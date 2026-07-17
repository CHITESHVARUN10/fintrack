const Notification = require('../models/notification.model');

/**
 * Persist an in-app notification.
 *
 * @param {ObjectId} memberId        Recipient user id.
 * @param {ObjectId} familyAccountId Family/account the notification belongs to.
 * @param {string}   type            Short type tag (e.g. 'Subscription due').
 * @param {string}   message          Human-readable message.
 * @param {string}   [relatedModule] Source module (e.g. 'subscription').
 * @param {ObjectId} [relatedId]      Id of the related document.
 * @param {string|string[]} [channel] Delivery channel(s); defaults to ['in-app'].
 * @returns {Promise<Notification>}
 */
async function createNotification(
  memberId,
  familyAccountId,
  type,
  message,
  relatedModule,
  relatedId,
  channel,
) {
  const channels = Array.isArray(channel)
    ? channel
    : channel
      ? [channel]
      : ['in-app'];

  const doc = new Notification({
    memberId,
    familyAccountId: familyAccountId || null,
    type,
    message,
    relatedModule: relatedModule || null,
    relatedId: relatedId || null,
    channel: channels,
    isRead: false,
  });
  return doc.save();
}

module.exports = { createNotification };
