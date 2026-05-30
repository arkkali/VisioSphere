import { runAuditArchive, getArchiveStatus } from '../services/auditArchiveService.js';

export const triggerArchive = async (req, res, next) => {
  try {
    const result = await runAuditArchive();
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const archiveStatus = async (req, res, next) => {
  try {
    const status = getArchiveStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
};