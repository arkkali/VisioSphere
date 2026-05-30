const fs = require('fs');
const guardianAuthService = require('../services/guardianAuthService');
const guardianService = require('../services/guardianService');
const guardianImportService = require('../services/guardianImportService');
const AuditLog = require('../models/AuditLog');

exports.login = async (req, res, next) => {
  try {
    const identifier = req.body.email || req.body.guardianId;
    if (!identifier || !req.body.password)
      return res.status(401).json({ message: 'Invalid credentials.' });
    const result = await guardianAuthService.login(identifier, req.body.password);
    res.status(200).json({
      message: result.isFirstLogin ? 'First login detected.' : 'Login successful!',
      ...result
    });
  } catch (err) { next(err); }
};

exports.requestOtp = async (req, res, next) => {
  try {
    if (!req.body.email) return res.status(400).json({ message: 'Email is required' });
    await guardianAuthService.requestOtp(req.body.email);
    res.status(200).json({ message: 'OTP sent successfully to your email.' });
  } catch (err) { next(err); }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otpCode } = req.body;
    if (!email || !otpCode) return res.status(400).json({ message: 'Email and OTP code are required' });
    await guardianAuthService.verifyOtp(email, otpCode);
    res.status(200).json({ message: 'OTP verified successfully.' });
  } catch (err) { next(err); }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otpCode, newPassword, confirmPassword } = req.body;
    if (!email || !otpCode || !newPassword || !confirmPassword)
      return res.status(400).json({ message: 'All fields are required' });
    const result = await guardianAuthService.resetPassword(email, otpCode, newPassword, confirmPassword);
    res.status(200).json({ message: 'Password set successfully! You can now login.', ...result });
  } catch (err) { next(err); }
};

exports.setPassword = async (req, res, next) => {
  try {
    const { guardianId, newPassword, confirmPassword } = req.body;
    if (!guardianId || !newPassword || !confirmPassword)
      return res.status(400).json({ message: 'All fields are required' });
    const result = await guardianAuthService.setPassword(guardianId, newPassword, confirmPassword);
    res.status(200).json({ message: 'Password set successfully! You can now login.', ...result });
  } catch (err) { next(err); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { guardianId, oldPassword, newPassword, confirmPassword } = req.body;
    if (!guardianId || !oldPassword || !newPassword || !confirmPassword)
      return res.status(400).json({ message: 'All fields are required.' });
    await guardianAuthService.changePassword(guardianId, oldPassword, newPassword, confirmPassword);
    res.status(200).json({ message: 'Password updated successfully!' });
  } catch (err) { next(err); }
};

exports.getAll = async (req, res, next) => {
  try {
    res.status(200).json(await guardianService.getAll());
  } catch (err) { next(err); }
};

exports.getByHouse = async (req, res, next) => {
  try {
    res.status(200).json(await guardianService.getByHouse(req.params.house));
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const guardian = await guardianService.getOne(req.params.guardianId);
    if (!guardian) return res.status(404).json({ message: 'Guardian not found' });
    res.status(200).json(guardian);
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { firstName, lastName, email } = req.body;
    if (!firstName || !lastName || !email)
      return res.status(400).json({ message: 'Please provide all required fields (First Name, Last Name, Email)' });
    const guardian = await guardianService.create(req.body);
    res.status(201).json({ message: 'Guardian account provisioned successfully!', guardian });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const guardian = await guardianService.update(req.params.guardianId, req.body);
    res.status(200).json({ message: 'Guardian updated successfully!', guardian });
  } catch (err) { next(err); }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'Status is required' });
    const guardian = await guardianService.updateStatus(req.params.guardianId, status);
    res.status(200).json({ message: 'Status updated successfully!', guardian });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await guardianService.remove(req.params.guardianId);
    res.status(200).json({ message: 'Guardian deleted successfully and unlinked from elders.' });
  } catch (err) { next(err); }
};

exports.linkElder = async (req, res, next) => {
  try {
    const { guardianId, residentId } = req.body;
    if (!guardianId || !residentId)
      return res.status(400).json({ message: 'Guardian ID and Resident ID are required' });
    const guardian = await guardianService.linkElder(guardianId, residentId);
    res.status(200).json({ message: 'Resident successfully linked to Guardian!', guardian });
  } catch (err) { next(err); }
};

exports.unlinkElder = async (req, res, next) => {
  try {
    const { guardianId, residentId } = req.body;
    if (!guardianId || !residentId)
      return res.status(400).json({ message: 'Guardian ID and Resident ID are required' });
    const guardian = await guardianService.unlinkElder(guardianId, residentId);
    res.status(200).json({ message: 'Resident successfully unlinked from Guardian!', guardian });
  } catch (err) { next(err); }
};

exports.saveFcmToken = async (req, res, next) => {
  try {
    if (!req.body.token) return res.status(400).json({ message: 'Token is required' });
    await guardianService.saveFcmToken(req.params.guardianId, req.body.token);
    res.status(200).json({ message: 'FCM Token saved successfully' });
  } catch (err) { next(err); }
};

exports.uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided' });
    // req.file.location is the full S3 URL provided by multer-s3
    const imagePath = req.file.location;
    const guardian = await guardianService.uploadPhoto(req.params.guardianId, imagePath);
    if (!guardian) return res.status(404).json({ message: 'Guardian not found' });
    res.status(200).json({ message: 'Profile photo updated successfully', profilePhoto: imagePath, guardian });
  } catch (err) { next(err); }
};

exports.importFile = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { created, errors } = await guardianImportService.importFromFile(req.file.path, req.file.mimetype);
    if (created.length === 0) return res.status(400).json({ message: 'No guardians were imported', errors });
    await AuditLog.create({
      category: 'Registration',
      event: 'Batch Import Guardians',
      actorName: req.user?.customId || 'Facility Admin',
      actorRole: req.user?.role || 'Facility Admin',
      actorId: req.user?.adminId || req.user?.nurseId || null,
      status: 'success',
      purpose: 'Bulk administrative import of guardian data',
      newValues: { importedCount: created.length }
    });
    res.status(201).json({
      message: `Successfully imported ${created.length} guardian(s)`,
      importedCount: created.length,
      errors: errors.length ? errors : undefined
    });
  } catch (err) { next(err); }
};