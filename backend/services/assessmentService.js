const DailyAssessment = require('../models/DailyAssessment');
const AuditLog = require('../models/AuditLog');
const assessmentNotificationHelper = require('./assessmentNotificationHelper');

const crypto = require('crypto');
const path = require('path');
const { signUploadToken } = require('../utils/clipToken');

// The mini PC's public origin — the same Cloudflare tunnel the clips already
// come through, e.g. https://cctv.visiosphere.live. One host, one secret, one
// handshake for every file this system stores.
const STORE_BASE_URL = (process.env.CLIP_BASE_URL || '').replace(/\/+$/, '');

/**
 * Make a stored name that is safe in a URL and on a disk. The nurse's original
 * filename survives as a readable suffix, but it never decides the path: the
 * timestamp and random half guarantee uniqueness, and anything outside a small
 * allowlist of characters is replaced.
 */
function safeStoredName(originalname = '') {
  const ext = (path.extname(originalname) || '').toLowerCase().slice(0, 10);
  const stem = path.basename(originalname, path.extname(originalname))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 40) || 'file';
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${stem}${ext}`;
}

/**
 * Store one report attachment on the mini PC; return the name it was stored
 * under. The NAME is what goes in the database, never a URL — a URL carries a
 * token that expires and an origin that may change. Read URLs are minted fresh
 * on every read, in withAttachmentUrls below.
 */
async function uploadFile(file) {
  if (!STORE_BASE_URL) {
    const err = new Error(
      'File storage is not configured: CLIP_BASE_URL is empty. It must point ' +
      'at the mini PC origin, e.g. https://cctv.visiosphere.live'
    );
    err.status = 500;
    throw err;
  }

  const filename = safeStoredName(file.originalname);
  const { token } = signUploadToken(filename, 'write');
  const url = `${STORE_BASE_URL}/uploads/${encodeURIComponent(filename)}`
            + `?token=${encodeURIComponent(token)}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': file.mimetype || 'application/octet-stream' },
      body: file.buffer,
    });
  } catch (cause) {
    // Tunnel down, mini PC off, DNS wrong. Say which, rather than letting the
    // browser show a bare "Upload failed" that names no cause at all.
    const err = new Error(
      `Could not reach file storage at ${STORE_BASE_URL}: ${cause.message}`
    );
    err.status = 502;
    throw err;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(
      `File storage refused the upload (${res.status})`
      + (body ? `: ${body.slice(0, 200)}` : '')
    );
    err.status = res.status === 413 ? 413 : 502;
    throw err;
  }

  // Two values, two jobs. `fileUrl` is the bare stored name and is what the
  // client saves into the report. `viewUrl` is a signed, short-lived link the
  // editor uses to show the file immediately, before the report is saved and
  // read back. The browser never builds either one itself — that string
  // concatenation is exactly what broke image display before.
  const { token: viewToken } = signUploadToken(filename, 'view');
  return {
    fileUrl: filename,
    viewUrl: `${STORE_BASE_URL}/uploads/${encodeURIComponent(filename)}`
           + `?token=${encodeURIComponent(viewToken)}`,
  };
}

/**
 * Swap stored filenames for freshly signed, short-lived URLs on the way out.
 * Anything already absolute is left alone — that is an attachment from the old
 * S3 era, and rewriting it would be a guess.
 */
