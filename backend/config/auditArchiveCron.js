import cron from 'node-cron';
import { runAuditArchive } from '../services/auditArchiveService.js';

export const scheduleAuditArchive = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      const result = await runAuditArchive();
      if (!result.skipped) {
        console.log(`[CRON] Audit archive complete — ${result.archived} logs archived to ${result.filename}`);
      }
    } catch (err) {
      console.error('[CRON] Audit archive failed:', err.message);
    }
  });
};