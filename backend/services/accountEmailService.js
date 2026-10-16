const Admin = require('../models/Admin');
const Guardian = require('../models/Guardian');
const Nurse = require('../models/Nurse');
const { runUnscoped } = require('../models/plugins/facilityScope');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const emailPattern = (email) => new RegExp(
  '^' + email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
  'i'
);

const assertEmailAvailable = async (rawEmail, { exceptNurseId } = {}) => {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email)) {
    const error = new Error('Enter a valid email address.');
    error.status = 400;
    throw error;
  }

  const match = emailPattern(email);
  const inUse = await runUnscoped(async () => {
    const [admin, nurse, guardian] = await Promise.all([
      Admin.findOne({ email: match }).select('_id'),
      Nurse.findOne({ email: match, nurseId: { $ne: exceptNurseId } }).select('_id'),
      Guardian.findOne({ email: match }).select('_id'),
    ]);
    return Boolean(admin || nurse || guardian);
  });

  if (inUse) {
    const error = new Error('That email address is already used by another account.');
    error.status = 409;
    throw error;
  }

  return email;
};

const isDuplicateEmailError = (error) =>
  error?.code === 11000 &&
  (error.keyPattern?.email || error.keyValue?.email);

module.exports = { assertEmailAvailable, isDuplicateEmailError, normalizeEmail };
