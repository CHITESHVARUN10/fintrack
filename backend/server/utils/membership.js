// Upgrade users created by the older invitation/seed flow, which assigned a
// family on User before FamilyMembership existed. Never reactivate an existing
// PENDING, REJECTED, or REMOVED membership.
async function ensureLegacyMembership(user) {
  if (!user?.isActive || !user.familyAccountId) return;
  const Membership = require('../models/familymembership.model');
  const existing = await Membership.exists({ userId: user._id, familyId: user.familyAccountId });
  if (existing) return;
  const Family = require('../models/familyaccount.model');
  const family = await Family.findById(user.familyAccountId);
  if (!family) return;
  const role = String(family.adminId) === String(user._id) ? 'ADMIN' : 'MEMBER';
  // setOnInsert makes concurrent upgrades harmless and cannot overwrite a
  // revocation that was persisted before the upsert.
  await Membership.updateOne(
    { userId: user._id, familyId: user.familyAccountId },
    { $setOnInsert: { role, status: 'ACTIVE', reviewedAt: new Date() } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  await Family.updateOne({ _id: family._id }, { $addToSet: { members: user._id } });
}
module.exports = { ensureLegacyMembership };
