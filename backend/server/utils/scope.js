// Shared query-scoping and ownership helpers for member-scoped resources.
// memberId-based models: Income, Subscription, RecurringPayment, Investment,
// EMILoan, AdHocExpense, Insurance, EducationPayment, Notification.

// Build a list filter scoped to the requesting user. Admins may pass
// ?memberId=<id> to scope to a specific family member.
async function buildListFilter(req) {
  const memberId = req.user.role === 'admin' && req.query.memberId ? req.query.memberId : req.user._id;
  if (String(memberId) !== String(req.user._id)) {
    const User = require('../models/user.model');
    const member = req.user.familyAccountId && await User.exists({ _id: memberId, familyAccountId: req.user.familyAccountId, isActive: true });
    if (!member) throw Object.assign(new Error('Member not in your family'), { status: 403 });
  }
  return { memberId, familyAccountId: req.user.familyAccountId || null };
}

function sameId(a, b) {
  return Boolean(a && b && String(a._id || a) === String(b._id || b));
}

function canModify(req, doc) {
  if (!doc || !req.user) return false;
  if (!sameId(req.user.familyAccountId, doc.familyAccountId || doc.familyId)) return false;
  return sameId(doc.memberId, req.user._id) || req.user.role === 'admin';
}

// Ledger mutations belong exclusively to their creator, including admin requests.
function canModifyTransaction(req, tx) {
  return Boolean(tx && sameId(tx.familyId, req.user.familyAccountId) && sameId(tx.createdBy, req.user._id));
}

// For Transaction ledger: PRIVATE transactions are only visible to creator (or admin via explicit include)
// Returns a Mongo filter fragment to add to Transaction queries.
function buildTransactionVisibilityFilter(req, options = {}) {
  const { includePrivate = false } = options;
  // includePrivate only makes sense for creator's own private in familyView
  if (includePrivate) return {};
  // Exclude PRIVATE from family aggregates unless it's the requester's own
  // Use $or: visibility != PRIVATE OR createdBy == requester
  return {
    $or: [{ visibility: { $ne: 'PRIVATE' } }, { createdBy: req.user._id }],
  };
}

function shouldIncludePrivate(req, tx) {
  if (!tx) return false;
  if (tx.visibility !== 'PRIVATE') return true;
  if (String(tx.createdBy) === String(req.user._id)) return true;
  if (String(tx.createdBy?._id) === String(req.user._id)) return true;
  return false;
}

module.exports = { buildListFilter, canModify, canModifyTransaction, sameId, buildTransactionVisibilityFilter, shouldIncludePrivate };
