const IST_OFFSET_MS = 330 * 60000;
const DAY_MS = 86400000;

// Search days follow the reader's local (IST) calendar, so a payment made late
// in the evening still belongs to the day shown in the app.
function localDayStart(value) {
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(start).toISOString().slice(0, 10) === text ? start - IST_OFFSET_MS : null;
}

// Both ends are inclusive whole local days; the end becomes an exclusive bound
// on the following midnight so no same-day ledger entry is dropped.
function localDayRange(from, to) {
  if (!from && !to) return null;
  const start = from ? localDayStart(from) : null;
  const end = to ? localDayStart(to) : null;
  if ((from && start == null) || (to && end == null) || (start != null && end != null && start > end)) {
    return { error: 'Choose a valid date range' };
  }
  return {
    ...(start != null ? { $gte: new Date(start) } : {}),
    ...(end != null ? { $lt: new Date(end + DAY_MS) } : {}),
  };
}

function ledgerDateRange(from, to) {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if ((!from || date.test(from)) && (!to || date.test(to))) return localDayRange(from, to);
  const start = from ? (date.test(from) ? localDayStart(from) : Date.parse(from)) : null;
  const end = to ? (date.test(to) ? localDayStart(to) : Date.parse(to)) : null;
  if ((from && (start == null || !Number.isFinite(start))) ||
      (to && (end == null || !Number.isFinite(end))) ||
      (start != null && end != null && start > end)) return { error: 'Choose a valid date range' };
  return {
    ...(start != null ? { $gte: new Date(start) } : {}),
    ...(end != null ? (date.test(to) ? { $lt: new Date(end + DAY_MS) } : { $lte: new Date(end) }) : {}),
  };
}

module.exports = { localDayRange, ledgerDateRange };
