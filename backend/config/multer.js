const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');

// S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// S3 storage for images (guardian photos, assessment files)
const s3Storage = multerS3({
  s3,
  bucket: process.env.AWS_BUCKET_NAME,
  key: (req, file, cb) => {
    cb(null, `uploads/${Date.now()}-${file.originalname}`);
  },
});

// Local disk storage — only for spreadsheet imports (parsed then deleted immediately)
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

const imageFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith('image/') ||
    (file.mimetype === 'application/octet-stream' &&
      file.originalname.match(/\.(jpg|jpeg|png)$/i))
  ) {
    return cb(null, true);
  }
  cb(new Error(`Invalid file type. Received: ${file.mimetype}. Only image files are allowed.`));
};

// spreadsheetUpload → local disk (file deleted immediately after parsing)
exports.spreadsheetUpload = multer({ storage: diskStorage, fileFilter: spreadsheetFilter });

// imageUpload → S3 (guardian photos, assessment images)
exports.imageUpload = multer({ storage: s3Storage, fileFilter: imageFilter });