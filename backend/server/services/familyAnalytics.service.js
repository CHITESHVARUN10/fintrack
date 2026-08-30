const Transaction = require('../models/transaction.model');
const User = require('../models/user.model');
const { computeLedgerSummary } = require('./transactionEngine.service');

async function getFamilyAnalytics({ familyId, from, to, memberIds, categories, modes, types, requesterId, includePrivate = false }) {
  const filter = { familyId, status: { $ne: 'VOIDED' } };
  // PRIVATE is invisible to other members even in aggregates
  if (!includePrivate && requesterId) {
    filter.$and = [{ $or: [{ visibility: { $ne: 'PRIVATE' } }, { createdBy: requesterId }] }];
  } else if (!includePrivate) {
    filter.visibility = { $ne: 'PRIVATE' };
  }
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

  // heatmap: zero-fill range so empty days are visible
  let heatmap = [];
  if (from && to) {
    const start = new Date(from); start.setHours(0,0,0,0);
    const end = new Date(to); end.setHours(0,0,0,0);
    for (let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
      const k=d.toISOString().slice(0,10);
      const spendPaise = byDay.get(k)||0;
      heatmap.push({ date:k, spendPaise, spend: spendPaise/100 });
    }
  } else {
    heatmap = Array.from(byDay.entries()).sort((a,b)=> a[0].localeCompare(b[0])).map(([date, spendPaise])=> ({ date, spendPaise, spend: spendPaise/100 }));
    // also fill gaps between min and max day in data
    if (heatmap.length>1){
      const min=new Date(heatmap[0].date), max=new Date(heatmap[heatmap.length-1].date);
      const filled=[];
      for (let d=new Date(min); d<=max; d.setDate(d.getDate()+1)){
        const k=d.toISOString().slice(0,10);
        const found=heatmap.find(h=> h.date===k);
        filled.push(found||{date:k, spendPaise:0, spend:0});
      }
      heatmap=filled;
    }
  }
  const highestDay = heatmap.length ? heatmap.reduce((a,b)=> a.spendPaise>b.spendPaise?a:b) : null;
  if (highestDay && highestDay.spendPaise===0) { /* no spend days, keep null-ish */ }

  // avg daily (over range or span of data)
  let days = 1;
  if (from && to) days = Math.max(1, Math.ceil((new Date(to)-new Date(from))/86400000)+1);
  else if (heatmap.length) {
    const ds = heatmap.map(h=> h.date).sort();
    days = Math.max(1, Math.ceil((new Date(ds[ds.length-1])-new Date(ds[0]))/86400000)+1);
  }
  const avgDailyPaise = Math.round((summary.actualExpenditurePaise||0)/days);

  // 100% share calculations (all based on actualExpenditurePaise total)
  const totalExpensePaise = summary.actualExpenditurePaise || 0;
  const byMemberShare = byMember.map((m) => ({ ...m, sharePct: totalExpensePaise ? (m.spendPaise / totalExpensePaise) * 100 : 0 }));
  const byCategoryShare = byCategory.map((c) => ({ ...c, sharePct: totalExpensePaise ? (c.spendPaise / totalExpensePaise) * 100 : 0 }));
  const byVendorShare = topVendors.map((v) => ({ ...v, sharePct: totalExpensePaise ? (v.spendPaise / totalExpensePaise) * 100 : 0 }));
  const byModeShare = byModeArr.map((m) => ({ ...m, sharePct: totalExpensePaise ? (m.spendPaise / totalExpensePaise) * 100 : 0 }));

  // monthly area (income vs expense) for AreaChart
  const monthlyMap = new Map();
  for (const t of items) {
    const k = new Date(t.occurredAt).toISOString().slice(0, 7);
    const cur = monthlyMap.get(k) || { month: k, expensePaise: 0, incomePaise: 0 };
    if (t.type === 'EXPENSE' || t.type === 'CASH_EXPENSE') cur.expensePaise += t.amountPaise || 0;
    else if (t.type === 'INCOME') cur.incomePaise += t.amountPaise || 0;
    monthlyMap.set(k, cur);
  }
  const monthlyArea = Array.from(monthlyMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({ month: m.month, expense: m.expensePaise / 100, income: m.incomePaise / 100, expensePaise: m.expensePaise, incomePaise: m.incomePaise, net: (m.incomePaise - m.expensePaise) / 100 }));

  // member x vendor matrix (for drilldown)
  const byMemberByVendorMap = new Map();
  for (const t of items) {
    if (t.type !== 'EXPENSE' && t.type !== 'CASH_EXPENSE') continue;
    const memberId = String(t.createdBy?._id || t.createdBy || 'unknown');
    const memberName = t.createdBy?.name || memberId.slice(0, 8);
    const vendor = String(t.recipient?.name || 'Unknown').trim().slice(0, 60) || 'Unknown';
    const key = `${memberId}__${vendor}`;
    const cur = byMemberByVendorMap.get(key) || { memberId, memberName, vendor, spendPaise: 0, count: 0 };
    cur.spendPaise += t.amountPaise || 0;
    cur.count += 1;
    byMemberByVendorMap.set(key, cur);
  }
  const byMemberByVendor = Array.from(byMemberByVendorMap.values())
    .map((v) => ({ ...v, spend: v.spendPaise / 100 }))
    .sort((a, b) => b.spendPaise - a.spendPaise)
    .slice(0, 50);

  return {
    summary,
    timeSeries,
    byMember,
    byCategory,
    topVendors,
    byMode: byModeArr,
    heatmap,
    highestDay,
    avgDailyPaise,
    avgDaily: avgDailyPaise / 100,
    totalCount: items.length,
    byMemberShare,
    byCategoryShare,
    byVendorShare,
    byModeShare,
    monthlyArea,
    byMemberByVendor,
  };
}

module.exports = { getFamilyAnalytics };
