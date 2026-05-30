const mongoose = require('mongoose');
const DailyReport = require('../models/DailyReport');
const AuditLog = require('../models/AuditLog');

const saveReport = async (body) => {
  const {
    reportDate,
    totalResidents,
    totalPresent,
    totalNotPresent,
    housesSummary,
    absentResidents,
    notesSnapshot
  } = body;

  const savedReport = await DailyReport.findOneAndUpdate(
    { reportDate },
    {
      totalResidents,
      totalPresent,
      totalNotPresent,
      housesSummary,
      absentResidents,
      notesSnapshot,
      generatedBy: 'System Admin'
    },
    { returnDocument: 'after', upsert: true }
  );

  await AuditLog.create({
    category: 'Reporting',
    event: 'Daily Report Archived',
    actorName: 'System Admin',
    purpose: 'Saved daily attendance and notes snapshot',
    status: 'success',
    oldValues: null,
    newValues: { reportDate }
  });

  return savedReport;
};

const getAll = async () => {
  return await DailyReport.find().sort({ createdAt: -1 });
};

const getById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid report ID');
    err.status = 400;
    throw err;
  }

  const report = await DailyReport.findById(id);
  if (!report) {
    const err = new Error('Report not found');
    err.status = 404;
    throw err;
  }

  return report;
};

const deleteReport = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid report ID');
    err.status = 400;
    throw err;
  }

  const deletedReport = await DailyReport.findByIdAndDelete(id);
  if (!deletedReport) {
    const err = new Error('Report not found');
    err.status = 404;
    throw err;
  }

  await AuditLog.create({
    category: 'Reporting',
    event: 'Archived Report Deleted',
    actorName: 'System Admin',
    purpose: 'Removed historical report data',
    status: 'success',
    oldValues: { reportDate: deletedReport.reportDate },
    newValues: null
  });
};

module.exports = { saveReport, getAll, getById, deleteReport };