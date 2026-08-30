const express = require('express');
const { isAuthenticated } = require('../middleware/auth.middleware');
const RecipientDirectory = require('../models/recipientdirectory.model');
const Transaction = require('../models/transaction.model');
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
    const { from, to, memberId, category, productName, limit, skip } = req.query;
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

    // Fetch transactions family-scoped; try to use recipientVendorRef index first
    const baseFilter = { familyId: req.user.familyAccountId };
    if (hasDate) baseFilter.occurredAt = filterDate;
    if (memberId) baseFilter.createdBy = memberId;
    if (category) baseFilter.category = category;
    if (productName) baseFilter.productName = { $regex: String(productName).trim(), $options:'i' };

    // First try direct ref match + fallback to name/upi fuzzy
    let candidates = await Transaction.find(baseFilter).sort({ occurredAt:-1 }).populate('createdBy','name email').populate('recipientVendorRef').lean();
    // If we have many, we already filtered by family+date/member etc. Now narrow to this vendor
    const matched = [];
    let totalPaise=0;
    const byCategory={};
    const bySubcategory={};
    const byProduct={};
    const byMember={}; // memberId -> {name, paise, count}
    const monthlyBucketsMap={}; // YYYY-MM -> paise
    for(const t of candidates){
      // quick ref hit check
      let hit=false;
      if (String(t.recipientVendorRef?._id || t.recipientVendorRef || '') === String(vendor._id)) hit=true;
      else {
        const tVk = normalizeVendorKey(t.recipient?.name||'', t.upiId||t.recipient?.upiId||'');
        const tUpi = String(t.upiId||t.recipient?.upiId||'').toLowerCase();
        hit = (vk && tVk===vk) || (upi && tUpi===upi);
        // also check aliases
        if(!hit && vendor.aliases && vendor.aliases.length){
          const nameLow = String(t.recipient?.name||'').toLowerCase();
          for(const alias of vendor.aliases){ if(alias && nameLow.includes(String(alias).toLowerCase())){ hit=true; break; } }
        }
      }
      if(!hit) continue;
      matched.push(t);
    }
    // sort matched already by occurredAt desc due to query, but ensure
    matched.sort((a,b)=> new Date(b.occurredAt)-new Date(a.occurredAt));
    const paged = matched.slice(sk, sk+lim);
    for(const t of matched){
      if(t.type==='EXPENSE' || t.type==='CASH_EXPENSE'){
        const amt=t.amountPaise||0;
        totalPaise += amt;
        const c=t.category||'Other'; byCategory[c]=(byCategory[c]||0)+amt;
        if(t.subcategory){ bySubcategory[t.subcategory]=(bySubcategory[t.subcategory]||0)+amt; }
        const pname = t.productName || (t.lineItems&&t.lineItems[0]?.productName) || '';
        if(pname){ byProduct[pname]=(byProduct[pname]||0)+amt; }
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
    res.json({
      vendor,
      transactions: paged,
      totalPaise,
      totalFilteredCount: matched.length,
      totalFormatted: `₹${(totalPaise/100).toLocaleString('en-IN')}`,
      byCategory,
      bySubcategory,
      byProduct,
      byMember: byMemberArr,
      monthlyBuckets,
      count: matched.length,
      pagedCount: paged.length,
      skip: sk,
      limit: lim,
    });
  } catch(err){ next(err) }
});
module.exports = router;
