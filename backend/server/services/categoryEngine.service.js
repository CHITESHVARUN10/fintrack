const RecipientDirectory = require('../models/recipientdirectory.model');
const { MANUAL_UPI_HANDLE_MAP, KEYWORD_CATEGORY_MAP } = require('../config/bhimUpiMap');
const { normalizeVendorKey } = require('./recipient.service');

// Lightweight rule-based categorizer (no AI) – combination of manual + auto-learn
// Returns { category, subcategory, confidence, trace: [{rule, category, confidence}] }

async function predictCategory({ familyId, vendorKey, upiId, amountPaise, description = '', vendorDoc = null }) {
  const trace = [];
  let best = { category: 'Other', confidence: 0, rule: 'none' };

  function consider(category, confidence, rule) {
    if (!category || category === 'Other') return;
    trace.push({ rule, category, confidence });
    if (confidence > best.confidence) best = { category, confidence, rule };
  }

  // 1. Vendor primaryCategory – highest signal (hit-ranked)
  try {
    let vendor = vendorDoc;
    if (!vendor && familyId && (vendorKey || upiId)) {
      if (vendorKey) {
        vendor = await RecipientDirectory.findOne({ familyId, vendorKey }).lean();
        if (!vendor) vendor = await RecipientDirectory.findOne({ familyId, aliases: vendorKey.toLowerCase() }).lean();
      }
      if (!vendor && upiId) vendor = await RecipientDirectory.findOne({ familyId, upiId: String(upiId).toLowerCase() }).lean();
    }
    if (vendor) {
      const primary = vendor.primaryCategory || vendor.category || (vendor.offerings && vendor.offerings[0]?.category);
      if (primary && primary !== 'Other') {
        // confidence based on hits: >10 => 90, >3 => 80, else 70
        const hits = vendor.hits || 1;
        const conf = hits > 10 ? 90 : hits > 3 ? 80 : 70;
        consider(primary, conf, 'vendor_primary');
      }
      // vendor offerings also as candidates (lower confidence)
      if (vendor.offerings) {
        for (const off of vendor.offerings) {
          if (off.category && off.category !== 'Other') consider(off.category, 40, 'vendor_offering');
        }
      }
      // amount signature → product category
      if (amountPaise && vendor.priceMap && vendor.priceMap.length) {
        const tolerance = Math.max(100, amountPaise * 0.05);
        let bestPm = null;
        let bestScore = -1;
        for (const pm of vendor.priceMap) {
          if (Math.abs((pm.amountPaise || 0) - amountPaise) <= tolerance) {
            const score = (pm.hits || 1) * 100 - Math.abs(pm.amountPaise - amountPaise);
            if (score > bestScore) { bestScore = score; bestPm = pm; }
          }
        }
        if (bestPm) {
          const prod = (vendor.products || []).find((p) => String(p._id) === String(bestPm.productRef));
          if (prod && prod.category && prod.category !== 'Other') consider(prod.category, 60, 'vendor_amount_product');
          else if (prod) consider(vendor.primaryCategory, 30, 'vendor_amount_fallback');
        }
      }
      // auto-learn from UPI handle: if this vendor's handle maps to its primary, boost handle rule
      if (upiId && vendor.primaryCategory) {
        const handle = String(upiId).split('@')[1]?.toLowerCase();
        if (handle) consider(vendor.primaryCategory, 50, `auto_learn_handle_${handle}`);
      }
    }
  } catch {}

  // 2. Manual UPI handle map (BHIM-like, weak)
  if (upiId && typeof upiId === 'string' && upiId.includes('@')) {
    const handle = upiId.split('@')[1]?.toLowerCase().trim();
    if (handle && MANUAL_UPI_HANDLE_MAP[handle]) {
      consider(MANUAL_UPI_HANDLE_MAP[handle], 40, `manual_upi_handle_${handle}`);
    }
  }

  // 3. Keyword in description / recipient name (weak)
  const descLower = String(description || '').toLowerCase();
  for (const [kw, cat] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    if (descLower.includes(kw)) {
      consider(cat, 30, `keyword_${kw}`);
      break; // first match only to avoid over-scoring
    }
  }

  // 4. Fallback: if still Other, try vendor again with normalized key from description (covers cases where vendorKey not yet resolved)
  if (best.category === 'Other' && familyId && description) {
    try {
      const vkFromDesc = normalizeVendorKey(description, upiId);
      if (vkFromDesc && vkFromDesc !== vendorKey) {
        const altVendor = await RecipientDirectory.findOne({ familyId, vendorKey: vkFromDesc }).lean();
        if (altVendor && altVendor.primaryCategory && altVendor.primaryCategory !== 'Other') {
          consider(altVendor.primaryCategory, 45, 'vendor_from_desc');
        }
      }
    } catch {}
  }

  return {
    category: best.category,
    subcategory: null, // could be extended via taxonomy
    confidence: best.confidence,
    rule: best.rule,
    trace,
  };
}

module.exports = { predictCategory };
