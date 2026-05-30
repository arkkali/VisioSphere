const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { verifyToken } = require('../middleware/auth');
const { writeLimiter, readLimiter } = require('../config/rateLimiter');

router.get('/',                    verifyToken, readLimiter,  incidentController.getIncidents);
router.get('/unread-count',        verifyToken, readLimiter,  incidentController.getUnreadCount);
router.get('/stats/daily',         verifyToken, readLimiter,  incidentController.getDailyStats);
router.get('/stats/weekly',        verifyToken, readLimiter,  incidentController.getWeeklyStats);
router.patch('/:id/acknowledge',   verifyToken, writeLimiter, incidentController.acknowledgeIncident);
router.patch('/:id/dismiss',       verifyToken, writeLimiter, incidentController.dismissIncident);
router.patch('/:id/resolve',       verifyToken, writeLimiter, incidentController.resolveIncident);

module.exports = router;