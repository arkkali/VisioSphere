/**
 * listReferencedClips.js — READ ONLY. Writes nothing, deletes nothing.
 *
 * Prints, one per line, the basename of every file in CLIP_DIR that is still
 * referenced by an Incident — both the .mp4 and its .jpg poster.
 *
 *   node scripts/listReferencedClips.js > keep.txt
 *
 * WHY THIS EXISTS
 * Files accumulate in CLIP_DIR that nothing points at any more: clips recorded
 * before delete-propagation existed, incidents removed directly from the DB,
 * recordings whose incident never got written. The only way to tell an orphan
 * from a live recording is to ask the database, because the mini PC has no
 * knowledge of incidents at all.
 *
 * DO NOT substitute "what the Video Clips page shows" for this list. That grid
 * filters to the last 7 days and hides dismissed incidents (see
 * inspectClips.js), so most referenced clips are NOT on screen at any moment.
 * Deleting everything absent from the page would destroy live evidence.
 *
 * Deliberately UNSCOPED and unfiltered: every facility, every age, dismissed
 * included. This list is a safety floor — err towards keeping a file.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { runUnscoped } = require('../models/plugins/facilityScope');
const Incident = require('../models/Incident');
// Reuse the backend's own resolver so the three historical clipPath shapes
// (ai_core-relative, S3 URL, absolute path) all reduce correctly. Duplicating
// that logic here is how the list would silently miss files.
const { clipFilename } = require('../services/videoService');

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGO_URI / MONGODB_URI in backend/.env — aborting.');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const docs = await runUnscoped(() =>
    Incident.find({ clipPath: { $nin: [null, ''] } }).select('clipPath').lean()
  );

  const keep = new Set();
  let unusable = 0;
  for (const d of docs) {
    const mp4 = clipFilename(d.clipPath);
    if (!mp4) { unusable++; continue; }
    keep.add(mp4);
    keep.add(mp4.replace(/\.mp4$/i, '.jpg'));
  }

  // Filenames to stdout, diagnostics to stderr, so `> keep.txt` stays clean.
  for (const name of [...keep].sort()) console.log(name);

  console.error(
    `\n[summary] ${docs.length} incidents carry a clipPath` +
    ` -> ${keep.size} filenames to keep (mp4 + poster).` +
    (unusable ? ` ${unusable} clipPath values were unusable and SKIPPED.` : '')
  );
  if (unusable) {
    console.error('[warn] Unusable clipPath values mean some referenced files are');
    console.error('[warn] missing from this list. Investigate before deleting anything.');
  }

  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
