const SystemSettings = require('../models/SystemSettings');
const AuditLog = require('../models/AuditLog');

const getSettings = async () => {
  let settings = await SystemSettings.findOne();
  if (!settings) {
    settings = await SystemSettings.create({});
  }
  return settings;
};

const updateSettings = async (body) => {
  let settings = await SystemSettings.findOne();
  if (!settings) {
    settings = await SystemSettings.create({});
  }

  const oldSettings = settings.toObject();

  if (body.facilityConfiguration) settings.facilityConfiguration = body.facilityConfiguration;
  if (body.aiThresholds) settings.aiThresholds = body.aiThresholds;
  if (body.notifications) settings.notifications = body.notifications;
  if (body.dataPrivacy) settings.dataPrivacy = body.dataPrivacy;

  const updatedSettings = await settings.save();

  await AuditLog.create({
    category: 'System Configuration',
    event: 'System Settings Updated',
    actorName: 'Facility Admin',
    purpose: 'Modified global system parameters and thresholds',
    status: 'success',
    oldValues: oldSettings,
    newValues: updatedSettings.toObject()
  });

  return updatedSettings;
};

module.exports = { getSettings, updateSettings };