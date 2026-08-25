/**
 * fixFacilityHouses.js — correct records holding a house from the wrong facility.
 *
 * WHY THESE RECORDS EXIST
 *
 * Nurse.houseAssigned and Resident.house were enums listing only Grace's six
 * houses, written before Saint Anthony existed and never updated when facility
 * separation landed. Nothing on the write path checks a house against the
 * record's facility either. So a Saint Anthony nurse could be — and was —
 * saved holding 'House of St. Charbel', which is why account management showed
 * "St. Charbel" for a Saint Anthony nurse.
 *
 * The enums now derive from config/facilities.js, so new records can hold the
 * right value. This fixes the ones already stored.
 *
 *   node scripts/fixFacilityHouses.js            # report only, writes NOTHING
 *   node scripts/fixFacilityHouses.js --apply    # actually correct them
 *
 * NOTE the flag is inverted relative to backfillFacility.js, deliberately.
 * That script fills in a field that was missing; this one OVERWRITES a value
 * someone may have chosen. Overwriting real data should never be what happens
 * when you forget a flag.
 *
 * WHAT IT WILL AND WILL NOT DECIDE
 *
 * A record at a single-house facility has exactly one correct answer, so it is
 * corrected automatically. A record at a multi-house facility (Grace's) that
 * holds some other facility's house has SIX possible right answers and this
 * script will not guess — those are listed for a human to resolve. Silently
 * picking one would be inventing a resident's location.
 *
 * Safe to re-run: it only touches records that are still mismatched.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { housesFor, FACILITY_KEYS } = require('../config/facilities');
const { runUnscoped } = require('../models/plugins/facilityScope');

const Nurse    = require('../models/Nurse');
const Resident = require('../models/Resident');

const APPLY = process.argv.includes('--apply');

/** The collections carrying a house, and the field each calls it. */
const TARGETS = [
  { model: Nurse,    field: 'houseAssigned', label: 'Nurse',    idField: 'nurseId'    },
  { model: Resident, field: 'house',         label: 'Resident', idField: 'residentId' },
];

const describe = (doc, idField) => {
  const id = doc[idField] || doc._id;
  const name = [doc.firstName, doc.lastName].filter(Boolean).join(' ') || '(no name)';
  return `${id} ${name}`;
};

const scan = async ({ model, field, label, idField }) => {
  const docs = await runUnscoped(() => model.find({}).lean());

  const fixed = [];
  const ambiguous = [];
  const unknownFacility = [];

  for (const doc of docs) {
    const facility = doc.facility;

    if (!FACILITY_KEYS.includes(facility)) {
      // No facility at all, or one this build does not know. Not this script's
      // job — that is what backfillFacility.js is for. Reported, never guessed.
      unknownFacility.push(doc);
      continue;
    }

    const valid = housesFor(facility);
    if (valid.includes(doc[field])) continue; // already correct

    if (valid.length === 1) {
      fixed.push({ doc, from: doc[field], to: valid[0] });
    } else {
      ambiguous.push({ doc, from: doc[field], choices: valid });
    }
  }

  console.log(`\n${label}: ${docs.length} record(s) scanned`);

  if (!fixed.length && !ambiguous.length && !unknownFacility.length) {
    console.log('  nothing to correct.');
    return { corrected: 0, ambiguous: 0 };
  }

  for (const { doc, from, to } of fixed) {
    console.log(`  ${APPLY ? 'FIX ' : 'WOULD FIX'}  ${describe(doc, idField)}`);
    console.log(`            ${doc.facility}: "${from}" -> "${to}"`);
  }

  for (const { doc, from, choices } of ambiguous) {
    console.log(`  MANUAL     ${describe(doc, idField)}`);
    console.log(`            ${doc.facility} holds "${from}", which belongs to another facility.`);
    console.log(`            ${choices.length} houses are valid here — pick one in the app: ${choices.join(', ')}`);
  }

  for (const doc of unknownFacility) {
    console.log(`  SKIPPED    ${describe(doc, idField)} — facility is ${JSON.stringify(doc.facility)}.`);
    console.log(`            Run scripts/backfillFacility.js first.`);
  }

  if (APPLY && fixed.length) {
    for (const { doc, to } of fixed) {
      // Raw driver write on purpose: a full save() would re-run every validator
      // on documents that may have OTHER pre-existing problems, and one
      // unrelated invalid field would block a correction that is itself fine.
      // The value written is taken from config/facilities.js, so it is valid by
      // construction.
      await runUnscoped(() =>
        model.collection.updateOne({ _id: doc._id }, { $set: { [field]: to } })
      );
    }
    console.log(`  applied ${fixed.length} correction(s).`);
  }

  return { corrected: fixed.length, ambiguous: ambiguous.length };
};

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('[fixFacilityHouses] MONGO_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(APPLY
    ? '[fixFacilityHouses] APPLY mode — records WILL be modified.'
    : '[fixFacilityHouses] DRY RUN — nothing will be written. Re-run with --apply to commit.');

  let corrected = 0;
  let ambiguous = 0;
  for (const target of TARGETS) {
    const result = await scan(target);
    corrected += result.corrected;
    ambiguous += result.ambiguous;
  }

  console.log(`\n${APPLY ? 'Corrected' : 'Would correct'}: ${corrected}`);
  console.log(`Needing a human decision: ${ambiguous}`);
  if (!APPLY && corrected) console.log('\nRe-run with --apply to write these changes.');

  await mongoose.connection.close();
};

run().catch(async (err) => {
  console.error('[fixFacilityHouses] failed:', err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
