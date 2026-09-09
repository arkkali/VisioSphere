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
// Viewing and reclassifying a recording is care work: Facility Admin and Nurse
// only. Guardians are family members -- they have no CCTV or clip access in the
// mobile app, and these two routes were the only place a Guardian token could
// still have reached footage, since ProtectedRoute checks sign-in and never
// role. Listing roles explicitly rather than excluding 'Guardian' so a role
// added later is denied by default instead of silently inheriting access.
router.get('/:id/video-url',       verifyToken, authorizeRoles('Facility Admin', 'Nurse'), readLimiter,  incidentController.getVideoUrl);

// Downloading takes a copy of resident footage off the system permanently, so
// it is restricted to a Facility Admin and written to the audit trail. Note the
// limit of this control: anyone who may PLAY a clip already receives the bytes
// and can save them from the browser. What is admin-only is the audited export
// path, not the pixels. Removing footage from a viewer entirely would mean
// removing playback, not hardening this route.
router.get('/:id/download-url',    verifyToken, authorizeRoles('Facility Admin'), readLimiter, incidentController.getVideoDownloadUrl);
router.patch('/:id/acknowledge',   verifyToken, writeLimiter, incidentController.acknowledgeIncident);
router.patch('/:id/dismiss',       verifyToken, writeLimiter, incidentController.dismissIncident);
router.patch('/:id/resolve',       verifyToken, writeLimiter, incidentController.resolveIncident);

// Correcting a misclassification is clinical work, so nurses may do it.
router.patch('/:id/clip',          verifyToken, authorizeRoles('Facility Admin', 'Nurse'), writeLimiter, incidentController.updateClip);

// Deleting the recording of a detected fall destroys evidence, so it is
// restricted to a Facility Admin and always written to the audit trail.
// Loosen this only with a deliberate decision about who may erase footage.
router.delete('/:id/clip',         verifyToken, authorizeRoles('Facility Admin'), writeLimiter, incidentController.deleteClip);

module.exports = router;