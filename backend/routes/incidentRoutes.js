const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');
const { writeLimiter, readLimiter } = require('../config/rateLimiter');

router.get('/',                    verifyToken, readLimiter,  incidentController.getIncidents);
router.get('/unread-count',        verifyToken, readLimiter,  incidentController.getUnreadCount);
router.get('/stats/daily',         verifyToken, readLimiter,  incidentController.getDailyStats);
router.get('/stats/weekly',        verifyToken, readLimiter,  incidentController.getWeeklyStats);
// Registered before the '/:id/...' routes so a literal path segment is never
// shadowed by the parameterised ones.
router.get('/thumbnail-urls',      verifyToken, readLimiter,  incidentController.getThumbnailUrls);
router.get('/:id/video-url',       verifyToken, readLimiter,  incidentController.getVideoUrl);
router.patch('/:id/acknowledge',   verifyToken, writeLimiter, incidentController.acknowledgeIncident);
router.patch('/:id/dismiss',       verifyToken, writeLimiter, incidentController.dismissIncident);
router.patch('/:id/resolve',       verifyToken, writeLimiter, incidentController.resolveIncident);

// Correcting a misclassification is clinical work, so nurses may do it.
router.patch('/:id/clip',          verifyToken, writeLimiter, incidentController.updateClip);

// Deleting the recording of a detected fall destroys evidence, so it is
// restricted to a Facility Admin and always written to the audit trail.
// Loosen this only with a deliberate decision about who may erase footage.
router.delete('/:id/clip',         verifyToken, authorizeRoles('Facility Admin'), writeLimiter, incidentController.deleteClip);

module.exports = router;