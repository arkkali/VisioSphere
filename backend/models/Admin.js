const mongoose = require('mongoose');
const facilityScope = require('./plugins/facilityScope');
const { currentFacility } = facilityScope;
const { adminPrefixFor } = require('../config/facilities');
const adminSchema = new mongoose.Schema({
  customId:      { type: String, unique: true },
  name:          { type: String, required: true },
  email:         { type: String, required: true, unique: true },
  password:      { type: String, default: null },
  isFirstLogin:  { type: Boolean, default: true },
  otpCode:       { type: String, default: null },
  otpExpiry:     { type: Date, default: null },
  is2FAEnabled:  { type: Boolean, default: false },
  twoFaPin:      { type: String, default: null },
  profilePic:    { type: String, default: null },
  theme:         { type: String, enum: ['light', 'dark', 'default'], default: 'default' },
  linkedNurseId: { type: String, default: null },
  fcmToken:      { type: String, default: null },
  status:        { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  role: {
    type:     String,
    enum:     ['Facility Admin', 'Nurse', 'Guardian'],
    required: true,
  },
}, { timestamps: true });

/**
 * @param {string} role      'Facility Admin' | 'Nurse' | 'Guardian'
 * @param {string} [facility] REQUIRED for 'Facility Admin'. Chooses the id
 *   prefix, which is what determines the account's facility everywhere else
 *   (config/facilities.js facilityForAdminId). Falls back to the ambient
 *   facility context when omitted.
 *
 * Previously this always produced `A-<year><nn>` for admins, so an admin
 * created for Saint Anthony through the app would have been handed a Graces
 * id and silently treated as a Graces account.
 */
adminSchema.statics.generateCustomId = async function (role, facility) {
  const currentYear = new Date().getFullYear();
  let prefix = '';

  if (role === 'Nurse')          prefix = `N-${currentYear}`;
  else if (role === 'Guardian')  prefix = `G-${currentYear}`;
  else if (role === 'Facility Admin') {
    const key = facility || currentFacility();
    const adminPrefix = adminPrefixFor(key);
    if (!adminPrefix) {
      throw new Error(
        `[Admin.generateCustomId] Cannot mint an admin id without a known facility ` +
        `(got ${JSON.stringify(key)}). The id prefix IS the facility, so guessing ` +
        `one would put the account in the wrong tenant.`
      );
    }
    prefix = `${adminPrefix}-${currentYear}`;
  }

  if (prefix) {
    // Unscoped deliberately: for admins the prefix already pins the facility,
    // and for N-/G- ids the counter is shared across facilities by design (it
    // only has to produce a unique id, not a tenant-specific one).
    const lastUser = await facilityScope.runUnscoped(async () => this.findOne({
      role,
      customId: { $regex: `^${prefix}` },
    }).sort({ createdAt: -1 }));

    let nextNumber = 1;
    if (lastUser && lastUser.customId) {
      const lastNumberStr = lastUser.customId.replace(prefix, '');
      nextNumber = parseInt(lastNumberStr) + 1;
    }
    const formattedNumber = nextNumber.toString().padStart(2, '0');
    return `${prefix}${formattedNumber}`;
  }

  return null;
};

// Tenant isolation: adds `facility`, auto-scopes every query, stamps creates.
// See models/plugins/facilityScope.js.
adminSchema.plugin(facilityScope);

module.exports = mongoose.model('Admin', adminSchema, 'admins');