function withAttachmentUrls(doc) {
  if (!doc) return doc;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  if (!Array.isArray(obj.blocks) || !STORE_BASE_URL) return obj;

  obj.blocks = obj.blocks.map((block) => {
    const name = block && block.fileUrl;
    if (typeof name !== 'string' || !name || /^https?:\/\//i.test(name)) return block;
    try {
      const { token } = signUploadToken(name, 'view');
      return {
        ...block,
        fileUrl: `${STORE_BASE_URL}/uploads/${encodeURIComponent(name)}`
               + `?token=${encodeURIComponent(token)}`,
        fileName: name,
      };
    } catch {
      // One unsignable name must not take the whole report down with it.
      return block;
    }
  });
  return obj;
}

async function createAssessment(data, io) {
  const { residentId, residentName, authorId, authorName, title, blocks, tags } = data;

  const assessment = await new DailyAssessment({
    residentId,
    residentName,
    authorId,
    authorName,
    title: title || 'Daily Assessment Update',
    tags: tags || [],
    blocks: blocks || []
  }).save();

  await AuditLog.create({
    category: 'Reporting',
    event: 'Daily Report Submitted',
    actorName: authorName,
    purpose: `Submitted daily assessment for ${residentName}`,
    status: 'success',
    newValues: {
      assessmentId: assessment._id,
      residentId,
      title: assessment.title,
      tags: assessment.tags
    }
  });

  if (io) io.emit('new_assessment_report', { assessment });

  await assessmentNotificationHelper.notifyGuardiansNewReport({
    residentId,
    residentName,
    authorName,
    assessment,
    io
  });

  return assessment;
}

async function updateAssessment(id, data) {
  const { title, blocks, tags } = data;

const assessment = await DailyAssessment.findByIdAndUpdate(
    id,
    { title, blocks, tags },
    { returnDocument: 'after' }
  );
  
  if (!assessment) {
    const err = new Error('Assessment not found');
    err.status = 404;
    throw err;
  }

  await AuditLog.create({
    category: 'Reporting',
    event: 'Daily Report Edited',
    actorName: 'Care Team',
    purpose: `Updated daily assessment for ${assessment.residentName}`,
    status: 'success',
    newValues: {
      assessmentId: assessment._id,
      title: assessment.title,
      tags: assessment.tags
    }
  });

  return assessment;
}

async function getAssessmentsByResident(residentId) {
  const list = await DailyAssessment.find({ residentId })
    .sort({ createdAt: -1 })
    .lean();
  return list.map(withAttachmentUrls);
}

async function getAssessmentById(id) {
  const assessment = await DailyAssessment.findById(id).lean();
  if (!assessment) {
    const err = new Error('Assessment not found');
    err.status = 404;
    throw err;
  }
  return withAttachmentUrls(assessment);
}

async function addComment(assessmentId, commentData, io) {
  const { senderId, senderName, senderRole, text } = commentData;

  const assessment = await DailyAssessment.findById(assessmentId);
  if (!assessment) {
    const err = new Error('Assessment not found');
    err.status = 404;
    throw err;
  }

  assessment.comments.push({ senderId, senderName, senderRole, text });
  await assessment.save();

  const addedComment = assessment.comments[assessment.comments.length - 1];

  if (io) {
    io.emit('new_assessment_comment', {
      assessmentId: assessment._id,
      comment: addedComment
    });
  }

  if (senderRole !== 'Guardian') {
    await assessmentNotificationHelper.notifyGuardiansNewComment({
      assessment,
      senderName,
      io
    });
  }

  await AuditLog.create({
    category: 'Reporting',
    event: 'Assessment Comment Added',
    actorName: senderName,
    purpose: `Added a comment to assessment for ${assessment.residentName}`,
    status: 'success',
    newValues: {
      assessmentId: assessment._id,
      commentPreview: text.substring(0, 50)
    }
  });

  return assessment;
}

async function updateReactions(id, reactionData, io) {
  const { thumbsUp, heart, acknowledged } = reactionData;

  const assessment = await DailyAssessment.findById(id);
  if (!assessment) {
    const err = new Error('Assessment not found');
    err.status = 404;
    throw err;
  }

  const oldReactions = assessment.reactions.toObject
    ? assessment.reactions.toObject()
    : { ...assessment.reactions };

  if (thumbsUp !== undefined) assessment.reactions.thumbsUp = thumbsUp;
  if (heart !== undefined) assessment.reactions.heart = heart;
  if (acknowledged !== undefined) assessment.reactions.acknowledged = acknowledged;

  await assessment.save();

  if (io) {
    io.emit('new_assessment_reaction', {
      assessmentId: assessment._id,
      reactions: assessment.reactions
    });
  }

  await AuditLog.create({
    category: 'Reporting',
    event: 'Assessment Reaction Updated',
    actorName: 'System User',
    purpose: `Updated reactions on assessment for ${assessment.residentName}`,
    status: 'success',
    oldValues: oldReactions,
    newValues: { thumbsUp, heart, acknowledged }
  });

  return assessment;
}

module.exports = {
  uploadFile,
  createAssessment,
  updateAssessment,
  getAssessmentsByResident,
  getAssessmentById,
  addComment,
  updateReactions
};