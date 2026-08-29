const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const Nurse = require('../models/Nurse');
const AuditLog = require('../models/AuditLog');
const { SESSION_TTL } = require('../config/session');

const resend = new Resend(process.env.RESEND_API_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const throwError = (message, status) => {
  const err = new Error(message);
  err.status = status;
  throw err;
};

exports.emergencyReset = async (nurseId) => {
  const nurse = await Nurse.findOne({ nurseId });
  if (!nurse) throwError('Nurse not found', 404);
  nurse.password = '123456';
  nurse.isFirstLogin = false;
  await nurse.save();
  await AuditLog.create({
    category: 'Authentication',
    event: 'Emergency Password Reset',
    actorName: 'System Admin',
    purpose: 'Developer override for testing',
    status: 'alert',
    newValues: { targetNurse: nurseId },
    facility: nurse.facility
  });
};

exports.login = async (nurseId, password) => {
  const nurse = await Nurse.findOne({
    $or: [{ nurseId }, { email: nurseId?.toLowerCase() }]
  });

  if (!nurse) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed Login Attempt',
      actorName: nurseId || 'Unknown', status: 'failed',
      purpose: 'Security monitoring for unauthorized access',
      newValues: { reason: 'Account not found', role: 'Nurse' }
    });
    throwError('Invalid credentials.', 401);
  }

  if (nurse.status !== 'Active') {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed Login Attempt',
      actorName: nurse.nurseId, status: 'failed',
      purpose: 'Security monitoring for unauthorized access',
      newValues: { reason: 'Account inactive', role: 'Nurse' },
      facility: nurse.facility
    });
    throwError('Invalid credentials.', 401);
  }

  if (nurse.isFirstLogin) {
    return {
      isFirstLogin: true,
      nurseId: nurse.nurseId,
      tempToken: jwt.sign(
        { nurseId: nurse.nurseId, role: 'Nurse', name: `${nurse.firstName} ${nurse.lastName}`, facility: nurse.facility },
        JWT_SECRET,
        { expiresIn: '15m' }
      ),
      nurse: {
        // profileName is the name clients PRINT: the nurse's own displayName
        // override when set, her legal name otherwise. Resolved once, on the
        // Nurse schema — see models/Nurse.js. Hand-picked objects like this
        // one skip toJSON, so it has to be listed or it is missing here only.
        nurseId: nurse.nurseId, profileName: nurse.profileName,
        displayName: nurse.displayName, firstName: nurse.firstName,
        lastName: nurse.lastName, houseAssigned: nurse.houseAssigned,
        profilePic: nurse.profilePic
      }
    };
  }

  if (!password) throwError('Password is required', 400);

  const isValid = await nurse.comparePassword(password);
  if (!isValid) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed Login Attempt',
      actorName: nurse.nurseId, status: 'failed',
      purpose: 'Security monitoring for unauthorized access',
      newValues: { reason: 'Invalid credentials', role: 'Nurse' },
      facility: nurse.facility
    });
    throwError('Invalid credentials.', 401);
  }

  if (nurse.is2FAEnabled) {
    return {
      requires2FA: true,
      nurse: {
        // profileName is the name clients PRINT: the nurse's own displayName
        // override when set, her legal name otherwise. Resolved once, on the
        // Nurse schema — see models/Nurse.js. Hand-picked objects like this
        // one skip toJSON, so it has to be listed or it is missing here only.
        nurseId: nurse.nurseId, profileName: nurse.profileName,
        displayName: nurse.displayName, firstName: nurse.firstName,
        lastName: nurse.lastName, houseAssigned: nurse.houseAssigned,
        theme: nurse.theme, profilePic: nurse.profilePic
      }
    };
  }

  const token = jwt.sign(
    { nurseId: nurse.nurseId, role: 'Nurse', name: `${nurse.firstName} ${nurse.lastName}`, facility: nurse.facility },
    JWT_SECRET,
    { expiresIn: SESSION_TTL }
  );

  await AuditLog.create({
    category: 'Authentication', event: 'Login',
    actorName: nurse.nurseId, status: 'success',
    purpose: 'Track session starts and system access',
    newValues: { role: 'Nurse', houseAssigned: nurse.houseAssigned },
      facility: nurse.facility
    });

  return {
    isFirstLogin: false,
    token,
    nurse: {
      // profileName is the name clients PRINT: the nurse's own displayName
      // override when set, her legal name otherwise. Resolved once, on the
      // Nurse schema — see models/Nurse.js. Hand-picked objects like this
      // one skip toJSON, so it has to be listed or it is missing here only.
      nurseId: nurse.nurseId, profileName: nurse.profileName,
      displayName: nurse.displayName, firstName: nurse.firstName,
      lastName: nurse.lastName, houseAssigned: nurse.houseAssigned,
      status: nurse.status, theme: nurse.theme, profilePic: nurse.profilePic
    }
  };
};

