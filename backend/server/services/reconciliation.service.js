const crypto = require('crypto');
const { TRANSACTION_CONFIG } = require('../config/transactionConfig');

function fingerprintCandidate(c) {
  const key = [c.type, c.amountPaise, (c.recipient?.name || '').trim().toLowerCase(), c.occurredAt ? new Date(c.occurredAt).toISOString().slice(0,16) : '', (c.upiId||'').toLowerCase(), (c.transactionIdExt||'').toLowerCase(), (c.utr||'').toLowerCase()].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0,24);
}

function minutesDiff(a,b){ return Math.abs(new Date(a).getTime()- new Date(b).getTime())/60000; }
function daysDiff(a,b){ return Math.abs(new Date(a).getTime()- new Date(b).getTime())/86400000; }

function scoreCandidate(candidate, existing) {
  if ((candidate.type && existing.type && candidate.type !== existing.type) || candidate.amountPaise !== existing.amountPaise) return { confidence: 0, level: 'NONE' };

  const candTx = (candidate.transactionIdExt||'').trim().toLowerCase();
  const existTx = (existing.transactionIdExt||existing._extTx||'').trim().toLowerCase();
  if (candTx && existTx && candTx===existTx) return { confidence: 100, level: 'TX_ID' };

  const candUtr = (candidate.utr||'').trim().toLowerCase();
  const existUtr = (existing.utr||existing._utr||'').trim().toLowerCase();
  if (candUtr && existUtr && candUtr===existUtr) return { confidence: 98, level: 'UTR' };

  if ((candTx && existTx && candTx !== existTx) || (candUtr && existUtr && candUtr !== existUtr)) return { confidence: 0, level: 'NONE' };

  const candUpi = (candidate.upiId||'').trim().toLowerCase();
  const existUpi = (existing.upiId||existing._upi||'').trim().toLowerCase();
  const sameUpi = !!(candUpi && existUpi && candUpi===existUpi);

  const candName = (candidate.recipient?.name || '').trim().toLowerCase();
  const existName = (existing.recipient?.name || '').trim().toLowerCase();
  if ((candUpi && existUpi && !sameUpi) || (candName && existName && candName !== existName && !sameUpi)) return { confidence: 0, level: 'NONE' };
  const hasTime = candidate.metadata?.timePrecision !== 'day' && existing.metadata?.timePrecision !== 'day';
  const sameMinute = hasTime && candidate.occurredAt && existing.occurredAt &&
    new Date(candidate.occurredAt).toISOString().slice(0,16) === new Date(existing.occurredAt).toISOString().slice(0,16);
  if (sameMinute) return { confidence: 90, level: 'AMOUNT_SAME_MINUTE' };

  const timeClose = hasTime && candidate.occurredAt && existing.occurredAt && minutesDiff(candidate.occurredAt, existing.occurredAt) <= TRANSACTION_CONFIG.timeWindows.highConfidenceMinutes;
  const dateClose = candidate.occurredAt && existing.occurredAt && daysDiff(candidate.occurredAt, existing.occurredAt) <= TRANSACTION_CONFIG.timeWindows.dateToleranceDays;

  if (sameUpi && dateClose && timeClose) return { confidence: 92, level: 'UPI_AMOUNT_DATETIME' };
  if (sameUpi && dateClose) return { confidence: 75, level: 'UPI_AMOUNT_DATE' };

  const mediumClose = hasTime && candidate.occurredAt && existing.occurredAt && minutesDiff(candidate.occurredAt, existing.occurredAt) <= TRANSACTION_CONFIG.timeWindows.mediumConfidenceMinutes;
  if (dateClose && mediumClose) return { confidence: 68, level: 'AMOUNT_DATETIME' };

  return { confidence: 25, level: 'AMOUNT_ONLY' };
}

function classifyConfidence(conf){
  if (conf >= TRANSACTION_CONFIG.thresholds.autoMerge) return 'AUTO';
  if (conf >= TRANSACTION_CONFIG.thresholds.pendingReview) return 'REVIEW';
  return 'SEPARATE';
}

module.exports = { fingerprintCandidate, scoreCandidate, classifyConfidence };
