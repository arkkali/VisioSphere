const cron = require('node-cron');
const Resident = require('../models/Resident');
const AuditLog = require('../models/AuditLog');
const { FACILITY_KEYS } = require('./facilities');
const { runWithFacility } = require('../models/plugins/facilityScope');

const initCron = () => {
  cron.schedule('0 0 * * *', async () => {
    // Cron runs outside any HTTP request, so there is no facility context to
    // inherit — the scoping plugin would throw. Run the reset once PER
    // facility instead of unscoped: each tenant then gets its own audit entry,
    // and AuditLog.facility (required) is satisfied.
    for (const facility of FACILITY_KEYS) {
      try {
        await runWithFacility(facility, async () => {
          await Resident.updateMany({}, { $set: { attendance: null, notes: '' } });
          await AuditLog.create({
            category: 'System',
            event: 'Automated Daily Reset',
            actorName: 'System Cron Job',
            purpose: 'Reset attendance and notes for the new day',
            status: 'success',
            newValues: { attendance: null, notes: '', facility }
          });
        });
      } catch (err) {
        console.error(`[CRON] Error during midnight reset for ${facility}:`, err);
      }
    }
  }, { scheduled: true, timezone: 'Asia/Manila' });
};

module.exports = initCron;
