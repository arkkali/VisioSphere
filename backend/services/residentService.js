const Resident = require('../models/Resident');
const Nurse = require('../models/Nurse');
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
  Resident.find().sort({ createdAt: -1 });

// Act 4: paginated version backing GET /api/residents.
// Same filter/sort as the old /all (none applied, sorted by createdAt desc) — only difference is skip/limit.
exports.getPaginated = async ({ page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (pageNum - 1) * limitNum;

  const [data, total] = await Promise.all([
    Resident.find().sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    Resident.countDocuments(),
  ]);

  return {
    data,
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  };
};

exports.getByNurse = async (nurseId) => {
  const nurse = await Nurse.findOne({ nurseId }).populate({
    path: 'assignedElders',
    options: { sort: { createdAt: -1 } }
  });
  if (!nurse) throwError('Nurse not found', 404);
  return nurse.assignedElders || [];
};

exports.getByHouse = (house) =>
  Resident.find({ house }).sort({ createdAt: -1 });

exports.getStats = async () => {
  const totalResidents = await Resident.countDocuments({});
  return { totalResidents };
};

exports.getStatsComparison = async () => {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [current, previous] = await Promise.all([
    Resident.countDocuments({ createdAt: { $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1) } }),
    Resident.countDocuments({ createdAt: { $lt: thisMonthStart } }),
  ]);

  return buildComparison(current, previous, 'last month');
};

exports.getOne = async (id) => {
  const resident = await Resident.findById(id);
  if (!resident) throwError('Resident not found', 404);
  return resident;
};

exports.create = async (data) => {
  const { firstName, middleName, lastName, house } = data;
  if (!firstName || !lastName || !house) throwError('Please provide all required fields: firstName, lastName, house', 400);

  const residentId = await Resident.generateResidentId();

  const resident = await new Resident({
    residentId,
    firstName,
    middleName: middleName || '',
    lastName,
    house,
    attendance: null,
    notes: ''
  }).save();

  await AuditLog.create({
    category: 'Registration',
    event: 'New Elder Added',
    actorName: 'System Admin',
    purpose: 'Tracks administrative changes to the database',
    status: 'success',
    oldValues: null,
    newValues: {
      residentId: resident.residentId,
      name: `${resident.firstName} ${resident.lastName}`,
      house: resident.house
    }
  });

  return resident;
};

exports.update = async (id, data) => {
  const old = await Resident.findById(id);
  if (!old) throwError('Resident not found', 404);

  const { firstName, middleName, lastName, house, attendance, notes } = data;
  const updateData = {};

  if (firstName !== undefined)  updateData.firstName  = firstName;
  if (middleName !== undefined) updateData.middleName = middleName || '';
  if (lastName !== undefined)   updateData.lastName   = lastName;
  if (house !== undefined)      updateData.house      = house;
  if (attendance !== undefined) updateData.attendance = attendance && attendance.trim() !== '' ? attendance : null;
  if (notes !== undefined)      updateData.notes      = notes || '';

  const updated = await Resident.findByIdAndUpdate(
    id, updateData, { returnDocument: 'after', runValidators: true }
  );

  await AuditLog.create({
    category: 'Account Management',
    event: 'Elder Profile Updated',
    actorName: 'System Admin',
    purpose: 'Modifying resident details',
    status: 'success',
    oldValues: {
      name: `${old.firstName} ${old.lastName}`,
      house: old.house,
      attendance: old.attendance
    },
    newValues: updateData
  });

  return updated;
};

exports.remove = async (id) => {
  const resident = await Resident.findByIdAndDelete(id);
  if (!resident) throwError('Resident not found', 404);

  await AuditLog.create({
    category: 'Account Management',
    event: 'Elder Profile Deleted',
    actorName: 'System Admin',
    purpose: 'Removing elder from system',
    status: 'success',
    oldValues: {
      residentId: resident.residentId,
      name: `${resident.firstName} ${resident.lastName}`
    },
    newValues: null
  });

  return resident;
};

exports.batchCreate = async (residentsData) => {
  if (!Array.isArray(residentsData) || residentsData.length === 0)
    throwError('Residents array is required and must not be empty', 400);

  const created = [];
  const errors = [];

  for (let i = 0; i < residentsData.length; i++) {
    try {
      const { firstName, middleName, lastName, house } = residentsData[i];
      if (!firstName || !lastName || !house) {
        errors.push(`Row ${i + 1}: Missing required fields`);
        continue;
      }
      const residentId = await Resident.generateResidentId();
      const resident = await new Resident({
        residentId, firstName, middleName: middleName || '',
        lastName, house, attendance: null, notes: ''
      }).save();
      created.push(resident);
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err.message}`);
    }
  }

  if (created.length === 0) throwError('No residents were imported', 400);

  await AuditLog.create({
    category: 'Registration',
    event: 'Batch Import Residents',
    actorName: 'System Admin',
    purpose: 'Bulk administrative import of elder data',
    status: 'success',
    oldValues: null,
    newValues: { importedCount: created.length }
  });

  return { created, errors };
};