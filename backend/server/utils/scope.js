// Shared query-scoping and ownership helpers for member-scoped resources.
// memberId-based models: Income, Subscription, RecurringPayment, Investment,
// EMILoan, AdHocExpense, Insurance, EducationPayment, Notification.

// Build a list filter scoped to the requesting user. Admins may pass
// ?memberId=<id> to scope to a specific family member.
function buildListFilter(req) {
  if (req.user.role === 'admin' && req.query.memberId) {
    return { memberId: req.query.memberId };
  }
  return { memberId: req.user._id };
}

function canModify(req, doc) {
  if (!doc || !req.user) return false;
  const userMemberId = req.user._id ? String(req.user._id) : '';
  const docMemberId = doc.memberId ? String(doc.memberId) : '';
  if (docMemberId && userMemberId && docMemberId === userMemberId) return true;

  const userFamilyId = req.user.familyAccountId ? String(req.user.familyAccountId) : '';
  const docFamilyId = doc.familyAccountId ? String(doc.familyAccountId) : doc.familyId ? String(doc.familyId) : '';
  if (userFamilyId && docFamilyId && userFamilyId === docFamilyId) {
    return true;
  }
  return false;
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

module.exports = { buildListFilter, canModify, buildTransactionVisibilityFilter, shouldIncludePrivate };
