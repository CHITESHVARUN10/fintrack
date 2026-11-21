const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  monthRange,
  visibilityClause,
  buildTransactionVisibilityFilter,
} = require('./scope');

const id = () => new mongoose.Types.ObjectId();
const me = id();
const partner = id();

test('monthRange uses IST calendar boundaries', () => {
  const range = monthRange('2026-11');
  assert.equal(range.$gte.toISOString(), '2026-10-31T18:30:00.000Z');
  assert.equal(range.$lt.toISOString(), '2026-11-30T18:30:00.000Z');
  assert.equal(monthRange('2026-13'), null);
  assert.equal(monthRange('nope'), null);
});

test('other members need an explicitly shared month', () => {
  const clause = visibilityClause({
    userId: me,
    shares: [{ userId: partner, month: '2026-11' }],
  });
  assert.equal(clause.$or.length, 2);
  assert.equal(String(clause.$or[0].createdBy), String(me));
  const other = clause.$or[1].$and;
  assert.deepEqual(other[0], { visibility: { $ne: 'PRIVATE' } });
  assert.equal(String(other[1].$or[0].createdBy), String(partner));
  assert.equal(
    other[1].$or[0].occurredAt.$gte.toISOString(),
    '2026-10-31T18:30:00.000Z',
  );
});

test('no shared months hides every other member', () => {
  const clause = visibilityClause({ userId: me, shares: [] });
  assert.deepEqual(clause, { $or: [{ createdBy: me }] });
});

test('includePrivate skips the PRIVATE check but still needs a shared month', () => {
  const clause = visibilityClause({
    userId: me,
    shares: [{ userId: partner, month: '2026-11' }],
    includePrivate: true,
  });
  assert.equal(clause.$or[1].$and.length, 1);
  assert.ok(clause.$or[1].$and[0].$or);
});

test('a family-wide query without a requester sees only shared months', async () => {
  const clause = await buildTransactionVisibilityFilter(null, {
    familyId: id(),
    shares: [{ userId: partner, month: '2026-10' }],
  });
  assert.deepEqual(clause.$and[0], { visibility: { $ne: 'PRIVATE' } });
  assert.equal(String(clause.$and[1].$or[0].createdBy), String(partner));
});

test('a family-wide query with no shares matches nothing', async () => {
  const clause = await buildTransactionVisibilityFilter(null, {
    familyId: id(),
    shares: [],
    userId: null,
  });
  assert.deepEqual(clause, { _id: null });
});
