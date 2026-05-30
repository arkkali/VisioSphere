const mongoose = require('mongoose');
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

guardianSchema.statics.generateGuardianId = async function () {
  const currentYear = new Date().getFullYear();
  const prefix = `G-${currentYear}`;

  const lastGuardian = await this.findOne({
    guardianId: { $regex: `^${prefix}` }
  }).sort({ createdAt: -1 });

  let nextNumber = 1;
  if (lastGuardian && lastGuardian.guardianId) {
    const lastNum = parseInt(lastGuardian.guardianId.replace(prefix, ''));
    if (!isNaN(lastNum)) nextNumber = lastNum + 1;
  }

  return `${prefix}${nextNumber.toString().padStart(2, '0')}`;
};

module.exports = mongoose.model('Guardian', guardianSchema);