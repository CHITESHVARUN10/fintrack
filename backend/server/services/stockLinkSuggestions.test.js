const test = require('node:test');
const assert = require('node:assert/strict');
const { stockSuggestions } = require('./stockLinkSuggestions');

const acme = { _id: 'acme', ticker: 'ACME', stockName: 'Acme Industries' };
const globex = { _id: 'globex', ticker: 'GLBX', stockName: 'Globex' };
const income = (name, upiId) => ({ type: 'INCOME', recipient: { name, upiId }, amountPaise: 26030 });
const dividend = (stock, name, upiId) => ({
  ...income(name, upiId), financeLink: { recordId: stock._id, role: 'dividend' },
});

test('stock suggestions use a confirmed issuer across changed narration and amount', () => {
  const examples = [dividend(acme, 'ACME dividend', 'acme@upi')];
  const rows = [
    income('ACME DIVIDEND REF 456'),
    income('UPI/Acme Industries/HDFC/100011000111', 'acme@upi'),
    income('ACME PAYROLL', 'acme@upi'),
    income('Different vendor'),
  ];
  assert.deepEqual(stockSuggestions([acme], examples, rows).map(match => match.transaction), rows.slice(0, 2));
});

test('stock suggestions omit an ambiguous payment ID without an issuer', () => {
  const examples = [
    dividend(acme, 'ACME dividend', 'broker@upi'),
    dividend(globex, 'GLBX dividend', 'broker@upi'),
  ];
  const matched = stockSuggestions([acme, globex], examples, [
    income('Dividend credit', 'broker@upi'),
    income('ACME dividend', 'broker@upi'),
  ]);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].investmentId, acme._id);
});
