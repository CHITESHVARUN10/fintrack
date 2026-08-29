const RecipientDirectory = require('../models/recipientdirectory.model');

function normalizeVendorKey(rawDesc, upiId) {
  let s = String(rawDesc || upiId || '').trim();
  if (!s) return '';
  s = s.toLowerCase();
  // Strip common UPI description wrappers: UPI/NAME/BANK/.../UPI, PCI/... etc
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
  if (vendorKey) doc = await RecipientDirectory.findOne({ familyId, vendorKey }).lean();
  if (!doc && upiId) doc = await RecipientDirectory.findOne({ familyId, upiId: String(upiId).toLowerCase() }).lean();
  if (doc && doc.category) return doc.category;
  return 'Other';
}

async function upsertFromCategory({ familyId, createdBy, vendorKey, upiId, label, category }) {
  if (!familyId || (!vendorKey && !upiId) || !category || category === 'Other') return null;
  const vk = vendorKey || normalizeVendorKey(label || upiId, upiId);
  if (!vk) return null;
  const filter = { familyId, vendorKey: vk };
  return RecipientDirectory.findOneAndUpdate(
    filter,
    { $inc: { hits: 1 }, $set: { label: label || vk, category, lastSeen: new Date(), ...(upiId ? { upiId: String(upiId).toLowerCase() } : {}), ...(createdBy ? { createdBy } : {}) }, $setOnInsert: { familyId, vendorKey: vk } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

module.exports = { normalizeVendorKey, resolveCategory, upsertFromCategory };
