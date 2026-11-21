// Shared query-scoping and ownership helpers for member-scoped resources.
// memberId-based models: Income, Subscription, RecurringPayment, Investment,
// AdHocExpense, Notification.

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

const MonthShare = require('../models/monthshare.model');

// Family months are viewed in IST, so the stored UTC instants are bucketed
// against IST month boundaries rather than UTC ones.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function monthRange(month) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return {
    $gte: new Date(Date.UTC(year, index, 1) - IST_OFFSET_MS),
    $lt: new Date(Date.UTC(year, index + 1, 1) - IST_OFFSET_MS),
  };
}

// Pure clause builder so tests and callers with preloaded shares avoid a query.
function visibilityClause({ userId = null, shares = [], includePrivate = false }) {
  const shared = shares
    .map(share => ({ userId: share.userId, range: monthRange(share.month) }))
    .filter(share => share.userId && share.range);
  const otherMonths = {
    $and: [
      ...(includePrivate ? [] : [{ visibility: { $ne: 'PRIVATE' } }]),
      { $or: shared.map(share => ({ createdBy: share.userId, occurredAt: share.range })) },
    ],
  };
  if (!userId) return shared.length ? otherMonths : { _id: null };
  return { $or: [{ createdBy: userId }, ...(shared.length ? [otherMonths] : [])] };
}

async function loadSharedMonths(familyId, excludeUserId) {
  if (!familyId) return [];
  return MonthShare.find({
    familyId,
    shared: true,
    ...(excludeUserId ? { userId: { $ne: excludeUserId } } : {}),
  }).select('userId month').lean();
}

// For Transaction ledger: a member's rows are always visible to them. Rows
// created by others require BOTH a shared month and a non-private visibility.
// Returns a Mongo filter fragment to add to Transaction queries.
async function buildTransactionVisibilityFilter(req, options = {}) {
  const { includePrivate = false, familyId, shares } = options;
  const userId = options.userId || req?.user?._id || null;
  const family = familyId || req?.user?.familyAccountId || null;
  const rows = shares || (await loadSharedMonths(family, userId));
  return visibilityClause({ userId, shares: rows, includePrivate });
}

module.exports = {
  buildListFilter,
  canModify,
  canModifyTransaction,
  sameId,
  monthRange,
  visibilityClause,
  loadSharedMonths,
  buildTransactionVisibilityFilter,
};
