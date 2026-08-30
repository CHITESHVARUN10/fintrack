const express = require('express');
const RecipientDirectory = require('../../models/recipientdirectory.model');
const Transaction = require('../../models/transaction.model');
const { isAuthenticated } = require('../../middleware/auth.middleware');
const { normalizeVendorKey, upsertFromCategory, upsertProduct, resolveProduct, normalizeProductName } = require('../../services/recipient.service');

const router = express.Router();
router.use(isAuthenticated);

function requireFamily(req,res){ if(!req.user.familyAccountId){ res.status(400).json({ error:'Join or create a family first'}); return false } return true }

function escapeRegex(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

router.get('/', async (req,res,next)=>{
  try{
    if(!requireFamily(req,res)) return;
    const q = req.query.q;
    const qOr = q ? [{ vendorKey: { $regex: escapeRegex(q), $options:'i'} },{ label: { $regex: escapeRegex(q), $options:'i'} },{ upiId: { $regex: escapeRegex(q), $options:'i'} }, { aliases: { $regex: escapeRegex(q), $options:'i'} }] : null;
    const catOr = req.query.category ? [{ primaryCategory: req.query.category }, { category: req.query.category }, { 'offerings.category': req.query.category }] : null;
    const statusFilter = req.query.status ? { status: req.query.status } : { status: { $ne: 'ARCHIVED' } };
    // allow ?includeArchived=true to show all
    const filter={ familyId: req.user.familyAccountId, ...statusFilter };
    if (req.query.includeArchived==='true') delete filter.status;
    if(qOr && catOr) filter.$and = [{ $or: qOr }, { $or: catOr }];
    else if(qOr) filter.$or = qOr;
    else if(catOr) filter.$or = catOr;
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit||100),10)||100));
    const skip = Math.max(0, parseInt(String(req.query.skip||0),10)||0);
    const items = await RecipientDirectory.find(filter).sort({ hits:-1 }).skip(skip).limit(limit);
    res.json({ items });
  } catch(err){ next(err) }
});

router.get('/by-key', async (req,res,next)=>{
  try{
    if(!requireFamily(req,res)) return;
    const vk = req.query.vendorKey ? String(req.query.vendorKey).toLowerCase().trim() : '';
    const upiId = req.query.upiId ? String(req.query.upiId).toLowerCase().trim() : '';
    const label = req.query.label || '';
    let doc=null;
    if(vk) {
      doc = await RecipientDirectory.findOne({ familyId: req.user.familyAccountId, vendorKey: vk });
      if(!doc) doc = await RecipientDirectory.findOne({ familyId: req.user.familyAccountId, aliases: vk });
    }
    if(!doc && upiId) doc = await RecipientDirectory.findOne({ familyId: req.user.familyAccountId, upiId });
    if(!doc && label){
      const nk = normalizeVendorKey(label, upiId);
      if(nk) {
        doc = await RecipientDirectory.findOne({ familyId: req.user.familyAccountId, vendorKey: nk });
        if(!doc) doc = await RecipientDirectory.findOne({ familyId: req.user.familyAccountId, aliases: nk });
      }
    }
    res.json({ vendor: doc || null });
  } catch(err){ next(err) }
});

router.get('/categories', async (req,res,next)=>{
  try{
    const { FLAT_CATEGORIES, CATEGORY_TAXONOMY } = require('../../config/transactionConfig');
    res.json({ categories: FLAT_CATEGORIES, taxonomy: CATEGORY_TAXONOMY });
  } catch(err){ next(err) }
});

