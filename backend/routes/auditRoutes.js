const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { verifyToken } = require('../middleware/auth');
const { writeLimiter, readLimiter } = require('../config/rateLimiter');

router.get('/',  verifyToken, readLimiter,  auditController.getAll);
router.post('/', verifyToken, writeLimiter, auditController.create);

module.exports = router;