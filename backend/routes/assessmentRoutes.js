const express = require('express');
const router = express.Router();
const assessmentController = require('../controllers/assessmentController');
const { imageUpload } = require('../config/multer');
const { verifyToken } = require('../middleware/auth');
const { uploadLimiter, writeLimiter, readLimiter } = require('../config/rateLimiter');

router.post('/upload',              verifyToken, uploadLimiter, imageUpload.single('file'), assessmentController.uploadFile);
router.post('/add',                 verifyToken, writeLimiter,  assessmentController.createAssessment);
router.put('/:id',                  verifyToken, writeLimiter,  assessmentController.updateAssessment);
router.get('/resident/:residentId', verifyToken, readLimiter,   assessmentController.getAssessmentsByResident);
router.get('/:id',                  verifyToken, readLimiter,   assessmentController.getAssessmentById);
router.post('/:id/comments',        verifyToken, writeLimiter,  assessmentController.addComment);
router.put('/:id/reactions',        verifyToken, writeLimiter,  assessmentController.updateReactions);

module.exports = router;