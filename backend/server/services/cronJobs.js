const cron = require('node-cron');

const Subscription = require('../models/subscription.model');
const EMILoan = require('../models/loan.model');
const Insurance = require('../models/insurance.model');
const Investment = require('../models/investment.model');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');
const { createNotification } = require('./notificationService');
const { sendEmail } = require('../utils/mailer');

// --- date helpers ---
function dateOnly(d) {
  const x = d ? new Date(d) : new Date();
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}
function addDays(base, n) {
  const d = dateOnly(base);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function sameDate(a, b) {
  const x = dateOnly(a);
  const y = dateOnly(b);
  return x.getTime() === y.getTime();
}
// Does dayOfMonth fall on the given calendar date? Handles 29-31 in short months
// by clamping to the last day of that month.
function dayMatches(dayOfMonth, target) {
  if (!dayOfMonth) return false;
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(dayOfMonth, last);
  return target.getDate() === day;
}

// Create an in-app notification + send an email, but only once per calendar day
// for the same (member, type, relatedId) so a daily 8am job never spams.
async function notifyOnce(memberId, familyAccountId, type, message, relatedModule, relatedId, dueDate) {
  const startToday = dateOnly(new Date());
  const endToday = new Date(startToday.getTime() + 864e5);
  const existing = await Notification.findOne({
    memberId,
    type,
    relatedId,
    createdAt: { $gte: startToday, $lt: endToday },
  });
  if (existing) return;

  await createNotification(memberId, familyAccountId, type, message, relatedModule, relatedId, ['in-app']);

  const user = await User.findById(memberId).select('email').lean();
  if (user && user.email) {
    await sendEmail({ to: user.email, subject: `[FinTrack] ${type}`, text: message });
  }
}

async function runDailyJob() {
  const today = dateOnly(new Date());
  const in3 = addDays(today, 3);
  const in7 = addDays(today, 7);
  const in15 = addDays(today, 15);
  const in30 = addDays(today, 30);

  try {
    // 1) Subscriptions billing in 3 days.
    const subs = await Subscription.find({ status: 'Active' });
    for (const s of subs) {
      if (s.billingDate && dayMatches(s.billingDate, in3)) {
        await notifyOnce(
          s.memberId,
          s.familyAccountId,
          'Subscription due',
          `Your subscription "${s.name || 'subscription'}" bills on ${in3.toDateString()} (₹${s.amount}).`,
          'subscription',
          s._id,
          in3,
        );
      }
    }

    // 2) Loan EMIs in 3 days (Active only).
    const loans = await EMILoan.find({ status: 'Active' });
    for (const l of loans) {
      if (l.emiDate && dayMatches(l.emiDate, in3)) {
        await notifyOnce(
          l.memberId,
          l.familyAccountId,
          'EMI due',
          `Your loan EMI for "${l.loanName || 'loan'}" is due on ${in3.toDateString()} (₹${l.emiAmount}).`,
          'loan',
          l._id,
          in3,
        );
      }
    }

    // 3) Insurance premiums due in 7 days (Active only).
    const insurances = await Insurance.find({ status: 'Active' });
    for (const i of insurances) {
      if (i.nextDueDate && sameDate(i.nextDueDate, in7)) {
        await notifyOnce(
          i.memberId,
          i.familyAccountId,
          'Insurance premium due',
          `Your insurance "${i.policyName || 'policy'}" premium is due on ${in7.toDateString()}.`,
          'insurance',
          i._id,
          in7,
        );
      }
    }

    // 4) FD maturities in 15 days (Active only).
    const fds = await Investment.find({ investmentType: 'fd', status: 'Active' });
    for (const iv of fds) {
      if (iv.maturityDate && sameDate(iv.maturityDate, in15)) {
        await notifyOnce(
          iv.memberId,
          iv.familyAccountId,
          'FD maturity',
          `Your fixed deposit "${iv.bankName || 'deposit'}" matures on ${in15.toDateString()} (₹${iv.maturityAmount}).`,
          'investment',
          iv._id,
          in15,
        );
      }
    }

    // 5) Yearly subscriptions renewing in 30 days.
    for (const s of subs) {
      if (s.frequency === 'yearly' && s.nextRenewalDate && sameDate(s.nextRenewalDate, in30)) {
        await notifyOnce(
          s.memberId,
          s.familyAccountId,
          'Subscription renewal',
          `Your yearly subscription "${s.name || 'subscription'}" renews on ${in30.toDateString()}.`,
          'subscription',
          s._id,
          in30,
        );
      }
    }

    // 6) On the 1st of the month, email all admins that the monthly report is ready.
    if (today.getDate() === 1) {
      const admins = await User.find({ role: 'admin' }).select('name email').lean();
      const label = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      for (const a of admins) {
        if (a.email) {
          await sendEmail({
            to: a.email,
            subject: '[FinTrack] Your monthly report is ready',
            text: `Hi ${a.name || 'Admin'}, your monthly financial report for ${label} is ready to download from the Reports section.`,
          });
        }
      }
    }

    console.log('[cron] daily job completed', new Date().toISOString());
  } catch (err) {
    console.error('[cron] daily job failed:', err);
  }
}

let started = false;
function initCronJobs() {
  if (started) return;
  started = true;
  // Daily at 8:00 AM (server local time).
  cron.schedule('0 8 * * *', runDailyJob);
  console.log('[cron] scheduled daily job at 08:00');
}

initCronJobs();

module.exports = { initCronJobs, runDailyJob };
