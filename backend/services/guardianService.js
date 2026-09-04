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
          gender, profilePhoto, birthday, emergencyContact, appTheme, status } = data;

  const updateData = { firstName, middleName, lastName, email, phone, gender };
  if (profilePhoto !== undefined)     updateData.profilePhoto = profilePhoto;
  if (birthday !== undefined)         updateData.birthday = birthday;
  if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact;
  if (appTheme !== undefined)         updateData.appTheme = appTheme;

  // Account Status was missing from this whitelist, so the admin panels on web
  // (GuardianDashboard.jsx, both the row dropdown and the Edit modal) and on
  // mobile (edit_guardian_modal.dart) sent the new status, got a 200 and a
  // success toast back, and were handed a document still carrying the OLD
  // status -- which they wrote straight back into the list. The change looked
  // like it had been saved and had in fact never left this function.
  //
  // Account Status is only an admin's to set once the guardian has finished
  // setting up. Until then the system owns it: it is PENDING, and it becomes
  // ACTIVE by itself in guardianAuthService.setPassword().
  //
  // Compared against the CURRENT value first, because both edit panels resend
  // the whole profile on every save — a phone-number edit on a PENDING
  // guardian arrives carrying status: 'PENDING' and must not be refused. Only
  // a real change is a decision, and only a real change is checked.
  if (status !== undefined && status !== old.status) {
    if (!old.isPasswordSet)
      throwError(
        'This guardian has not completed account setup. Account Status stays PENDING until they set their password.',
        400
      );

    const validStatuses = ['ACTIVE', 'INACTIVE'];
    if (!validStatuses.includes(status))
      throwError('Invalid status. Must be ACTIVE or INACTIVE.', 400);

    updateData.status = status;
  }

  const updated = await Guardian.findOneAndUpdate(
    { guardianId }, { $set: updateData }, { returnDocument: 'after' }
  ).populate('assignedElders').select('-password');

  await AuditLog.create({
    category: 'Account Management', event: 'Guardian Profile Updated',
    actorName: guardianId, status: 'success',
    purpose: 'Modifying guardian details',
    oldValues: {
      name: `${old.firstName} ${old.lastName}`,
      email: old.email, phone: old.phone, appTheme: old.appTheme,
      status: old.status
    },
    newValues: { firstName, middleName, lastName, email, phone, appTheme, status }
  });

  return updated;
};

exports.updateStatus = async (guardianId, status) => {
  const validStatuses = ['ACTIVE', 'INACTIVE'];
  if (!validStatuses.includes(status))
    throwError('Invalid status. Must be ACTIVE or INACTIVE.', 400);

  const old = await Guardian.findOne({ guardianId });
  if (!old) throwError('Guardian not found', 404);

  // Locked while setup is outstanding — see the note in update(). PENDING is
  // written by provisioning and cleared by setPassword(), never by an admin.
  if (!old.isPasswordSet)
    throwError(
      'This guardian has not completed account setup. Account Status stays PENDING until they set their password.',
      400
    );

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