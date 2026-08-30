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

// Whether the requesting user may read/modify a given document.
function canModify(req, doc) {
  if (!doc) return false;
  if (doc.memberId && doc.memberId.equals(req.user._id)) return true;
  if (
    req.user.role === 'admin' &&
    req.user.familyAccountId &&
    doc.familyAccountId &&
    doc.familyAccountId.equals(req.user.familyAccountId)
  ) {
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
