const express = require('express');
const EMILoan = require('../../models/loan.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { buildListFilter, canModify, canModifyTransaction, buildTransactionVisibilityFilter } = require('../../utils/scope');

const router = express.Router();
router.use(isAuthenticated);

// GET /api/loans
router.get('/', async (req, res, next) => {
  try {
    const filter = await buildListFilter(req);
    if (req.query.loanType) filter.loanType = req.query.loanType;
    const items = await EMILoan.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// GET /api/loans/suggestions
router.get('/suggestions', async (req, res, next) => {
  try {
    if (!req.user.familyAccountId) return res.status(400).json({ error: 'Join family first' });
    const { buildSuggestionsForLoans } = require('../../services/subscriptionLinker.service');
    const memberId = req.user.role === 'admin' && req.query.memberId ? req.query.memberId : undefined;
    const suggestions = await buildSuggestionsForLoans({ familyId: req.user.familyAccountId, memberId });
    res.json({ suggestions });
  } catch (err) {
    next(err);
  }
});

// POST /api/loans/calculate — standalone calc (no DB) for BE reuse & PDF
router.post('/calculate', async (req, res, next) => {
  try {
    const { principal, rate, tenureMonths, startDate, emiDate } = req.body;
    const { calcFull, validateLoanInputs } = require('../../utils/loanCalc');
    const P = Number(principal), R = Number(rate), N = Number(tenureMonths);
    const errs = validateLoanInputs(P, R, N);
    if (errs.length) return res.status(400).json({ error: errs.join(' · ') });
    const result = calcFull(P, R, N, { startDate, emiDate });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/loans/:id/apply-suggestion
router.post('/:id/apply-suggestion', async (req, res, next) => {
  try {
    if (!req.user.familyAccountId) return res.status(400).json({ error: 'Join family first' });
    const { applySuggestion } = require('../../services/subscriptionLinker.service');
    const { acceptAmount, acceptDate, matchedTxIds } = req.body;
    const updated = await applySuggestion({
      kind: 'loan',
      id: req.params.id,
      acceptAmount,
      acceptDate,
      matchedTxIds,
      createdBy: req.user._id,
      familyId: req.user.familyAccountId,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/loans/:id/dismiss-suggestion
router.post('/:id/dismiss-suggestion', async (req, res, next) => {
  try {
    if (!req.user.familyAccountId) return res.status(400).json({ error: 'Join family first' });
    const { dismissSuggestion } = require('../../services/subscriptionLinker.service');
    const result = await dismissSuggestion({
      kind: 'loan',
      id: req.params.id,
      familyId: req.user.familyAccountId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/loans/:id — detail
router.get('/:id', async (req, res, next) => {
  try {
    const loan = await EMILoan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, loan)) return res.status(403).json({ error: 'Forbidden' });
    res.json(loan);
  } catch (err) { next(err); }
});

// GET /api/loans/:id/schedule — amort + yearly, with paid vs future split
router.get('/:id/schedule', async (req, res, next) => {
  try {
    const loan = await EMILoan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, loan)) return res.status(403).json({ error: 'Forbidden' });
    const { amortizationSchedule, yearlySummary, monthsBetween } = require('../../utils/loanCalc');
    const principal = Number(loan.principalAmount || 0);
    const rate = Number(loan.interestRate || 0);
    const tenure = Number(loan.tenureMonths || 0);
    const startDate = loan.startDate ? new Date(loan.startDate).toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
    const emiDate = Number(loan.emiDate || 5);
    const schedule = amortizationSchedule(principal, rate, tenure, { startDate, emiDate });
    const yearly = yearlySummary(schedule, startDate);
    // derive paid months via date diff and outstanding approx
    const paidMonths = monthsBetween(startDate, new Date());
    const outstanding = Number(loan.outstandingAmount || 0);
    // find closest month where closing ~ outstanding
    let matchedMonth = 0;
    let minDiff = Infinity;
    for (let i=0;i<schedule.length;i++){
      const diff = Math.abs(schedule[i].closing - outstanding);
      if(diff < minDiff){ minDiff = diff; matchedMonth = i+1; }
    }
    // future payments are after today / after paidMonths
    const todayIso = new Date().toISOString().slice(0,10);
    const future = schedule.filter(r=> r.date >= todayIso);
    const paid = schedule.filter(r=> r.date < todayIso);
    res.json({ loan, schedule, yearly, paidMonths, matchedMonth, future, paid, totalPayable: schedule.reduce((s,x)=> s+x.emi,0), totalInterest: schedule.reduce((s,x)=> s+x.interest,0) });
  } catch (err) { next(err); }
});

// GET /api/loans/:id/transactions — all linked txs + suggestions
router.get('/:id/transactions', async (req, res, next) => {
  try {
    const loan = await EMILoan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, loan)) return res.status(403).json({ error: 'Forbidden' });
    const Transaction = require('../../models/transaction.model');
    // linked explicitly
    const linked = await Transaction.find({ loanRef: loan._id, familyId: loan.familyAccountId, ...buildTransactionVisibilityFilter(req), status: { $ne: 'VOIDED' } }).sort({ occurredAt: -1 }).limit(200).lean();
    // also suggest via amount+name fuzzy (reuse subscriptionLinker)
    const { findMatches } = require('../../services/subscriptionLinker.service');
    const suggestions = await findMatches({ familyId: loan.familyAccountId, createdBy: req.user._id, name: loan.loanName, amount: loan.emiAmount, dueDay: loan.emiDate, type: 'loan' });
    // filter out already linked
    const linkedIds = new Set(linked.map(x=> String(x._id)));
    const unmatchedSuggestions = suggestions.filter(s=> !linkedIds.has(String(s._id)));
    // stats
    const totalPaidFromLinked = linked.reduce((s,x)=> s + (x.amountPaise||0), 0);
    res.json({ linked, suggestions: unmatchedSuggestions, totalPaidFromLinked, outstanding: loan.outstandingAmount, principal: loan.principalAmount });
  } catch (err) { next(err); }
});

// POST /api/loans/:id/link-transaction — attach existing transaction to loan (as EMI or prepayment)
router.post('/:id/link-transaction', async (req, res, next) => {
  try {
    const loan = await EMILoan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, loan)) return res.status(403).json({ error: 'Forbidden' });
    const { transactionId, isPrepayment = false } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'transactionId required' });
    const Transaction = require('../../models/transaction.model');
    const tx = await Transaction.findById(transactionId);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
      if (!canModifyTransaction(req, tx)) return res.status(403).json({ error: 'Only the transaction creator can modify it' });
    if (String(tx.familyId) !== String(loan.familyAccountId)) return res.status(403).json({ error: 'Transaction not in family' });
    if (tx.loanMeta?.isPrepayment) return res.status(409).json({ error: 'Recorded prepayments cannot be relinked' });
    tx.loanRef = loan._id;
    tx.loanMeta = { isLoanPayment: true, isPrepayment: !!isPrepayment };
    // also set category to Bills/Loan if Other
    if (!tx.category || tx.category === 'Other') {
      const map = { Home: 'Bills', Car: 'Bills', Personal: 'Bills', Education: 'Education', Gold: 'Bills' };
      tx.category = map[loan.loanType] || 'Bills';
    }
    await tx.save();
    res.json({ transaction: tx });
  } catch (err) { next(err); }
});

// POST /api/loans/:id/unlink-transaction
router.post('/:id/unlink-transaction', async (req, res, next) => {
  try {
    const loan = await EMILoan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, loan)) return res.status(403).json({ error: 'Forbidden' });
    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'transactionId required' });
    const Transaction = require('../../models/transaction.model');
    const tx = await Transaction.findById(transactionId);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
      if (!canModifyTransaction(req, tx)) return res.status(403).json({ error: 'Only the transaction creator can modify it' });
    if (String(tx.loanRef) !== String(loan._id)) return res.status(400).json({ error: 'Transaction not linked to this loan' });
    if (tx.loanMeta?.isPrepayment) return res.status(409).json({ error: 'Recorded prepayments cannot be unlinked without reversing their balance adjustment' });
    tx.loanRef = null;
    tx.loanMeta = { isLoanPayment: false, isPrepayment: false };
    await tx.save();
    res.json({ transaction: tx });
  } catch (err) { next(err); }
});

// POST /api/loans/:id/record-prepayment — record prepayment via transaction link or manual entry
router.post('/:id/record-prepayment', async (req, res, next) => {
  try {
    const loan = await EMILoan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, loan)) return res.status(403).json({ error: 'Forbidden' });
    const { amount, transactionId, date, mode, notes } = req.body;
    const prepayVal = Number(amount || 0);
    if ((!Number.isFinite(prepayVal) || prepayVal <= 0) && !transactionId) return res.status(400).json({ error: 'Amount or transactionId is required' });

    if (!transactionId && prepayVal > Number(loan.outstandingAmount || 0)) return res.status(400).json({ error: 'Prepayment exceeds outstanding balance' });
    const Transaction = require('../../models/transaction.model');
    let tx;
    let effectiveAmount = prepayVal;

    if (transactionId) {
      tx = await Transaction.findById(transactionId);
      if (!tx) return res.status(404).json({ error: 'Transaction not found' });
      if (!canModifyTransaction(req, tx)) return res.status(403).json({ error: 'Only the transaction creator can modify it' });
      if (String(tx.familyId) !== String(loan.familyAccountId)) return res.status(403).json({ error: 'Transaction not in family' });
      if (!['EXPENSE', 'CASH_EXPENSE'].includes(tx.type) || tx.status === 'VOIDED') return res.status(400).json({ error: 'An active expense transaction is required' });
      if (tx.loanRef && String(tx.loanRef) !== String(loan._id)) return res.status(409).json({ error: 'Transaction already linked to another loan' });
      if (loan.prepayments?.some(p => String(p.transactionId) === String(tx._id))) return res.json({ loan, transaction: tx, alreadyApplied: true });
      if (!Number.isFinite(tx.amountPaise) || tx.amountPaise <= 0 || tx.amountPaise / 100 > Number(loan.outstandingAmount || 0)) return res.status(400).json({ error: 'Invalid prepayment amount' });
      tx.loanRef = loan._id;
      tx.loanMeta = { isLoanPayment: true, isPrepayment: true };
      if (!tx.category || tx.category === 'Other') tx.category = 'Bills';
      tx.subcategory = 'Loan Prepayment';
      await tx.save();
      effectiveAmount = tx.amountPaise ? tx.amountPaise / 100 : prepayVal;
    } else {
      tx = new Transaction({
        familyId: loan.familyAccountId,
        createdBy: req.user._id,
        type: 'EXPENSE',
        amountPaise: Math.round(effectiveAmount * 100),
        currency: 'INR',
        occurredAt: date ? new Date(date) : new Date(),
        category: 'Bills',
        subcategory: 'Loan Prepayment',
        mode: mode || 'BANK',
        recipient: { name: loan.lender || loan.loanName },
        loanRef: loan._id,
        loanMeta: { isLoanPayment: true, isPrepayment: true },
        visibility: 'FAMILY',
        status: 'ACTIVE',
        metadata: { prepaymentNotes: notes || '' },
      });
      await tx.save();
    }

    // Claim the transaction and reduce principal in one conditional Mongo update.
    // Concurrent retries cannot apply the same payment more than once.
    const updated = await EMILoan.findOneAndUpdate(
      { _id: loan._id, 'prepayments.transactionId': { $ne: tx._id }, outstandingAmount: { $gte: effectiveAmount } },
      { $inc: { outstandingAmount: -effectiveAmount }, $push: { prepayments: { transactionId: tx._id, amount: effectiveAmount, date: tx.occurredAt, notes: notes || '' } } },
      { new: true, runValidators: true },
    );
    if (!updated) {
      const current = await EMILoan.findById(loan._id);
      if (current?.prepayments?.some(p => String(p.transactionId) === String(tx._id))) return res.json({ loan: current, transaction: tx, alreadyApplied: true });
      return res.status(409).json({ error: 'Prepayment exceeds the remaining balance or the loan changed; refresh and try again' });
    }
    if (updated.outstandingAmount === 0) {
      await EMILoan.updateOne({ _id: updated._id, outstandingAmount: 0 }, { $set: { status: 'Prepaid' } });
      updated.status = 'Prepaid';
    }

    res.status(201).json({ loan: updated, transaction: tx });
  } catch (err) { next(err); }
});

// POST /api/loans
router.post('/', async (req, res, next) => {
  try {
    const item = new EMILoan({
      ...req.body,
      memberId: req.user._id,
      familyAccountId: req.user.familyAccountId,
    });
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// PUT /api/loans/:id
router.put('/:id', async (req, res, next) => {
  try {
    const item = await EMILoan.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    const { memberId, familyAccountId, _id, ...updates } = req.body;
    Object.assign(item, updates);
    await item.save();
    res.json(item);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/loans/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const item = await EMILoan.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!canModify(req, item)) return res.status(403).json({ error: 'Forbidden' });
    await item.deleteOne();
    res.json({ message: 'deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
