const RecipientDirectory = require('../models/recipientdirectory.model');
const EMILoan = require('../models/loan.model');
const Subscription = require('../models/subscription.model');
const { MANUAL_UPI_HANDLE_MAP, KEYWORD_CATEGORY_MAP } = require('../config/bhimUpiMap');
const { normalizeVendorKey } = require('./recipient.service');

// Lightweight rule-based categorizer (no AI) – combination of manual + auto-learn
// Returns { category, subcategory, confidence, trace: [{rule, category, confidence}], loanRef, subscriptionRef }

async function predictCategory({ familyId, vendorKey, upiId, amountPaise, description = '', vendorDoc = null }) {
  const trace = [];
  let best = { category: 'Other', subcategory: null, confidence: 0, rule: 'none', loanRef: null, subscriptionRef: null };

  function consider(category, confidence, rule, subcategory = null, refs = {}) {
    if (!category || category === 'Other') return;
    trace.push({ rule, category, confidence });
    if (confidence > best.confidence) {
      best = {
        category,
        confidence,
        rule,
        subcategory: subcategory || best.subcategory,
        loanRef: refs.loanRef || best.loanRef,
        subscriptionRef: refs.subscriptionRef || best.subscriptionRef,
      };
    }
  }

  // 1. Active Family Loans match (High signal)
  if (familyId) {
    try {
      const activeLoans = await EMILoan.find({ familyAccountId: familyId, status: 'Active' }).lean();
      const descLower = String(description || '').toLowerCase();
      const upiLower = String(upiId || '').toLowerCase();
      for (const loan of activeLoans) {
        const loanNameLow = String(loan.loanName || '').toLowerCase().trim();
        const lenderLow = String(loan.lender || '').toLowerCase().trim();
        const isNameMatch = (loanNameLow && loanNameLow.length > 2 && (descLower.includes(loanNameLow) || upiLower.includes(loanNameLow))) ||
                            (lenderLow && lenderLow.length > 2 && (descLower.includes(lenderLow) || upiLower.includes(lenderLow)));
        const loanAmountPaise = Math.round(Number(loan.emiAmount || 0) * 100);
        const isAmountMatch = amountPaise && loanAmountPaise && Math.abs(amountPaise - loanAmountPaise) <= Math.max(100, loanAmountPaise * 0.05);

        if (isNameMatch && isAmountMatch) {
          consider('Bills', 90, `family_loan_exact_${loan._id}`, 'Loan EMI', { loanRef: loan._id });
          break;
        } else if (isNameMatch) {
          consider('Bills', 80, `family_loan_name_${loan._id}`, 'Loan EMI', { loanRef: loan._id });
        } else if (isAmountMatch && (descLower.includes('emi') || descLower.includes('loan') || descLower.includes('nach') || descLower.includes('ach') || descLower.includes('mortgage'))) {
          consider('Bills', 85, `family_loan_amount_kw_${loan._id}`, 'Loan EMI', { loanRef: loan._id });
        }
      }
    } catch {}
  }

  // 2. Active Family Subscriptions match (High signal)
  if (familyId) {
    try {
      const activeSubs = await Subscription.find({ familyAccountId: familyId, status: 'Active' }).lean();
      const descLower = String(description || '').toLowerCase();
      const upiLower = String(upiId || '').toLowerCase();
      for (const sub of activeSubs) {
        const subNameLow = String(sub.name || '').toLowerCase().trim();
        const isNameMatch = subNameLow && subNameLow.length > 2 && (descLower.includes(subNameLow) || upiLower.includes(subNameLow));
        const subAmountPaise = Math.round(Number(sub.amount || 0) * 100);
        const isAmountMatch = amountPaise && subAmountPaise && Math.abs(amountPaise - subAmountPaise) <= Math.max(100, subAmountPaise * 0.05);

        if (isNameMatch && isAmountMatch) {
          consider(sub.category || 'Entertainment', 90, `family_sub_exact_${sub._id}`, 'Subscription', { subscriptionRef: sub._id });
          break;
        } else if (isNameMatch) {
          consider(sub.category || 'Entertainment', 80, `family_sub_name_${sub._id}`, 'Subscription', { subscriptionRef: sub._id });
        }
      }
    } catch {}
  }

  // 3. Vendor primaryCategory – highest signal (hit-ranked)
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
        const hits = vendor.hits || 1;
        const conf = hits > 10 ? 90 : hits > 3 ? 80 : 70;
        consider(primary, conf, 'vendor_primary');
      }
      if (vendor.offerings) {
        for (const off of vendor.offerings) {
          if (off.category && off.category !== 'Other') consider(off.category, 40, 'vendor_offering');
        }
      }
      // Family shared amount→product mapping: same guy + same rupees => exact product across family
      // This is familyId-scoped priceMap, so any member's teaching benefits all members
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
          if (prod && prod.category && prod.category !== 'Other') {
            // Boosted confidence for family-shared same-amount product (hits>2 => 85, else 75) — can beat generic vendor_primary 70
            const conf = (bestPm.hits || prod.hits || 1) > 2 ? 85 : 75;
            consider(prod.category, conf, 'family_amount_product', prod.subcategory, {});
            // Also consider subcategory for precise product
            if (prod.subcategory) consider(prod.category, conf, 'family_amount_product_sub', prod.subcategory);
          } else if (prod) consider(vendor.primaryCategory, 30, 'vendor_amount_fallback');
        }
      }
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
    subcategory: best.subcategory || null,
    confidence: best.confidence,
    rule: best.rule,
    loanRef: best.loanRef || null,
    subscriptionRef: best.subscriptionRef || null,
    trace,
  };
}

module.exports = { predictCategory };
