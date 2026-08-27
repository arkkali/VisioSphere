const bcrypt = require('bcryptjs');
const Nurse = require('../models/Nurse');
const Admin = require('../models/Admin');
const AuditLog = require('../models/AuditLog');

const throwError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const buildComparison = (current, previous, period) => {
  const diff = current - previous;
  return {
    current,
    diff: Math.abs(diff),
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral',
    label: diff > 0
      ? `Increased by ${diff} since ${period}`
      : diff < 0
        ? `Decreased by ${Math.abs(diff)} since ${period}`
        : `No changes since ${period}`,
  };
};

exports.getAll = () =>
  Nurse.find().sort({ createdAt: -1 }).select('-password').populate('assignedElders');

exports.getByHouse = (house) =>
  Nurse.find({ houseAssigned: house }).sort({ createdAt: -1 }).select('-password').populate('assignedElders');

exports.getStats = async () => ({
  activeNurses: await Nurse.countDocuments({ status: 'Active' })
});

exports.getStatsComparison = async () => {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [current, previous] = await Promise.all([
    Nurse.countDocuments({ status: 'Active' }),
    Nurse.countDocuments({
      status: 'Active',
      createdAt: { $lt: thisMonthStart }
    }),
  ]);

  return buildComparison(current, previous, 'last month');
};

exports.getOne = (nurseId) =>
  Nurse.findOne({ nurseId }).select('-password').populate('assignedElders');

exports.getLinkedProfile = async (adminId) => {
  const admin = await Admin.findOne({ customId: adminId });
  if (!admin) throwError('Admin not found', 404);
  if (!admin.linkedNurseId) throwError('No linked nurse profile found', 404);
  const nurse = await Nurse.findOne({ nurseId: admin.linkedNurseId }).select('-password');
  if (!nurse) throwError('Linked nurse no longer exists', 404);
  return nurse;
};

exports.create = async (data) => {
  const { firstName, middleName, lastName, email, houseAssigned } = data;
  const nurseId = await Nurse.generateNurseId();
  const nurse = await new Nurse({
    nurseId, firstName, middleName: middleName || '',
    lastName, email, houseAssigned,
    status: 'Active', isFirstLogin: true, password: null, assignedElders: []
  }).save();

  await AuditLog.create({
    category: 'Registration', event: 'New Nurse Added',
    actorName: 'System Admin', status: 'success',
    purpose: 'Tracks administrative changes to the database',
    newValues: {
      nurseId: nurse.nurseId,
      name: `${nurse.firstName} ${nurse.lastName}`,
      houseAssigned: nurse.houseAssigned
    }
  });

  const result = nurse.toObject();
  delete result.password;
  return result;
};

exports.update = async (nurseId, data) => {
  const old = await Nurse.findOne({ nurseId });
  if (!old) throwError('Nurse not found', 404);

  const updated = await Nurse.findOneAndUpdate({ nurseId }, data, { returnDocument: 'after' })
    .select('-password').populate('assignedElders');

  await AuditLog.create({
    category: 'Account Management', event: 'Nurse Profile Updated',
    actorName: 'System Admin', status: 'success',
    purpose: 'Modifying nurse details',
    oldValues: {
      name: `${old.firstName} ${old.lastName}`,
      houseAssigned: old.houseAssigned,
      status: old.status
    },
    newValues: data
  });

  return updated;
};

exports.updateProfile = async (nurseId, { name, theme }) => {
  const nurse = await Nurse.findOne({ nurseId });
  if (!nurse) throwError('Nurse not found', 404);

  const oldName = `${nurse.firstName} ${nurse.lastName}`;

  if (name !== undefined) nurse.displayName = name.trim();
  if (theme) nurse.theme = theme;
  await nurse.save();

  await AuditLog.create({
    category: 'Account Management', event: 'Nurse Profile Updated',
    actorName: nurseId, status: 'success',
    purpose: 'User updated personal profile settings',
    oldValues: { name: oldName },
    newValues: { name, theme }
  });

  return nurse;
};

