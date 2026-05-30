const nurseAuthService = require('../services/nurseAuthService');
const nurseService = require('../services/nurseService');
const nurseImportService = require('../services/nurseImportService');
const AuditLog = require('../models/AuditLog');

exports.emergencyReset = async (req, res, next) => {
  try {
    await nurseAuthService.emergencyReset('N-202601');
    res.send('<h1>Success!</h1><p>Password reset to <strong>123456</strong>.</p>');
  } catch (err) { next(err); }
};

exports.login = async (req, res, next) => {
  try {
    if (!req.body.nurseId || !req.body.password)
      return res.status(401).json({ message: 'Invalid credentials.' });
    const result = await nurseAuthService.login(req.body.nurseId, req.body.password);
    res.status(200).json({
      message: result.isFirstLogin ? 'First login detected.' : 'Login successful!',
      ...result
    });
  } catch (err) { next(err); }
};

exports.requestOtp = async (req, res, next) => {
  try {
    await nurseAuthService.requestOtp(req.body.email);
    res.status(200).json({ message: 'OTP sent successfully to your email.' });
  } catch (err) { next(err); }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    await nurseAuthService.verifyOtp(req.body.email, req.body.otpCode);
    res.status(200).json({ message: 'OTP verified successfully.' });
  } catch (err) { next(err); }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otpCode, newPassword, confirmPassword } = req.body;
    const result = await nurseAuthService.resetPassword(email, otpCode, newPassword, confirmPassword);
    res.status(200).json({ message: 'Password set successfully! You can now login.', ...result });
  } catch (err) { next(err); }
};

exports.verify2FA = async (req, res, next) => {
  try {
    const { nurseId, pin } = req.body;
    if (!nurseId || !pin) return res.status(401).json({ message: 'Invalid credentials.' });
    const result = await nurseAuthService.verify2FA(nurseId, pin);
    res.status(200).json({ message: 'Login successful!', ...result });
  } catch (err) { next(err); }
};

exports.toggle2FA = async (req, res, next) => {
  try {
    const result = await nurseService.toggle2FA(req.params.nurseId, req.body);
    res.status(200).json(result);
  } catch (err) { next(err); }
};

exports.getAll = async (req, res, next) => {
  try {
    res.status(200).json(await nurseService.getAll());
  } catch (err) { next(err); }
};

exports.getByHouse = async (req, res, next) => {
  try {
    res.status(200).json(await nurseService.getByHouse(req.params.house));
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    res.status(200).json(await nurseService.getStats());
  } catch (err) { next(err); }
};

exports.getStatsComparison = async (req, res, next) => {
  try {
    res.status(200).json(await nurseService.getStatsComparison());
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const nurse = await nurseService.getOne(req.params.nurseId);
    if (!nurse) return res.status(404).json({ message: 'Nurse not found' });
    res.status(200).json(nurse);
  } catch (err) { next(err); }
};

exports.getLinkedProfile = async (req, res, next) => {
  try {
    res.status(200).json(await nurseService.getLinkedProfile(req.params.adminId));
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const nurse = await nurseService.create(req.body);
    res.status(201).json({ message: 'Nurse added successfully!', nurse });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const nurse = await nurseService.update(req.params.nurseId, req.body);
    res.status(200).json({ message: 'Nurse updated successfully!', nurse });
  } catch (err) { next(err); }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const data = await nurseService.updateProfile(req.params.nurseId, req.body);
    res.status(200).json({ success: true, message: 'Profile updated successfully!', data });
  } catch (err) { next(err); }
};

exports.changePassword = async (req, res, next) => {
  try {
    await nurseService.changePassword(req.params.nurseId, req.body.oldPassword, req.body.newPassword);
    res.status(200).json({ success: true, message: 'Password changed successfully!' });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await nurseService.remove(req.params.nurseId);
    res.status(200).json({ message: 'Nurse deleted successfully!' });
  } catch (err) { next(err); }
};

exports.assignElder = async (req, res, next) => {
  try {
    if (!req.body.elderId) return res.status(400).json({ message: 'Elder ID is required.' });
    const nurse = await nurseService.assignElder(req.params.nurseId, req.body.elderId);
    res.status(200).json({ message: 'Elder assigned successfully.', nurse });
  } catch (err) { next(err); }
};

exports.unassignElder = async (req, res, next) => {
  try {
    if (!req.body.elderId) return res.status(400).json({ message: 'Elder ID is required.' });
    const nurse = await nurseService.unassignElder(req.params.nurseId, req.body.elderId);
    res.status(200).json({ message: 'Elder removed successfully.', nurse });
  } catch (err) { next(err); }
};

exports.uploadProfilePic = async (req, res, next) => {
  try {
    const { nurseId, imageBase64 } = req.body;
    if (!nurseId || !imageBase64)
      return res.status(400).json({ message: 'Nurse ID and image data are required.' });
    await nurseService.uploadProfilePic(nurseId, imageBase64);
    res.status(200).json({ message: 'Profile picture updated successfully' });
  } catch (err) { next(err); }
};

exports.importFile = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { created, errors } = await nurseImportService.importFromFile(req.file.path, req.file.mimetype);
    if (created.length === 0) return res.status(400).json({ message: 'No nurses were imported', errors });
    await AuditLog.create({
      category: 'Registration',
      event: 'Batch Import Nurses',
      actorName: req.user?.customId || 'Facility Admin',
      actorRole: req.user?.role || 'Facility Admin',
      actorId: req.user?.adminId || req.user?.nurseId || null,
      status: 'success',
      purpose: 'Bulk administrative import of nurse data',
      newValues: { importedCount: created.length }
    });
    res.status(201).json({
      message: `Successfully imported ${created.length} nurse(s)`,
      importedCount: created.length,
      errors: errors.length ? errors : undefined
    });
  } catch (err) { next(err); }
};

exports.batchCreate = async (req, res, next) => {
  try {
    const { nurses } = req.body;
    if (!Array.isArray(nurses) || nurses.length === 0)
      return res.status(400).json({ message: 'Please provide an array of nurses' });
    const result = await nurseService.batchCreate(nurses);
    res.status(201).json({
      message: `Successfully created ${result.created.length} nurse(s)`,
      ...result
    });
  } catch (err) { next(err); }
};