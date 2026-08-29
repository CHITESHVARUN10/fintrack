const crypto = require('crypto');
const Transaction = require('../models/transaction.model');
const SourceRecord = require('../models/sourcerecord.model');
const { fingerprintCandidate, scoreCandidate, classifyConfidence } = require('./reconciliation.service');
const { normalizeVendorKey, resolveCategory, upsertFromCategory } = require('./recipient.service');

function validateCandidate(c) {
  if (!c.amountPaise || c.amountPaise <= 0) throw Object.assign(new Error('amountPaise required'), { status: 400 });
  if (!c.occurredAt) throw Object.assign(new Error('occurredAt required'), { status: 400 });
  if (!c.type) throw Object.assign(new Error('type required'), { status: 400 });
  const types = ['EXPENSE','INCOME','INTERNAL_TRANSFER','CASH_WITHDRAWAL','CASH_EXPENSE'];
  if (!types.includes(c.type)) throw Object.assign(new Error('Invalid type'), { status: 400 });
}

async function ingest(candidate, { familyId, createdBy, source, batchId, rawPayload, fingerprint }) {
  validateCandidate(candidate);
  const fp = fingerprint || fingerprintCandidate(candidate);

  // Batch idempotency: same fingerprint+batch → return existing
  if (batchId) {
    const dup = await SourceRecord.findOne({ familyId, batchId, fingerprint: fp });
    if (dup) {
      const tx = await Transaction.findById(dup.transactionId);
      return { transaction: tx, sourceRecord: dup, deduped: true };
    }
  }

  // Search recent candidates for reconciliation
  const windowFrom = new Date(new Date(candidate.occurredAt).getTime() - 2*86400000);
  const windowTo = new Date(new Date(candidate.occurredAt).getTime() + 2*86400000);
  const recent = await Transaction.find({ familyId, amountPaise: candidate.amountPaise, occurredAt: { $gte: windowFrom, $lte: windowTo }, status: { $ne: 'VOIDED' } }).lean();
  const sourceRecents = await SourceRecord.find({ familyId, occurredAt: { $gte: windowFrom, $lte: windowTo } }).lean().catch(()=>[]);
  // Merge signals: map transaction id → upi/utr/tx
  const txSignals = new Map();
  for (const sr of sourceRecents) {
    if (!txSignals.has(String(sr.transactionId))) txSignals.set(String(sr.transactionId), { upi: sr.upiId, utr: sr.utr, _extTx: sr.transactionIdExt });
  }

  let best = null; let bestScore = 0; let bestLevel = 'NONE';
  for (const tx of recent) {
    const signals = txSignals.get(String(tx._id)) || {};
    const sc = scoreCandidate(candidate, { amountPaise: tx.amountPaise, occurredAt: tx.occurredAt, upiId: signals.upi, utr: signals.utr, transactionIdExt: signals._extTx });
    if (sc.confidence > bestScore) { bestScore = sc.confidence; best = tx; bestLevel = sc.level; }
  }

  const decision = classifyConfidence(bestScore);

  if (decision === 'AUTO' && best) {
    const sr = await SourceRecord.create({ transactionId: best._id, familyId, createdBy, source, rawPayload, parsedFields: candidate, batchId, fingerprint: fp, upiId: candidate.upiId, transactionIdExt: candidate.transactionIdExt, utr: candidate.utr, confidence: bestScore });
    await Transaction.findByIdAndUpdate(best._id, { $addToSet: { sourceIds: sr._id }, confidence: bestScore, status: 'RECONCILED' });
    const tx = await Transaction.findById(best._id);
    return { transaction: tx, sourceRecord: sr, reconciled: true, level: bestLevel };
  }

  if (decision === 'REVIEW' && best) {
    const tx = await Transaction.create({
      familyId, createdBy, type: candidate.type, mode: candidate.mode || 'OTHER', amountPaise: candidate.amountPaise, currency: candidate.currency || 'INR',
      occurredAt: candidate.occurredAt, category: candidate.category, sender: candidate.sender, recipient: candidate.recipient,
      familyTransfer: candidate.familyTransfer, cashLeg: candidate.cashLeg, visibility: candidate.visibility || 'FAMILY', status: 'PENDING_REVIEW', confidence: bestScore, candidateOf: best._id, batchId, fingerprint: fp, metadata: candidate.metadata,
    });
    const sr = await SourceRecord.create({ transactionId: tx._id, familyId, createdBy, source, rawPayload, parsedFields: candidate, batchId, fingerprint: fp, upiId: candidate.upiId, transactionIdExt: candidate.transactionIdExt, utr: candidate.utr, confidence: bestScore });
    tx.sourceIds = [sr._id]; await tx.save();
    return { transaction: tx, sourceRecord: sr, pendingReview: true, candidateOf: best._id, level: bestLevel };
  }

  // Auto-apply vendor category when candidate is Other
  try {
    if (!candidate.category || candidate.category === 'Other') {
      const vk = normalizeVendorKey(candidate.recipient?.name || candidate.recipient?.label || '', candidate.upiId || candidate.recipient?.upiId);
      if (vk || candidate.upiId) {
        const resolved = await resolveCategory({ familyId, vendorKey: vk, upiId: candidate.upiId || candidate.recipient?.upiId });
        if (resolved && resolved !== 'Other') { candidate.category = resolved; candidate.metadata = { ...(candidate.metadata||{}), vendorResolved: true, vendorKey: vk }; }
      }
    }
  } catch {}
  const tx = await Transaction.create({
    familyId, createdBy, type: candidate.type, mode: candidate.mode || 'OTHER', amountPaise: candidate.amountPaise, currency: candidate.currency || 'INR',
    occurredAt: candidate.occurredAt, category: candidate.category, sender: candidate.sender, recipient: candidate.recipient,
    familyTransfer: candidate.familyTransfer, cashLeg: candidate.cashLeg, visibility: candidate.visibility || 'FAMILY', status: 'ACTIVE', confidence: bestScore, batchId, fingerprint: fp, metadata: candidate.metadata,
  });
  const sr = await SourceRecord.create({ transactionId: tx._id, familyId, createdBy, source, rawPayload, parsedFields: candidate, batchId, fingerprint: fp, upiId: candidate.upiId, transactionIdExt: candidate.transactionIdExt, utr: candidate.utr, confidence: bestScore });
  tx.sourceIds = [sr._id]; await tx.save();

  try {
    const vk = normalizeVendorKey(candidate.recipient?.name || '', candidate.upiId || candidate.recipient?.upiId);
    const upi = candidate.upiId || candidate.recipient?.upiId || null;
    const label = candidate.recipient?.name || upi || vk;
    if ((vk || upi) && candidate.category && candidate.category !== 'Other') {
      await upsertFromCategory({ familyId, createdBy, vendorKey: vk, upiId: upi, label, category: candidate.category });
    } else if (vk || upi) {
      // still bump hits even when category is Other
      const RecipientDirectory = require('../models/recipientdirectory.model');
      if (vk) await RecipientDirectory.findOneAndUpdate({ familyId, vendorKey: vk }, { $inc: { hits: 1 }, $set: { lastSeen: new Date(), ...(upi?{upiId: String(upi).toLowerCase()}:{}), label: label || vk }, $setOnInsert: { familyId, vendorKey: vk, label: label||vk } }, { upsert: true });
    }
  } catch {}

  return { transaction: tx, sourceRecord: sr, created: true, level: bestLevel };
}

function computeLedgerSummary(transactions) {
  let actualExpenditurePaise = 0, internalTransfersPaise = 0, cashWithdrawalsPaise = 0, totalMovementPaise = 0, cashSpentPaise = 0, cashWithdrawnPaise = 0;
  for (const t of transactions) {
    if (t.status === 'VOIDED') continue;
    totalMovementPaise += t.amountPaise || 0;
    if (t.type === 'EXPENSE' || t.type === 'CASH_EXPENSE') actualExpenditurePaise += t.amountPaise || 0;
    if (t.type === 'INTERNAL_TRANSFER') internalTransfersPaise += t.amountPaise || 0;
    if (t.type === 'CASH_WITHDRAWAL') { cashWithdrawalsPaise += t.amountPaise || 0; cashWithdrawnPaise += t.amountPaise || 0; }
    if (t.type === 'CASH_EXPENSE') cashSpentPaise += t.amountPaise || 0;
  }
  return { actualExpenditurePaise, internalTransfersPaise, cashWithdrawalsPaise, totalMovementPaise, cashWithdrawnPaise, cashSpentPaise, cashRemainingPaise: cashWithdrawnPaise - cashSpentPaise };
}

module.exports = { ingest, computeLedgerSummary, validateCandidate };
