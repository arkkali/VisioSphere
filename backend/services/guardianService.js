const Guardian = require('../models/Guardian');
const Resident = require('../models/Resident');
const AuditLog = require('../models/AuditLog');

const throwError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

exports.getAll = () =>
  Guardian.find().populate('assignedElders').sort({ createdAt: -1 }).select('-password');

exports.getByHouse = async (house) => {
  const guardians = await Guardian.find().populate('assignedElders').sort({ createdAt: -1 }).select('-password');
  return guardians.filter(g => g.assignedElders.some(e => e.house === house));
};

exports.getOne = (guardianId) =>
  Guardian.findOne({ guardianId }).populate('assignedElders').select('-password');

exports.create = async (data) => {
  const { firstName, middleName, lastName, email, phone, gender } = data;
  const guardianId = await Guardian.generateGuardianId();

  const guardian = await new Guardian({
    guardianId, firstName, middleName: middleName || '',
    lastName, email, phone: phone || '', gender: gender || '',
    status: 'PENDING', isPasswordSet: false, password: null, isFirstLogin: true
  }).save();

  await AuditLog.create({
    category: 'Registration', event: 'New Guardian Added',
    actorName: 'System Admin', status: 'success',
    purpose: 'Tracks administrative changes to the database',
    newValues: { guardianId: guardian.guardianId, name: `${guardian.firstName} ${guardian.lastName}` }
  });

  const result = guardian.toObject();
  delete result.password;
  return result;
};

exports.update = async (guardianId, data) => {
  const old = await Guardian.findOne({ guardianId });
  if (!old) throwError('Guardian not found', 404);

  const { firstName, middleName, lastName, email, phone,
          gender, profilePhoto, birthday, emergencyContact, appTheme } = data;

  const updateData = { firstName, middleName, lastName, email, phone, gender };
  if (profilePhoto !== undefined)     updateData.profilePhoto = profilePhoto;
  if (birthday !== undefined)         updateData.birthday = birthday;
  if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact;
  if (appTheme !== undefined)         updateData.appTheme = appTheme;

  const updated = await Guardian.findOneAndUpdate(
    { guardianId }, { $set: updateData }, { returnDocument: 'after' }
  ).populate('assignedElders').select('-password');

  await AuditLog.create({
    category: 'Account Management', event: 'Guardian Profile Updated',
    actorName: guardianId, status: 'success',
    purpose: 'Modifying guardian details',
    oldValues: {
      name: `${old.firstName} ${old.lastName}`,
      email: old.email, phone: old.phone, appTheme: old.appTheme
    },
    newValues: { firstName, middleName, lastName, email, phone, appTheme }
  });

  return updated;
};

exports.updateStatus = async (guardianId, status) => {
  const validStatuses = ['ACTIVE', 'INACTIVE'];
  if (!validStatuses.includes(status))
    throwError('Invalid status. Must be ACTIVE or INACTIVE.', 400);

  const old = await Guardian.findOne({ guardianId });
  if (!old) throwError('Guardian not found', 404);

  if (!old.isPasswordSet && status === 'ACTIVE')
    throwError('Cannot activate a guardian who has not completed account setup.', 400);

  const updated = await Guardian.findOneAndUpdate(
    { guardianId }, { status }, { returnDocument: 'after' }
  ).populate('assignedElders').select('-password');

  await AuditLog.create({
    category: 'Account Management', event: 'Guardian Status Updated',
    actorName: 'System Admin', status: 'success',
    purpose: 'Modifying guardian account status',
    oldValues: { status: old.status },
    newValues: { status }
  });

  return updated;
};

exports.remove = async (guardianId) => {
  const guardian = await Guardian.findOne({ guardianId });
  if (!guardian) throwError('Guardian not found', 404);

  if (guardian.assignedElders?.length > 0) {
    await Resident.updateMany(
      { _id: { $in: guardian.assignedElders } },
      { $set: { primaryGuardian: null } }
    );
  }

  await Guardian.findOneAndDelete({ guardianId });

  await AuditLog.create({
    category: 'Account Management', event: 'Guardian Profile Deleted',
    actorName: 'System Admin', status: 'success',
    purpose: 'Removing guardian from system',
    oldValues: { guardianId: guardian.guardianId, name: `${guardian.firstName} ${guardian.lastName}` }
  });
};

exports.linkElder = async (guardianId, residentId) => {
  const guardian = await Guardian.findOne({ guardianId });
  const resident = await Resident.findOne({ residentId });
  if (!guardian || !resident) throwError('Guardian or Resident not found', 404);

  if (resident.primaryGuardian && resident.primaryGuardian.toString() !== guardian._id.toString()) {
    await Guardian.findByIdAndUpdate(resident.primaryGuardian, {
      $pull: { assignedElders: resident._id }
    });
  }

  if (!guardian.assignedElders) guardian.assignedElders = [];
  if (!guardian.assignedElders.some(id => id.equals(resident._id)))
    guardian.assignedElders.push(resident._id);

  await guardian.save();
  resident.primaryGuardian = guardian._id;
  await resident.save();

  await AuditLog.create({
    category: 'Account Management', event: 'Elder Linked to Guardian',
    actorName: 'System Admin', status: 'success',
    purpose: 'Assign resident responsibility to a guardian',
    newValues: { guardianId: guardian.guardianId, residentId: resident.residentId }
  });

  return Guardian.findOne({ guardianId }).populate('assignedElders').select('-password');
};

exports.unlinkElder = async (guardianId, residentId) => {
  const guardian = await Guardian.findOne({ guardianId });
  const resident = await Resident.findOne({ residentId });
  if (!guardian || !resident) throwError('Guardian or Resident not found', 404);

  guardian.assignedElders = guardian.assignedElders.filter(
    id => id.toString() !== resident._id.toString()
  );
  await guardian.save();

  if (resident.primaryGuardian?.toString() === guardian._id.toString()) {
    resident.primaryGuardian = null;
    await resident.save();
  }

  await AuditLog.create({
    category: 'Account Management', event: 'Elder Unlinked from Guardian',
    actorName: 'System Admin', status: 'success',
    purpose: 'Remove resident responsibility from a guardian',
    newValues: { guardianId: guardian.guardianId, residentId: resident.residentId }
  });

  return Guardian.findOne({ guardianId }).populate('assignedElders').select('-password');
};

exports.saveFcmToken = async (guardianId, token) => {
  const updated = await Guardian.findOneAndUpdate(
    { guardianId },
    { $addToSet: { fcmTokens: token } },
    { returnDocument: 'after' }
  );
  if (!updated) throwError('Guardian not found', 404);
};

exports.uploadPhoto = async (guardianId, imagePath) => {
  const updated = await Guardian.findOneAndUpdate(
    { guardianId },
    { profilePhoto: imagePath },
    { returnDocument: 'after' }
  ).populate('assignedElders').select('-password');

  if (!updated) throwError('Guardian not found', 404);

  await AuditLog.create({
    category: 'Account Management', event: 'Profile Photo Uploaded',
    actorName: guardianId, status: 'success',
    purpose: 'Update display picture',
    newValues: { profilePhoto: imagePath }
  });

  return updated;
};