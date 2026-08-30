const RecipientDirectory = require('../models/recipientdirectory.model');

function normalizeVendorKey(rawDesc, upiId) {
  let s = String(rawDesc || upiId || '').trim();
  if (!s) return '';
  s = s.toLowerCase();
  const upiMatch = s.match(/^upi\/([^\/]+)\//);
  if (upiMatch) s = upiMatch[1];
  s = s.replace(/[@\/]/g, ' ');
  s = s.replace(/[^a-z0-9 ]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, 80);
}

async function resolveCategory({ familyId, vendorKey, upiId }) {
  if (!familyId) return 'Other';
  let doc = null;
  if (vendorKey) {
    doc = await RecipientDirectory.findOne({ familyId, vendorKey }).lean();
    if (!doc) doc = await RecipientDirectory.findOne({ familyId, aliases: vendorKey.toLowerCase() }).lean();
  }
  if (!doc && upiId) doc = await RecipientDirectory.findOne({ familyId, upiId: String(upiId).toLowerCase() }).lean();
  if (!doc) return 'Other';
  if (doc.primaryCategory) return doc.primaryCategory;
  if (doc.category) return doc.category;
  if (doc.offerings && doc.offerings.length) return [...doc.offerings].sort((a,b)=> (b.hits||0)-(a.hits||0))[0].category;
  return 'Other';
}

async function resolveOfferings({ familyId, vendorKey, upiId }) {
  if (!familyId) return [];
  let doc=null;
  if (vendorKey) {
    doc = await RecipientDirectory.findOne({ familyId, vendorKey }).lean();
    if (!doc) doc = await RecipientDirectory.findOne({ familyId, aliases: vendorKey.toLowerCase() }).lean();
  }
  if (!doc && upiId) doc = await RecipientDirectory.findOne({ familyId, upiId: String(upiId).toLowerCase() }).lean();
  if (!doc || !doc.offerings) return [];
  return [...doc.offerings].sort((a,b)=> (b.hits||0)-(a.hits||0));
}

function normalizeProductName(s){
  return String(s||'').trim().slice(0,80);
}

async function resolveProduct({ familyId, vendorKey, upiId, amountPaise }) {
  if (!familyId || !amountPaise) return null;
  let doc=null;
  if (vendorKey) {
    doc = await RecipientDirectory.findOne({ familyId, vendorKey }).lean();
    if (!doc) doc = await RecipientDirectory.findOne({ familyId, aliases: vendorKey.toLowerCase() }).lean();
  }
  if (!doc && upiId) doc = await RecipientDirectory.findOne({ familyId, upiId: String(upiId).toLowerCase() }).lean();
  if (!doc || !doc.priceMap || !doc.priceMap.length) {
    // fallback to products by typicalAmountPaise
    if (!doc || !doc.products || !doc.products.length) return null;
    const tolerance = Math.max(100, amountPaise*0.05);
    const cands = doc.products.filter(p=> p.typicalAmountPaise && Math.abs(p.typicalAmountPaise - amountPaise) <= tolerance);
    if (!cands.length) return null;
    cands.sort((a,b)=> (b.hits||0)-(a.hits||0) || Math.abs(a.typicalAmountPaise-amountPaise)-Math.abs(b.typicalAmountPaise-amountPaise));
    return cands[0];
  }
  const tolerance = Math.max(100, amountPaise*0.05);
  let best=null, bestScore=-1;
  for (const pm of doc.priceMap){
    if (Math.abs((pm.amountPaise||0)-amountPaise) <= tolerance){
      const score = (pm.hits||1)*100 - Math.abs(pm.amountPaise-amountPaise);
      if (score>bestScore){ bestScore=score; best=pm; }
    }
  }
  if (!best) {
    // try products directly
    const cands = (doc.products||[]).filter(p=> p.typicalAmountPaise && Math.abs(p.typicalAmountPaise-amountPaise)<=tolerance);
    if (cands.length){
      cands.sort((a,b)=> (b.hits||0)-(a.hits||0));
      const prod=cands[0];
      return { product:prod, amountPaise, hits: prod.hits };
    }
    return null;
  }
  const prod = (doc.products||[]).find(p=> String(p._id)===String(best.productRef));
  if (prod) return { ...prod, priceMapHits: best.hits, matchedAmount: best.amountPaise };
  return best;
}

async function upsertProduct({ familyId, vendorKey, upiId, label, product }) {
  if (!familyId || !product || !product.name) return null;
  const vk = vendorKey || normalizeVendorKey(label||upiId||'', upiId||'');
  if (!vk && !upiId) return null;
  const key = vk || String(upiId).toLowerCase();
  let doc = await RecipientDirectory.findOne({ familyId, vendorKey: key });
  if (!doc && upiId) {
    doc = await RecipientDirectory.findOne({ familyId, upiId: String(upiId).toLowerCase() });
  }
  if (!doc){
    doc = await upsertFromCategory({ familyId, vendorKey: key, upiId, label: label||key, categories: product.category?[product.category]:[] });
    if (!doc) {
      // fallback directly by upi
      if (upiId) doc = await RecipientDirectory.findOne({ familyId, upiId: String(upiId).toLowerCase() });
      if (!doc) return null;
    }
  }
  const name = normalizeProductName(product.name);
  let existing = (doc.products||[]).find(p=> p.name.toLowerCase()===name.toLowerCase());
  if (existing){
    existing.hits=(existing.hits||0)+1;
    existing.lastSeen=new Date();
    if (product.category) existing.category=product.category;
    if (product.subcategory) existing.subcategory=product.subcategory;
    if (product.typicalAmountPaise) existing.typicalAmountPaise=product.typicalAmountPaise;
    if (product.unit) existing.unit=product.unit;
  } else {
    doc.products.push({
      name,
      category: product.category||doc.primaryCategory||'Other',
      subcategory: product.subcategory||'',
      typicalAmountPaise: product.typicalAmountPaise||null,
      unit: product.unit||'',
      hits:1,
      lastSeen:new Date(),
    });
    existing = doc.products[doc.products.length-1];
  }
  // priceMap maintenance
  if (product.typicalAmountPaise){
    let pm = (doc.priceMap||[]).find(p=> p.amountPaise===product.typicalAmountPaise && String(p.productRef||'')===String(existing._id||''));
    if (pm){ pm.hits=(pm.hits||0)+1; pm.lastSeen=new Date(); }
    else {
      if (!doc.priceMap) doc.priceMap=[];
      doc.priceMap.push({ amountPaise: product.typicalAmountPaise, productRef: existing._id, hits:1, lastSeen:new Date() });
    }
    // also generic amount mapping
    let generic = (doc.priceMap||[]).find(p=> p.amountPaise===product.typicalAmountPaise && !p.productRef);
    // keep per-product only
  }
  await doc.save();
  return doc;
}

async function upsertFromCategory({ familyId, createdBy, vendorKey, upiId, label, category, categories, subcategories, products, amountPaise }) {
  const cats = categories && categories.length ? categories : (category && category!=='Other' ? [category] : []);
  if (!familyId) return null;
  const vk = vendorKey || normalizeVendorKey(label || upiId || '', upiId || '');
  if (!vk && !upiId) return null;
  if (!cats.length) {
    const RecipientDirectory = require('../models/recipientdirectory.model');
    try{
      return await RecipientDirectory.findOneAndUpdate(
        { familyId, vendorKey: vk || String(upiId).toLowerCase() },
        { $inc: { hits: 1 }, $set: { lastSeen: new Date(), label: label||vk||String(upiId), ...(upiId?{ upiId: String(upiId).toLowerCase()}: {}), ...(createdBy?{createdBy}:{}) }, $setOnInsert: { familyId, vendorKey: vk || String(upiId).toLowerCase() } },
        { upsert:true, new:true, setDefaultsOnInsert:true }
      );
    } catch(e){
      if(e.code!==11000) throw e;
      // duplicate likely on upiId – try to find and bump that doc
      if (upiId) {
        const byUpi = await RecipientDirectory.findOne({ familyId, upiId: String(upiId).toLowerCase() });
        if (byUpi) {
          byUpi.hits=(byUpi.hits||0)+1; byUpi.lastSeen=new Date(); if(label) byUpi.label=label; await byUpi.save().catch(()=>{});
          return byUpi;
        }
      }
      return RecipientDirectory.findOneAndUpdate({ familyId, vendorKey: vk || String(upiId).toLowerCase() }, { $inc:{hits:1}}, {new:true});
    }
  }
  const key = vk || String(upiId).toLowerCase();
  const filter = { familyId, vendorKey: key };
  let doc = await RecipientDirectory.findOne(filter);
  // fallback: if not found by vendorKey but upiId exists, reuse that vendor (avoid duplicate upiId)
  if (!doc && upiId) {
    const byUpi = await RecipientDirectory.findOne({ familyId, upiId: String(upiId).toLowerCase() });
    if (byUpi) doc = byUpi;
  }
  if (!doc) {
    try{
      doc = await RecipientDirectory.create({ familyId, vendorKey: key, label: label||key, primaryCategory: cats[0], category: cats[0], offerings: cats.map(c=> ({category:c, hits:1, lastSeen:new Date()})), hits:1, lastSeen:new Date(), ...(upiId?{upiId:String(upiId).toLowerCase()}:{}), ...(createdBy?{createdBy}:{}) });
      return doc;
    } catch(e){
      if(e.code===11000){
        let found = await RecipientDirectory.findOne(filter);
        if(found) return found;
        if(upiId){
          found = await RecipientDirectory.findOne({ familyId, upiId: String(upiId).toLowerCase() });
          if(found) return found;
        }
        // rethrow if still not found – caller will handle
        throw e;
      }
      throw e;
    }
  }
  doc.hits = (doc.hits||0)+1;
  doc.lastSeen = new Date();
  if (label) doc.label = label;
  if (upiId && !doc.upiId) doc.upiId = String(upiId).toLowerCase();
  // keep alternate vendorKey as alias for future matching (handles "amazon pay" vs "amazon paygro" drift)
  if (vk && vk.toLowerCase() !== String(doc.vendorKey).toLowerCase()) {
    if (!doc.aliases) doc.aliases = [];
    const lowVk = vk.toLowerCase();
    const hasAlias = doc.aliases.map(a=> String(a).toLowerCase()).includes(lowVk);
    if (!hasAlias) {
      doc.aliases.push(lowVk);
      if (doc.aliases.length > 20) doc.aliases = doc.aliases.slice(-20);
    }
  }
  if (!doc.offerings) doc.offerings=[];
  for(const c of cats){
    let o = doc.offerings.find(o=> o.category===c);
    if(o){ o.hits=(o.hits||0)+1; o.lastSeen=new Date();
      if (subcategories && subcategories[c] && Array.isArray(subcategories[c])){
        const subs = subcategories[c].filter(Boolean).map(s=> String(s).trim().slice(0,40));
        if (!o.subcategories) o.subcategories=[];
        for(const sc of subs){ if(!o.subcategories.includes(sc)) o.subcategories.push(sc); }
      }
    } else { doc.offerings.push({category:c, hits:1, lastSeen:new Date(), subcategories: (subcategories && subcategories[c] ? subcategories[c].filter(Boolean).map(s=> String(s).trim().slice(0,40)) : []) }); }
  }
  const sorted=[...doc.offerings].sort((a,b)=> (b.hits||0)-(a.hits||0));
  doc.primaryCategory = sorted[0].category;
  doc.category = sorted[0].category;
  // handle embedded products if supplied
  if (products && Array.isArray(products) && products.length){
    if (!doc.products) doc.products=[];
    for(const prod of products){
      if (!prod || !prod.name) continue;
      const name = normalizeProductName(prod.name);
      let existing = doc.products.find(p=> p.name.toLowerCase()===name.toLowerCase());
      if (existing){
        existing.hits=(existing.hits||0)+1;
        existing.lastSeen=new Date();
        if (prod.category) existing.category=prod.category;
        if (prod.subcategory) existing.subcategory=prod.subcategory;
        if (prod.typicalAmountPaise) existing.typicalAmountPaise=prod.typicalAmountPaise;
      } else {
        doc.products.push({
          name,
          category: prod.category || cats[0] || doc.primaryCategory || 'Other',
          subcategory: prod.subcategory || '',
          typicalAmountPaise: prod.typicalAmountPaise || null,
          unit: prod.unit || '',
          hits:1,
          lastSeen:new Date(),
        });
        existing = doc.products[doc.products.length-1];
      }
      if (prod.typicalAmountPaise && existing && existing._id){
        if (!doc.priceMap) doc.priceMap=[];
        let pm = doc.priceMap.find(p=> p.amountPaise===prod.typicalAmountPaise && String(p.productRef||'')===String(existing._id));
        if (pm){ pm.hits=(pm.hits||0)+1; pm.lastSeen=new Date(); }
        else doc.priceMap.push({ amountPaise: prod.typicalAmountPaise, productRef: existing._id, hits:1, lastSeen:new Date() });
      } else if (amountPaise && existing && existing._id){
        if (!doc.priceMap) doc.priceMap=[];
        let pm = doc.priceMap.find(p=> p.amountPaise===amountPaise && String(p.productRef||'')===String(existing._id));
        if (pm){ pm.hits=(pm.hits||0)+1; pm.lastSeen=new Date(); }
        else doc.priceMap.push({ amountPaise, productRef: existing._id, hits:1, lastSeen:new Date() });
      }
    }
  } else if (amountPaise && cats.length===1){
    // learn priceMap for amount → primary product implicitly? store amount hits for vendor even without product name
    // keep simple: no generic priceMap without product
  }
  // also maintain priceMap for amountPaise even without explicit product (used for suggestion)
  if (amountPaise && !products?.length){
    // optional: could push generic amount mapping for inference; skip for now to keep fresh start as user wants
  }
  try{ await doc.save(); } catch(e){
    if(e.code===11000){
      console.warn('[vendor upsert] duplicate upiId', upiId, e.message);
      let found = await RecipientDirectory.findOne(filter);
      if(found) return found;
      if(upiId){
        found = await RecipientDirectory.findOne({ familyId, upiId: String(upiId).toLowerCase() });
        if(found) return found;
      }
      throw e;
    }
    throw e;
  }
  return doc;
}

async function predictCategoryForAmount({ familyId, vendorKey, upiId, amountPaise }){
  // Smart category prediction: vendor primary + product amount signature
  if (!familyId) return null;
  const cat = await resolveCategory({ familyId, vendorKey, upiId });
  if (cat && cat!=='Other') return cat;
  const prod = await resolveProduct({ familyId, vendorKey, upiId, amountPaise });
  if (prod && prod.category) return prod.category;
  if (prod && prod.product && prod.product.category) return prod.product.category;
  return null;
}

module.exports = { normalizeVendorKey, resolveCategory, resolveOfferings, resolveProduct, upsertFromCategory, upsertProduct, normalizeProductName, predictCategoryForAmount };
