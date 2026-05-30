const notificationService = require('../services/notificationService');
const User  = require('../models/User');
const Nurse = require('../models/Nurse');

const getByGuardian = async (req, res, next) => {
  try {
    const notifications = await notificationService.getByGuardian(req.params.guardianId);
    res.status(200).json(notifications);
  } catch (err) {
    next(err);
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    const result = await notificationService.getUnreadCount(req.params.guardianId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const notification = await notificationService.markAsRead(req.params.id);
    res.status(200).json({ message: 'Notification marked as read', notification });
  } catch (err) {
    next(err);
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    await notificationService.markAllAsRead(req.params.guardianId);
    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
};

const deleteNotification = async (req, res, next) => {
  try {
    await notificationService.deleteNotification(req.params.id);
    res.status(200).json({ message: 'Notification deleted successfully' });
  } catch (err) {
    next(err);
  }
};

const registerAdminFcmToken = async (req, res, next) => {
  try {
    const { customId } = req.params;
    const { fcmToken }  = req.body;

    if (!fcmToken) {
      return res.status(400).json({ message: 'fcmToken is required' });
    }

    const admin = await User.findOneAndUpdate(
      { customId, role: 'Facility Admin' },
      { fcmToken },
      { new: true }
    );

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.status(200).json({ message: 'Admin FCM token registered' });
  } catch (err) {
    next(err);
  }
};

const registerNurseFcmToken = async (req, res, next) => {
  try {
    const { nurseId }  = req.params;
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ message: 'fcmToken is required' });
    }

    const nurse = await Nurse.findOneAndUpdate(
      { nurseId },
      { fcmToken },
      { new: true }
    );

    if (!nurse) {
      return res.status(404).json({ message: 'Nurse not found' });
    }

    res.status(200).json({ message: 'Nurse FCM token registered' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getByGuardian,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  registerAdminFcmToken,
  registerNurseFcmToken,
};