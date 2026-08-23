/**
 * auditArchiveService.js
 *
 * Archives audit logs older than 30 days into a formatted .xlsx, then deletes
 * them from MongoDB.
 *
 * PERSISTENCE: archives go to S3, never to local disk. Heroku (and Render's
 * free tier) give the dyno an EPHEMERAL filesystem that is wiped on every
 * restart — at least once every 24 hours. Writing the workbook locally and
 * then deleting the source rows from Mongo destroyed the audit trail: the
 * .xlsx vanished with the next restart and the database rows were already
 * gone. The Mongo delete now happens ONLY after S3 acknowledges the upload.
 *
 * TENANCY: each facility gets its own workbook. The S3 key carries the
 * facility key, so two facilities archiving on the same day no longer collide
 * on an identical filename.
 */
const ExcelJS = require('exceljs');
const { PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const AuditLog = require('../models/AuditLog');
const facilityScope = require('../models/plugins/facilityScope');
const { s3, BUCKET } = require('../config/s3');

const ARCHIVE_PREFIX = 'audit-archives/';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Facility currently in scope, or UNSCOPED when called outside runWithFacility. */
const currentFacilityKey = () => {
  try {
    return facilityScope.currentFacility?.() || 'UNSCOPED';
  } catch {
    return 'UNSCOPED';
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

const buildFilename = (cutoff, facility) => {
  const tag = cutoff.toISOString().slice(0, 10);
  return `audit_archive_${facility}_${tag}.xlsx`;
};

const runAuditArchive = async () => {
  if (!BUCKET) {
    throw new Error('AWS_BUCKET_NAME is not set — refusing to archive without a destination.');
  }

  const facility = currentFacilityKey();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const logs = await AuditLog.find({ createdAt: { $lt: cutoff } }).sort({ createdAt: 1 }).lean();

  if (logs.length === 0) {
    return { archived: 0, filename: null, key: null, facility, skipped: true };
  }

  const filename = buildFilename(cutoff, facility);
  const key = `${ARCHIVE_PREFIX}${filename}`;

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

  // Build in memory — no disk involved.
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  if (!buffer || buffer.length < 1024) {
    throw new Error('Archive workbook appears corrupt (< 1KB) — aborting delete.');
  }

  // Durable BEFORE destructive. If this throws, the audit logs survive.
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: XLSX_MIME,
    Metadata: {
      facility,
      cutoff: cutoff.toISOString(),
      records: String(logs.length),
    },
  }));

  const ids = logs.map((l) => l._id);
  const deleteResult = await AuditLog.deleteMany({ _id: { $in: ids } });

  if (deleteResult.deletedCount !== logs.length) {
    throw new Error(
      `Delete count mismatch: expected ${logs.length}, deleted ${deleteResult.deletedCount}. ` +
      `Archive is safe at s3://${BUCKET}/${key}.`
    );
  }

  return {
    archived: logs.length,
    filename,
    key,
    bucket: BUCKET,
    facility,
    bytes: buffer.length,
    cutoff: cutoff.toISOString(),
    skipped: false,
  };
};

const getArchiveStatus = async () => {
  if (!BUCKET) {
    return { lastArchive: null, archiveCount: 0, files: [] };
  }

  const facility = currentFacilityKey();

  const out = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: ARCHIVE_PREFIX,
  }));

  const files = (out.Contents || [])
    .filter((o) => o.Key.endsWith('.xlsx'))
    // Only this facility's archives. Legacy keys written before the facility
    // segment existed have no facility in the name; they are shown to everyone
    // rather than hidden, so old archives stay discoverable.
    .filter((o) => o.Key.includes(`_${facility}_`) || /audit_archive_\d{4}-\d{2}-\d{2}\.xlsx$/.test(o.Key))
    .sort((a, b) => b.Key.localeCompare(a.Key));

  if (files.length === 0) {
    return { lastArchive: null, archiveCount: 0, files: [] };
  }

  const match = files[0].Key.match(/(\d{4}-\d{2}-\d{2})\.xlsx$/);

  return {
    lastArchive: match ? match[1] : null,
    archiveCount: files.length,
    files: files.map((o) => ({
      name: o.Key.replace(ARCHIVE_PREFIX, ''),
      key: o.Key,
      size: o.Size,
      createdAt: o.LastModified,
    })),
  };
};

module.exports = { runAuditArchive, getArchiveStatus };