router.post('/', async (req,res,next)=>{
  try{
    if(!requireFamily(req,res)) return;
    const { vendorKey: vkIn, upiId, label, category, categories, description, aliases, contact, notes, preferredMode, products, subcategories, amountPaise } = req.body;
    const cats = categories && categories.length ? categories.filter(Boolean) : (category ? [category] : []);
    if(!cats.length) return res.status(400).json({ error:'category or categories required'});
    const vk = (vkIn ? String(vkIn).toLowerCase().trim() : normalizeVendorKey(label||upiId||'', upiId||''));
    if(!vk && !upiId) return res.status(400).json({ error:'vendorKey or upiId required'});
    // standalone vendor requires UPI or mode
    const mode = preferredMode || contact?.preferredMode;
    if (!upiId && !mode) {
      // allow but warn; require at least one payment identifier—not blocking for now, but we enforce if creating without transactions
      // return res.status(400).json({ error:'UPI ID or payment mode is required for standalone vendor'});
    }

    const prods = Array.isArray(products) ? products.filter(p=> p && p.name).map(p=> ({
      name: String(p.name).trim().slice(0,80),
      category: p.category || cats[0],
      subcategory: p.subcategory || '',
      typicalAmountPaise: p.typicalAmountPaise ? Number(p.typicalAmountPaise) : (p.amountPaise ? Number(p.amountPaise) : undefined),
      unit: p.unit || '',
    })) : undefined;

    // Fast path: if exact vendor exists (by vendorKey or upiId), update instead of create (avoids race duplicate on rapid clicks)
    let existing = null
    if (vk) existing = await RecipientDirectory.findOne({ familyId: req.user.familyAccountId, vendorKey: vk })
    if (!existing && upiId) existing = await RecipientDirectory.findOne({ familyId: req.user.familyAccountId, upiId: String(upiId).toLowerCase() })
    if (existing) {
      const res2 = await upsertFromCategory({ familyId: req.user.familyAccountId, createdBy: req.user._id, vendorKey: existing.vendorKey, upiId, label: label||existing.label||vk||String(upiId), categories: cats, subcategories, products: prods, amountPaise: amountPaise ? Number(amountPaise) : undefined });
      if (!res2) {
        // fallback directly to existing if upsert returned null
        return res.status(409).json({ error:'Vendor conflict — found existing by UPI, please retry' });
      }
      // apply extra fields
      if (description !== undefined) res2.description = description;
      if (aliases !== undefined) res2.aliases = Array.isArray(aliases) ? aliases.filter(Boolean).map(s=> String(s).trim().toLowerCase().slice(0,50)) : [];
      if (contact !== undefined) {
        res2.contact = res2.contact || {};
        if (contact.phone !== undefined) res2.contact.phone = String(contact.phone).trim().slice(0,20);
        if (contact.email !== undefined) res2.contact.email = String(contact.email).trim().slice(0,80);
        if (contact.address !== undefined) res2.contact.address = String(contact.address).trim().slice(0,200);
        if (contact.preferredMode) res2.contact.preferredMode = contact.preferredMode;
      }
      if (preferredMode) { res2.contact = res2.contact || {}; res2.contact.preferredMode = preferredMode; }
      if (notes !== undefined) res2.notes = String(notes).trim().slice(0,500);
      try { await res2.save(); } catch(e){
        if(e.code===11000) {
          // upi conflict after extra fields, fetch again
          const fresh = await RecipientDirectory.findById(res2._id);
          return res.status(200).json({ recipient: fresh, updated: true });
        }
        throw e;
      }
      return res.status(200).json({ recipient: res2, updated: true });
    }
    let doc = await upsertFromCategory({ familyId: req.user.familyAccountId, createdBy: req.user._id, vendorKey: vk, upiId, label: label||vk||String(upiId), categories: cats, subcategories, products: prods, amountPaise: amountPaise ? Number(amountPaise) : undefined });
    if (!doc) {
      // try fallback by upi/vk if creation returned null due to duplicate
      if (upiId) doc = await RecipientDirectory.findOne({ familyId: req.user.familyAccountId, upiId: String(upiId).toLowerCase() });
      if (!doc && vk) doc = await RecipientDirectory.findOne({ familyId: req.user.familyAccountId, vendorKey: vk });
      if (!doc) return res.status(500).json({ error:'Failed to create vendor — possible duplicate UPI' });
    }
    let needsSave=false;
    if (description) { doc.description = String(description).trim().slice(0,500); needsSave=true; }
    if (aliases && Array.isArray(aliases)) { doc.aliases = aliases.filter(Boolean).map(s=> String(s).trim().toLowerCase().slice(0,50)); needsSave=true; }
    if (contact) {
      doc.contact = doc.contact || {};
      if (contact.phone) { doc.contact.phone = String(contact.phone).trim().slice(0,20); needsSave=true; }
      if (contact.email) { doc.contact.email = String(contact.email).trim().slice(0,80); needsSave=true; }
      if (contact.address) { doc.contact.address = String(contact.address).trim().slice(0,200); needsSave=true; }
      if (contact.preferredMode) { doc.contact.preferredMode = contact.preferredMode; needsSave=true; }
    }
    if (preferredMode) { doc.contact = doc.contact || {}; doc.contact.preferredMode = preferredMode; needsSave=true; }
    if (notes) { doc.notes = String(notes).trim().slice(0,500); needsSave=true; }
    if (needsSave) {
      try { await doc.save(); } catch(e){
        if(e.code===11000) {
          // return the doc as-is if duplicate on second save (already has upi)
          const fresh = await RecipientDirectory.findById(doc._id);
          return res.status(201).json({ recipient: fresh || doc });
        }
        throw e;
      }
    }
    res.status(201).json({ recipient: doc });
  } catch(err){
    if (err && err.code === 11000) {
      try{
        // idempotent fallback – duplicate means vendor already exists, return it as success
        let found=null;
        // vk and upiId are from outer scope
        const _vk = (typeof vk !== 'undefined' ? vk : null);
        const _upi = (typeof upiId !== 'undefined' ? upiId : null);
        if(_vk) found = await RecipientDirectory.findOne({ familyId: req.user.familyAccountId, vendorKey: _vk });
        if(!found && _vk) found = await RecipientDirectory.findOne({ familyId: req.user.familyAccountId, aliases: _vk });
        if(!found && _upi) found = await RecipientDirectory.findOne({ familyId: req.user.familyAccountId, upiId: String(_upi).toLowerCase() });
        if(found){
          // ensure categories are merged even on duplicate race
          try{
            const catsDup = (typeof cats !== 'undefined' && cats.length ? cats : []);
            if(catsDup.length){
              const merged = await upsertFromCategory({ familyId: req.user.familyAccountId, createdBy: req.user._id, vendorKey: found.vendorKey, upiId: _upi, label: (typeof label !== 'undefined' ? label : found.label), categories: catsDup });
              if(merged) return res.status(200).json({ recipient: merged, updated: true });
            }
          }catch{}
          return res.status(200).json({ recipient: found, updated: true, duplicate:true });
        }
      }catch{}
      return res.status(409).json({ error:'Vendor already exists — updated instead. Please reopen.', code:11000 });
    }
    next(err)
  }
});

