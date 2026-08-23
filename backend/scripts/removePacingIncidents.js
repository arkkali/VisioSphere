/**
 * removePacingIncidents.js — one-time cleanup after Module F (Pacing) was
 * removed from the AI core.
 *
 * The pacing detector counted a direction reversal from three consecutive
 * bounding-box centroids. That test is scale-blind, so a stationary person
 * whose box rattled between two points produced a 180-degree turn on every
 * frame and alerted as pacing. The module was deleted rather than retuned,
 * and this removes the records it produced.
 *
 *   node scripts/removePacingIncidents.js              # DRY RUN — counts only
 *   node scripts/removePacingIncidents.js --export     # dry run + write backup
 *   node scripts/removePacingIncidents.js --confirm    # export, then DELETE
 *
 * DELETION IS PERMANENT. There is no undo. The --confirm run always writes the
 * backup file first and refuses to proceed if that write fails, so you are
 * never left with neither the records nor a copy of them.
 *
 * Cross-tenant by design: incidents carry a `facility` and the scoping plugin
 * hides other tenants' rows from an unscoped query. runUnscoped() is required
 * or this would silently clean only one facility. See models/plugins/facilityScope.js.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { runUnscoped } = require('../models/plugins/facilityScope');
const Incident = require('../models/Incident');

// 'Pacing' has already been removed from the incidentType enum in
// models/Incident.js. That does NOT affect this script: Mongoose enums are
// write-time validators only, so a find/delete on the old value still matches.
const TARGET_TYPE = 'Pacing';

const CONFIRM = process.argv.includes('--confirm');
const EXPORT = CONFIRM || process.argv.includes('--export');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP = path.join(__dirname, `pacing-incidents-backup-${stamp}.json`);

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGO_URI / MONGODB_URI in backend/.env — aborting.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`Connected to ${mongoose.connection.name}\n`);

  try {
    const docs = await runUnscoped(() =>
      Incident.find({ incidentType: TARGET_TYPE }).lean()
    );

    if (docs.length === 0) {
      console.log('No Pacing incidents found. Nothing to do.');
      return;
    }

    // Break the count down so you can see what you are about to lose before
    // you lose it — by facility, and by month.
    const byFacility = {};
    const byMonth = {};
    let oldest = null;
    let newest = null;
    for (const d of docs) {
      byFacility[d.facility || '(none)'] = (byFacility[d.facility || '(none)'] || 0) + 1;
      const m = new Date(d.createdAt).toISOString().slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + 1;
      if (!oldest || d.createdAt < oldest) oldest = d.createdAt;
      if (!newest || d.createdAt > newest) newest = d.createdAt;
    }

    console.log(`Found ${docs.length} Pacing incident(s)`);
    console.log(`  date range : ${new Date(oldest).toISOString()} → ${new Date(newest).toISOString()}`);
    console.log('  by facility:');
    for (const [k, v] of Object.entries(byFacility).sort()) console.log(`    ${k.padEnd(20)} ${v}`);
    console.log('  by month   :');
    for (const [k, v] of Object.entries(byMonth).sort()) console.log(`    ${k.padEnd(20)} ${v}`);
    console.log();

    // Clips are stored in S3 under their own keys and are NOT touched here.
    // Deleting the incident row orphans any clip it pointed at; listed so you
    // can remove them from the bucket separately if you want those gone too.
    const clips = docs.map((d) => d.clipPath).filter(Boolean);
    if (clips.length) {
      console.log(`${clips.length} of these reference a saved clip. This script does NOT`);
      console.log('delete from S3 — remove these keys yourself if you want them gone:');
      for (const c of clips) console.log(`    ${c}`);
      console.log();
    }

    if (EXPORT) {
      fs.writeFileSync(BACKUP, JSON.stringify(docs, null, 2), 'utf8');
      console.log(`Backup written: ${BACKUP}`);
      const check = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
      if (check.length !== docs.length) throw new Error('backup verification failed');
      console.log(`Backup verified: ${check.length} record(s) readable.\n`);
    }

    if (!CONFIRM) {
      console.log('DRY RUN — nothing deleted.');
      console.log('Re-run with --confirm to delete permanently.');
      return;
    }

    const res = await runUnscoped(() =>
      Incident.deleteMany({ incidentType: TARGET_TYPE })
    );
    console.log(`DELETED ${res.deletedCount} incident(s).`);

    const left = await runUnscoped(() =>
      Incident.countDocuments({ incidentType: TARGET_TYPE })
    );
    console.log(left === 0
      ? 'Verified: no Pacing incidents remain.'
      : `WARNING: ${left} still present — re-run to investigate.`);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
