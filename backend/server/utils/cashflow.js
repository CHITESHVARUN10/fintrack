function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// A source is active for the month when its start is before the exclusive
// month end and its end is not before the month start.
function activeInMonth(item, monthStart, monthEnd) {
  const start = item?.startDate ? new Date(item.startDate) : null;
  const end = item?.endDate ? new Date(item.endDate) : null;
  if (start && Number.isFinite(start.getTime()) && start >= monthEnd) return false;
  if (end && Number.isFinite(end.getTime()) && end < monthStart) return false;
  return true;
}

function incomeForMonth({ incomes = [], receipts = [], monthStart, monthEnd }) {
  const received = receipts.reduce((sum, tx) => sum + (Number(tx.amountPaise) || 0), 0) / 100;
  const planned = incomes
    .filter(income => activeInMonth(income, monthStart, monthEnd))
    .reduce((sum, income) => sum + Math.max(0, Number(income.amount) || 0), 0);
  return { received: round2(received), planned: round2(planned) };
}

// Bank reversals arrive as credits but are not new income. Keep them out of
// the income plan while still showing them in the receipt timeline.
function isRefundReceipt(tx) {
  const narration = tx?.recipient?.name || tx?.sender?.name || '';
  const reversal = /(?:^|[\s/:-])(?:refund|purchase reversal)(?:[\s/:-]|$)/i.test(narration);
  return Boolean(
    tx?.metadata?.origin !== 'MANUAL' &&
    tx?.batchId &&
    reversal,
  );
}

module.exports = { activeInMonth, incomeForMonth, isRefundReceipt, round2 };
