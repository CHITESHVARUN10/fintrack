
const express = require('express');
const RecipientDirectory = require('../../models/recipientdirectory.model');
const Transaction = require('../../models/transaction.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { normalizeVendorKey } = require('../../services/recipient.service');

const router = express.Router();
router.use(isAuthenticated);

function requireFamily(req,res){ if(!req.user.familyAccountId){ res.status(400).json({ error:'Join or create a family first'}); return false } return true }

router.get('/', async (req,res,next)=>{
  try{
    if(!requireFamily(req,res)) return;
    const q = req.query.q;
    const filter={ familyId: req.user.familyAccountId };
    if(q) filter.$or=[{ vendorKey: { $regex: q, $options:'i'} },{ label: { $regex: q, $options:'i'} },{ upiId: { $regex: q, $options:'i'} }];
    if(req.query.category) filter.category=req.query.category;
    const items = await RecipientDirectory.find(filter).sort({ hits:-1 }).limit(100);
    res.json({ items });
  } catch(err){ next(err) }
});

router.post('/', async (req,res,next)=>{
  try{
    if(!requireFamily(req,res)) return;
    const { vendorKey: vkIn, upiId, label, category } = req.body;
    if(!category) return res.status(400).json({ error:'category required'});
    const vk = (vkIn ? String(vkIn).toLowerCase().trim() : normalizeVendorKey(label||upiId||'', upiId||''));
    if(!vk && !upiId) return res.status(400).json({ error:'vendorKey or upiId required'});
    const key = vk || String(upiId).toLowerCase();
    const doc = await RecipientDirectory.findOneAndUpdate(
      { familyId: req.user.familyAccountId, vendorKey: key },
      { $set: { label: label||key, category, lastSeen: new Date(), ...(upiId?{upiId:String(upiId).toLowerCase()}:{}), createdBy: req.user._id }, $inc: { hits: 1 }, $setOnInsert: { familyId: req.user.familyAccountId, vendorKey: key } },
      { upsert:true, new:true, setDefaultsOnInsert:true }
    );
    res.status(201).json({ recipient: doc });
  } catch(err){ next(err) }
});

router.put('/:id', async (req,res,next)=>{
  try{
    const doc = await RecipientDirectory.findById(req.params.id);
    if(!doc) return res.status(404).json({ error:'Not found'});
    if(String(doc.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden'});
    if(req.body.label) doc.label=req.body.label;
    if(req.body.category) doc.category=req.body.category;
    if(req.body.upiId !== undefined) doc.upiId = req.body.upiId ? String(req.body.upiId).toLowerCase() : undefined;
    doc.lastSeen=new Date();
    await doc.save();
    res.json({ recipient: doc });
  } catch(err){ next(err) }
});

router.post('/:id/apply', async (req,res,next)=>{
  try{
    const doc = await RecipientDirectory.findById(req.params.id);
    if(!doc) return res.status(404).json({ error:'Not found'});
    if(String(doc.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden'});
    const overwrite = !!req.body.overwrite;
    // retro-apply: update historical ACTIVE/RECONCILED/PENDING_REVIEW txs matching vendor
    const needle = String(doc.label||doc.vendorKey||'').toLowerCase();
    const vk = String(doc.vendorKey||'').toLowerCase();
    // match by vendorKey derived from recipient.name or upi
    const all = await Transaction.find({ familyId: req.user.familyAccountId, status: { $ne:'VOIDED'} }).lean();
    let matched=0, updated=0;
    for(const t of all){
      const name = String(t.recipient?.name||'').toLowerCase();
      const tVk = normalizeVendorKey(t.recipient?.name||'', t.upiId||t.recipient?.upiId||'');
      const tUpi = String(t.upiId||t.recipient?.upiId||'').toLowerCase();
      const hit = (vk && tVk===vk) || (doc.upiId && tUpi && tUpi===String(doc.upiId).toLowerCase()) || (!vk && needle && name.includes(needle));
      if(!hit) continue;
      matched++;
      if(!overwrite && t.category && t.category!=='Other') continue;
      await Transaction.updateOne({ _id: t._id }, { $set: { category: doc.category } });
      updated++;
    }
    res.json({ matched, updated, category: doc.category });
  } catch(err){ next(err) }
});

module.exports = router;
