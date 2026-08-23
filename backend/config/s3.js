/**
 * s3.js — single shared S3 client.
 *
 * Heroku dynos have an EPHEMERAL filesystem: anything written to disk is lost
 * on every restart (at least daily, plus on every deploy). Nothing that must
 * outlive a request may be written locally. Any module that persists a file
 * uses this client.
 */
const { S3Client } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_BUCKET_NAME;

module.exports = { s3, BUCKET };
