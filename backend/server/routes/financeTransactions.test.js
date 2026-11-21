const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const Investment = require('../models/investment.model');
const Transaction = require('../models/transaction.model');
const { registerFinanceTransactions, isSuggested, payerOf } = require('./financeTransactions');

const ids = () => ({ family: new mongoose.Types.ObjectId(), owner: new mongoose.Types.ObjectId() });

async function listTransactions(req) {
  const router = express.Router();
  registerFinanceTransactions(router, Investment, 'investments');
  const handlers = router.stack
    .find(layer => layer.route?.path === '/:id/transactions' && layer.route.methods.get)
    .route.stack.map(step => step.handle);
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let loaded = false;
  await handlers[0](req, res, err => { if (err) throw err; loaded = true; });
  if (!loaded) return res;
  await handlers[1](req, res, err => { if (err) throw err; });
  return res;
}

// The date/amount filters must reach Mongo so they narrow the whole result set
// before pagination, instead of filtering only the rows on the current page.
function captureQuery(t, scope) {
  const chains = [];
  t.mock.method(Investment, 'findOne', () => ({
    lean: async () => ({
      _id: scope.investment,
      investmentType: 'fd',
      memberId: scope.member,
      familyAccountId: scope.family,
    }),
  }));
  t.mock.method(Transaction, 'find', filter => {
    const chain = {
      filter,
      select() { return chain; },
      sort() { return chain; },
      skip(n) { chain.skipped = n; return chain; },
      limit(n) { chain.limited = n; return chain; },
      lean: async () => [],
    };
    chains.push(chain);
    return chain;
  });
  return chains;
}

function request(scope, query) {
  return {
    user: { _id: scope.member, familyAccountId: scope.family, role: 'member' },
    params: { id: String(scope.investment) },
    query,
    body: {},
  };
}

test('FD dates clamp to the last day of a short month before adding extra days', async () => {
  const deposit = new Investment({
    memberId: new mongoose.Types.ObjectId(),
    familyAccountId: new mongoose.Types.ObjectId(),
    investmentType: 'fd',
    startDate: '2024-01-31',
    principalAmount: 50000,
    interestRate: 7.2,
    tenureMonths: 1,
    tenureDays: 3,
    maturityAction: 'renew_principal',
  });

  await deposit.validate();
  assert.equal(deposit.maturityDate.toISOString(), '2024-03-03T00:00:00.000Z');

  deposit.maturityDate = '2024-01-30';
  await assert.rejects(deposit.validate(), /Maturity must be after the opening date/);
});

test('income suggestions learn the payer across distinct statement references', () => {
  const confirmed = { recipient: { name: 'NEFT-HDFC000123451-ACME SERVICES-SALARY' } };
  const payers = new Set([payerOf(confirmed)]);
  const credit = {
    recipient: { name: 'NEFT-HDFC000876543-ACME SERVICES-SALARY' },
    amountPaise: 7000000,
    occurredAt: new Date('2024-02-29T08:00:00Z'),
  };

  const regular = { payPattern: 'regular', amount: 70000, creditDate: 31 };
  assert.equal(isSuggested(credit, regular, payers), true);
  assert.equal(isSuggested({ ...credit, amountPaise: 5000000 }, regular, payers), false);
  const differentDay = { ...credit, occurredAt: new Date('2024-03-18T08:00:00Z') };
  assert.equal(isSuggested(differentDay, regular, payers), false);
  assert.equal(isSuggested(differentDay, { payPattern: 'variable' }, payers), true);
  assert.equal(isSuggested({ ...credit, sender: { name: 'Other payer' } }, regular, payers), false);
});

const scope = () => ({
  family: new mongoose.Types.ObjectId(),
  member: new mongoose.Types.ObjectId(),
  investment: new mongoose.Types.ObjectId(),
});

test('search days are inclusive local days around IST midnight', async t => {
  const fd = scope();
  const chains = captureQuery(t, fd);
  const res = await listTransactions(request(fd, { view: 'available', role: 'deposit', from: '2026-11-18', to: '2026-11-18' }));
  assert.equal(res.statusCode, 200);
  // 2026-11-18 00:00 IST is 2026-11-17T18:30Z; the exclusive end is the next local midnight.
  assert.deepEqual(chains[0].filter.$and.at(-1).occurredAt, {
    $gte: new Date('2026-11-17T18:30:00.000Z'),
    $lt: new Date('2026-11-18T18:30:00.000Z'),
  });

  await listTransactions(request(fd, { view: 'available', role: 'deposit', to: '2026-11-18' }));
  assert.deepEqual(chains[1].filter.$and.at(-1).occurredAt, { $lt: new Date('2026-11-18T18:30:00.000Z') });

  await listTransactions(request(fd, { view: 'available', role: 'deposit', from: '2026-11-18' }));
  assert.deepEqual(chains[2].filter.$and.at(-1).occurredAt, { $gte: new Date('2026-11-17T18:30:00.000Z') });
});

test('an inverted or malformed day range is refused instead of ignored', async t => {
  const fd = scope();
  captureQuery(t, fd);
  const inverted = await listTransactions(request(fd, { view: 'available', role: 'deposit', from: '2026-11-19', to: '2026-11-18' }));
  assert.equal(inverted.statusCode, 400);
  const malformed = await listTransactions(request(fd, { view: 'available', role: 'deposit', from: '2026-02-31' }));
  assert.equal(malformed.statusCode, 400);
});

test('exact amount matches integer paise in the query before pagination', async t => {
  const fd = scope();
  const chains = captureQuery(t, fd);
  await listTransactions(request(fd, { view: 'available', role: 'deposit', amountPaise: '125050', page: '3' }));
  assert.equal(chains[0].filter.amountPaise, 125050);
  assert.equal(chains[0].skipped, 40);

  const fractional = await listTransactions(request(fd, { view: 'available', role: 'deposit', amountPaise: '1250.50' }));
  assert.equal(fractional.statusCode, 400);
  const negative = await listTransactions(request(fd, { view: 'available', role: 'deposit', amountPaise: '-100' }));
  assert.equal(negative.statusCode, 400);
});

test('date and amount filters combine with the existing counterparty search', async t => {
  const fd = scope();
  const chains = captureQuery(t, fd);
  await listTransactions(request(fd, { view: 'available', role: 'deposit', q: 'acme', from: '2026-11-01', to: '2026-11-30', amountPaise: '700000' }));
  const { $and } = chains[0].filter;
  assert.equal($and.length, 2);
  assert.ok($and[0].$or.some(clause => clause['recipient.name']));
  assert.deepEqual($and[1].occurredAt, {
    $gte: new Date('2026-10-31T18:30:00.000Z'),
    $lt: new Date('2026-11-30T18:30:00.000Z'),
  });
  assert.equal(chains[0].filter.amountPaise, 700000);
});
