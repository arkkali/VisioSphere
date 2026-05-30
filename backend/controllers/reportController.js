const reportService = require('../services/reportService');

const saveReport = async (req, res, next) => {
  try {
    const report = await reportService.saveReport(req.body);
    res.status(200).json({ message: 'Report saved to archive successfully!', report });
  } catch (err) {
    next(err);
  }
};

const getAll = async (req, res, next) => {
  try {
    const reports = await reportService.getAll();
    res.status(200).json(reports);
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const report = await reportService.getById(req.params.id);
    res.status(200).json(report);
  } catch (err) {
    next(err);
  }
};

const deleteReport = async (req, res, next) => {
  try {
    await reportService.deleteReport(req.params.id);
    res.status(200).json({ message: 'Report deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = { saveReport, getAll, getById, deleteReport };