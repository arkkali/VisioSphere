const express    = require('express');
const router     = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken }        = require('../middleware/auth');
const { writeLimiter, readLimiter } = require('../config/rateLimiter');

router.get('/guardian/:guardianId',              verifyToken, readLimiter,  notificationController.getByGuardian);
router.get('/guardian/:guardianId/unread-count', verifyToken, readLimiter,  notificationController.getUnreadCount);
router.put('/:id/read',                          verifyToken, writeLimiter, notificationController.markAsRead);
router.put('/guardian/:guardianId/read-all',     verifyToken, writeLimiter, notificationController.markAllAsRead);
router.delete('/:id',                            verifyToken, writeLimiter, notificationController.deleteNotification);

router.post('/admin/:customId/fcm-token',  verifyToken, writeLimiter, notificationController.registerAdminFcmToken);
router.post('/nurse/:nurseId/fcm-token',   verifyToken, writeLimiter, notificationController.registerNurseFcmToken);

module.exports = router;