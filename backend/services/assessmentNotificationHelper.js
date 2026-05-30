const admin = require('firebase-admin');
const Guardian = require('../models/Guardian');
const Notification = require('../models/Notification');

async function notifyGuardiansNewReport({ residentId, residentName, authorName, assessment, io }) {
  const guardians = await Guardian.find({
    $or: [
      { 'assignedElders._id': residentId },
      { assignedElders: residentId }
    ]
  });

  const reportDate = assessment.createdAt || assessment.date || new Date();

  for (const guardian of guardians) {
    const guardianIdStr = guardian.guardianId || guardian._id.toString();

    const notification = await Notification.create({
      guardianId: guardianIdStr,
      type: 'new_report',
      title: 'New Daily Journal',
      message: `${authorName} has posted a new daily assessment for ${residentName}.`,
      residentId,
      residentName,
      assessmentId: assessment._id,
      reportDate
    });

    if (io) io.emit('new_notification', { notification });

    if (guardian.fcmTokens && guardian.fcmTokens.length > 0) {
      try {
        await admin.messaging().sendEachForMulticast({
          tokens: guardian.fcmTokens,
          notification: { title: notification.title, body: notification.message },
          data: {
            _id: notification._id.toString(),
            type: 'new_report',
            residentId: residentId.toString(),
            assessmentId: assessment._id.toString(),
            reportDate: reportDate.toISOString()
          }
        });
      } catch (fcmErr) {
        console.error(`[FCM] Error sending to ${guardianIdStr}:`, fcmErr.message);
      }
    }
  }
}

async function notifyGuardiansNewComment({ assessment, senderName, io }) {
  const guardians = await Guardian.find({
    $or: [
      { 'assignedElders._id': assessment.residentId },
      { assignedElders: assessment.residentId }
    ]
  });

  const reportDate = assessment.createdAt || assessment.date || new Date();

  for (const guardian of guardians) {
    const guardianIdStr = guardian.guardianId || guardian._id.toString();

    const notification = await Notification.create({
      guardianId: guardianIdStr,
      type: 'new_comment',
      title: 'New Message from Care Team',
      message: `${senderName} added a comment to ${assessment.residentName}'s report.`,
      residentId: assessment.residentId,
      residentName: assessment.residentName,
      assessmentId: assessment._id,
      reportDate
    });

    if (io) io.emit('new_notification', { notification });

    if (guardian.fcmTokens && guardian.fcmTokens.length > 0) {
      try {
        await admin.messaging().sendEachForMulticast({
          tokens: guardian.fcmTokens,
          notification: { title: notification.title, body: notification.message },
          data: {
            _id: notification._id.toString(),
            type: 'new_comment',
            residentId: assessment.residentId.toString(),
            assessmentId: assessment._id.toString(),
            reportDate: reportDate.toISOString()
          }
        });
      } catch (fcmErr) {
        console.error(`[FCM] Error sending to ${guardianIdStr}:`, fcmErr.message);
      }
    }
  }
}

module.exports = { notifyGuardiansNewReport, notifyGuardiansNewComment };