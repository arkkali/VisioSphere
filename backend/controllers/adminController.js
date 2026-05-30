const jwt = require('jsonwebtoken');
const adminAuthService = require('../services/adminAuthService');
const adminService = require('../services/adminService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

exports.login = async (req, res, next) => {
  try {
    const { customId, password } = req.body;
    if (!customId) return res.status(400).json({ message: 'Invalid credentials.' });
    const result = await adminAuthService.login(customId, password);
    res.status(200).json({
      message: result.isFirstLogin ? 'First login detected. Please set a permanent password.'
             : result.requires2FA  ? 'Login successful'
             : 'Login successful',
      ...result
    });
  } catch (err) { next(err); }
};

exports.verify2FA = async (req, res, next) => {
  try {
    const { customId, pin } = req.body;
    if (!customId || !pin) return res.status(401).json({ message: 'Invalid credentials.' });
    const result = await adminAuthService.verify2FA(customId, pin);
    res.status(200).json({ message: 'Login successful', ...result });
  } catch (err) { next(err); }
};

exports.requestOtp = async (req, res, next) => {
  try {
    if (!req.body.email) return res.status(400).json({ message: 'Email is required' });
    await adminAuthService.requestOtp(req.body.email);
    res.status(200).json({ message: 'OTP sent successfully to your email.' });
  } catch (err) { next(err); }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otpCode } = req.body;
    if (!email || !otpCode) return res.status(400).json({ message: 'Email and OTP code are required' });
    await adminAuthService.verifyOtp(email, otpCode);
    res.status(200).json({ message: 'OTP verified successfully.' });
  } catch (err) { next(err); }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otpCode, newPassword, confirmPassword } = req.body;
    if (!email || !otpCode || !newPassword || !confirmPassword)
      return res.status(400).json({ message: 'All fields are required' });
    const result = await adminAuthService.resetPassword(email, otpCode, newPassword, confirmPassword);
    res.status(200).json({ message: 'Password set successfully! You can now login.', ...result });
  } catch (err) { next(err); }
};

exports.getAll = async (req, res, next) => {
  try {
    const admins = await adminService.getAll();
    res.status(200).json(admins.length ? admins : []);
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    res.status(200).json(await adminService.getOne(req.params.id));
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      return res.status(401).json({ message: 'Unauthorized' });
    try {
      jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    res.status(200).json(await adminService.getStats(req.params.adminId));
  } catch (err) { next(err); }
};

exports.register = async (req, res, next) => {
  try {
    const admin = await adminService.register(req.body);
    res.status(201).json({ message: 'Admin registered successfully!', admin });
  } catch (err) { next(err); }
};

exports.uploadProfilePic = async (req, res, next) => {
  try {
    const { customId, imageBase64 } = req.body;
    if (!customId || !imageBase64)
      return res.status(400).json({ message: 'Admin ID and Image data are required' });
    await adminService.uploadProfilePic(customId, imageBase64);
    res.status(200).json({ message: 'Profile picture updated successfully' });
  } catch (err) { next(err); }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const admin = await adminService.updateProfile(req.params.id, req.body);
    res.status(200).json(admin);
  } catch (err) { next(err); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    await adminService.changePassword(req.params.id, oldPassword, newPassword);
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) { next(err); }
};

exports.toggle2FA = async (req, res, next) => {
  try {
    const { enable, pin } = req.body;
    if (enable && (!pin || pin.length < 4))
      return res.status(400).json({ message: 'A valid PIN is required to enable 2FA' });
    const result = await adminService.toggle2FA(req.params.id, enable, pin);
    res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.linkNurse = async (req, res, next) => {
  try {
    if (!req.body.nurseId) return res.status(400).json({ message: 'Nurse ID is required' });
    const result = await adminService.linkNurse(req.params.id, req.body.nurseId);
    res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.unlinkNurse = async (req, res, next) => {
  try {
    await adminService.unlinkNurse(req.params.id);
    res.status(200).json({ message: 'Unlinked successfully' });
  } catch (err) { next(err); }
};

exports.deactivate = async (req, res, next) => {
  try {
    await adminService.deactivate(req.params.id);
    res.status(200).json({ message: 'Account deactivated successfully' });
  } catch (err) { next(err); }
};

exports.health = (req, res) => {
  res.status(200).json({ message: 'Admin routes are healthy', timestamp: new Date().toISOString() });
};