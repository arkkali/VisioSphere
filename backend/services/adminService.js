const bcryptjs = require('bcryptjs');
const Admin = require('../models/Admin');
const Nurse = require('../models/Nurse');
const Resident = require('../models/Resident');
const Incident = require('../models/Incident');
const AuditLog = require('../models/AuditLog');
const { CAMERA_FACILITY, DEFAULT_FACILITY } = require('../config/facilities');
const { currentFacility } = require('../models/plugins/facilityScope');

// ── Camera liveness ──────────────────────────────────────────────────────────
// This used to be `cameras: { online: 2, total: 2 }` — a literal, hardcoded on
// the way out of this function. It asked nothing and measured nothing, so the
// dashboard reported "2 / 2 cameras online" with both cameras unplugged, and
// "All Systems Normal" was drawn on top of it. On a monitoring product that is
// worse than showing no number at all: it is an assurance nobody checked.
//
// ai_core is the only thing that knows. Its /status endpoint reports, per
// camera, whether a frame arrived within CAMERA_STALE_AFTER_S — real liveness,
// not "is it listed in the config". It is reachable on the same tunnel origin
// the clips already come through.
//
// FAILS TO UNKNOWN, NEVER TO FINE. If the mini PC cannot be reached, `online`
// comes back null and the clients say so. The previous behaviour — assume two
// and paint it green — is the one thing this must never do again.
const AI_CORE_BASE = (process.env.CLIP_BASE_URL || '').replace(/\/+$/, '');
const CAMERA_HEALTH_TTL_MS = parseInt(process.env.CAMERA_HEALTH_TTL_MS || '10000', 10);
const CAMERA_HEALTH_TIMEOUT_MS = parseInt(process.env.CAMERA_HEALTH_TIMEOUT_MS || '2500', 10);

// Every dashboard load would otherwise put a request across the tunnel. The
// answer only changes on the scale of CAMERA_STALE_AFTER_S (5s), so a short
// cache costs nothing in freshness and keeps a room full of open dashboards
// from hammering the mini PC.
let _cameraHealthCache = { at: 0, value: null };

