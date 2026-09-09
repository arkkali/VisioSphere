const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { verifyToken, crossFacility } = require('../middleware/auth');
const { authLimiter, uploadLimiter, writeLimiter, readLimiter } = require('../config/rateLimiter');

router.post('/login',              crossFacility, authLimiter,                ctrl.login);
router.post('/verify-2fa',         crossFacility, authLimiter,                ctrl.verify2FA);
router.post('/request-otp',        crossFacility, authLimiter,                ctrl.requestOtp);
router.post('/verify-otp',         crossFacility, authLimiter,                ctrl.verifyOtp);
router.post('/reset-password',     crossFacility, authLimiter,                ctrl.resetPassword);
router.post('/register',           verifyToken, writeLimiter,  ctrl.register);
router.post('/upload-profile-pic', verifyToken, uploadLimiter, ctrl.uploadProfilePic);
router.get('/health',              verifyToken, readLimiter,   ctrl.health);
router.get('/all',                 verifyToken, readLimiter,   ctrl.getAll);
router.get('/stats/:adminId',      verifyToken, readLimiter,   ctrl.getStats);
router.get('/:id',                 verifyToken, readLimiter,   ctrl.getOne);
router.put('/:id/profile',         verifyToken, writeLimiter,  ctrl.updateProfile);
router.put('/:id/change-password', verifyToken, writeLimiter,  ctrl.changePassword);
// authLimiter, not writeLimiter: the request leg sends mail to an address the
// caller supplies, so it is a spam lever, and the verify leg is a 6-digit
// guess. Both belong on the tighter bucket.
router.post('/:id/email/request',  verifyToken, authLimiter,   ctrl.requestEmailChange);
router.post('/:id/email/verify',   verifyToken, authLimiter,   ctrl.verifyEmailChange);
router.put('/:id/deactivate',      verifyToken, writeLimiter,  ctrl.deactivate);
router.post('/:id/toggle-2fa',     verifyToken, writeLimiter,  ctrl.toggle2FA);
router.post('/:id/link-nurse',     verifyToken, writeLimiter,  ctrl.linkNurse);
router.post('/:id/unlink-nurse',   verifyToken, writeLimiter,  ctrl.unlinkNurse);

module.exports = router;