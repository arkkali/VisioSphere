const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const AuditLog = require('../models/AuditLog');

const ARCHIVE_DIR = path.resolve('uploads/audit-archives');

const ensureArchiveDir = () => {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
};

const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleString('en-PH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
};

const buildFilename = (cutoff) => {
  const tag = cutoff.toISOString().slice(0, 10);
  return `audit_archive_${tag}.xlsx`;
};

const runAuditArchive = async () => {
  ensureArchiveDir();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const logs = await AuditLog.find({ createdAt: { $lt: cutoff } }).sort({ createdAt: 1 }).lean();

  if (logs.length === 0) {
    return { archived: 0, filename: null, skipped: true };
  }

  const filename = buildFilename(cutoff);
  const filepath = path.join(ARCHIVE_DIR, filename);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VisioSphere System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Audit Logs', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  sheet.columns = [
    { header: 'Log ID',      key: '_id',       width: 28 },
    { header: 'Timestamp',   key: 'createdAt', width: 24 },
    { header: 'Category',    key: 'category',  width: 20 },
    { header: 'Event',       key: 'event',     width: 30 },
    { header: 'Actor Name',  key: 'actorName', width: 24 },
    { header: 'Actor Role',  key: 'actorRole', width: 20 },
    { header: 'Actor ID',    key: 'actorId',   width: 16 },
    { header: 'Purpose',     key: 'purpose',   width: 40 },
    { header: 'Status',      key: 'status',    width: 12 },
    { header: 'Old Values',  key: 'oldValues', width: 40 },
    { header: 'New Values',  key: 'newValues', width: 40 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00212E' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top:    { style: 'thin', color: { argb: 'FF00A8E8' } },
      bottom: { style: 'thin', color: { argb: 'FF00A8E8' } },
    };
  });
  headerRow.height = 28;

  const statusColors = {
    success: { bg: 'FFD1FAE5', font: 'FF065F46' },
    alert:   { bg: 'FFFEF3C7', font: 'FF92400E' },
    failed:  { bg: 'FFFEE2E2', font: 'FF991B1B' },
  };

  logs.forEach((log, idx) => {
    const row = sheet.addRow({
      _id:       log._id?.toString() || '',
      createdAt: formatDate(log.createdAt),
      category:  log.category  || '',
      event:     log.event     || '',
      actorName: log.actorName || '',
      actorRole: log.actorRole || '',
      actorId:   log.actorId   || '',
      purpose:   log.purpose   || '',
      status:    log.status    || '',
      oldValues: log.oldValues ? JSON.stringify(log.oldValues) : '',
      newValues: log.newValues ? JSON.stringify(log.newValues) : '',
    });

    const isEven = idx % 2 === 0;
    const statusColor = statusColors[log.status];

    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.font = { size: 10 };

      if (colNumber === 9 && statusColor) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColor.bg } };
        cell.font = { bold: true, color: { argb: statusColor.font }, size: 10 };
      } else {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEven ? 'FFF8FAFC' : 'FFFFFFFF' },
        };
      }
    });

    row.height = 22;
  });

  sheet.autoFilter = { from: 'A1', to: 'K1' };

  await workbook.xlsx.writeFile(filepath);

  const written = fs.existsSync(filepath);
  if (!written) {
    throw new Error('Archive file was not written successfully — aborting delete.');
  }

  const stats = fs.statSync(filepath);
  if (stats.size < 1024) {
    fs.unlinkSync(filepath);
    throw new Error('Archive file appears corrupt (< 1KB) — aborting delete.');
  }

  const ids = logs.map((l) => l._id);
  const deleteResult = await AuditLog.deleteMany({ _id: { $in: ids } });

  if (deleteResult.deletedCount !== logs.length) {
    throw new Error(
      `Delete count mismatch: expected ${logs.length}, deleted ${deleteResult.deletedCount}.`
    );
  }

  return {
    archived: logs.length,
    filename,
    filepath,
    cutoff: cutoff.toISOString(),
    skipped: false,
  };
};

const getArchiveStatus = () => {
  ensureArchiveDir();
  const files = fs.readdirSync(ARCHIVE_DIR).filter((f) => f.endsWith('.xlsx'));

  if (files.length === 0) {
    return { lastArchive: null, archiveCount: 0, files: [] };
  }

  files.sort().reverse();
  const latest = files[0];
  const match = latest.match(/audit_archive_(\d{4}-\d{2}-\d{2})\.xlsx/);
  const lastArchive = match ? match[1] : null;

  return {
    lastArchive,
    archiveCount: files.length,
    files: files.map((f) => {
      const stats = fs.statSync(path.join(ARCHIVE_DIR, f));
      return { name: f, size: stats.size, createdAt: stats.birthtime };
    }),
  };
};

module.exports = { runAuditArchive, getArchiveStatus };