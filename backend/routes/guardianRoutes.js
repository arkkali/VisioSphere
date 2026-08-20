const router = require('express').Router();
const ctrl = require('../controllers/guardianController');
const { spreadsheetUpload, imageUpload } = require('../config/multer');
const { verifyToken, crossFacility } = require('../middleware/auth');
const { authLimiter, uploadLimiter, writeLimiter, readLimiter } = require('../config/rateLimiter');

router.post('/auth/login',          crossFacility, authLimiter,                                                              ctrl.login);
router.post('/auth/request-otp',    crossFacility, authLimiter,                                                              ctrl.requestOtp);
router.post('/auth/verify-otp',     crossFacility, authLimiter,                                                              ctrl.verifyOtp);
router.post('/auth/reset-password', crossFacility, authLimiter,                                                              ctrl.resetPassword);
router.post('/auth/set-password',   crossFacility, authLimiter,                                                              ctrl.setPassword);
router.put('/auth/change-password',                                    verifyToken, authLimiter,               ctrl.changePassword);
router.get('/all',                                                     verifyToken, readLimiter,               ctrl.getAll);
router.get('/filter/house/:house',                                     verifyToken, readLimiter,               ctrl.getByHouse);
router.post('/add',                                                    verifyToken, writeLimiter,              ctrl.create);
router.post('/import', verifyToken, uploadLimiter, writeLimiter,       spreadsheetUpload.single('file'),       ctrl.importFile);
router.put('/link-elder',                                              verifyToken, writeLimiter,              ctrl.linkElder);
router.put('/unlink-elder',                                            verifyToken, writeLimiter,              ctrl.unlinkElder);
router.get('/:guardianId',                                             verifyToken, readLimiter,               ctrl.getOne);
router.post('/:guardianId/fcm-token',                                  verifyToken, writeLimiter,              ctrl.saveFcmToken);
router.post('/:guardianId/upload-photo', verifyToken, uploadLimiter,   imageUpload.single('profileImage'),     ctrl.uploadPhoto);
router.put('/:guardianId/status',                                      verifyToken, writeLimiter,              ctrl.updateStatus);
router.put('/:guardianId',                                             verifyToken, writeLimiter,              ctrl.update);
router.delete('/:guardianId',                                          verifyToken, writeLimiter,              ctrl.remove);

module.exports = router;