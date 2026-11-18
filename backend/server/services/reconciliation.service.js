const crypto = require('crypto');
const { TRANSACTION_CONFIG } = require('../config/transactionConfig');

function fingerprintCandidate(c) {
  const key = [c.type, c.amountPaise, (c.recipient?.name || '').trim().toLowerCase(), c.occurredAt ? new Date(c.occurredAt).toISOString().slice(0,16) : '', (c.upiId||'').toLowerCase(), (c.transactionIdExt||'').toLowerCase(), (c.utr||'').toLowerCase()].join('|');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0,24);
}

function minutesDiff(a,b){ return Math.abs(new Date(a).getTime()- new Date(b).getTime())/60000; }
function daysDiff(a,b){ return Math.abs(new Date(a).getTime()- new Date(b).getTime())/86400000; }

// Words that appear in almost every bank narration or merchant label and
// carry no identity. They must not make two unrelated payees look alike.
const NAME_NOISE = new Set([
  'upi','neft','imps','rtgs','pos','ach','dr','cr','txn','transaction','ref','reference',
  'payment','payments','paid','pay','merchant','online','retail','store','stores','shop',
  'the','and','to','from','via','for','of','pvt','ltd','limited','india','bank',
]);

function normalizeName(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[0-9]{4,}/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameWords(raw) {
  return normalizeName(raw)
    .split(' ')
    .filter((w) => w && !NAME_NOISE.has(w) && !/^\d+$/.test(w));
}

function looksLikeBankNarration(raw) {
  const text = String(raw || '');
  return /(?:^|[^a-z])(upi|neft|imps|rtgs|pos|ach|dr|cr|txn|ref|payment|paid)(?:[^a-z]|$)/i.test(text)
    || /\d{4,}/.test(text);
}

/**
 * true  → strong merchant match
 * false → names are present and clearly identify different merchants
 * null  → not enough signal (one side is missing, or one side is bank noise)
 */
function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return null;
  if (na === nb) return true;

  const wa = nameWords(a);
  const wb = nameWords(b);
  if (!wa.length || !wb.length) {
    // A real name ("Different Shop") must not be treated as unknown, but a
    // bank narration such as "UPI/DR/123456789" carries no merchant at all.
    return (looksLikeBankNarration(a) || looksLikeBankNarration(b)) ? null : false;
  }

  const setA = new Set(wa);
  const setB = new Set(wb);
  const common = [...setA].filter((w) => setB.has(w));
  if (common.length >= 2) return true;
  if (common.length === 0) return false;

  const shared = common[0];
  const oneContainsOther = na.includes(nb) || nb.includes(na);
  if (oneContainsOther && shared.length >= 5) return true;
  if (shared.length >= 6 && (setA.size === 1 || setB.size === 1)) return true;

  // One shared short token is not enough to claim identity.
  return null;
}

function scoreCandidate(candidate, existing) {
  if ((candidate.type && existing.type && candidate.type !== existing.type) || candidate.amountPaise !== existing.amountPaise) return { confidence: 0, level: 'NONE' };

  const candTx = (candidate.transactionIdExt||'').trim().toLowerCase();
  const existTx = (existing.transactionIdExt||existing._extTx||'').trim().toLowerCase();
  if (candTx && existTx && candTx===existTx) return { confidence: 100, level: 'TX_ID' };

  const candUtr = (candidate.utr||'').trim().toLowerCase();
  const existUtr = (existing.utr||existing._utr||'').trim().toLowerCase();
  if (candUtr && existUtr && candUtr===existUtr) return { confidence: 98, level: 'UTR' };

  const candUpi = (candidate.upiId || candidate.recipient?.upiId || '').trim().toLowerCase();
  const existUpi = (existing.upiId || existing._upi || existing.recipient?.upiId || '').trim().toLowerCase();
  const sameUpi = !!(candUpi && existUpi && candUpi === existUpi);
  const upiConflict = !!(candUpi && existUpi && !sameUpi);
  const utrConflict = !!(candUtr && existUtr && candUtr !== existUtr);

  const nameMatch = namesMatch(candidate.recipient?.name, existing.recipient?.name);
  const appOrigin = existing.metadata?.origin === 'QR_SCAN' || candidate.metadata?.origin === 'QR_SCAN';
  const dateClose = !!(candidate.occurredAt && existing.occurredAt &&
    daysDiff(candidate.occurredAt, existing.occurredAt) <= TRANSACTION_CONFIG.timeWindows.dateToleranceDays);

  // A payment made through FinStack's own scanner is already confirmed by the
  // user. The later bank row is the same money leaving the account, so this
  // is the strongest reconciliation bridge we have.
  if (appOrigin && dateClose) {
    if (sameUpi) return { confidence: 96, level: 'APP_UPI_AMOUNT_DATE' };
    if (nameMatch === true) return { confidence: 92, level: 'APP_NAME_AMOUNT_DATE' };
    if (nameMatch === null && !upiConflict && !utrConflict) {
      return { confidence: 88, level: 'APP_AMOUNT_DATE' };
    }
    if (nameMatch === false && !sameUpi) return { confidence: 0, level: 'NONE' };
  }

  // External references normally identify one payment. A QR's `tr` is a
  // merchant reference, though, so an app-origin match with the same payee
  // and amount is allowed to bridge a different bank reference above.
  if (candTx && existTx && candTx !== existTx) return { confidence: 0, level: 'NONE' };
  if (upiConflict) return { confidence: 0, level: 'NONE' };
  if (utrConflict) return { confidence: 0, level: 'NONE' };
  if (nameMatch === false && !sameUpi) return { confidence: 0, level: 'NONE' };

  const hasTime = candidate.metadata?.timePrecision !== 'day' && existing.metadata?.timePrecision !== 'day';
  const sameMinute = hasTime && candidate.occurredAt && existing.occurredAt &&
    new Date(candidate.occurredAt).toISOString().slice(0,16) === new Date(existing.occurredAt).toISOString().slice(0,16);
  if (sameMinute) return { confidence: 90, level: 'AMOUNT_SAME_MINUTE' };

  const timeClose = hasTime && candidate.occurredAt && existing.occurredAt && minutesDiff(candidate.occurredAt, existing.occurredAt) <= TRANSACTION_CONFIG.timeWindows.highConfidenceMinutes;

  if (sameUpi && dateClose && timeClose) return { confidence: 92, level: 'UPI_AMOUNT_DATETIME' };
  if (sameUpi && dateClose) return { confidence: 75, level: 'UPI_AMOUNT_DATE' };

  const mediumClose = hasTime && candidate.occurredAt && existing.occurredAt && minutesDiff(candidate.occurredAt, existing.occurredAt) <= TRANSACTION_CONFIG.timeWindows.mediumConfidenceMinutes;
  if (dateClose && mediumClose) return { confidence: 68, level: 'AMOUNT_DATETIME' };

  return { confidence: 25, level: 'AMOUNT_ONLY' };
}

function classifyConfidence(conf){
  if (conf >= TRANSACTION_CONFIG.thresholds.autoMerge) return 'AUTO';
  if (conf >= TRANSACTION_CONFIG.thresholds.pendingReview) return 'REVIEW';
  return 'SEPARATE';
}

module.exports = { fingerprintCandidate, scoreCandidate, classifyConfidence, namesMatch };
