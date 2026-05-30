const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { verifyToken } = require('../middleware/auth');
const { writeLimiter, readLimiter } = require('../config/rateLimiter');

router.get('/', verifyToken, readLimiter,  settingsController.getSettings);
router.put('/', verifyToken, writeLimiter, settingsController.updateSettings);

module.exports = router;