// Strip sensitive fields from a user document before sending to the client.
function sanitizeUser(user) {
  if (!user) return null;
  const obj = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  delete obj.passwordHash;
  delete obj.inviteToken;
  delete obj.inviteExpiry;
  return obj;
}

module.exports = { sanitizeUser };
