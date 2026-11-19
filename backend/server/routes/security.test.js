const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/user.model');
const Membership = require('../models/familymembership.model');
const Family = require('../models/familyaccount.model');
const Transaction = require('../models/transaction.model');
const SourceRecord = require('../models/sourcerecord.model');
const ImportBatch = require('../models/importbatch.model');
const { isAuthenticated } = require('../middleware/auth.middleware');
const { buildListFilter, canModify, canModifyTransaction } = require('../utils/scope');
const { fingerprintCandidate, scoreCandidate, classifyConfidence } = require('../services/reconciliation.service');
const txRoutes = require('./transactions/transactions.routes');
const familyRoutes = require('./families/families.routes');
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
test('family admin cannot rotate another family invite code', async t => {
  t.mock.method(Family, 'findById', async () => ({ _id: alice.familyAccountId, adminId: alice._id }));
  assert.equal((await call(familyRoutes, 'post', '/:id/rotate-code', { user: outsider })).statusCode, 403);
});
test('transaction list paginates and reports the true total', async t => {
  const chain = {
    sort() { return chain; },
    skip(n) { chain.skipped = n; return chain; },
    limit(n) { chain.limited = n; return chain; },
    select() { return chain; },
    populate() { return chain; },
    lean: async () => [],
  };
  t.mock.method(Transaction, 'countDocuments', async () => 137);
  t.mock.method(Transaction, 'find', () => chain);
  const res = await call(txRoutes, 'get', '/', { user: alice, query: { page: '2', limit: '50' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.total, 137);
  assert.equal(res.body.page, 2);
  assert.equal(res.body.limit, 50);
  assert.equal(res.body.hasMore, true);
  assert.equal(chain.skipped, 50);
  assert.equal(chain.limited, 50);
  assert.deepEqual(res.body.items, []);
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
test('an app-scanned UPI payment matches the later bank narration', () => {
  const appTx = {
    type: 'EXPENSE',
    amountPaise: 12000,
    occurredAt: '2026-11-18T10:05:00Z',
    mode: 'UPI',
    recipient: { name: 'Chai Wala', upiId: 'chai.wala@paytm' },
    metadata: { origin: 'QR_SCAN', timePrecision: 'minute' },
  };
  const bank = {
    type: 'EXPENSE',
    amountPaise: 12000,
    occurredAt: '2026-11-18T12:00:00Z',
    mode: 'BANK',
    recipient: { name: 'UPI/DR/416123456789/CHAI WALA/YESB/chai.wala@paytm/Payment' },
    upiId: 'chai.wala@paytm',
    metadata: { timePrecision: 'day', channel: 'UPI' },
  };
  const scored = scoreCandidate(bank, appTx);
  assert.equal(scored.level, 'APP_UPI_AMOUNT_DATE');
  assert.equal(classifyConfidence(scored.confidence), 'AUTO');
});
test('a QR payment still matches a bank row with no payee name in the narration', () => {
  const appTx = {
    type: 'EXPENSE',
    amountPaise: 12000,
    occurredAt: '2026-11-18T10:05:00Z',
    mode: 'UPI',
    recipient: { name: 'Chai Wala', upiId: 'chai.wala@paytm' },
    metadata: { origin: 'QR_SCAN', timePrecision: 'minute' },
  };
  const bank = {
    type: 'EXPENSE',
    amountPaise: 12000,
    occurredAt: '2026-11-18T12:00:00Z',
    mode: 'BANK',
    recipient: { name: 'UPI/DR/416123456789' },
    metadata: { timePrecision: 'day', channel: 'UPI' },
  };
  const scored = scoreCandidate(bank, appTx);
  assert.equal(scored.level, 'APP_AMOUNT_DATE');
  assert.equal(classifyConfidence(scored.confidence), 'AUTO');
});
test('a QR payment does not absorb a different merchant with the same amount', () => {
  const appTx = {
    type: 'EXPENSE',
    amountPaise: 12000,
    occurredAt: '2026-11-18T10:05:00Z',
    mode: 'UPI',
    recipient: { name: 'Chai Wala', upiId: 'chai.wala@paytm' },
    metadata: { origin: 'QR_SCAN', timePrecision: 'minute' },
  };
  const bank = {
    type: 'EXPENSE',
    amountPaise: 12000,
    occurredAt: '2026-11-18T12:00:00Z',
    mode: 'BANK',
    recipient: { name: 'UPI/DR/416123456789/CORNER STORE/YESB' },
    metadata: { timePrecision: 'day', channel: 'UPI' },
  };
  assert.equal(scoreCandidate(bank, appTx).confidence, 0);
});
test('a QR payment survives a bank-reference vs UPI-UTR mismatch when the payee is the same', () => {
  const appTx = {
    type: 'EXPENSE',
    amountPaise: 12000,
    occurredAt: '2026-11-18T10:05:00Z',
    mode: 'UPI',
    recipient: { name: 'Chai Wala', upiId: 'chai.wala@paytm' },
    utr: '416123456789',
    metadata: { origin: 'QR_SCAN', timePrecision: 'minute' },
  };
  const bank = {
    type: 'EXPENSE',
    amountPaise: 12000,
    occurredAt: '2026-11-18T12:00:00Z',
    mode: 'BANK',
    recipient: { name: 'UPI/DR/CHAI WALA/YESB' },
    upiId: 'chai.wala@paytm',
    utr: 'BANKREF9988',
    metadata: { timePrecision: 'day', channel: 'UPI' },
  };
  assert.equal(classifyConfidence(scoreCandidate(bank, appTx).confidence), 'AUTO');
});
test('a QR merchant reference does not block a matching bank transaction id', () => {
  const appTx = {
    type: 'EXPENSE',
    amountPaise: 12000,
    occurredAt: '2026-11-18T10:05:00Z',
    mode: 'UPI',
    recipient: { name: 'Chai Wala', upiId: 'chai.wala@paytm' },
    transactionIdExt: 'QR-MERCHANT-REF',
    metadata: { origin: 'QR_SCAN', timePrecision: 'minute' },
  };
  const bank = {
    type: 'EXPENSE',
    amountPaise: 12000,
    occurredAt: '2026-11-18T12:00:00Z',
    mode: 'BANK',
    recipient: { name: 'CHAI WALA', upiId: 'chai.wala@paytm' },
    transactionIdExt: 'BANK-TXN-999',
    metadata: { timePrecision: 'day', channel: 'UPI' },
  };
  assert.equal(classifyConfidence(scoreCandidate(bank, appTx).confidence), 'AUTO');
});
test('a QR payment reconciles onto a bank row imported earlier', () => {
  const bank = {
    type: 'EXPENSE',
    amountPaise: 12000,
    occurredAt: '2026-11-18T12:00:00Z',
    mode: 'BANK',
    recipient: { name: 'UPI/DR/CHAI WALA/YESB', upiId: 'chai.wala@paytm' },
    metadata: { timePrecision: 'day', channel: 'UPI' },
  };
  const appTx = {
    type: 'EXPENSE',
    amountPaise: 12000,
    occurredAt: '2026-11-18T10:05:00Z',
    mode: 'UPI',
    recipient: { name: 'Chai Wala', upiId: 'chai.wala@paytm' },
    metadata: { origin: 'QR_SCAN', timePrecision: 'minute' },
  };
  assert.equal(classifyConfidence(scoreCandidate(appTx, bank).confidence), 'AUTO');
});
test('ingest persists accepted references and split amounts', async t => {
  t.mock.method(SourceRecord, 'findOne', () => ({ lean: async () => null, then: resolve => Promise.resolve(null).then(resolve) }));
  t.mock.method(Transaction, 'find', () => ({ lean: async () => [] }));
  const create = t.mock.method(Transaction, 'create', async fields => ({ ...fields, _id: id(), save: async () => {} }));
  t.mock.method(SourceRecord, 'create', async fields => ({ ...fields, _id: id() }));
  const { ingest } = require('../services/transactionEngine.service');
  const subscriptionRef = id();
  await ingest({ ...candidate, recipient: undefined, category: 'Food', subscriptionRef, categorySplit: [{ category: 'Food', amountPaise: 10000 }] }, { familyId: bob.familyAccountId, createdBy: bob._id, source: 'MANUAL' });
  const stored = create.mock.calls[0].arguments[0];
  assert.equal(stored.subscriptionRef, subscriptionRef); assert.equal(stored.categorySplit[0].amountPaise, 10000);
});
test('ingest links an imported bank row to an app QR payment instead of duplicating it', async t => {
  t.mock.method(SourceRecord, 'findOne', () => ({ lean: async () => null, then: resolve => Promise.resolve(null).then(resolve) }));
  const qrId = id();
  const qr = {
    _id: qrId,
    familyId: alice.familyAccountId,
    createdBy: bob._id,
    type: 'EXPENSE',
    mode: 'UPI',
    amountPaise: 12000,
    occurredAt: new Date('2026-11-18T10:05:00Z'),
    status: 'ACTIVE',
    recipient: { name: 'Chai Wala', upiId: 'chai.wala@paytm' },
    metadata: { origin: 'QR_SCAN', timePrecision: 'minute' },
  };
  t.mock.method(Transaction, 'find', () => ({ lean: async () => [qr] }));
  t.mock.method(SourceRecord, 'find', () => ({ lean: async () => [{ transactionId: qrId, upiId: 'chai.wala@paytm' }] }));
  const sourceCreate = t.mock.method(SourceRecord, 'create', async fields => ({ ...fields, _id: id() }));
  const update = t.mock.method(Transaction, 'findByIdAndUpdate', async () => ({}));
  const txCreate = t.mock.method(Transaction, 'create', async () => assert.fail('must not create a duplicate transaction'));
  t.mock.method(Transaction, 'findById', async () => ({ ...qr, status: 'RECONCILED' }));
  const { ingest } = require('../services/transactionEngine.service');
  const bank = {
    amountPaise: 12000,
    occurredAt: new Date('2026-11-18T12:00:00Z'),
    type: 'EXPENSE',
    mode: 'BANK',
    category: 'Other',
    recipient: { name: 'UPI/DR/416123456789/CHAI WALA/YESB' },
    utr: '416123456789',
    metadata: { timePrecision: 'day', channel: 'UPI' },
    visibility: 'PRIVATE',
  };
  const result = await ingest(bank, { familyId: alice.familyAccountId, createdBy: bob._id, source: 'BANK_STATEMENT', batchId: 'batch-1' });
  assert.equal(result.reconciled, true);
  assert.equal(result.transaction._id, qrId);
  assert.equal(sourceCreate.mock.callCount(), 1);
  assert.equal(update.mock.callCount(), 1);
  assert.equal(txCreate.mock.callCount(), 0);
  const updateArgs = update.mock.calls[0].arguments;
  assert.equal(updateArgs[1].status, 'RECONCILED');
  assert.equal(updateArgs[1].metadata.origin, 'QR_SCAN');
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
