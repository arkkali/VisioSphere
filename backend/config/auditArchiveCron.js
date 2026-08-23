const cron = require('node-cron');
const { runAuditArchive } = require('../services/auditArchiveService');
const { FACILITY_KEYS } = require('./facilities');
const facilityScope = require('../models/plugins/facilityScope');

const { runWithFacility } = facilityScope;

const scheduleAuditArchive = () => {
  cron.schedule('0 2 * * *', async () => {
    // Archived per facility rather than unscoped, so each tenant gets its own
    // workbook. Previously one .xlsx mixed both facilities' audit logs.
    for (const facility of FACILITY_KEYS) {
      try {
        const result = await runWithFacility(facility, () => runAuditArchive());
        if (!result.skipped) {
          console.log(`[CRON] Audit archive complete (${facility}) — ${result.archived} logs archived to ${result.key}`);
        }
      } catch (err) {
        console.error(`[CRON] Audit archive failed for ${facility}:`, err.message);
      }
    }
  }, { scheduled: true, timezone: 'Asia/Manila' });
};

module.exports = { scheduleAuditArchive };
