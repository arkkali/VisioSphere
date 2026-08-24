/**
 * inspectClips.js — READ ONLY. Answers "why is the Video Clips page empty?"
 *
 * Writes nothing, deletes nothing. Safe to run against production.
 *
 *   node scripts/inspectClips.js
 *   node scripts/inspectClips.js --facility=SAINT_ANTHONY
 *
 * The Video Clips grid shows an incident only when ALL of these hold:
 *   1. source === 'cctv'
 *   2. createdAt within the last 7 days
 *   3. dismissed !== true
 *   4. facility === the signed-in user's facility   (enforced by facilityScope)
 *   5. clipPath is set                              (filtered client-side)
 *
 * An empty grid means one of those five is failing, and from the outside they
 * all look identical: a 200 response with an empty list. This prints each stage
 * separately so the one that drops to zero is obvious.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { runUnscoped } = require('../models/plugins/facilityScope');
const Incident = require('../models/Incident');

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
};
const WANT_FACILITY = arg('facility');
const SINCE = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

const tally = (docs, key) => {
  const out = {};
  for (const d of docs) {
    const k = typeof key === 'function' ? key(d) : (d[key] ?? '(unset)');
    out[k] = (out[k] || 0) + 1;
  }
  return out;
};
const show = (obj) => {
  const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return console.log('      (none)');
  for (const [k, v] of rows) console.log(`      ${String(k).padEnd(28)} ${v}`);
};

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGO_URI / MONGODB_URI in backend/.env — aborting.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`Connected to ${mongoose.connection.name}\n`);

  try {
    // runUnscoped: without it the plugin would scope this to one tenant and the
    // whole point is to see across both.
    const all = await runUnscoped(() => Incident.find({}).lean());
    console.log(`TOTAL incidents in collection: ${all.length}`);
    if (!all.length) {
      console.log('\nThe collection is EMPTY. The clips page cannot show anything.');
      return;
    }

    console.log('\n  by facility:');   show(tally(all, 'facility'));
    console.log('\n  by source:');     show(tally(all, 'source'));
    console.log('\n  by location (the ai_core cam id):'); show(tally(all, 'location'));
    console.log('\n  dismissed:');     show(tally(all, (d) => (d.dismissed ? 'dismissed' : 'not dismissed')));
    console.log('\n  clipPath:');      show(tally(all, (d) => (d.clipPath ? 'has clipPath' : 'NO clipPath')));

    const newest = all.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    const oldest = all.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
    console.log(`\n  date range: ${new Date(oldest.createdAt).toISOString()}`);
    console.log(`           -> ${new Date(newest.createdAt).toISOString()}`);
    console.log(`  7-day cutoff is ${SINCE.toISOString()}`);

    // ---- Stage-by-stage funnel, mirroring the real query ------------------
    console.log('\n──────── FUNNEL (each line is the previous line, further filtered) ────────');
    let step = all;
    console.log(`  all incidents                     ${step.length}`);
    step = step.filter((d) => d.source === 'cctv');
    console.log(`  + source === 'cctv'               ${step.length}`);
    step = step.filter((d) => new Date(d.createdAt) >= SINCE);
    console.log(`  + within last 7 days              ${step.length}`);
    step = step.filter((d) => d.dismissed !== true);
    console.log(`  + not dismissed                   ${step.length}`);

    const facilities = WANT_FACILITY
      ? [WANT_FACILITY]
      : [...new Set(all.map((d) => d.facility).filter(Boolean))];

    for (const fac of facilities) {
      const scoped = step.filter((d) => d.facility === fac);
      const withClip = scoped.filter((d) => d.clipPath);
      console.log(`  + facility === ${String(fac).padEnd(18)} ${scoped.length}`);
      console.log(`  + has clipPath  ${''.padEnd(17)} ${withClip.length}   <-- what ${fac} sees on the page`);
    }

    // ---- The most recent CCTV rows, in full -------------------------------
    console.log('\n──────── 10 most recent cctv incidents ────────');
    const recent = all
      .filter((d) => d.source === 'cctv')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);
    for (const d of recent) {
      console.log(
        `  ${new Date(d.createdAt).toISOString()}  ${String(d.facility || '(none)').padEnd(14)}` +
        ` ${String(d.location || '(none)').padEnd(16)} ${String(d.incidentType).padEnd(20)}` +
        ` dismissed=${d.dismissed === true}  clip=${d.clipPath || '(none)'}`
      );
    }

    console.log('\nHOW TO READ THIS: find the first funnel line that drops to 0.');
    console.log('  drops at "within last 7 days"  -> the records are older than the window');
    console.log('  drops at "not dismissed"       -> something dismissed them');
    console.log('  drops at "facility === ..."    -> the incidents are tagged to the OTHER');
    console.log('                                    facility than the account viewing them;');
    console.log('                                    compare the `location` values above with');
    console.log('                                    CAMERA_FACILITY in config/facilities.js');
    console.log('  drops at "has clipPath"        -> the clip reference was cleared');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
