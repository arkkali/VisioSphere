const mongoose = require('mongoose');
const facilityScope = require('./plugins/facilityScope');
const { currentFacility } = facilityScope;
const { idPrefixFor } = require('../config/facilities');
const bcrypt = require('bcryptjs');

const guardianSchema = new mongoose.Schema({
  guardianId: { type: String, unique: true },
  firstName: { type: String, required: true },
  middleName: { type: String, default: '' },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, default: '' },
  birthday: { type: Date, default: null },
  gender: {
    type: String,
    enum: ['M', 'F', ''],
    default: ''
  },
  emergencyContact: {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    relationship: { type: String, default: '' }
  },
  assignedElders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resident'
  }],
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'PENDING'],
    default: 'PENDING'
  },
  appTheme: {
    type: String,
    enum: ['Auto', 'Light', 'Dark'],
    default: 'Auto'
  },
  fcmTokens: {
    type: [String],
    default: []
  },
  password: { type: String, default: null },
  isFirstLogin: { type: Boolean, default: true },
  isPasswordSet: { type: Boolean, default: false },
  lastPasswordChange: { type: Date, default: null },
  profilePhoto: { type: String, default: null },
  otpCode: { type: String, default: null },
  otpExpiry: { type: Date, default: null }
}, { timestamps: true });

guardianSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.lastPasswordChange = new Date();
});

guardianSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

/**
 * @param {string} [facility] Defaults to the ambient facility context.
 *   The prefix encodes facility AND role (guardian): Graces uses the short
 *   form, Saint Anthony uses ST*. See config/facilities.js idPrefixes.
 */
guardianSchema.statics.generateGuardianId = async function (facility) {
  const key = facility || currentFacility();
  const rolePrefix = idPrefixFor(key, 'guardian');
  if (!rolePrefix) {
    throw new Error(
      `[generateGuardianId] Cannot mint a guardian id without a known facility (got ` +
      `${JSON.stringify(key)}). The prefix encodes the facility, so guessing would ` +
      `put the record in the wrong tenant.`
    );
  }
  const currentYear = new Date().getFullYear();
  const prefix = `${rolePrefix}-${currentYear}`;

  const lastGuardian = await facilityScope.runUnscoped(async () => this.findOne({
    guardianId: { $regex: `^${prefix}` }
  }).sort({ createdAt: -1 }));

  let nextNumber = 1;
  if (lastGuardian && lastGuardian.guardianId) {
    const lastNum = parseInt(lastGuardian.guardianId.replace(prefix, ''));
    if (!isNaN(lastNum)) nextNumber = lastNum + 1;
  }

  return `${prefix}${nextNumber.toString().padStart(2, '0')}`;
};

// Tenant isolation: adds `facility`, auto-scopes every query, stamps creates.
// See models/plugins/facilityScope.js.
guardianSchema.plugin(facilityScope);

module.exports = mongoose.model('Guardian', guardianSchema);