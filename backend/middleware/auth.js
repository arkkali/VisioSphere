const jwt = require('jsonwebtoken');
const { isFacility } = require('../config/facilities');
const { RENEWED_TOKEN_HEADER, renewedTokenFor } = require('../config/session');
const { runWithFacility, runUnscoped } = require('../models/plugins/facilityScope');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Verifies the JWT and runs the REST of the request inside that user's
 * facility context, so every model query downstream is scoped automatically
 * (see models/plugins/facilityScope.js). Calling next() from inside
 * runWithFacility() is what propagates the context — async work started by
 * later handlers inherits it.
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('No token provided');
    err.status = 401;
    return next(err);
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    const err = new Error('Invalid or expired token');
    err.status = 401;
    return next(err);
  }

  req.user = decoded;

  // Tokens minted before facility separation carry no facility claim. There is
  // no safe default — guessing would hand one tenant's data to the other — so
  // force a fresh sign-in rather than falling back.
  if (!isFacility(decoded.facility)) {
    const err = new Error('Your session predates facility separation. Please sign in again.');
    err.status = 401;
    return next(err);
  }

  req.facility = decoded.facility;

  // Slide the session forward. A token nearing its expiry is replaced here, and
  // the client swaps it in from the response header — so a user who keeps using
  // the app never hits the expiry at all. See config/session.js for why this is
  // preferred over simply issuing very long-lived tokens.
  //
  // Wrapped defensively: this is a convenience on the path of EVERY
  // authenticated request. If signing ever throws, the request must still be
  // served with the token the caller already presented and verified. A failure
  // to renew is a future re-login, not a failed request now.
  try {
    const renewed = renewedTokenFor(decoded);
    if (renewed) res.setHeader(RENEWED_TOKEN_HEADER, renewed);
  } catch (err) {
    console.warn('[session] token renewal failed:', err.message);
  }

  return runWithFacility(decoded.facility, () => next());
};

/**
 * Marks a route as deliberately cross-facility. Use ONLY where the facility
 * cannot be known yet — login and password-recovery must locate the account
 * before its facility is available. Every use is an audited hole in tenant
 * isolation; grep for it before adding another.
 */
const crossFacility = (req, res, next) => runUnscoped(() => next());

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      const err = new Error('Access denied');
      err.status = 403;
      return next(err);
    }
    next();
  };
};

module.exports = { verifyToken, authorizeRoles, crossFacility };
