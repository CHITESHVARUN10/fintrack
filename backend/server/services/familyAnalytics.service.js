const Transaction = require('../models/transaction.model');
const User = require('../models/user.model');
const { computeLedgerSummary } = require('./transactionEngine.service');

async function getFamilyAnalytics({ familyId, from, to, memberIds, categories, modes, types }) {
  const filter = { familyId, status: { $ne: 'VOIDED' } };
  if (from || to) {
    filter.occurredAt = {};
    if (from) filter.occurredAt.$gte = new Date(from);
    if (to) { const t = new Date(to); if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) t.setHours(23,59,59,999); filter.occurredAt.$lte = t; }
  }
  if (memberIds && memberIds.length) filter.createdBy = { $in: memberIds };
  if (categories && categories.length) filter.category = { $in: categories };
  if (modes && modes.length) filter.mode = { $in: modes };
  if (types && types.length) filter.type = { $in: types };

  const items = await Transaction.find(filter).populate('createdBy','name email').lean();
  const summary = computeLedgerSummary(items);

  // time series: daily buckets
  const byDay = new Map();
  for (const t of items) {
    if (t.type !== 'EXPENSE' && t.type !== 'CASH_EXPENSE') continue;
    const k = new Date(t.occurredAt).toISOString().slice(0,10);
    byDay.set(k, (byDay.get(k)||0) + (t.amountPaise||0));
  }
  const timeSeries = Array.from(byDay.entries()).sort((a,b)=> a[0].localeCompare(b[0])).map(([date, spendPaise])=> ({ date, spendPaise, spend: spendPaise/100 }));

  // by member
  const byMemberMap = new Map();
  for (const t of items) {
    if (t.type !== 'EXPENSE' && t.type !== 'CASH_EXPENSE') continue;
    const id = String(t.createdBy?._id || t.createdBy || 'unknown');
    const name = t.createdBy?.name || id.slice(0,8);
    const cur = byMemberMap.get(id) || { memberId: id, name, spendPaise: 0, count: 0 };
    cur.spendPaise += t.amountPaise||0; cur.count++;
    byMemberMap.set(id, cur);
  }
  const byMember = Array.from(byMemberMap.values()).map(m=> ({ ...m, spend: m.spendPaise/100 })).sort((a,b)=> b.spendPaise-a.spendPaise);

  // by category
  const byCat = new Map();
  for (const t of items) {
    if (t.type !== 'EXPENSE' && t.type !== 'CASH_EXPENSE') continue;
    const k = t.category || 'Other';
    byCat.set(k, (byCat.get(k)||0)+(t.amountPaise||0));
  }
  const byCategory = Array.from(byCat.entries()).map(([category, spendPaise])=> ({ category, spendPaise, spend: spendPaise/100 })).sort((a,b)=> b.spendPaise-a.spendPaise);

  // by vendor (top 10)
  const byVendor = new Map();
  for (const t of items) {
    if (t.type !== 'EXPENSE' && t.type !== 'CASH_EXPENSE') continue;
    const k = String(t.recipient?.name||'Unknown').trim().slice(0,60) || 'Unknown';
    const cur = byVendor.get(k) || { vendor: k, spendPaise: 0, count: 0 };
    cur.spendPaise += t.amountPaise||0; cur.count++;
    byVendor.set(k, cur);
  }
  const topVendors = Array.from(byVendor.values()).map(v=> ({ ...v, spend: v.spendPaise/100 })).sort((a,b)=> b.spendPaise-a.spendPaise).slice(0,10);

  // by mode
  const byMode = new Map();
  for (const t of items) {
    if (t.type !== 'EXPENSE' && t.type !== 'CASH_EXPENSE') continue;
    const k = t.mode || 'OTHER';
    byMode.set(k, (byMode.get(k)||0)+(t.amountPaise||0));
  }
  const byModeArr = Array.from(byMode.entries()).map(([mode, spendPaise])=> ({ mode, spendPaise, spend: spendPaise/100 }));

  // heatmap: already byDay, expose as array; highest
  const heatmap = Array.from(byDay.entries()).map(([date, spendPaise])=> ({ date, spendPaise, spend: spendPaise/100 }));
  const highestDay = heatmap.length ? heatmap.reduce((a,b)=> a.spendPaise>b.spendPaise?a:b) : null;

  // avg daily (over range or span of data)
  let days = 1;
  if (from && to) days = Math.max(1, Math.ceil((new Date(to)-new Date(from))/86400000)+1);
  else if (heatmap.length) {
    const ds = heatmap.map(h=> h.date).sort();
    days = Math.max(1, Math.ceil((new Date(ds[ds.length-1])-new Date(ds[0]))/86400000)+1);
  }
  const avgDailyPaise = Math.round((summary.actualExpenditurePaise||0)/days);

  return { summary, timeSeries, byMember, byCategory, topVendors, byMode: byModeArr, heatmap, highestDay, avgDailyPaise, avgDaily: avgDailyPaise/100, totalCount: items.length };
}

module.exports = { getFamilyAnalytics };
