const assessmentService = require('../services/assessmentService');

async function uploadFile(req, res, next) {
  try {
    if (!req.file) {
      const err = new Error('No file uploaded');
      err.status = 400;
      throw err;
    }
    const result = await assessmentService.uploadFile(req.file);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function createAssessment(req, res, next) {
  try {
    const { residentId, residentName, authorId, authorName } = req.body;
    if (!residentId || !residentName || !authorId || !authorName) {
      const err = new Error('Missing required fields');
      err.status = 400;
      throw err;
    }
    const io = req.app.get('io');
    const assessment = await assessmentService.createAssessment(req.body, io);
    res.status(201).json({ message: 'Assessment saved successfully', assessment });
  } catch (err) {
    next(err);
  }
}

async function updateAssessment(req, res, next) {
  try {
    const assessment = await assessmentService.updateAssessment(req.params.id, req.body);
    res.status(200).json({ message: 'Assessment updated successfully', assessment });
  } catch (err) {
    next(err);
  }
}

async function deleteAssessment(req, res, next) {
  try {
    const io = req.app.get('io');
    await assessmentService.deleteAssessment(req.params.id, req.user, io);
    res.status(200).json({ message: 'Assessment deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function getAssessmentsByResident(req, res, next) {
  try {
    const assessments = await assessmentService.getAssessmentsByResident(req.params.residentId);
    res.status(200).json(assessments);
  } catch (err) {
    next(err);
  }
}

async function getAssessmentById(req, res, next) {
  try {
    const assessment = await assessmentService.getAssessmentById(req.params.id);
    res.status(200).json(assessment);
  } catch (err) {
    next(err);
  }
}

async function addComment(req, res, next) {
  try {
    const { senderId, senderName, senderRole, text } = req.body;
    if (!senderId || !senderName || !senderRole || !text) {
      const err = new Error('Missing required comment fields');
      err.status = 400;
      throw err;
    }
    const io = req.app.get('io');
    const assessment = await assessmentService.addComment(req.params.id, req.body, io);
    res.status(200).json({ message: 'Comment added', assessment });
  } catch (err) {
    next(err);
  }
}

async function updateReactions(req, res, next) {
  try {
    const io = req.app.get('io');
    const assessment = await assessmentService.updateReactions(req.params.id, req.body, io);
    res.status(200).json({ message: 'Reactions updated', assessment });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadFile,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  getAssessmentsByResident,
  getAssessmentById,
  addComment,
  updateReactions
};