const settingsService = require('../services/settingsService');

const getSettings = async (req, res, next) => {
  try {
    const settings = await settingsService.getSettings();
    res.status(200).json(settings);
  } catch (err) {
    next(err);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const updatedSettings = await settingsService.updateSettings(req.body);
    res.status(200).json({ message: 'Settings updated successfully', settings: updatedSettings });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSettings, updateSettings };