exports.verify2FA = async (nurseId, pin) => {
  const nurse = await Nurse.findOne({ nurseId });
  if (!nurse) throwError('Invalid credentials.', 401);

  const isValid = await bcrypt.compare(pin, nurse.twoFaPin);
  if (!isValid) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed 2FA Attempt',
      actorName: nurse.nurseId, status: 'failed',
      purpose: 'Security monitoring',
      newValues: { reason: 'Invalid PIN provided' },
      facility: nurse.facility
    });
    throwError('Invalid credentials.', 401);
  }

  const token = jwt.sign(
    { nurseId: nurse.nurseId, role: 'Nurse', name: `${nurse.firstName} ${nurse.lastName}`, facility: nurse.facility },
    JWT_SECRET,
    { expiresIn: SESSION_TTL }
  );

  await AuditLog.create({
    category: 'Authentication', event: 'Login',
    actorName: nurse.nurseId, status: 'success',
    purpose: 'Track session starts and system access after 2FA',
    newValues: { role: 'Nurse', houseAssigned: nurse.houseAssigned },
      facility: nurse.facility
    });

  return {
    token,
    nurse: {
      // profileName is the name clients PRINT: the nurse's own displayName
      // override when set, her legal name otherwise. Resolved once, on the
      // Nurse schema — see models/Nurse.js. Hand-picked objects like this
      // one skip toJSON, so it has to be listed or it is missing here only.
      nurseId: nurse.nurseId, profileName: nurse.profileName,
      displayName: nurse.displayName, firstName: nurse.firstName,
      lastName: nurse.lastName, houseAssigned: nurse.houseAssigned,
      status: nurse.status, theme: nurse.theme, profilePic: nurse.profilePic
    }
  };
};

exports.requestOtp = async (email) => {
  const nurse = await Nurse.findOne({ email });
  if (!nurse) throwError('No account found with that email address.', 404);

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  nurse.otpCode = otpCode;
  nurse.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await nurse.save();

  await AuditLog.create({
    category: 'Authentication', event: 'OTP Requested',
    actorName: nurse.nurseId, status: 'success',
    purpose: 'Password reset initiation',
    newValues: { targetEmail: email },
      facility: nurse.facility
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
    console.error('[Resend] Nurse OTP send failed:', error);
    throwError('Failed to send OTP email', 500);
  }
};

exports.verifyOtp = async (email, otpCode) => {
  const nurse = await Nurse.findOne({ email });
  if (!nurse) throwError('Nurse not found', 404);

  if (nurse.otpCode !== otpCode) {
    await AuditLog.create({
      category: 'Authentication', event: 'Failed OTP Verification',
      actorName: nurse.nurseId, status: 'failed',
      purpose: 'Security monitoring',
      newValues: { reason: 'Invalid OTP code provided' },
      facility: nurse.facility
    });
    throwError('Invalid OTP code.', 400);
  }

  if (new Date() > nurse.otpExpiry) throwError('OTP code has expired. Please request a new one.', 400);
};

exports.resetPassword = async (email, otpCode, newPassword, confirmPassword) => {
  if (newPassword !== confirmPassword) throwError('Passwords do not match', 400);
  if (newPassword.length < 6) throwError('Password must be at least 6 characters', 400);

  const nurse = await Nurse.findOne({ email });
  if (!nurse) throwError('Nurse not found', 404);
  if (nurse.otpCode !== otpCode || new Date() > nurse.otpExpiry)
    throwError('Invalid or expired OTP.', 400);

  nurse.password = newPassword;
  nurse.isFirstLogin = false;
  nurse.otpCode = null;
  nurse.otpExpiry = null;
  await nurse.save();

  await AuditLog.create({
    category: 'Authentication', event: 'Password Reset Successful',
    actorName: nurse.nurseId, status: 'success',
    purpose: 'Account recovery completed',
      facility: nurse.facility
    });

  return { nurseId: nurse.nurseId };
};