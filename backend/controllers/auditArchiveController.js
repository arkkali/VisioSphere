const { runAuditArchive, getArchiveStatus } = require('../services/auditArchiveService');

const triggerArchive = async (req, res, next) => {
  try {
    res.json(await runAuditArchive());
  } catch (err) {
    next(err);
  }
};

const archiveStatus = async (req, res, next) => {
  try {
    res.json(await getArchiveStatus());
  } catch (err) {
    next(err);
  }
};

module.exports = { triggerArchive, archiveStatus };
