const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Membership = require('../models/familymembership.model');
const Family = require('../models/familyaccount.model');
const Transaction = require('../models/transaction.model');
const SourceRecord = require('../models/sourcerecord.model');
const Form16 = require('../models/form16.model');
const Loan = require('../models/loan.model');
const ImportBatch = require('../models/importbatch.model');
const { isAuthenticated } = require('../middleware/auth.middleware');
const { buildListFilter, canModify, canModifyTransaction } = require('../utils/scope');
const { fingerprintCandidate, scoreCandidate, classifyConfidence } = require('../services/reconciliation.service');
const txRoutes = require('./transactions/transactions.routes');
const familyRoutes = require('./families/families.routes');
const formRoutes = require('./form16/form16.routes');
const loanRoutes = require('./loans/loans.routes');
const importRoutes = require('./imports/imports.routes');
const id = () => new mongoose.Types.ObjectId();
const alice = { _id: id(), familyAccountId: id(), role: 'admin', isActive: true };
const bob = { _id: id(), familyAccountId: alice.familyAccountId, role: 'member', isActive: true };
const outsider = { _id: id(), familyAccountId: id(), role: 'admin', isActive: true };
async function call(router, method, path, req) {
  const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ query: {}, body: {}, params: {}, ...req }, response, err => { throw err; });
  return response;
}
test('member-scoped filters reject a foreign member before reports or lists are generated', async t => {
  t.mock.method(User, 'exists', async () => null);
  await assert.rejects(buildListFilter({ user: alice, query: { memberId: outsider._id } }), { status: 403 });
});
test('admin can select only a verified family member', async t => {
  t.mock.method(User, 'exists', async filter => {
    assert.equal(filter.familyAccountId, alice.familyAccountId); return { _id: bob._id };
  });
  const filter = await buildListFilter({ user: alice, query: { memberId: bob._id } });
  assert.equal(filter.memberId, bob._id); assert.equal(filter.familyAccountId, alice.familyAccountId);
});
test('finance writes allow owner or own family admin, never a regular peer or foreign admin', () => {
  const doc = { memberId: bob._id, familyAccountId: alice.familyAccountId };
  assert.ok(canModify({ user: bob }, doc));
  assert.ok(canModify({ user: alice }, doc));
  assert.ok(!canModify({ user: { ...alice, role: 'member' } }, doc));
  assert.ok(!canModify({ user: outsider }, doc));
});
test('transaction writes belong only to creator even if caller is admin', () => {
  const tx = { createdBy: bob._id, familyId: alice.familyAccountId };
  assert.ok(canModifyTransaction({ user: bob }, tx));
  assert.ok(!canModifyTransaction({ user: alice }, tx));
  assert.ok(!canModifyTransaction({ user: outsider }, tx));
});
test('inactive existing session is rejected', async () => {
  let nextCalled = false;
  const res = { status(code) { this.code = code; return this; }, json() {} };
  await isAuthenticated({ user: { ...bob, isActive: false }, isAuthenticated: () => true }, res, () => { nextCalled = true; });
  assert.equal(res.code, 401); assert.ok(!nextCalled);
});
test('removed membership is denied even if a legacy family pointer remains', async t => {
  t.mock.method(Membership, 'exists', async () => null);
  const res = { status(code) { this.code = code; return this; }, json() {} };
  await isAuthenticated({ user: bob, isAuthenticated: () => true }, res, () => assert.fail('revoked member passed'));
  assert.equal(res.code, 403);
});
test('active membership passes request authentication', async t => {
  t.mock.method(Membership, 'exists', async filter => typeof filter.status === 'object' ? null : ({ _id: id() }));
  let passed = false;
  await isAuthenticated({ user: bob, isAuthenticated: () => true }, {}, err => { if (err) throw err; passed = true; });
  assert.ok(passed);
});
test('foreign family administrator cannot patch a transaction', async t => {
  t.mock.method(Transaction, 'findById', async () => ({ createdBy: bob._id, familyId: alice.familyAccountId }));
  const res = await call(txRoutes, 'patch', '/:id', { user: outsider, params: { id: id() } });
  assert.equal(res.statusCode, 403);
});
test('family admin cannot patch another member transaction', async t => {
  t.mock.method(Transaction, 'findById', async () => ({ createdBy: bob._id, familyId: alice.familyAccountId }));
  assert.equal((await call(txRoutes, 'patch', '/:id', { user: alice })).statusCode, 403);
});
test('unrelated user cannot resolve another transaction', async t => {
  t.mock.method(Transaction, 'findById', async () => ({ createdBy: bob._id, familyId: alice.familyAccountId, status: 'PENDING_REVIEW' }));
  assert.equal((await call(txRoutes, 'post', '/:id/resolve', { user: outsider, body: { action: 'keepSeparate' } })).statusCode, 403);
});
test('merge target must also belong to transaction creator', async t => {
  const source = { _id: id(), createdBy: bob._id, familyId: alice.familyAccountId, status: 'PENDING_REVIEW', candidateOf: id() };
  t.mock.method(Transaction, 'findById', async key => key === source.candidateOf ? { createdBy: alice._id, familyId: alice.familyAccountId } : source);
  assert.equal((await call(txRoutes, 'post', '/:id/resolve', { user: bob, body: { action: 'merge' } })).statusCode, 403);
});
test('family admin retains Form16 access within family and is denied unrelated records', async t => {
  const form = { userId: bob._id, isFinalized: true, finalizedDeductions: [] };
  t.mock.method(Form16, 'findById', async () => form);
  t.mock.method(User, 'exists', async filter => String(filter.familyAccountId) === String(alice.familyAccountId) ? { _id: bob._id } : null);
  assert.equal((await call(formRoutes, 'get', '/:id/deductions-preview', { user: alice, params: { id: String(id()) } })).statusCode, 200);
  assert.equal((await call(formRoutes, 'get', '/:id/deductions-preview', { user: outsider, params: { id: String(id()) } })).statusCode, 403);
});
test('family admin cannot rotate another family invite code', async t => {
  t.mock.method(Family, 'findById', async () => ({ _id: alice.familyAccountId, adminId: alice._id }));
  assert.equal((await call(familyRoutes, 'post', '/:id/rotate-code', { user: outsider })).statusCode, 403);
});
test('member removal clears current user family access', async t => {
  t.mock.method(Family, 'findById', async () => ({ _id: alice.familyAccountId, adminId: alice._id }));
  const membership = { status: 'ACTIVE', save: async () => {} };
  t.mock.method(Membership, 'findOne', async () => membership);
  t.mock.method(Family, 'findByIdAndUpdate', async () => ({}));
  const update = t.mock.method(User, 'updateOne', async () => ({}));
  assert.equal((await call(familyRoutes, 'delete', '/:id/members/:userId', { user: alice, params: { userId: bob._id } })).statusCode, 200);
  assert.equal(membership.status, 'REMOVED');
  assert.equal(update.mock.calls[0].arguments[1].$set.familyAccountId, null);
});
test('import batch lookup includes requester family', async t => {
  t.mock.method(ImportBatch, 'findOne', filter => {
    assert.equal(filter.familyId, bob.familyAccountId);
    return { populate: async () => null };
  });
  assert.equal((await call(importRoutes, 'get', '/batches/:id', { user: bob, params: { id: 'batch' } })).statusCode, 404);
});
const candidate = { amountPaise: 10000, occurredAt: '2026-10-15T10:50:10Z', type: 'EXPENSE', recipient: { name: 'Shop' } };
test('same member amount and minute is automatically reconciled as requested', () => {
  const other = { ...candidate, occurredAt: '2026-10-15T10:50:59Z' };
  assert.equal(fingerprintCandidate(candidate), fingerprintCandidate(other));
  assert.equal(classifyConfidence(scoreCandidate(candidate, other).confidence), 'AUTO');
});
test('different times on the same day are not exact duplicates', () => {
  const later = { ...candidate, occurredAt: '2026-10-15T17:50:10Z' };
  assert.notEqual(fingerprintCandidate(candidate), fingerprintCandidate(later));
  assert.notEqual(classifyConfidence(scoreCandidate(candidate, later).confidence), 'AUTO');
});
test('same-minute income and expense, or different recipients/references, remain separate', () => {
  for (const other of [{ ...candidate, type: 'INCOME' }, { ...candidate, recipient: { name: 'Different Shop' } }, { ...candidate, utr: 'REF2' }]) {
    const original = { ...candidate, utr: 'REF1' };
    assert.notEqual(classifyConfidence(scoreCandidate(original, other).confidence), 'AUTO');
  }
});
test('date-only bank rows are never treated as same-minute payments', () => {
  const dayOnly = { ...candidate, metadata: { timePrecision: 'day' } };
  assert.notEqual(classifyConfidence(scoreCandidate(dayOnly, dayOnly).confidence), 'AUTO');
});
test('negative manual prepayment is rejected before saving', async t => {
  t.mock.method(Loan, 'findById', async () => ({ _id: id(), memberId: bob._id, familyAccountId: bob.familyAccountId, outstandingAmount: 10000 }));
  assert.equal((await call(loanRoutes, 'post', '/:id/record-prepayment', { user: bob, body: { amount: -100 } })).statusCode, 400);
});
test('one payment reduces principal once across repeated requests', async t => {
  const loan = { _id: id(), memberId: bob._id, familyAccountId: bob.familyAccountId, outstandingAmount: 10000, prepayments: [] };
  const tx = { _id: id(), createdBy: bob._id, familyId: bob.familyAccountId, type: 'EXPENSE', status: 'ACTIVE', amountPaise: 100000, save: async () => {} };
  t.mock.method(Loan, 'findById', async () => loan);
  t.mock.method(Transaction, 'findById', async () => tx);
  const update = t.mock.method(Loan, 'findOneAndUpdate', async (filter, change) => {
    assert.deepEqual(filter['prepayments.transactionId'], { $ne: tx._id });
    loan.outstandingAmount += change.$inc.outstandingAmount; loan.prepayments.push(change.$push.prepayments); return loan;
  });
  const req = { user: bob, body: { transactionId: String(tx._id) } };
  assert.equal((await call(loanRoutes, 'post', '/:id/record-prepayment', req)).statusCode, 201);
  assert.equal((await call(loanRoutes, 'post', '/:id/record-prepayment', req)).body.alreadyApplied, true);
  assert.equal(loan.outstandingAmount, 9000); assert.equal(update.mock.callCount(), 1);
});
test('ingest persists accepted references and split amounts', async t => {
  t.mock.method(SourceRecord, 'findOne', () => ({ lean: async () => null, then: resolve => Promise.resolve(null).then(resolve) }));
  t.mock.method(Transaction, 'find', () => ({ lean: async () => [] }));
  const create = t.mock.method(Transaction, 'create', async fields => ({ ...fields, _id: id(), save: async () => {} }));
  t.mock.method(SourceRecord, 'create', async fields => ({ ...fields, _id: id() }));
  const { ingest } = require('../services/transactionEngine.service');
  const loanRef = id(); const subscriptionRef = id();
  await ingest({ ...candidate, recipient: undefined, category: 'Food', loanRef, subscriptionRef, loanMeta: { isLoanPayment: true }, categorySplit: [{ category: 'Food', amountPaise: 10000 }] }, { familyId: bob.familyAccountId, createdBy: bob._id, source: 'MANUAL' });
  const stored = create.mock.calls[0].arguments[0];
  assert.equal(stored.loanRef, loanRef); assert.equal(stored.subscriptionRef, subscriptionRef); assert.equal(stored.categorySplit[0].amountPaise, 10000);
});
test('legacy membership upgrade never restores an existing revoked membership', async t => {
  t.mock.method(Membership, 'exists', async () => ({ _id: id() }));
  t.mock.method(Membership, 'updateOne', async () => assert.fail('must not reactivate an existing membership'));
  const { ensureLegacyMembership } = require('../utils/membership');
  await ensureLegacyMembership(bob);
});
test('legacy active users receive membership with insert-only defaults', async t => {
  t.mock.method(Membership, 'exists', async () => null);
  t.mock.method(Family, 'findById', async () => ({ _id: bob.familyAccountId, adminId: alice._id }));
  const upsert = t.mock.method(Membership, 'updateOne', async () => ({}));
  t.mock.method(Family, 'updateOne', async () => ({}));
  const { ensureLegacyMembership } = require('../utils/membership');
  await ensureLegacyMembership(bob);
  assert.equal(upsert.mock.calls[0].arguments[1].$setOnInsert.status, 'ACTIVE');
  assert.equal(upsert.mock.calls[0].arguments[1].$setOnInsert.role, 'MEMBER');
  assert.equal(upsert.mock.calls[0].arguments[1].$set, undefined);
});
test('deleting an investment invalidates its user recommendations through real document middleware', async t => {
  const Investment = require('../models/investment.model');
  const Recommendation = require('../models/taxrecommendation.model');
  t.mock.method(Investment.collection, 'deleteOne', async () => ({ acknowledged: true, deletedCount: 1 }));
  const update = t.mock.method(Recommendation, 'updateMany', async () => ({ modifiedCount: 1 }));
  const doc = new Investment({ memberId: bob._id, familyAccountId: bob.familyAccountId });
  await doc.deleteOne();
  assert.equal(String(update.mock.calls[0].arguments[0].userId), String(bob._id));
  assert.equal(update.mock.calls[0].arguments[1].$set.isStale, true);
});
test('weekly and yearly budgets use different bounded intervals', async t => {
  const Budget = require('../models/budget.model');
  const router = require('./budgets/budgets.routes');
  t.mock.method(Budget, 'find', () => ({ sort: async () => [{ period: 'WEEKLY' }, { period: 'YEARLY' }] }));
  const intervals = [];
  t.mock.method(Transaction, 'find', filter => { intervals.push(filter.occurredAt); return { lean: async () => [] }; });
  await call(router, 'get', '/', { user: bob });
  assert.equal(intervals[0].$gte.getDay(), 1);
  assert.equal((intervals[0].$lt - intervals[0].$gte) / 86400000, 7);
  assert.equal(intervals[1].$gte.getMonth(), 0);
  assert.equal(intervals[1].$lt.getFullYear(), intervals[1].$gte.getFullYear() + 1);
});
test('finalization rebuilds deductions from saved values rather than trusting an injected snapshot', async t => {
  const Investment = require('../models/investment.model');
  const Insurance = require('../models/insurance.model');
  const Education = require('../models/education.model');
  for (const Model of [Investment, Insurance, Education, Loan]) t.mock.method(Model, 'find', async () => []);
  const doc = { userId: bob._id, financialYear: '2025-26', grossSalary: 1000000, section80C: 10000, save: async () => {} };
  t.mock.method(Form16, 'findById', async () => doc);
  const res = await call(formRoutes, 'patch', '/:id', { user: bob, params: { id: String(id()) }, body: { isFinalized: true, finalizedDeductions: [{ section: '80C', amount: 150000, source: 'USER_MANUAL' }] } });
  assert.equal(res.statusCode, 200);
  assert.equal(doc.finalizedDeductions.find(item => item.section === '80C').amount, 10000);
});
test('draft preview uses unsaved Form16 values without losing selected-year paid records', async t => {
  const Investment = require('../models/investment.model');
  const Insurance = require('../models/insurance.model');
  const Education = require('../models/education.model');
  t.mock.method(Investment, 'find', async () => [{ taxPayments: [{ financialYear: '2025-26', section: '80C', amount: 30000 }] }]);
  for (const Model of [Insurance, Education, Loan]) t.mock.method(Model, 'find', async () => []);
  const stored = { userId: bob._id, financialYear: '2025-26', grossSalary: 1000000, section80C: 10000 };
  t.mock.method(Form16, 'findById', async () => stored);
  const res = await call(formRoutes, 'post', '/:id/deductions-preview', { method: 'POST', user: bob, params: { id: String(id()) }, body: { section80C: 20000 } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.deductions.some(item => item.section === '80C' && item.source === 'INVESTMENT_RECORD' && item.amount === 30000));
  assert.equal(stored.section80C, 10000);
});
