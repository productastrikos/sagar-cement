const express = require('express');
const jwt = require('jsonwebtoken');
const { findUserByIdentifier, verifyPassword, toPublicUser } = require('../data/users');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { logAudit } = require('../sim/store');

const router = express.Router();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

router.post('/login', (req, res) => {
  const { username, email, password } = req.body || {};
  const user = findUserByIdentifier(username || email);
  if (!verifyPassword(user, password)) {
    logAudit(null, 'Sign-in rejected', String(username || email || '(blank)'));
    return res.status(401).json({ error: 'That username and password don’t match. Check the demo credentials below the form.' });
  }
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  logAudit(user, 'Signed in', 'S!aP ClinkerIQ');
  res.json({ token, user: toPublicUser(user) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

module.exports = router;
