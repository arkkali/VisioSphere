const express = require('express');
const router = express.Router();
const { triggerArchive, archiveStatus } = require('../controllers/auditArchiveController');
const { verifyToken } = require('../middleware/auth');
const { writeLimiter, readLimiter } = require('../config/rateLimiter');

router.use(verifyToken);
router.get('/status',  readLimiter,  archiveStatus);
router.post('/trigger', writeLimiter, triggerArchive);

module.exports = router;