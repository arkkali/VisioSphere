const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' }
}, { _id: true });

const systemSettingsSchema = new mongoose.Schema({
  facilityConfiguration: {
    zones: [zoneSchema],
    shiftTimings: {
      morningStart: { type: String, default: '06:00 AM' },
      afternoonStart: { type: String, default: '02:00 PM' },
      nightStart: { type: String, default: '10:00 PM' }
    }
  },
  aiThresholds: {
    fallSensitivity: { type: Number, default: 75, min: 0, max: 100 },
    thermalThreshold: { type: Number, default: 38.0 },
    inactivityTimerMinutes: { type: Number, default: 15 }
  },
  notifications: {
    smsEnabled: { type: Boolean, default: true },
    emergencyBroadcastActive: { type: Boolean, default: false },
    guardianNotificationDelayMinutes: { type: Number, default: 2 }
  },
  dataPrivacy: {
    videoRetentionDays: { type: Number, default: 30 },
    auditTrailRetentionDays: { type: Number, default: 90 }
  }
}, { timestamps: true });

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);