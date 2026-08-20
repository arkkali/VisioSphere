/**
 * backfillFacility.js — one-time migration for tenant separation.
 *
 * Every document written before facility separation has no `facility` field.
 * The scoping plugin marks that field required, so those rows would become
 * invisible (they match no facility) and any save() on them would fail
 * validation. This assigns them all to Graces, which is where the existing
 * data came from.
 *
 *   node scripts/backfillFacility.js --dry-run   # report only, write nothing
 *   node scripts/backfillFacility.js             # apply
 *
 * Safe to re-run: it only touches documents where `facility` is missing.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { DEFAULT_FACILITY, FACILITY_KEYS } = require('../config/facilities');
const { runUnscoped } = require('../models/plugins/facilityScope');

const Admin           = require('../models/Admin');
const AuditLog        = require('../models/AuditLog');
const DailyAssessment = require('../models/DailyAssessment');
const DailyReport     = require('../models/DailyReport');
const Guardian        = require('../models/Guardian');
const Incident        = require('../models/Incident');
const Notification    = require('../models/Notification');
const Nurse           = require('../models/Nurse');
const Resident        = require('../models/Resident');
const SystemSettings  = require('../models/SystemSettings');

const MODELS = [Admin, AuditLog, DailyAssessment, DailyReport, Guardian,
                Incident, Notification, Nurse, Resident, SystemSettings];

const DRYRUN = process.argv.includes('--dry-run');
const TARGET = process.env.BACKFILL_FACILITY || DEFAULT_FACILITY;

/**
 * DailyReport.reportDate used to be globally unique. With two facilities that
 * index makes the second facility's report overwrite the first's, so the model
 * now declares a compound { facility, reportDate } unique index instead. Mongo
 * will not replace the old index by itself — it must be dropped explicitly.
 */
const dropLegacyReportIndex = async () => {
  const coll = DailyReport.collection;
  let indexes;
  try {
    indexes = await coll.indexes();
  } catch {
    return { dropped: false, reason: 'collection does not exist yet' };
  }

  const legacy = indexes.find(
    (i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ reportDate: 1 })
  );
  if (!legacy) return { dropped: false, reason: 'no legacy unique index on reportDate' };
  if (DRYRUN)  return { dropped: false, reason: `would drop index "${legacy.name}"` };

  await coll.dropIndex(legacy.name);
  return { dropped: true, reason: `dropped index "${legacy.name}"` };
};

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error('[backfill] MONGO_URI is not set. Add it to backend/.env.');
    process.exit(1);
  }
  if (!FACILITY_KEYS.includes(TARGET)) {
    console.error(`[backfill] BACKFILL_FACILITY="${TARGET}" is not one of: ${FACILITY_KEYS.join(', ')}`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[backfill] Connected. Assigning facility="${TARGET}" to documents that have none.`);
  if (DRYRUN) console.log('[backfill] DRY RUN — nothing will be written.\n');

  // Unscoped by necessity: these documents have no facility yet, so a scoped
  // query would match none of them. This is the one place that must see
  // across tenants.
  const rows = await runUnscoped(async () => {
    const out = [];
    for (const Model of MODELS) {
      const filter = { facility: { $exists: false } };
      const missing = await Model.countDocuments(filter);
      let updated = 0;
      if (missing && !DRYRUN) {
        const res = await Model.updateMany(filter, { $set: { facility: TARGET } });
        updated = res.modifiedCount ?? res.nModified ?? 0;
      }
      const total = await Model.countDocuments({});
      out.push({ model: Model.modelName, total, missing, updated });
    }
    return out;
  });

  console.log('MODEL                 TOTAL   NO FACILITY   ' + (DRYRUN ? 'WOULD SET' : 'UPDATED'));
  console.log('─'.repeat(62));
  rows.forEach((r) => {
    console.log(
      `${r.model.padEnd(20)} ${String(r.total).padStart(6)} ${String(r.missing).padStart(13)}   ` +
      `${String(DRYRUN ? r.missing : r.updated).padStart(9)}`
    );
  });
  console.log('─'.repeat(62));

  const idx = await dropLegacyReportIndex();
  console.log(`\n[backfill] DailyReport index: ${idx.reason}`);

  const totalMissing = rows.reduce((a, r) => a + r.missing, 0);
  console.log(
    DRYRUN
      ? `\n[backfill] ${totalMissing} document(s) would be assigned to ${TARGET}. Re-run without --dry-run to apply.`
      : `\n[backfill] Done. ${rows.reduce((a, r) => a + r.updated, 0)} document(s) assigned to ${TARGET}.`
  );

  await mongoose.connection.close();
  process.exit(0);
};

main().catch(async (err) => {
  console.error('[backfill] Fatal error:', err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
