/**
 * seedAdmin.js — provisions the hardcoded Facility Admin accounts.
 *
 * VisioSphere has no admin sign-up: admin accounts are created here and only
 * here. Each seeded account is ready for the two-step login in the UI —
 * customId + password on the System Login screen, then the 6-digit PIN on the
 * Security Check screen.
 *
 *   node seedAdmin.js              # create missing admins, leave existing alone
 *   node seedAdmin.js --force      # also overwrite password/PIN on existing admins
 *   node seedAdmin.js --dry-run    # show what would happen, write nothing
 *
 * Secrets: the defaults below are placeholders. Override per account with env
 * vars (see SEED_ADMIN_*_PASSWORD / _PIN keys) so real credentials never sit in
 * git. Change every default before this touches a production database.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');
const Admin = require('./models/Admin');
const AuditLog = require('./models/AuditLog');
const { FACILITIES, FACILITY_KEYS, isFacility } = require('./config/facilities');
const { runWithFacility, runUnscoped } = require('./models/plugins/facilityScope');

/* ───────────────────────────────────────────────────────────────────────────
   THE ACCOUNTS. Edit this array to add or change admins.

   customId  optional. Omit it and the next A-<year>NN is generated via
             Admin.generateCustomId(). Set it explicitly when you need a
             stable, known ID (e.g. A-202601 for the primary admin).
   pin       exactly 6 digits, matching the Security Check screen. Set to null
             to disable 2FA for that account (login then goes straight through).
   facility  REQUIRED. Which care facility this admin belongs to. This is the
             ONLY thing that isolates their data — NOT the customId prefix.
             One of: GRACES, SAINT_ANTHONY (see config/facilities.js).
   ─────────────────────────────────────────────────────────────────────────── */
const ADMINS = [
  {
    customId: 'STA-202601',
    facility: 'SAINT_ANTHONY',
    name:     'Riza Chico',
    email:    'riza@gmail.com',
    password: process.env.SEED_ADMIN_1_PASSWORD || 'riza12345',
    pin:      process.env.SEED_ADMIN_1_PIN      || '123456',
  },
  {
    customId: 'A-202602',
    facility: 'GRACES',
    name:     'Facility Supervisor',
    email:    'admin@gmail.com',
    password: process.env.SEED_ADMIN_2_PASSWORD || 'admintwo123',
    pin:      process.env.SEED_ADMIN_2_PIN      || '654321',
  },
];

/* Shape an explicit customId must match: 1-4 capital letters, hyphen, 6 digits.
 * Passes: A-202601, STA-202601, ADM-202612
 *
 * Deliberately broader than the app's own scheme. Admin.generateCustomId()
 * only ever mints `A-<year><NN>` for Facility Admins, so a different prefix
 * here (STA-, etc.) applies to seeded accounts ONLY — admins created later via
 * POST /api/admin/register still come out as A-<year><NN>, leaving two schemes
 * in one collection. Patch Admin.generateCustomId() too if you want one prefix
 * everywhere.
 */
const ADMIN_ID_PATTERN = /^[A-Z]{1,4}-\d{6}$/;

/* ── flags ───────────────────────────────────────────────────────────────── */
const argv   = process.argv.slice(2);
const FORCE  = argv.includes('--force');
const DRYRUN = argv.includes('--dry-run');

/* ── validation ──────────────────────────────────────────────────────────── */
const validate = (list) => {
  const errors = [];
  const seenEmail = new Set();
  const seenId = new Set();

  list.forEach((a, i) => {
    const at = `ADMINS[${i}]${a.name ? ` (${a.name})` : ''}`;

    if (!a.name?.trim())  errors.push(`${at}: name is required`);
    if (!a.email?.trim()) errors.push(`${at}: email is required`);
    else {
      const email = a.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`${at}: "${a.email}" is not a valid email`);
      if (seenEmail.has(email)) errors.push(`${at}: duplicate email "${email}" in this file`);
      seenEmail.add(email);
    }

    // Matches the 6-char minimum enforced by adminAuthService.resetPassword.
    if (!a.password || a.password.length < 6) errors.push(`${at}: password must be at least 6 characters`);

    if (a.pin !== null && a.pin !== undefined && !/^\d{6}$/.test(a.pin)) {
      errors.push(`${at}: pin must be exactly 6 digits (or null to disable 2FA)`);
    }

    if (!isFacility(a.facility)) {
      errors.push(`${at}: facility must be one of ${FACILITY_KEYS.join(' | ')} (got ${JSON.stringify(a.facility)})`);
    }

    if (a.customId) {
      if (!ADMIN_ID_PATTERN.test(a.customId)) {
        errors.push(`${at}: customId "${a.customId}" must be 1-4 capital letters, a hyphen, then 6 digits (e.g. A-202601 or STA-202601)`);
      }
      if (seenId.has(a.customId)) errors.push(`${at}: duplicate customId "${a.customId}" in this file`);
      seenId.add(a.customId);
    }
  });

  return errors;
};

