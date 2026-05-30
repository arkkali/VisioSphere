const mongoose = require('mongoose');

const dailyReportSchema = new mongoose.Schema(
  {
    reportDate: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    totalResidents: { type: Number, required: true, default: 0 },
    totalPresent: { type: Number, required: true, default: 0 },
    totalNotPresent: { type: Number, required: true, default: 0 },
    housesSummary: [
      {
        house: { type: String, required: true },
        headcount: { type: Number, required: true, default: 0 },
        present: { type: Number, required: true, default: 0 },
        notPresent: { type: Number, required: true, default: 0 },
      }
    ],
    absentResidents: [
      {
        residentId: String,
        name: String,
        house: String,
      }
    ],
    notesSnapshot: [
      {
        residentId: String,
        name: String,
        house: String,
        note: String,
      }
    ],
    generatedBy: {
      type: String,
      default: 'System',
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('DailyReport', dailyReportSchema);