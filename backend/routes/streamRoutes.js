const express = require('express');
const router = express.Router();
const streamController = require('../controllers/streamController');
const { verifyToken } = require('../middleware/auth');
const { readLimiter } = require('../config/rateLimiter');

// Any authenticated user (admin / nurse / guardian) may obtain a viewing token.
router.get('/token', verifyToken, readLimiter, streamController.getStreamToken);

module.exports = router;