/* ── seeding ─────────────────────────────────────────────────────────────── */
const seedOne = async (spec) => {
  const email = spec.email.trim().toLowerCase();

  // Deliberately unscoped: Admin.email and Admin.customId are globally unique,
  // so a clash with the OTHER facility's admin must still be detected here
  // rather than surfacing as a duplicate-key error at insert time.
  const existing = await runUnscoped(() => Admin.findOne({
    $or: [{ email }, ...(spec.customId ? [{ customId: spec.customId }] : [])],
  }));

  if (existing && existing.facility && existing.facility !== spec.facility) {
    return {
      action: 'failed', customId: existing.customId, email,
      note: `already exists under facility ${existing.facility}, but this entry says ${spec.facility} — resolve manually`,
    };
  }

  if (existing && !FORCE) {
    return { action: 'skipped', customId: existing.customId, email, note: 'already exists — use --force to overwrite' };
  }

  const hashedPassword = await bcryptjs.hash(spec.password, 10);
  const has2FA = !!spec.pin;

  const fields = {
    name:         spec.name.trim(),
    email,
    facility:     spec.facility,
    password:     hashedPassword,
    role:         'Facility Admin',
    status:       'ACTIVE',

    // MUST be false. adminAuthService.login returns a tempToken and skips the
    // bcrypt check entirely when isFirstLogin is true — seeding it as true
    // would make these accounts reachable with the customId alone.
    isFirstLogin: false,

    // Drives the Security Check screen. verify2FA compares the PIN as a plain
    // string, so it is stored unhashed here to stay compatible with that code.
    is2FAEnabled: has2FA,
    twoFaPin:     has2FA ? spec.pin : null,

    otpCode:      null,
    otpExpiry:    null,
  };

  if (DRYRUN) {
    return {
      action:   existing ? 'would update' : 'would create',
      customId: existing?.customId || spec.customId || '(generated)',
      email,
    };
  }

  return runWithFacility(spec.facility, async () => {
    if (existing) {
      Object.assign(existing, fields);
      await existing.save();
      return { action: 'updated', customId: existing.customId, email };
    }

    const customId = spec.customId || (await Admin.generateCustomId('Facility Admin'));
    const created = await Admin.create({ ...fields, customId });
    return { action: 'created', customId: created.customId, email };
  });
};

/* ── main ────────────────────────────────────────────────────────────────── */
const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error('[seed] MONGO_URI is not set. Add it to backend/.env before running.');
    process.exit(1);
  }

  const errors = validate(ADMINS);
  if (errors.length) {
    console.error('[seed] Fix these problems in the ADMINS array first:\n');
    errors.forEach((e) => console.error(`  ✗ ${e}`));
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[seed] Connected to MongoDB${DRYRUN ? '  (DRY RUN — nothing will be written)' : ''}`);
  if (FORCE && !DRYRUN) console.log('[seed] --force: existing admins will have their password and PIN overwritten.');

  const results = [];
  for (const spec of ADMINS) {
    try {
      results.push({ ...(await seedOne(spec)), spec });
    } catch (err) {
      results.push({ action: 'failed', customId: spec.customId || '—', email: spec.email, note: err.message, spec });
    }
  }

  const wrote = results.filter((r) => r.action === 'created' || r.action === 'updated');

  for (const r of (DRYRUN ? [] : wrote)) {
    await runWithFacility(r.spec.facility, () => AuditLog.create({
      category:  'Account Management',
      event:     'Admin Accounts Seeded',
      actorName: 'seedAdmin.js',
      actorRole: 'System',
      purpose:   'Provisioning of pre-registered Facility Admin accounts',
      status:    'success',
      newValues: { customId: r.customId, facility: r.spec.facility },
    }));
  }

  console.log('\n──────────────────────────────────────────────────────────────');
  results.forEach((r) => {
    const icon = r.action === 'failed' ? '✗' : r.action === 'skipped' ? '·' : '✓';
    console.log(`${icon} ${r.action.toUpperCase().padEnd(12)} ${String(r.customId).padEnd(12)} ${String(r.spec?.facility || '').padEnd(14)} ${r.email}`);
    if (r.note) console.log(`               ${r.note}`);
  });
  console.log('──────────────────────────────────────────────────────────────');

  if (wrote.length && !DRYRUN) {
    console.log('\nSign in with these credentials:\n');
    console.log('  ADMIN ID     FACILITY        PASSWORD              PIN');
    wrote.forEach((r) => {
      const fac = FACILITIES[r.spec.facility]?.shortName || r.spec.facility;
      console.log(`  ${String(r.customId).padEnd(12)} ${String(fac).padEnd(15)} ${String(r.spec.password).padEnd(21)} ${r.spec.pin || '(2FA off)'}`);
    });
    console.log('\nStore these in your password manager, then rotate the defaults in this file.');
  }

  await mongoose.connection.close();
  process.exit(results.some((r) => r.action === 'failed') ? 1 : 0);
};

main().catch(async (err) => {
  console.error('[seed] Fatal error:', err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
