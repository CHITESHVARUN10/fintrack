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

module.exports = { buildListFilter, canModify };
