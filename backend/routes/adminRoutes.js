const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { verifyToken } = require('../middleware/auth');
const { authLimiter, uploadLimiter, writeLimiter, readLimiter } = require('../config/rateLimiter');

router.post('/login',              authLimiter,                ctrl.login);
router.post('/verify-2fa',         authLimiter,                ctrl.verify2FA);
router.post('/request-otp',        authLimiter,                ctrl.requestOtp);
router.post('/verify-otp',         authLimiter,                ctrl.verifyOtp);
router.post('/reset-password',     authLimiter,                ctrl.resetPassword);
router.post('/register',           verifyToken, writeLimiter,  ctrl.register);
router.post('/upload-profile-pic', verifyToken, uploadLimiter, ctrl.uploadProfilePic);
router.get('/health',              verifyToken, readLimiter,   ctrl.health);
router.get('/all',                 verifyToken, readLimiter,   ctrl.getAll);
router.get('/stats/:adminId',      verifyToken, readLimiter,   ctrl.getStats);
router.get('/:id',                 verifyToken, readLimiter,   ctrl.getOne);
router.put('/:id/profile',         verifyToken, writeLimiter,  ctrl.updateProfile);
router.put('/:id/change-password', verifyToken, writeLimiter,  ctrl.changePassword);
router.put('/:id/deactivate',      verifyToken, writeLimiter,  ctrl.deactivate);
router.post('/:id/toggle-2fa',     verifyToken, writeLimiter,  ctrl.toggle2FA);
router.post('/:id/link-nurse',     verifyToken, writeLimiter,  ctrl.linkNurse);
router.post('/:id/unlink-nurse',   verifyToken, writeLimiter,  ctrl.unlinkNurse);

module.exports = router;