async function fetchCameraHealth() {
  if (!AI_CORE_BASE) return null;
  const now = Date.now();
  if (_cameraHealthCache.value && now - _cameraHealthCache.at < CAMERA_HEALTH_TTL_MS) {
    return _cameraHealthCache.value;
  }
  try {
    const res = await fetch(`${AI_CORE_BASE}/status`, {
      signal: AbortSignal.timeout(CAMERA_HEALTH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const health = Array.isArray(body && body.cameraHealth) ? body.cameraHealth : null;
    if (!health) return null;
    _cameraHealthCache = { at: now, value: health };
    return health;
  } catch {
    // Tunnel down, mini PC off, request timed out. Unknown, not zero and
    // certainly not two — the caller turns this into an explicit "unavailable".
    return null;
  }
}

/**
 * Camera stat for ONE facility.
 *
 * ai_core serves every camera it is configured with, regardless of tenant, so
 * the list is filtered through CAMERA_FACILITY before counting — a Grace's
 * admin must not be told about Saint Anthony's rig, and vice versa.
 *
 * `total` here is how many cameras ai_core is RUNNING for this facility, which
 * is not always how many tiles the app draws: the UI also shows placeholders
 * for hardware that is not installed yet. Clients that know their own tile
 * count should prefer it for the denominator and use `online` from here.
 */
async function cameraStat(facility) {
  const health = await fetchCameraHealth();
  if (!health) {
    return {
      online: null,
      total: null,
      label: 'Camera status unavailable',
      direction: 'none',
      available: false,
    };
  }
  const mine = health.filter(
    (c) => (CAMERA_FACILITY[c && c.id] || DEFAULT_FACILITY) === facility
  );
  const online = mine.filter((c) => c && c.online).length;
  return {
    online,
    total: mine.length,
    label: `${online} / ${mine.length} online`,
    direction: 'none',
    available: true,
  };
}

const throwError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const getPHBoundaries = () => {
  const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
  const nowPH = new Date(Date.now() + PH_OFFSET_MS);
  const todayPH = new Date(Date.UTC(nowPH.getUTCFullYear(), nowPH.getUTCMonth(), nowPH.getUTCDate()));
  const todayStartUTC = new Date(todayPH.getTime() - PH_OFFSET_MS);
  const yesterdayStartUTC = new Date(todayStartUTC.getTime() - 24 * 60 * 60 * 1000);
  return { todayStartUTC, yesterdayStartUTC };
};

const getMonthBoundaries = () => {
  const now = new Date();
  const startOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const endOfLastMonth = new Date(startOfThisMonth.getTime() - 1);
  return { startOfThisMonth, startOfLastMonth, endOfLastMonth };
};

const buildStatDiff = (current, previous, labels) => {
  const diff = current - previous;
  if (diff > 0) return { current, diff, direction: 'up', label: `${diff} increased from ${labels.period}` };
  if (diff < 0) return { current, diff: Math.abs(diff), direction: 'down', label: `${Math.abs(diff)} decreased from ${labels.period}` };
  return { current, diff: 0, direction: 'neutral', label: `No changes since ${labels.period}` };
};

exports.getAll = () =>
  Admin.find({ role: 'Facility Admin' }).select('-password');

exports.getOne = async (customId) => {
  const admin = await Admin.findOne({ customId, role: 'Facility Admin' }).select('-password');
  if (!admin) throwError('Admin not found', 404);
  return admin;
};

exports.getStats = async (adminId) => {
  const admin = await Admin.findOne({ customId: adminId, role: 'Facility Admin' }).select('_id');
  if (!admin) throwError('Admin not found', 404);

  const { startOfThisMonth, startOfLastMonth, endOfLastMonth } = getMonthBoundaries();
  const { todayStartUTC, yesterdayStartUTC } = getPHBoundaries();

  const [
    eldersThisMonth, eldersLastMonth,
    nursesThisMonth, nursesLastMonth,
    alertsToday, alertsYesterday
  ] = await Promise.all([
    Resident.countDocuments({ status: 'Active' }),
    Resident.countDocuments({
      status: { $in: ['Active', 'Discharged'] },
      admittedAt: { $lt: startOfThisMonth },
      $or: [{ dischargedAt: null }, { dischargedAt: { $gt: endOfLastMonth } }]
    }),
    Nurse.countDocuments({ status: 'Active' }),
    Nurse.countDocuments({
      createdAt: { $lt: startOfThisMonth },
      $or: [{ deactivatedAt: null }, { deactivatedAt: { $gt: endOfLastMonth } }]
    }),
    Incident.countDocuments({ createdAt: { $gte: todayStartUTC }, dismissed: { $ne: true } }),
    Incident.countDocuments({ createdAt: { $gte: yesterdayStartUTC, $lt: todayStartUTC }, dismissed: { $ne: true } })
  ]);

  return {
    elders:  buildStatDiff(eldersThisMonth,  eldersLastMonth,  { period: 'last month' }),
    nurses:  buildStatDiff(nursesThisMonth,  nursesLastMonth,  { period: 'last month' }),
    alerts:  buildStatDiff(alertsToday,      alertsYesterday,  { period: 'yesterday'  }),
    cameras: await cameraStat(currentFacility())
  };
};

exports.register = async (data) => {
  const { name, email, password } = data;
  if (!name || !email) throwError('Name and email are required', 400);

  let hashedPassword = null;
  let isFirstLogin = true;

  if (password) {
    hashedPassword = await bcryptjs.hash(password, 10);
    isFirstLogin = false;
  }

  const newAdmin = await new Admin({
    name, email, password: hashedPassword, isFirstLogin, role: 'Facility Admin'
  }).save();

  await AuditLog.create({
    category: 'Registration', event: 'New Admin Added',
    actorName: 'System Admin', actorRole: 'System',
    purpose: 'Tracks administrative changes to the database', status: 'success',
    newValues: { adminId: newAdmin.customId, name: newAdmin.name, email: newAdmin.email }
  });

  return { customId: newAdmin.customId, name: newAdmin.name, email: newAdmin.email, role: newAdmin.role, isFirstLogin: newAdmin.isFirstLogin };
};

exports.uploadProfilePic = async (customId, imageBase64) => {
  const admin = await Admin.findOne({ customId, role: 'Facility Admin' });
  if (!admin) throwError('Admin not found', 404);

  admin.profilePic = imageBase64;
  await admin.save();

  await AuditLog.create({
    category: 'Account Management', event: 'Profile Picture Updated',
    actorName: admin.name, actorRole: 'Facility Admin',
    purpose: 'User updated their profile picture', status: 'success'
  });
};

exports.updateProfile = async (customId, updateData) => {
  const admin = await Admin.findOneAndUpdate(
    { customId, role: 'Facility Admin' },
    updateData,
    { returnDocument: 'after' }
  ).select('-password');

  if (!admin) throwError('Admin not found', 404);

  await AuditLog.create({
    category: 'Account Management', event: 'Admin Profile Updated',
    actorName: admin.name, actorRole: 'Facility Admin',
    purpose: 'Updated profile settings', status: 'success'
  });

  return admin;
};

exports.changePassword = async (customId, oldPassword, newPassword) => {
  const admin = await Admin.findOne({ customId, role: 'Facility Admin' });
  if (!admin) throwError('Admin not found', 404);

  const isMatch = await bcryptjs.compare(oldPassword, admin.password);
  if (!isMatch) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed Password Change',
      actorName: admin.name, actorRole: 'Facility Admin',
      purpose: 'Security monitoring', status: 'failed',
      newValues: { reason: 'Incorrect current password' }
    });
    throwError('Incorrect current password', 401);
  }

  admin.password = await bcryptjs.hash(newPassword, 10);
  await admin.save();

  await AuditLog.create({
    category: 'Account Management', event: 'Password Changed',
    actorName: admin.name, actorRole: 'Facility Admin',
    purpose: 'User updated their password', status: 'success'
  });
};