router.put('/:id', async (req,res,next)=>{
  try{
    const doc = await RecipientDirectory.findById(req.params.id);
    if(!doc) return res.status(404).json({ error:'Not found'});
    if(String(doc.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden'});
    if(req.body.label !== undefined) doc.label=String(req.body.label).trim().slice(0,80) || doc.label;
    if(req.body.description !== undefined) doc.description = String(req.body.description||'').trim().slice(0,500);
    if(req.body.aliases !== undefined) doc.aliases = Array.isArray(req.body.aliases) ? req.body.aliases.filter(Boolean).map(s=> String(s).trim().toLowerCase().slice(0,50)) : [];
    if(req.body.notes !== undefined) doc.notes = String(req.body.notes||'').trim().slice(0,500);
    if(req.body.status !== undefined){
      const st = String(req.body.status).toUpperCase();
      if (['ACTIVE','ARCHIVED'].includes(st)) doc.status = st;
    }
    if(req.body.contact !== undefined){
      doc.contact = doc.contact || {};
      if(req.body.contact.phone !== undefined) doc.contact.phone = String(req.body.contact.phone||'').trim().slice(0,20) || undefined;
      if(req.body.contact.email !== undefined) doc.contact.email = String(req.body.contact.email||'').trim().slice(0,80) || undefined;
      if(req.body.contact.address !== undefined) doc.contact.address = String(req.body.contact.address||'').trim().slice(0,200) || undefined;
      if(req.body.contact.preferredMode !== undefined) doc.contact.preferredMode = req.body.contact.preferredMode || undefined;
    }
    if(req.body.preferredMode !== undefined){
      doc.contact = doc.contact || {};
      doc.contact.preferredMode = req.body.preferredMode || undefined;
    }
    if(req.body.categories && Array.isArray(req.body.categories)){
      // replace offerings from categories array — keep subcategories if supplied via subcategories map
      const cats = req.body.categories.filter(Boolean);
      const subMap = req.body.subcategories || {};
      doc.offerings = cats.map(c=> ({
        category:c,
        hits: (doc.offerings.find(o=> o.category===c)?.hits || 1),
        lastSeen:new Date(),
        subcategories: Array.isArray(subMap[c]) ? subMap[c].filter(Boolean).map(s=> String(s).trim().slice(0,40)) : (doc.offerings.find(o=> o.category===c)?.subcategories || [])
      }));
      doc.primaryCategory = doc.offerings[0]?.category || doc.primaryCategory;
      doc.category = doc.primaryCategory;
    } else if(req.body.category){
      const updated = await upsertFromCategory({ familyId: doc.familyId, vendorKey: doc.vendorKey, upiId: doc.upiId, label: doc.label, category: req.body.category });
      return res.json({ recipient: updated });
    }
    // products batch replace if supplied
    if(req.body.products !== undefined && Array.isArray(req.body.products)){
      // full replace
      doc.products = req.body.products.filter(p=> p && p.name).map(p=> ({
        name: String(p.name).trim().slice(0,80),
        category: p.category || doc.primaryCategory || 'Other',
        subcategory: p.subcategory || '',
        typicalAmountPaise: p.typicalAmountPaise ? Number(p.typicalAmountPaise) : (p.amountPaise ? Number(p.amountPaise): null),
        unit: p.unit || '',
        hits: p.hits || 1,
        lastSeen: p.lastSeen ? new Date(p.lastSeen) : new Date(),
      }));
      // rebuild priceMap from products
      doc.priceMap = [];
      for(const prod of doc.products){
        if(prod.typicalAmountPaise){
          doc.priceMap.push({ amountPaise: prod.typicalAmountPaise, productRef: prod._id, hits: prod.hits||1, lastSeen: prod.lastSeen||new Date() });
        }
      }
    }
    if(req.body.upiId !== undefined) doc.upiId = req.body.upiId ? String(req.body.upiId).toLowerCase() : undefined;
    if(req.body.vendorKey !== undefined){
      const newVk = String(req.body.vendorKey).toLowerCase().trim();
      if(newVk) doc.vendorKey = newVk;
    }
    doc.lastSeen=new Date();
    await doc.save();
    res.json({ recipient: doc });
  } catch(err){ next(err) }
});

router.delete('/:id', async (req,res,next)=>{
  try{
    const doc = await RecipientDirectory.findById(req.params.id);
    if(!doc) return res.status(404).json({ error:'Not found'});
    if(String(doc.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden'});
    // soft archive instead of hard delete to preserve history
    if (req.query.hard==='true'){
      await RecipientDirectory.findByIdAndDelete(req.params.id);
      return res.json({ deleted:true });
    }
    doc.status='ARCHIVED';
    await doc.save();
    res.json({ archived:true, recipient: doc });
  } catch(err){ next(err) }
});

// --- products sub-resource ---
router.post('/:id/products', async (req,res,next)=>{
  try{
    const doc = await RecipientDirectory.findById(req.params.id);
    if(!doc) return res.status(404).json({ error:'Vendor not found'});
    if(String(doc.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden'});
    const { name, category, subcategory, typicalAmountPaise, amountPaise, unit } = req.body;
    if(!name || !String(name).trim()) return res.status(400).json({ error:'name required'});
    const amt = typicalAmountPaise ? Number(typicalAmountPaise) : (amountPaise ? Number(amountPaise) : null);
    const result = await upsertProduct({
      familyId: doc.familyId,
      vendorKey: doc.vendorKey,
      upiId: doc.upiId,
      label: doc.label,
      product: { name: String(name).trim(), category: category||doc.primaryCategory||'Other', subcategory: subcategory||'', typicalAmountPaise: amt, unit: unit||'' },
    });
    res.json({ recipient: result });
  } catch(err){ next(err) }
});

router.put('/:id/products/:prodId', async (req,res,next)=>{
  try{
    const doc = await RecipientDirectory.findById(req.params.id);
    if(!doc) return res.status(404).json({ error:'Vendor not found'});
    if(String(doc.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden'});
    const prod = doc.products.id(req.params.prodId);
    if(!prod) return res.status(404).json({ error:'Product not found'});
    const { name, category, subcategory, typicalAmountPaise, amountPaise, unit } = req.body;
    if(name !== undefined) prod.name = String(name).trim().slice(0,80) || prod.name;
    if(category !== undefined) prod.category = String(category).trim().slice(0,30) || prod.category;
    if(subcategory !== undefined) prod.subcategory = String(subcategory).trim().slice(0,40) || '';
    if(unit !== undefined) prod.unit = String(unit).trim().slice(0,20);
    if(typicalAmountPaise !== undefined || amountPaise !== undefined){
      const amt = typicalAmountPaise!==undefined ? Number(typicalAmountPaise) : (amountPaise!==undefined ? Number(amountPaise) : null);
      prod.typicalAmountPaise = amt;
      // sync priceMap
      if (amt){
        let pm = doc.priceMap.find(p=> String(p.productRef)===String(prod._id));
        if(pm){ pm.amountPaise=amt; pm.lastSeen=new Date(); }
        else doc.priceMap.push({ amountPaise: amt, productRef: prod._id, hits: prod.hits||1, lastSeen:new Date() });
      }
    }
    prod.lastSeen=new Date();
    await doc.save();
    res.json({ recipient: doc });
  } catch(err){ next(err) }
});

router.delete('/:id/products/:prodId', async (req,res,next)=>{
  try{
    const doc = await RecipientDirectory.findById(req.params.id);
    if(!doc) return res.status(404).json({ error:'Vendor not found'});
    if(String(doc.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden'});
    const prod = doc.products.id(req.params.prodId);
    if(!prod) return res.status(404).json({ error:'Product not found'});
    // remove priceMap entries
    doc.priceMap = (doc.priceMap||[]).filter(p=> String(p.productRef)!==String(prod._id));
    prod.deleteOne();
    await doc.save();
    res.json({ recipient: doc });
  } catch(err){ next(err) }
});

router.get('/:id/suggest', async (req,res,next)=>{
  try{
    const doc = await RecipientDirectory.findById(req.params.id);
    if(!doc) return res.status(404).json({ error:'Vendor not found'});
    if(String(doc.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden'});
    const amountPaise = Number(req.query.amountPaise||req.query.amount||0);
    if(!amountPaise) return res.status(400).json({ error:'amountPaise required'});
    const suggestion = await resolveProduct({ familyId: doc.familyId, vendorKey: doc.vendorKey, upiId: doc.upiId, amountPaise });
    res.json({ suggestion, vendor: doc });
  } catch(err){ next(err) }
});

router.post('/backfill', async (req,res,next)=>{
  try{
    if(!requireFamily(req,res)) return;
    const txs = await Transaction.find({ familyId: req.user.familyAccountId, status: { $ne:'VOIDED' } }).lean();
    const grouped = new Map();
    for(const t of txs){
      const upi = String(t.upiId || t.recipient?.upiId || '').toLowerCase().trim();
      const vk = normalizeVendorKey(t.recipient?.name||'', upi) || (upi ? upi : '');
      if(!vk) continue;
      const label = String(t.recipient?.name||upi||vk).trim() || vk;
      const cat = t.category && t.category!=='Other' ? t.category : null;
      const key = vk;
      let g = grouped.get(key);
      if(!g) { g = { vk, upi, label, categories: cat? [cat]: [], hits:0, anyUpi: upi||null }; grouped.set(key,g); }
      if(cat && !g.categories.includes(cat)) g.categories.push(cat);
      g.hits++;
      if(upi) g.anyUpi = g.anyUpi || upi;
    }
    let touched=0;
    for(const [,g] of grouped){
      const r = await upsertFromCategory({ familyId: req.user.familyAccountId, vendorKey: g.vk, upiId: g.anyUpi||undefined, label: g.label, categories: g.categories });
      if(r) touched++;
    }
    res.json({ scanned: txs.length, distinct: grouped.size, touched });
  } catch(err){ next(err) }
});

router.post('/:id/apply', async (req,res,next)=>{
  try{
    const doc = await RecipientDirectory.findById(req.params.id);
    if(!doc) return res.status(404).json({ error:'Not found'});
    if(String(doc.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden'});
    const overwrite = !!req.body.overwrite;
    const cat = doc.primaryCategory || doc.category || (doc.offerings&&doc.offerings[0]?.category) || 'Other';
    const needle = String(doc.label||doc.vendorKey||'').toLowerCase();
    const vk = String(doc.vendorKey||'').toLowerCase();
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
      await Transaction.updateOne({ _id: t._id }, { $set: { category: cat } });
      updated++;
    }
    res.json({ matched, updated, category: cat, primaryCategory: cat });
  } catch(err){ next(err) }
});

// merge duplicate vendors
router.post('/:id/merge', async (req,res,next)=>{
  try{
    const source = await RecipientDirectory.findById(req.params.id);
    if(!source) return res.status(404).json({ error:'Source not found'});
    if(String(source.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden'});
    const targetId = req.body.targetId;
    if(!targetId) return res.status(400).json({ error:'targetId required'});
    const target = await RecipientDirectory.findById(targetId);
    if(!target) return res.status(404).json({ error:'Target not found'});
    if(String(target.familyId)!==String(req.user.familyAccountId)) return res.status(403).json({ error:'Forbidden target'});
    if(String(source._id)===String(target._id)) return res.status(400).json({ error:'Cannot merge same vendor'});
    // merge offerings
    for(const o of (source.offerings||[])){
      let ex = (target.offerings||[]).find(x=> x.category===o.category);
      if(ex){ ex.hits=(ex.hits||0)+(o.hits||0); ex.lastSeen=new Date(); if(o.subcategories) { if(!ex.subcategories) ex.subcategories=[]; for(const sc of o.subcategories) if(!ex.subcategories.includes(sc)) ex.subcategories.push(sc); } }
      else target.offerings.push(o);
    }
    // merge products
    for(const p of (source.products||[])){
      let ex = target.products.find(x=> x.name.toLowerCase()===p.name.toLowerCase());
      if(!ex) target.products.push({ name:p.name, category:p.category, subcategory:p.subcategory, typicalAmountPaise:p.typicalAmountPaise, unit:p.unit, hits:p.hits||1, lastSeen:p.lastSeen||new Date() });
      else { ex.hits=(ex.hits||0)+(p.hits||0); if(p.typicalAmountPaise && !ex.typicalAmountPaise) ex.typicalAmountPaise=p.typicalAmountPaise; }
    }
    // merge priceMap
    for(const pm of (source.priceMap||[])){
      // resolve productRef mapping: find target product by name if source ref
      let pmRef = pm.productRef;
      if(pmRef){
        const srcProd = source.products.id(pmRef);
        if(srcProd){
          const tgtProd = target.products.find(x=> x.name.toLowerCase()===String(srcProd.name).toLowerCase());
          if(tgtProd) pmRef = tgtProd._id;
          else pmRef = null;
        }
      }
      if(pmRef){
        let ex = (target.priceMap||[]).find(x=> x.amountPaise===pm.amountPaise && String(x.productRef)===String(pmRef));
        if(ex) ex.hits=(ex.hits||0)+(pm.hits||0);
        else target.priceMap.push({ amountPaise: pm.amountPaise, productRef: pmRef, hits: pm.hits||1, lastSeen:new Date() });
      }
    }
    // merge aliases and keep upi if target missing
    const aliasSet = new Set([...(target.aliases||[]), ...(source.aliases||[]), source.label, source.vendorKey].filter(Boolean).map(s=> String(s).trim().toLowerCase()));
    target.aliases = Array.from(aliasSet).slice(0,20);
    if(!target.upiId && source.upiId) target.upiId = source.upiId;
    target.hits=(target.hits||0)+(source.hits||0);
    target.lastSeen=new Date();
    // re-rank primary
    if(target.offerings.length){
      const sorted=[...target.offerings].sort((a,b)=> (b.hits||0)-(a.hits||0));
      target.primaryCategory=sorted[0].category;
      target.category=sorted[0].category;
    }
    await target.save();
    // move transactions recipientVendorRef
    await Transaction.updateMany({ familyId: target.familyId, recipientVendorRef: source._id }, { $set: { recipientVendorRef: target._id } });
    // also need to handle transactions matched via name/upi: they will be picked up via vendorKey/upi after merge; no bulk category change unless requested
    await RecipientDirectory.findByIdAndDelete(source._id);
    res.json({ merged: true, target });
  } catch(err){ next(err) }
});

module.exports = router;
