const AuditLog = require('../models/AuditLog');

const getAll = async () => {
  return await AuditLog.find().sort({ createdAt: -1 });
};

const create = async (data) => {
  const { category, event, actorName, actorRole, actorId, purpose, status, oldValues, newValues } = data;

  if (!category || !event || !actorName || !purpose || !status) {
    const err = new Error('Missing required fields');
    err.status = 400;
    throw err;
  }

  const newLog = new AuditLog({
    category,
    event,
    actorName,
    actorRole: actorRole || 'System',
    actorId: actorId || null,
    purpose,
    status,
    oldValues: oldValues || null,
    newValues: newValues || null
  });

  return await newLog.save();
};

module.exports = { getAll, create };