exports.toggle2FA = async (customId, enable, pin) => {
  const admin = await Admin.findOne({ customId, role: 'Facility Admin' });
  if (!admin) throwError('Admin not found', 404);

  admin.is2FAEnabled = enable;
  admin.twoFaPin = enable ? pin : null;
  await admin.save();

  await AuditLog.create({
    category: 'Account Management', event: '2FA Settings Changed',
    actorName: admin.name, actorRole: 'Facility Admin',
    purpose: `User ${enable ? 'enabled' : 'disabled'} 2FA`, status: 'success',
    newValues: { is2FAEnabled: enable ? 'true' : 'false' }
  });

  return { is2FAEnabled: admin.is2FAEnabled };
};

exports.linkNurse = async (customId, nurseId) => {
  const admin = await Admin.findOne({ customId, role: 'Facility Admin' });
  if (!admin) throwError('Admin not found', 404);

  const nurse = await Nurse.findOne({ nurseId });
  if (!nurse) throwError('Nurse ID not found in the system', 404);

  admin.linkedNurseId = nurseId;
  await admin.save();

  nurse.linkedAdminId = admin._id.toString();
  nurse.status = 'Active';
  nurse.isFirstLogin = false;

  // 2FA IS DELIBERATELY NOT INHERITED. This block used to copy the admin's
  // flag and PIN onto the nurse, and it locked the nurse out of the system
  // permanently:
  //
  //   * the admin's PIN is stored in PLAINTEXT and verified by string equality
  //     (adminAuthService: `admin.twoFaPin !== pin`)
  //   * the nurse's PIN is verified with bcrypt.compare(pin, nurse.twoFaPin)
  //
  // So the copied value was a raw 4-digit string sitting where a bcrypt hash
  // was expected. bcrypt.compare can never match it. The nurse was asked for a
  // PIN on every login, no PIN could ever satisfy it, and nothing in the UI
  // explained why or offered a way out.
  //
  // Even with the hashing fixed, inheriting is the wrong behaviour: it hands
  // the nurse a second factor that is really the ADMIN's secret, without
  // telling either of them. A nurse who wants 2FA enables it themselves
  // (nurseService.toggle2FA), which hashes the PIN properly.
  //
  // If a nurse is already locked out by the old behaviour, clear it directly:
  //   db.nurses.updateOne({ nurseId: 'STN-XXXXXX' },
  //                       { $set: { is2FAEnabled: false, twoFaPin: null } })

  await nurse.save();

  await AuditLog.create({
    category: 'Account Management', event: 'Nurse Account Linked',
    actorName: admin.name, actorRole: 'Facility Admin',
    purpose: `Linked admin account to nurse ID: ${nurseId}`, status: 'success',
    newValues: {
      linkedNurseId: nurseId,
    }
  });

  return { linkedNurseId: admin.linkedNurseId };
};

exports.unlinkNurse = async (customId) => {
  const admin = await Admin.findOne({ customId, role: 'Facility Admin' });
  if (!admin) throwError('Admin not found', 404);

  if (admin.linkedNurseId) {
    const nurse = await Nurse.findOne({ nurseId: admin.linkedNurseId });
    if (nurse) { nurse.linkedAdminId = null; await nurse.save(); }
  }

  admin.linkedNurseId = null;
  await admin.save();

  await AuditLog.create({
    category: 'Account Management', event: 'Nurse Account Unlinked',
    actorName: admin.name, actorRole: 'Facility Admin',
    purpose: 'Unlinked nurse account', status: 'success'
  });
};

exports.deactivate = async (customId) => {
  const admin = await Admin.findOne({ customId, role: 'Facility Admin' });
  if (!admin) throwError('Admin not found', 404);

  admin.status = 'INACTIVE';
  await admin.save();

  await AuditLog.create({
    category: 'Account Management', event: 'Admin Account Deactivated',
    actorName: admin.name, actorRole: 'Facility Admin',
    purpose: 'Self-deactivation of account', status: 'success'
  });
};