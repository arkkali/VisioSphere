const bcryptjs = require('bcryptjs');
const Admin = require('../models/Admin');
const Nurse = require('../models/Nurse');
const Resident = require('../models/Resident');
const Incident = require('../models/Incident');
const AuditLog = require('../models/AuditLog');

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
    cameras: { online: 2, total: 2, label: '2 / 2 online', direction: 'none' }
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

  if (admin.is2FAEnabled) {
    nurse.is2FAEnabled = true;
    nurse.twoFaPin = admin.twoFaPin;
  }

  await nurse.save();

  await AuditLog.create({
    category: 'Account Management', event: 'Nurse Account Linked',
    actorName: admin.name, actorRole: 'Facility Admin',
    purpose: `Linked admin account to nurse ID: ${nurseId}`, status: 'success',
    newValues: {
      linkedNurseId: nurseId,
      ...(admin.is2FAEnabled && { nurse2FAInherited: 'true' }),
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