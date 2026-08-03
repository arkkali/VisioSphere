const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const Admin  = require('../models/Admin');
const Nurse = require('../models/Nurse');
const admin = require('../config/firebase');

const getByGuardian = async (guardianId) => {
  return await Notification.find({ guardianId })
    .sort({ createdAt: -1 })
    .limit(50);
};

const getUnreadCount = async (guardianId) => {
  const count = await Notification.countDocuments({ guardianId, isRead: false });
  return { count };
};

const markAsRead = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid notification ID');
    err.status = 400;
    throw err;
  }
  const notification = await Notification.findByIdAndUpdate(
    id,
    { isRead: true },
    { returnDocument: 'after' }
  );
  if (!notification) {
    const err = new Error('Notification not found');
    err.status = 404;
    throw err;
  }
  return notification;
};

const markAllAsRead = async (guardianId) => {
  await Notification.updateMany(
    { guardianId, isRead: false },
    { $set: { isRead: true } }
  );
};

const deleteNotification = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid notification ID');
    err.status = 400;
    throw err;
  }
  const notification = await Notification.findByIdAndDelete(id);
  if (!notification) {
    const err = new Error('Notification not found');
    err.status = 404;
    throw err;
  }
};

const dispatchIncidentPushToStaff = async (incident) => {
  try {
    const [admins, nurses] = await Promise.all([
      Admin.find({ role: 'Facility Admin', status: 'ACTIVE', fcmToken: { $ne: null } }, 'fcmToken').lean(),
      Nurse.find({ status: 'Active', fcmToken: { $ne: null } }, 'fcmToken').lean(),
    ]);
    const tokens = [
      ...admins.map((a) => a.fcmToken),
      ...nurses.map((n) => n.fcmToken),
    ].filter(Boolean);
    if (tokens.length === 0) return;
    const title = incident.severity === 'Emergency'
      ? `🚨 Emergency: ${incident.incidentType}`
      : `⚠️ Alert: ${incident.incidentType}`;
    const body = `${incident.location} — ${incident.description}`;
    const message = {
      data: {
        incidentId:   String(incident._id),
        incidentType: incident.incidentType ?? '',
        severity:     incident.severity     ?? '',
        location:     incident.location     ?? '',
        title,
        body,
      },
      android: {
        priority: incident.severity === 'Emergency' ? 'high' : 'normal',
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1,
          },
        },
      },
    };
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500));
    }
    for (const chunk of chunks) {
      await admin.messaging().sendEachForMulticast({ ...message, tokens: chunk });
    }
  } catch (err) {
    console.error('[FCM] dispatchIncidentPushToStaff error:', err.message);
  }
};

const dispatchResolutionPushToStaff = async (incident, resolverName) => {
  try {
    const [admins, nurses] = await Promise.all([
      Admin.find({ role: 'Facility Admin', status: 'ACTIVE', fcmToken: { $ne: null } }, 'fcmToken').lean(),
      Nurse.find({ status: 'Active', fcmToken: { $ne: null } }, 'fcmToken').lean(),
    ]);
    const tokens = [
      ...admins.map((a) => a.fcmToken),
      ...nurses.map((n) => n.fcmToken),
    ].filter(Boolean);
    if (tokens.length === 0) return;
    const title = `✅ Resolved: ${incident.incidentType}`;
    const body = `${incident.location} — Resolved by ${resolverName}`;
    const message = {
      data: {
        incidentId:   String(incident._id),
        incidentType: incident.incidentType ?? '',
        severity:     incident.severity     ?? '',
        location:     incident.location     ?? '',
        resolverName: resolverName          ?? '',
        title,
        body,
      },
      android: {
        priority: 'normal',
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 0,
          },
        },
      },
    };
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500));
    }
    for (const chunk of chunks) {
      await admin.messaging().sendEachForMulticast({ ...message, tokens: chunk });
    }
  } catch (err) {
    console.error('[FCM] dispatchResolutionPushToStaff error:', err.message);
  }
};

module.exports = {
  getByGuardian,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  dispatchIncidentPushToStaff,
  dispatchResolutionPushToStaff,
};