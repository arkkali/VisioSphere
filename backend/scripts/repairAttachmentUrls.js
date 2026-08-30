/**
 * repairAttachmentUrls.js — one-time repair for report attachments whose
 * `fileUrl` holds a signed URL instead of the stored filename.
 *
 * THE DAMAGE THIS UNDOES
 * ----------------------
 * services/assessmentService.js stores the BARE FILENAME in the database and
 * mints a fresh, short-lived signed URL on every read (withAttachmentUrls).
 * Clients that saved the signed URL back on edit — the mobile app until the
 * previewUrl fix, and the web app before DailyAssessments.jsx started sending
 * `fileName || fileUrl` — wrote a link with an expired token into the record.
 * withAttachmentUrls deliberately leaves anything absolute alone (it cannot
 * know whether an absolute URL is an S3 leftover), so those blocks are never
 * re-signed and the image renders as broken for ever.
 *
 * THE BYTES ARE NOT LOST. The file is still on the mini PC under the name
 * embedded in that URL. Stripping the origin and the ?token= query restores
 * exactly the value that should have been stored, and the next read signs it
 * again like any other attachment.
 *
 * WHAT IT WILL NOT TOUCH
 *   - blocks whose fileUrl is already a bare name (nothing to do)
 *   - absolute URLs that are not /uploads/ paths — S3-era attachments, which
 *     the backend passes through on purpose
 *   - blocks with a null/empty fileUrl: no upload ever reached storage, so
 *     there is nothing to point at. These are listed at the end as a
 *     re-attachment worklist; only a person can fix them.
 *
 * DRY RUN IS THE DEFAULT, unlike backfillFacility.js. That script only fills
 * in a missing field; this one REWRITES values in a resident's medical record,
 * so writing has to be asked for explicitly.
 *
 *   node scripts/repairAttachmentUrls.js            # report only, writes nothing
 *   node scripts/repairAttachmentUrls.js --verify   # also ask the mini PC whether each file is still there
 *   node scripts/repairAttachmentUrls.js --apply    # perform the repair
 *
 * Run --verify first. A name the mini PC does not have is a repair that would
 * leave the block just as broken, and you want to know that before writing.
 *
 * Safe to re-run: a repaired block is a bare name and is skipped next time.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { runUnscoped } = require('../models/plugins/facilityScope');
const { signUploadToken, isSafeClipFilename } = require('../utils/clipToken');
const DailyAssessment = require('../models/DailyAssessment');

const APPLY  = process.argv.includes('--apply');
const VERIFY = process.argv.includes('--verify');
const STORE_BASE_URL = (process.env.CLIP_BASE_URL || '').replace(/\/+$/, '');

const tag = '[repair]';

/**
 * Decide what a single block's fileUrl is.
 *   { kind: 'bare' | 'repairable' | 'foreign' | 'unsafe', name? , host? }
 */
