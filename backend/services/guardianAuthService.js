const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const Guardian = require('../models/Guardian');
const AuditLog = require('../models/AuditLog');

const resend = new Resend(process.env.RESEND_API_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const throwError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

const guardianPublicFields = (g) => ({
  guardianId:       g.guardianId,
  firstName:        g.firstName,
  middleName:       g.middleName,
  lastName:         g.lastName,
  gender:           g.gender,
  assignedElders:   g.assignedElders,
  status:           g.status,
  appTheme:         g.appTheme,
  profilePhoto:     g.profilePhoto,
  emergencyContact: g.emergencyContact,
});

exports.login = async (identifier, password) => {
  const guardian = await Guardian.findOne({
    $or: [{ guardianId: identifier }, { email: identifier }]
  }).populate('assignedElders');

  if (!guardian) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed Login Attempt',
      actorName: identifier || 'Unknown', status: 'failed',
      purpose: 'Security monitoring for unauthorized access',
      newValues: { reason: 'Account not found' }
    });
    throwError('Guardian not found in the database', 404);
  }

  if (guardian.status.toUpperCase() === 'INACTIVE') {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed Login Attempt',
      actorName: guardian.guardianId, status: 'failed',
      purpose: 'Security monitoring for unauthorized access',
      newValues: { reason: 'Account inactive' }
    });
    throwError('This guardian account is not active', 403);
  }

  if (guardian.isPasswordSet === false) {
    return {
      isFirstLogin: true,
      guardianId: guardian.guardianId,
      tempToken: jwt.sign({ guardianId: guardian.guardianId, role: 'Guardian', facility: guardian.facility }, JWT_SECRET, { expiresIn: '15m' }),
      guardian: guardianPublicFields(guardian)
    };
  }

  if (!password) throwError('Password is required', 400);

  const isValid = await guardian.comparePassword(password);
  if (!isValid) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed Login Attempt',
      actorName: guardian.guardianId, status: 'failed',
      purpose: 'Security monitoring for unauthorized access',
      newValues: { reason: 'Invalid credentials' }
    });
    throwError('Invalid password', 401);
  }

  const token = jwt.sign({ guardianId: guardian.guardianId, role: 'Guardian', facility: guardian.facility }, JWT_SECRET, { expiresIn: '7d' });

  await AuditLog.create({
    category: 'Authentication', event: 'Login',
    actorName: guardian.guardianId, status: 'success',
    purpose: 'Track session starts and system access'
  });

  return { isFirstLogin: false, token, guardian: guardianPublicFields(guardian) };
};

exports.requestOtp = async (email) => {
  const guardian = await Guardian.findOne({ email });
  if (!guardian) throwError('No account found with that email address.', 404);

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  guardian.otpCode   = otpCode;
  guardian.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await guardian.save();

  await AuditLog.create({
    category: 'Authentication', event: 'OTP Requested',
    actorName: guardian.guardianId, status: 'success',
    purpose: 'Password reset initiation',
    newValues: { targetEmail: email }
  });

  const { error } = await resend.emails.send({
    from: process.env.MAIL_FROM || 'onboarding@resend.dev',
    to: email,
    subject: 'VisioSphere Security - Your OTP Code',
    html: `<div style="font-family:sans-serif;text-align:center;padding:20px;">
             <h2>VisioSphere Account Verification</h2>
             <p>Your 6-digit verification code is:</p>
             <h1 style="color:#00a8e8;letter-spacing:5px;">${otpCode}</h1>
             <p>This code will expire in 10 minutes.</p>
           </div>`
  });

  if (error) {
    console.error('[Resend] Guardian OTP send failed:', error);
    throwError('Failed to send OTP email', 500);
  }
};

exports.verifyOtp = async (email, otpCode) => {
  const guardian = await Guardian.findOne({ email });
  if (!guardian) throwError('Guardian not found', 404);

  if (guardian.otpCode !== otpCode) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed OTP Verification',
      actorName: guardian.guardianId, status: 'failed',
      purpose: 'Security monitoring',
      newValues: { reason: 'Invalid OTP code provided' }
    });
    throwError('Invalid OTP code.', 400);
  }

  if (new Date() > guardian.otpExpiry)
    throwError('OTP code has expired. Please request a new one.', 400);
};

exports.resetPassword = async (email, otpCode, newPassword, confirmPassword) => {
  if (newPassword !== confirmPassword) throwError('Passwords do not match', 400);
  if (newPassword.length < 6) throwError('Password must be at least 6 characters', 400);

  const guardian = await Guardian.findOne({ email });
  if (!guardian) throwError('Guardian not found', 404);
  if (guardian.otpCode !== otpCode || new Date() > guardian.otpExpiry)
    throwError('Invalid or expired OTP.', 400);

  guardian.password      = newPassword;
  guardian.isFirstLogin  = false;
  guardian.isPasswordSet = true;
  guardian.status        = 'ACTIVE';
  guardian.otpCode       = null;
  guardian.otpExpiry     = null;
  await guardian.save();

  await AuditLog.create({
    category: 'Authentication', event: 'Password Reset Successful',
    actorName: guardian.guardianId, status: 'success',
    purpose: 'Account recovery completed'
  });

  return { guardianId: guardian.guardianId };
};

exports.setPassword = async (guardianId, newPassword, confirmPassword) => {
  if (newPassword !== confirmPassword) throwError('Passwords do not match', 400);
  if (newPassword.length < 6) throwError('Password must be at least 6 characters', 400);

  const guardian = await Guardian.findOne({ guardianId });
  if (!guardian) throwError('Guardian not found', 404);
  if (guardian.isPasswordSet) throwError('Password has already been set for this account.', 400);

  guardian.password      = newPassword;
  guardian.isPasswordSet = true;
  guardian.isFirstLogin  = false;
  guardian.status        = 'ACTIVE';
  await guardian.save();

  await AuditLog.create({
    category: 'Authentication', event: 'Set Password',
    actorName: guardian.guardianId, status: 'success',
    purpose: 'First-time account security setup'
  });

  return { guardianId: guardian.guardianId };
};

exports.changePassword = async (guardianId, oldPassword, newPassword, confirmPassword) => {
  if (newPassword !== confirmPassword) throwError('New passwords do not match.', 400);
  if (newPassword.length < 6) throwError('New password must be at least 6 characters long.', 400);

  const guardian = await Guardian.findOne({ guardianId });
  if (!guardian) throwError('Guardian not found.', 404);

  const isValid = await guardian.comparePassword(oldPassword);
  if (!isValid) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed Password Change',
      actorName: guardianId, status: 'failed',
      purpose: 'Security monitoring',
      newValues: { reason: 'Incorrect old password' }
    });
    throwError('Incorrect current password.', 401);
  }

  guardian.password = newPassword;
  await guardian.save();

  await AuditLog.create({
    category: 'Authentication', event: 'Password Changed',
    actorName: guardianId, status: 'success',
    purpose: 'User initiated password update'
  });
};