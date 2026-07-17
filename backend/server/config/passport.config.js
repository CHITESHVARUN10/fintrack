const passport = require('passport');
const { Strategy: LocalStrategy } = require('passport-local');
const bcrypt = require('bcrypt');
const User = require('../models/user.model');

passport.use(
  new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email: String(email).toLowerCase() });
        if (!user) return done(null, false, { message: 'Invalid email or password' });
        if (!user.isActive) return done(null, false, { message: 'Account is not active' });
        const ok = await bcrypt.compare(password, user.passwordHash || '');
        if (!ok) return done(null, false, { message: 'Invalid email or password' });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    },
  ),
);

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('-passwordHash');
    done(null, user || false);
  } catch (err) {
    done(err);
  }
});

module.exports = passport;
