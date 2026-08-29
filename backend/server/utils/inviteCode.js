const crypto = require('crypto');

function generateInviteCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

module.exports = { generateInviteCode };
