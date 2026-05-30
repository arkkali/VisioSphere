const cron = require('node-cron');
const Resident = require('../models/Resident');
const AuditLog = require('../models/AuditLog');

const initCron = () => {
  cron.schedule('0 0 * * *', async () => {
    try {
      await Resident.updateMany({}, { $set: { attendance: null, notes: '' } });
      await AuditLog.create({
        category: 'System',
        event: 'Automated Daily Reset',
        actorName: 'System Cron Job',
        purpose: 'Reset attendance and notes for the new day',
        status: 'success',
        newValues: { attendance: null, notes: '' }
      });
    } catch (err) {
      console.error('[CRON] Error during midnight reset:', err);
    }
  }, { scheduled: true, timezone: 'Asia/Manila' });
};

module.exports = initCron;