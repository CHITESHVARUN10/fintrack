const express = require('express');
const { isAuthenticated } = require('../middleware/auth.middleware');
const RecipientDirectory = require('../models/recipientdirectory.model');
const Transaction = require('../models/transaction.model');
const { activeOffsets } = require('../services/transactionOffsets');
const { buildTransactionVisibilityFilter } = require('../utils/scope');
const { vendorDisplayName } = require('../utils/vendorDisplayName');
const { normalizeVendorKey } = require('../services/recipient.service');
const router = express.Router();
router.use(isAuthenticated);
function requireFamily(req,res){ if(!req.user.familyAccountId){ res.status(400).json({ error:'Join or create a family first'}); return false } return true }
// GET /api/vendors/:id/transactions — all transactions for a vendor (family-scoped) with rich aggregations
router.get('/:id/transactions', async (req,res,next)=>{
  try{
    if(!requireFamily(req,res)) return;
    const vendor = await RecipientDirectory.findById(req.params.id);
    if(!vendor) return res.status(404).json({ error:'Vendor not found'});
    if(String(vendor.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden'});
    const vk = String(vendor.vendorKey||'').toLowerCase();
    const upi = String(vendor.upiId||'').toLowerCase();
    // optional filters
    const { from, to, memberId, category, productName, limit, skip, amountPaise } = req.query;
    if (amountPaise !== undefined &&
        (typeof amountPaise !== 'string' || !/^\d+$/.test(amountPaise) ||
          !Number.isSafeInteger(Number(amountPaise)) || Number(amountPaise) <= 0)) {
      return res.status(400).json({ error: 'Enter a valid amount' });
    }
    const filterDate = {};
    if (from) filterDate.$gte = new Date(from);
    if (to){
      const t = new Date(to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) t.setHours(23,59,59,999);
      filterDate.$lte = t;
    }
    const hasDate = Object.keys(filterDate).length;
    const lim = Math.min(1000, Math.max(1, parseInt(String(limit||200),10)||200));
    const sk = Math.max(0, parseInt(String(skip||0),10)||0);

    // Fetch transactions family-scoped; unshared months and PRIVATE rows stay
    // invisible to other members even in vendor aggregates.
    const visibility = await buildTransactionVisibilityFilter(req, { familyId: req.user.familyAccountId });
    const baseFilter = { familyId: req.user.familyAccountId, status: { $ne: 'VOIDED' }, $and: [visibility] };
    if (hasDate) baseFilter.occurredAt = filterDate;
    if (memberId) {
      if (String(memberId) !== String(req.user._id) && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admin can filter by member' });
      }
      baseFilter.createdBy = memberId;
    }
    if (category) baseFilter.category = category;
    if (amountPaise !== undefined) baseFilter.amountPaise = Number(amountPaise);
    if (productName) baseFilter.productName = {
      $regex: String(productName).trim().slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i',
    };

    // First try direct ref match + fallback to name/upi fuzzy
    const [candidates, offsets] = await Promise.all([
      Transaction.find(baseFilter).sort({ occurredAt: -1, _id: -1 }).populate('createdBy', 'name email')
        .populate('recipientVendorRef', 'label upiId').populate('subscriptionRef').lean(),
      activeOffsets(req.user.familyAccountId, memberId),
    ]);
    // If we have many, we already filtered by family+date/member etc. Now narrow to this vendor
    const matched = [];
    let totalPaise=0;
    const byCategory = Object.create(null);
    const bySubcategory = Object.create(null);
    const byProduct = Object.create(null);
    const productCounts = new Map();
    const byMember={}; // memberId -> {name, paise, count}
    const monthlyBucketsMap={}; // YYYY-MM -> paise
    for(const t of candidates){
      // quick ref hit check
      let hit=false;
      const reference = t.recipientVendorRef?._id || t.recipientVendorRef;
      if (reference) hit = String(reference) === String(vendor._id);
      else {
        const tVk = normalizeVendorKey(t.recipient?.name||'', t.upiId||t.recipient?.upiId||'');
        const tUpi = String(t.upiId||t.recipient?.upiId||'').toLowerCase();
        const knownName = vendorDisplayName({ name: vendor.label, upiId: vendor.upiId }).toLowerCase();
        const observedName = vendorDisplayName(t.recipient).toLowerCase();
        hit = (vk && vk !== 'upi' && tVk === vk) || (upi && tUpi === upi) ||
          (knownName !== 'unknown' && knownName === observedName);
        // also check aliases
        if(!hit && vendor.aliases && vendor.aliases.length){
          const nameLow = String(t.recipient?.name||'').toLowerCase();
          for(const alias of vendor.aliases){ if(alias && nameLow.includes(String(alias).toLowerCase())){ hit=true; break; } }
        }
      }
      if(!hit) continue;
      matched.push(offsets.has(String(t._id)) ? { ...t, isOffset: true } : t);
    }
    const paged = matched.slice(sk, sk+lim);
    for(const t of matched){
      if (!t.isOffset && (t.type === 'EXPENSE' || t.type === 'CASH_EXPENSE')) {
        const amt=t.amountPaise||0;
        totalPaise += amt;
        const c=t.category||'Other'; byCategory[c]=(byCategory[c]||0)+amt;
        if(t.subcategory){ bySubcategory[t.subcategory]=(bySubcategory[t.subcategory]||0)+amt; }
        const pname = t.productName || (t.lineItems&&t.lineItems[0]?.productName) || '';
        if(pname){ byProduct[pname]=(byProduct[pname]||0)+amt; }
        if (amountPaise !== undefined) {
          const seen = new Set();
          for (const label of [t.productName, ...(t.lineItems || []).map(row => row.productName)]) {
            const name = label?.trim();
            const key = name?.toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            const product = productCounts.get(key) || { name, count: 0 };
            product.count++;
            productCounts.set(key, product);
          }
        }
        const mid = String(t.createdBy?._id || t.createdBy || 'unknown');
        const mname = t.createdBy?.name || (typeof t.createdBy==='string'? t.createdBy.slice(0,8): 'Unknown');
        if(!byMember[mid]) byMember[mid]={ name:mname, paise:0, count:0 };
        byMember[mid].paise+=amt; byMember[mid].count+=1;
        const mkey = new Date(t.occurredAt).toISOString().slice(0,7);
        monthlyBucketsMap[mkey]=(monthlyBucketsMap[mkey]||0)+amt;
      }
    }
    const monthlyBuckets = Object.entries(monthlyBucketsMap).sort((a,b)=> a[0].localeCompare(b[0])).map(([month,paise])=> ({ month, paise, spend: paise/100 }));
    const byMemberArr = Object.entries(byMember).map(([id,v])=> ({ memberId:id, name:v.name, paise:v.paise, spend:v.paise/100, count:v.count }));
    // linked subscriptions for this vendor (via transactions)
    const linkedSubsMap = new Map();
    for (const t of matched) {
      if (t.subscriptionRef) {
        const sid = String(t.subscriptionRef._id || t.subscriptionRef);
        if (!linkedSubsMap.has(sid)) linkedSubsMap.set(sid, t.subscriptionRef);
      }
    }
    const linkedSubscriptions = Array.from(linkedSubsMap.values());
    res.json({
      vendor,
      transactions: paged,
      totalPaise,
      totalFilteredCount: matched.length,
      totalFormatted: `₹${(totalPaise/100).toLocaleString('en-IN')}`,
      byCategory,
      bySubcategory,
      byProduct,
      ...(amountPaise !== undefined ? { productsAtAmount: [...productCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) } : {}),
      byMember: byMemberArr,
      monthlyBuckets,
      linkedSubscriptions,
      count: matched.length,
      pagedCount: paged.length,
      skip: sk,
      limit: lim,
    });
  } catch(err){ next(err) }
});
module.exports = router;
