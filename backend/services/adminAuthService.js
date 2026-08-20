const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const Admin = require('../models/Admin');
const AuditLog = require('../models/AuditLog');

const resend = new Resend(process.env.RESEND_API_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const throwError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

exports.login = async (customId, password) => {
  const admin = await Admin.findOne({
    $or: [{ customId }, { email: customId?.toLowerCase() }],
    role: 'Facility Admin'
  });

  if (!admin) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed Login Attempt',
      actorName: customId || 'Unknown', actorRole: 'System',
      purpose: 'Security monitoring for unauthorized access',
      status: 'failed', newValues: { reason: 'Admin account not found' }
    });
    throwError('Invalid credentials.', 401);
  }

  if (admin.status === 'INACTIVE') {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed Login Attempt',
      actorName: admin.name, actorRole: 'Facility Admin',
      purpose: 'Security monitoring', status: 'failed',
      newValues: { reason: 'Account deactivated' }
    });
    throwError('Invalid credentials.', 401);
  }

  if (admin.isFirstLogin === true) {
    return {
      isFirstLogin: true,
      customId: admin.customId,
      tempToken: jwt.sign(
        { customId: admin.customId, role: admin.role, adminId: admin._id, name: admin.name, facility: admin.facility },
        JWT_SECRET,
        { expiresIn: '15m' }
      ),
      admin: { customId: admin.customId, name: admin.name, role: admin.role, profilePic: admin.profilePic }
    };
  }

  if (!password) throwError('Password is required', 400);

  if (!admin.password) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed Login Attempt',
      actorName: admin.name, actorRole: 'Facility Admin',
      purpose: 'Security monitoring for unauthorized access',
      status: 'failed', newValues: { reason: 'Account has no password set' }
    });
    throwError('Invalid credentials.', 401);
  }

  const isValid = await bcryptjs.compare(password, admin.password);
  if (!isValid) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed Login Attempt',
      actorName: admin.name, actorRole: 'Facility Admin',
      purpose: 'Security monitoring for unauthorized access',
      status: 'failed', newValues: { reason: 'Invalid credentials' }
    });
    throwError('Invalid credentials.', 401);
  }

  if (admin.is2FAEnabled) {
    return {
      requires2FA: true,
      admin: { customId: admin.customId, name: admin.name, role: admin.role, profilePic: admin.profilePic, theme: admin.theme }
    };
  }

  const token = jwt.sign(
    { customId: admin.customId, role: admin.role, adminId: admin._id, name: admin.name, facility: admin.facility },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  await AuditLog.create({
    category: 'Authentication', event: 'Login', actorName: admin.name,
    actorRole: 'Facility Admin', purpose: 'Track session starts and system access',
    status: 'success', newValues: { role: admin.role }
  });

  return {
    isFirstLogin: false, token,
    admin: { customId: admin.customId, name: admin.name, role: admin.role, profilePic: admin.profilePic, linkedNurseId: admin.linkedNurseId, theme: admin.theme }
  };
};

exports.verify2FA = async (customId, pin) => {
  const admin = await Admin.findOne({ customId, role: 'Facility Admin' });
  if (!admin) throwError('Invalid credentials.', 401);

  if (admin.twoFaPin !== pin) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed 2FA Attempt',
      actorName: admin.name, actorRole: 'Facility Admin',
      purpose: 'Security monitoring', status: 'failed',
      newValues: { reason: 'Invalid PIN provided' }
    });
    throwError('Invalid credentials.', 401);
  }

  const token = jwt.sign(
    { customId: admin.customId, role: admin.role, adminId: admin._id, name: admin.name, facility: admin.facility },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  await AuditLog.create({
    category: 'Authentication', event: 'Login', actorName: admin.name,
    actorRole: 'Facility Admin', purpose: 'Track session starts and system access after 2FA',
    status: 'success', newValues: { role: admin.role }
  });

  return {
    token,
    admin: { customId: admin.customId, name: admin.name, role: admin.role, profilePic: admin.profilePic, linkedNurseId: admin.linkedNurseId, theme: admin.theme }
  };
};

exports.requestOtp = async (email) => {
  const admin = await Admin.findOne({ email, role: 'Facility Admin' });
  if (!admin) throwError('No account found with that email address.', 404);

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  admin.otpCode = otpCode;
  admin.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await admin.save();

  await AuditLog.create({
    category: 'Authentication', event: 'OTP Requested',
    actorName: admin.name, actorRole: 'Facility Admin',
    purpose: 'Password reset initiation', status: 'success',
    newValues: { targetEmail: email }
  });

  const { error } = await resend.emails.send({
    from: process.env.MAIL_FROM || 'onboarding@resend.dev', to: email,
    subject: 'VisioSphere Security - Your OTP Code',
    html: `<div style="font-family:sans-serif;text-align:center;padding:20px;">
             <h2>VisioSphere Account Verification</h2>
             <p>Your 6-digit verification code is:</p>
             <h1 style="color:#00a8e8;letter-spacing:5px;">${otpCode}</h1>
             <p>This code will expire in 10 minutes.</p>
           </div>`
  });

  if (error) {
    console.error('[Resend] Admin OTP send failed:', error);
    throwError('Failed to send OTP email', 500);
  }
};

exports.verifyOtp = async (email, otpCode) => {
  const admin = await Admin.findOne({ email, role: 'Facility Admin' });
  if (!admin) throwError('Admin not found', 404);

  if (admin.otpCode !== otpCode) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed OTP Verification',
      actorName: admin.name, actorRole: 'Facility Admin',
      purpose: 'Security monitoring', status: 'failed',
      newValues: { reason: 'Invalid OTP code provided' }
    });
    throwError('Invalid OTP code.', 400);
  }

  if (new Date() > admin.otpExpiry)
    throwError('OTP code has expired. Please request a new one.', 400);
};

exports.resetPassword = async (email, otpCode, newPassword, confirmPassword) => {
  if (newPassword !== confirmPassword) throwError('Passwords do not match', 400);
  if (newPassword.length < 6) throwError('Password must be at least 6 characters', 400);

  const admin = await Admin.findOne({ email, role: 'Facility Admin' });
  if (!admin) throwError('Admin not found', 404);

  if (admin.otpCode !== otpCode || new Date() > admin.otpExpiry)
    throwError('Invalid or expired OTP. Cannot reset password.', 400);

  admin.password = await bcryptjs.hash(newPassword, 10);
  admin.isFirstLogin = false;
  admin.otpCode = null;
  admin.otpExpiry = null;
  await admin.save();

  await AuditLog.create({
    category: 'Authentication', event: 'Password Reset Successful',
    actorName: admin.name, actorRole: 'Facility Admin',
    purpose: 'Account recovery completed', status: 'success'
  });

  return { customId: admin.customId };
};