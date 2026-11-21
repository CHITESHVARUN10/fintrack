const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Investment = require('../models/investment.model');
const { isSuggested, payerOf } = require('./financeTransactions');

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
