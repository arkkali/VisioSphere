const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { verifyToken } = require('../middleware/auth');
const { writeLimiter, readLimiter } = require('../config/rateLimiter');

router.post('/save',  verifyToken, writeLimiter, reportController.saveReport);
router.get('/all',    verifyToken, readLimiter,  reportController.getAll);
router.get('/:id',    verifyToken, readLimiter,  reportController.getById);
router.delete('/:id', verifyToken, writeLimiter, reportController.deleteReport);

module.exports = router;