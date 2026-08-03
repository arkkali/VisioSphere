const mongoose = require('mongoose');

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

adminSchema.statics.generateCustomId = async function (role) {
  const currentYear = new Date().getFullYear();
  let prefix = '';

  if (role === 'Nurse')          prefix = `N-${currentYear}`;
  else if (role === 'Guardian')  prefix = `G-${currentYear}`;
  else if (role === 'Facility Admin') prefix = `A-${currentYear}`;

  if (prefix) {
    const lastUser = await this.findOne({
      role,
      customId: { $regex: `^${prefix}` },
    }).sort({ createdAt: -1 });

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

module.exports = mongoose.model('Admin', adminSchema, 'admins');