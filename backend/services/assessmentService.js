const DailyAssessment = require('../models/DailyAssessment');
const AuditLog = require('../models/AuditLog');
const assessmentNotificationHelper = require('./assessmentNotificationHelper');

async function uploadFile(file) {
  // file.location is the full S3 URL provided by multer-s3
  return { fileUrl: file.location };
}

async function createAssessment(data, io) {
  const { residentId, residentName, authorId, authorName, title, blocks, tags } = data;

  const assessment = await new DailyAssessment({
    residentId,
    residentName,
    authorId,
    authorName,
    title: title || 'Daily Assessment Update',
    tags: tags || [],
    blocks: blocks || []
  }).save();

  await AuditLog.create({
    category: 'Reporting',
    event: 'Daily Report Submitted',
    actorName: authorName,
    purpose: `Submitted daily assessment for ${residentName}`,
    status: 'success',
    newValues: {
      assessmentId: assessment._id,
      residentId,
      title: assessment.title,
      tags: assessment.tags
    }
  });

  if (io) io.emit('new_assessment_report', { assessment });

  await assessmentNotificationHelper.notifyGuardiansNewReport({
    residentId,
    residentName,
    authorName,
    assessment,
    io
  });

  return assessment;
}

async function updateAssessment(id, data) {
  const { title, blocks, tags } = data;

const assessment = await DailyAssessment.findByIdAndUpdate(
    id,
    { title, blocks, tags },
    { returnDocument: 'after' }
  );
  
  if (!assessment) {
    const err = new Error('Assessment not found');
    err.status = 404;
    throw err;
  }

  await AuditLog.create({
    category: 'Reporting',
    event: 'Daily Report Edited',
    actorName: 'Care Team',
    purpose: `Updated daily assessment for ${assessment.residentName}`,
    status: 'success',
    newValues: {
      assessmentId: assessment._id,
      title: assessment.title,
      tags: assessment.tags
    }
  });

  return assessment;
}

async function getAssessmentsByResident(residentId) {
  return DailyAssessment.find({ residentId }).sort({ createdAt: -1 });
}

async function getAssessmentById(id) {
  const assessment = await DailyAssessment.findById(id);
  if (!assessment) {
    const err = new Error('Assessment not found');
    err.status = 404;
    throw err;
  }
  return assessment;
}

async function addComment(assessmentId, commentData, io) {
  const { senderId, senderName, senderRole, text } = commentData;

  const assessment = await DailyAssessment.findById(assessmentId);
  if (!assessment) {
    const err = new Error('Assessment not found');
    err.status = 404;
    throw err;
  }

  assessment.comments.push({ senderId, senderName, senderRole, text });
  await assessment.save();

  const addedComment = assessment.comments[assessment.comments.length - 1];

  if (io) {
    io.emit('new_assessment_comment', {
      assessmentId: assessment._id,
      comment: addedComment
    });
  }

  if (senderRole !== 'Guardian') {
    await assessmentNotificationHelper.notifyGuardiansNewComment({
      assessment,
      senderName,
      io
    });
  }

  await AuditLog.create({
    category: 'Reporting',
    event: 'Assessment Comment Added',
    actorName: senderName,
    purpose: `Added a comment to assessment for ${assessment.residentName}`,
    status: 'success',
    newValues: {
      assessmentId: assessment._id,
      commentPreview: text.substring(0, 50)
    }
  });

  return assessment;
}

async function updateReactions(id, reactionData, io) {
  const { thumbsUp, heart, acknowledged } = reactionData;

  const assessment = await DailyAssessment.findById(id);
  if (!assessment) {
    const err = new Error('Assessment not found');
    err.status = 404;
    throw err;
  }

  const oldReactions = assessment.reactions.toObject
    ? assessment.reactions.toObject()
    : { ...assessment.reactions };

  if (thumbsUp !== undefined) assessment.reactions.thumbsUp = thumbsUp;
  if (heart !== undefined) assessment.reactions.heart = heart;
  if (acknowledged !== undefined) assessment.reactions.acknowledged = acknowledged;

  await assessment.save();

  if (io) {
    io.emit('new_assessment_reaction', {
      assessmentId: assessment._id,
      reactions: assessment.reactions
    });
  }

  await AuditLog.create({
    category: 'Reporting',
    event: 'Assessment Reaction Updated',
    actorName: 'System User',
    purpose: `Updated reactions on assessment for ${assessment.residentName}`,
    status: 'success',
    oldValues: oldReactions,
    newValues: { thumbsUp, heart, acknowledged }
  });

  return assessment;
}

module.exports = {
  uploadFile,
  createAssessment,
  updateAssessment,
  getAssessmentsByResident,
  getAssessmentById,
  addComment,
  updateReactions
};