exports.changePassword = async (nurseId, oldPassword, newPassword) => {
  const nurse = await Nurse.findOne({ nurseId });
  if (!nurse) throwError('Nurse not found', 404);
  if (!nurse.password) throwError('No password set.', 400);
  if (!(await nurse.comparePassword(oldPassword))) throwError('Incorrect current password', 400);
  if (newPassword.length < 6) throwError('New password must be at least 6 characters', 400);

  nurse.password = newPassword;
  await nurse.save();

  await AuditLog.create({
    category: 'Security', event: 'Password Changed',
    actorName: nurseId, status: 'success',
    purpose: 'User initiated password change'
  });
};

exports.toggle2FA = async (nurseId, { enable, pin }) => {
  const update = enable
    ? { is2FAEnabled: true, twoFaPin: await bcrypt.hash(pin, 10) }
    : { is2FAEnabled: false, twoFaPin: null };

  const nurse = await Nurse.findOneAndUpdate(
    { nurseId },
    { $set: update },
    { returnDocument: 'after' }
  );
  if (!nurse) throwError('Nurse not found', 404);

  await AuditLog.create({
    category: 'Security',
    event: enable ? '2FA Enabled' : '2FA Disabled',
    actorName: nurseId,
    status: 'success',
    purpose: 'Standalone nurse updated two-factor authentication setting',
    newValues: { is2FAEnabled: String(enable) }
  });

  return { is2FAEnabled: nurse.is2FAEnabled };
};

exports.remove = async (nurseId) => {
  const nurse = await Nurse.findOneAndDelete({ nurseId });
  if (!nurse) throwError('Nurse not found', 404);

  await AuditLog.create({
    category: 'Account Management', event: 'Nurse Profile Deleted',
    actorName: 'System Admin', status: 'success',
    purpose: 'Removing nurse from system',
    oldValues: { nurseId: nurse.nurseId, name: `${nurse.firstName} ${nurse.lastName}` }
  });
};

exports.assignElder = async (nurseId, elderId) => {
  const nurse = await Nurse.findOne({ nurseId });
  if (!nurse) throwError('Nurse not found.', 404);
  if (nurse.assignedElders?.length >= 10)
    throwError('Maximum of 10 elders allowed per nurse.', 400);

  const updated = await Nurse.findOneAndUpdate(
    { nurseId }, { $addToSet: { assignedElders: elderId } }, { returnDocument: 'after' }
  ).populate('assignedElders').select('-password');

  await AuditLog.create({
    category: 'Account Management', event: 'Elder Assigned to Nurse',
    actorName: 'System Admin', status: 'success',
    purpose: 'Operational duty assignment',
    newValues: { targetNurse: nurseId, assignedElder: elderId }
  });

  return updated;
};

exports.unassignElder = async (nurseId, elderId) => {
  const updated = await Nurse.findOneAndUpdate(
    { nurseId }, { $pull: { assignedElders: elderId } }, { returnDocument: 'after' }
  ).populate('assignedElders').select('-password');

  if (!updated) throwError('Nurse not found.', 404);

  await AuditLog.create({
    category: 'Account Management', event: 'Elder Unassigned from Nurse',
    actorName: 'System Admin', status: 'success',
    purpose: 'Operational duty removal',
    newValues: { targetNurse: nurseId, unassignedElder: elderId }
  });

  return updated;
};

exports.uploadProfilePic = async (nurseId, imageBase64) => {
  const nurse = await Nurse.findOne({ nurseId });
  if (!nurse) throwError('Nurse not found', 404);

  nurse.profilePic = imageBase64;
  await nurse.save();

  await AuditLog.create({
    category: 'Account Management', event: 'Profile Picture Updated',
    actorName: nurseId, status: 'success',
    purpose: 'User updated their profile picture'
  });
};

exports.batchCreate = async (nurses) => {
  const created = [];
  const errors = [];

  for (let i = 0; i < nurses.length; i++) {
    try {
      created.push(await exports.create(nurses[i]));
    } catch (err) {
      errors.push(`Nurse ${i + 1}: ${err.message}`);
    }
  }

  if (created.length === 0) throwError('No nurses were created', 400);

  await AuditLog.create({
    category: 'Registration', event: 'Batch API Creation',
    actorName: 'System Admin', status: 'success',
    purpose: 'Bulk API creation of nurse accounts',
    newValues: { createdCount: created.length }
  });

  return { created, errors };
};