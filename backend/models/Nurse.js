const mongoose = require('mongoose');
const facilityScope = require('./plugins/facilityScope');
const { ALL_HOUSES } = require('../config/facilities');
const { currentFacility } = facilityScope;
const { idPrefixFor } = require('../config/facilities');
const bcrypt   = require('bcryptjs');

const nurseSchema = new mongoose.Schema({
  nurseId:    { type: String, unique: true },
  firstName:  { type: String, required: true },
  middleName: { type: String, default: '' },
  lastName:   { type: String, required: true },
  displayName: { type: String, default: '' },
  email:      { type: String, required: true, unique: true },
  birthday:   { type: Date },
  gender:     { type: String, enum: ['M', 'F'] },
  houseAssigned: {
    type: String,
    // Every facility's houses, from config/facilities.js — never retyped here.
    enum: ALL_HOUSES,
    required: true,
  },
  status: {
    type:    String,
    enum:    ['Active', 'Inactive', 'On Leave'],
    default: 'Active',
    index:   true,
  },
  deactivatedAt:      { type: Date, default: null },
  theme:              { type: String, default: 'default' },
  profilePic:         { type: String, default: null },
  password:           { type: String, default: null },
  isFirstLogin:       { type: Boolean, default: true },
  lastPasswordChange: { type: Date, default: null },
  otpCode:            { type: String, default: null },
  otpExpiry:          { type: Date, default: null },
  fcmToken:           { type: String, default: null },
  assignedElders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref:  'Resident',
  }],
  linkedAdminId: { type: String, default: null, index: true },
  is2FAEnabled:  { type: Boolean, default: false },
  twoFaPin:      { type: String, default: null },
}, { timestamps: true });

nurseSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  const salt    = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  this.lastPasswordChange = new Date();
});

nurseSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.password) return false;
  return bcrypt.compare(enteredPassword, this.password);
};

/**
 * @param {string} [facility] Defaults to the ambient facility context.
 *   The prefix encodes facility AND role (nurse): Graces uses the short
 *   form, Saint Anthony uses ST*. See config/facilities.js idPrefixes.
 */
nurseSchema.statics.generateNurseId = async function (facility) {
  const key = facility || currentFacility();
  const rolePrefix = idPrefixFor(key, 'nurse');
  if (!rolePrefix) {
    throw new Error(
      `[generateNurseId] Cannot mint a nurse id without a known facility (got ` +
      `${JSON.stringify(key)}). The prefix encodes the facility, so guessing would ` +
      `put the record in the wrong tenant.`
    );
  }
  const currentYear = new Date().getFullYear();
  const prefix      = `${rolePrefix}-${currentYear}`;
  const lastNurse   = await facilityScope.runUnscoped(async () => this.findOne({
    nurseId: { $regex: `^${prefix}` },
  }).sort({ createdAt: -1 }));

  let nextNumber = 1;
  if (lastNurse && lastNurse.nurseId) {
    const lastNumberStr = lastNurse.nurseId.replace(prefix, '');
    nextNumber = parseInt(lastNumberStr) + 1;
  }
  const formattedNumber = nextNumber.toString().padStart(2, '0');
  return `${prefix}${formattedNumber}`;
};

nurseSchema.statics.deactivate = async function (nurseId) {
  return this.findOneAndUpdate(
    { nurseId, status: 'Active' },
    { status: 'Inactive', deactivatedAt: new Date() },
    { new: true }
  );
};

/**
 * The name every client should PRINT for this nurse.
 *
 * THE BUG THIS EXISTS TO KILL
 *
 * updateProfile() writes a nurse's chosen name to `displayName`, but every read
 * path built the name from `firstName + ' ' + lastName` instead. The field was
 * write-only: a nurse renamed herself, the value went into the database, and
 * nothing on earth ever read it back. She saw the old name on the dashboard, in
 * the settings box after a reload, and after the next sign-in — on mobile
 * always, and on the web anywhere a screen had not been patched by hand.
 *
 * The web had grown FOUR separate copies of `displayName?.trim() || firstName
 * lastName` (Login, Settings, AdminDashboard, DailyAssessments) and mobile had
 * none. Four copies of a rule is four chances to miss one, which is exactly what
 * happened. So the rule lives here now, on the server, and every client just
 * prints what it is given.
 *
 * WHY A NEW NAME AND NOT JUST `displayName`
 *
 * `displayName` is a real stored column — the nurse's OVERRIDE, empty until she
 * sets one. A virtual cannot share its name, and renaming the column would
 * silently discard the override of every nurse who has already set one, with no
 * migration to put it back. So the stored field keeps its name and meaning, and
 * `profileName` is the resolved answer: the override when there is one, the
 * legal name otherwise.
 *
 * SCOPE: this is the SELF-PROFILE name — greetings, the settings box, the
 * profile card. The admin's staff roster deliberately keeps showing firstName /
 * lastName, because that is a staff record and a nurse should not be able to
 * rename herself out of it.
 */
nurseSchema.virtual('profileName').get(function () {
  const chosen = (this.displayName || '').trim();
  if (chosen) return chosen;
  return `${this.firstName || ''} ${this.lastName || ''}`.trim();
});

// Virtuals are OFF by default in toJSON/toObject, so without this the field
// above would exist on the document and vanish the moment res.json() touched it
// — which is the same invisible failure all over again, one layer down.
nurseSchema.set('toJSON',   { virtuals: true });
nurseSchema.set('toObject', { virtuals: true });

// Tenant isolation: adds `facility`, auto-scopes every query, stamps creates.
// See models/plugins/facilityScope.js.
nurseSchema.plugin(facilityScope);

module.exports = mongoose.model('Nurse', nurseSchema);