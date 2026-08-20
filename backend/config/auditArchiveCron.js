import cron from 'node-cron';
import { runAuditArchive } from '../services/auditArchiveService.js';
import { FACILITY_KEYS } from './facilities.js';
import facilityScope from '../models/plugins/facilityScope.js';

const { runWithFacility } = facilityScope;

export const scheduleAuditArchive = () => {
  cron.schedule('0 2 * * *', async () => {
    // Archived per facility rather than unscoped, so each tenant gets its own
    // workbook. Previously one .xlsx mixed both facilities' audit logs.
    for (const facility of FACILITY_KEYS) {
      try {
        const result = await runWithFacility(facility, () => runAuditArchive());
        if (!result.skipped) {
          console.log(`[CRON] Audit archive complete (${facility}) — ${result.archived} logs archived to ${result.filename}`);
        }
      } catch (err) {
        console.error(`[CRON] Audit archive failed for ${facility}:`, err.message);
      }
    }
  });
};
