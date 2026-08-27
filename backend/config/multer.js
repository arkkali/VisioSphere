const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Upload storage.
 *
 * There is no S3 here any more. Report attachments are held in memory for the
 * length of one request and then PUT to the mini PC, which owns the disk and
 * serves them back through a signed URL — the same handshake the CCTV clips
 * already use (see services/assessmentService.js and utils/clipToken.js).
 *
 * WHY MEMORY AND NOT DISK: this backend's filesystem is not durable — on
 * Heroku the dyno disk is wiped on every restart, and even where it is not,
 * the file would sit on a machine that is not the one serving it. Holding the
 * bytes for one request and forwarding them keeps the only copy in the one
 * place that is backed up.
 */

// Local disk storage — only for spreadsheet imports (parsed then deleted
// immediately, inside the same request, so ephemerality does not matter).
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const spreadsheetFilter = (req, file, cb) => {
  const validMimes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ];
  validMimes.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'));
};

// Images plus PDFs: a nurse attaching a scanned form to a report is the same
// action as attaching a photo, and rejecting it produced a bare "Upload failed"
// with no explanation of what was wrong with the file.
const ATTACHMENT_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
]);
const ATTACHMENT_EXT = /\.(jpe?g|png|webp|gif|pdf)$/i;

const attachmentFilter = (req, file, cb) => {
  if (ATTACHMENT_MIMES.has(file.mimetype) ||
      (file.mimetype === 'application/octet-stream' &&
       ATTACHMENT_EXT.test(file.originalname))) {
    return cb(null, true);
  }
  cb(new Error(
    `That file type is not accepted (${file.mimetype}). ` +
    'Attach a JPG, PNG, WEBP, GIF or PDF.'
  ));
};

const MAX_ATTACHMENT_MB = parseInt(process.env.ATTACHMENT_MAX_MB || '10', 10);

exports.spreadsheetUpload = multer({
  storage: diskStorage,
  fileFilter: spreadsheetFilter,
});

exports.imageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: attachmentFilter,
  limits: { fileSize: MAX_ATTACHMENT_MB * 1024 * 1024 },
});
