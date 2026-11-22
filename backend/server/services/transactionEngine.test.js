const test = require('node:test');
const assert = require('node:assert/strict');
const { computeLedgerSummary } = require('./transactionEngine.service');

test('unresolved and voided duplicates contribute neither spend nor movement', () => {
  const rows = ['ACTIVE', 'RECONCILED', 'PENDING_REVIEW', 'VOIDED'].map(status => ({
    status,
    type: 'EXPENSE',
    amountPaise: 31142,
  }));
  const summary = computeLedgerSummary(rows);
  assert.equal(summary.actualExpenditurePaise, 62284);
  assert.equal(summary.totalMovementPaise, 62284);
});