function classify(value) {
  if (typeof value !== 'string' || !value.trim()) return { kind: 'empty' };
  if (!/^https?:\/\//i.test(value)) return { kind: 'bare' };

  let url;
  try {
    url = new URL(value);
  } catch {
    return { kind: 'foreign', host: '(unparseable)' };
  }

  // Only /uploads/<name> is ours. An S3 object key is not served from this
  // path, and if one somehow were, --verify catches it before any write.
  const m = url.pathname.match(/^\/uploads\/([^/]+)$/);
  if (!m) return { kind: 'foreign', host: url.host };

  let name;
  try {
    name = decodeURIComponent(m[1]);
  } catch {
    return { kind: 'unsafe', host: url.host };
  }

  // Same guard the signer and the mini PC apply. A name that fails this could
  // never have been stored by uploadFile, so treat it as suspect, not as data.
  if (!isSafeClipFilename(name)) return { kind: 'unsafe', host: url.host };

  return { kind: 'repairable', name, host: url.host };
}

/** Ask the mini PC whether it still holds `name`. */
async function storageHas(name) {
  if (!STORE_BASE_URL) return { ok: false, why: 'CLIP_BASE_URL is not set' };
  const { token } = signUploadToken(name, 'view');
  const url = `${STORE_BASE_URL}/uploads/${encodeURIComponent(name)}`
            + `?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return { ok: res.ok, why: res.ok ? 'present' : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, why: err.message };
  }
}

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error(`${tag} MONGO_URI is not set. Add it to backend/.env.`);
    process.exit(1);
  }
  if (VERIFY && !STORE_BASE_URL) {
    console.error(`${tag} --verify needs CLIP_BASE_URL (the mini PC origin).`);
    process.exit(1);
  }
  if (VERIFY && !process.env.CLIP_SIGNING_SECRET) {
    console.error(`${tag} --verify needs CLIP_SIGNING_SECRET, and it must match the mini PC's.`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`${tag} Connected.`);
  console.log(`${tag} Storage origin: ${STORE_BASE_URL || '(unset)'}`);
  console.log(APPLY ? `${tag} APPLY — repairs will be written.\n`
                    : `${tag} DRY RUN — nothing will be written. Add --apply to write.\n`);

  const counts = { bare: 0, repairable: 0, foreign: 0, unsafe: 0, empty: 0 };
  const foreignHosts = new Map();
  const repairs = [];   // { id, blockIndex, from, name }
  const orphans = [];   // image/file blocks with no fileUrl at all
  // Blocks already stored correctly. Nothing to repair, but these are the ones
  // people are actually looking at, so --verify checks them too: a correctly
  // stored name that storage cannot serve looks identical to a broken record
  // from the app, and only this tells the two apart.
  const healthy = [];   // { id, name, date, resident }

  await runUnscoped(async () => {
    const docs = await DailyAssessment
      .find({ 'blocks.type': { $in: ['image', 'file'] } })
      .select('_id date title residentName authorName blocks facility')
      .lean();

    console.log(`${tag} ${docs.length} report(s) contain an image or file block.\n`);

    for (const doc of docs) {
      (doc.blocks || []).forEach((block, i) => {
        if (!block || (block.type !== 'image' && block.type !== 'file')) return;

        const c = classify(block.fileUrl);
        counts[c.kind] = (counts[c.kind] || 0) + 1;

        if (c.kind === 'foreign' || c.kind === 'unsafe') {
          foreignHosts.set(c.host, (foreignHosts.get(c.host) || 0) + 1);
        }
        if (c.kind === 'repairable') {
          // Targeted by the block's own _id, not its array index: a report
          // edited between this read and the write would shift the indexes and
          // the repair would land on the wrong block.
          repairs.push({ id: doc._id, blockId: block._id, blockIndex: i, from: block.fileUrl, name: c.name });
        }
        if (c.kind === 'bare') {
          healthy.push({
            id: doc._id,
            name: block.fileUrl.trim(),
            date: doc.date ? new Date(doc.date).toISOString().slice(0, 10) : '?',
            resident: doc.residentName,
          });
        }
        if (c.kind === 'empty') {
          orphans.push({
            id: doc._id,
            date: doc.date ? new Date(doc.date).toISOString().slice(0, 10) : '?',
            resident: doc.residentName,
            author: doc.authorName,
            title: doc.title,
            blockIndex: i,
            type: block.type,
          });
        }
      });
    }

    // ---- optional storage check, before anything is written ---------------
    let missing = [];
    let unservable = [];
    if (VERIFY) {
      const all = repairs.length + healthy.length;
      console.log(`${tag} Checking ${all} file(s) against the mini PC...`);

      for (const r of repairs) {
        const res = await storageHas(r.name);
        r.present = res.ok;
        r.why = res.why;
        if (!res.ok) missing.push(r);
      }
      // The already-correct blocks. If these fail, nothing is wrong with the
      // database — the storage path itself is down, and no repair helps.
      for (const h of healthy) {
        const res = await storageHas(h.name);
        h.present = res.ok;
        h.why = res.why;
        if (!res.ok) unservable.push(h);
      }
      console.log(`${tag} stored correctly : ${healthy.length - unservable.length} served, ${unservable.length} NOT served`);
      if (repairs.length) {
        console.log(`${tag} needing repair   : ${repairs.length - missing.length} present, ${missing.length} missing`);
      }
      console.log('');
    }

    // ---- write ------------------------------------------------------------
    let written = 0;
    if (APPLY) {
      // With --verify, only repair blocks whose bytes are actually there.
      // Without it, repair everything that parses — the value is still strictly
      // better than an expired URL, because a bare name gets re-signed on read.
      const todo = VERIFY ? repairs.filter((r) => r.present) : repairs;
      for (const r of todo) {
        const res = r.blockId
          ? await DailyAssessment.updateOne(
              { _id: r.id, 'blocks._id': r.blockId },
              { $set: { 'blocks.$.fileUrl': r.name } })
          // Very old rows predate subdocument _ids; fall back to the index.
          : await DailyAssessment.updateOne(
              { _id: r.id },
              { $set: { [`blocks.${r.blockIndex}.fileUrl`]: r.name } });
        if ((res.modifiedCount ?? res.nModified ?? 0) > 0) written += 1;
      }
    }

    // ---- report -----------------------------------------------------------
    console.log('ATTACHMENT BLOCKS');
    console.log('─'.repeat(64));
    console.log(`  already correct (bare filename) : ${counts.bare}`);
    console.log(`  repairable (signed URL stored)  : ${counts.repairable}`);
    console.log(`  left alone (other origin/path)  : ${counts.foreign}`);
    console.log(`  suspect name, skipped           : ${counts.unsafe}`);
    console.log(`  no file at all (needs re-upload): ${counts.empty}`);
    console.log('─'.repeat(64));

    if (foreignHosts.size) {
      console.log('\nUntouched absolute URLs, by host:');
      for (const [host, n] of foreignHosts) console.log(`  ${host.padEnd(44)} ${n}`);
      console.log('  (S3-era attachments belong here. Anything unexpected is worth a look.)');
    }

    if (VERIFY && unservable.length) {
      console.log(`\n${unservable.length} correctly-stored attachment(s) that storage will NOT serve:`);
      unservable.slice(0, 20).forEach((h) => console.log(`  ${h.date}  ${h.name}  (${h.why})`));
      if (unservable.length > 20) console.log(`  ...and ${unservable.length - 20} more`);
      console.log('\nThese records are correct. The failure is between the backend and the');
      console.log('mini PC — check that CLIP_SIGNING_SECRET matches on both sides and that');
      console.log('the mini PC is running a cctv_core.py that has the /uploads routes.');
    }

    if (VERIFY && healthy.length && !unservable.length) {
      console.log(`\nAll ${healthy.length} correctly-stored attachment(s) were served by the mini PC.`);
      console.log('Storage is healthy: an image that still will not display is a client-side problem.');
    }

    if (VERIFY && missing.length) {
      console.log(`\n${missing.length} name(s) the mini PC does not have — repairing these would not help:`);
      missing.slice(0, 20).forEach((r) => console.log(`  ${r.name}  (${r.why})`));
      if (missing.length > 20) console.log(`  ...and ${missing.length - 20} more`);
    }

    if (orphans.length) {
      console.log(`\nRE-ATTACHMENT WORKLIST — ${orphans.length} block(s) never received a file.`);
      console.log('No script can recover these; someone has to attach the image again.\n');
      console.log('DATE        RESIDENT              AUTHOR                REPORT');
      console.log('─'.repeat(90));
      orphans.forEach((o) => {
        console.log(
          `${o.date}  ${String(o.resident || '?').slice(0, 20).padEnd(20)}  ` +
          `${String(o.author || '?').slice(0, 20).padEnd(20)}  ${String(o.title || '?').slice(0, 30)}`
        );
      });
    }

    console.log(
      APPLY
        ? `\n${tag} Done. ${written} block(s) repaired.`
        : `\n${tag} ${VERIFY ? repairs.filter((r) => r.present).length : repairs.length} block(s) would be repaired. Re-run with --apply to write.`
    );
  });

  await mongoose.connection.close();
  process.exit(0);
};

main().catch(async (err) => {
  console.error(`${tag} Fatal error:`, err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
