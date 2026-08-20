const mongoose = require('mongoose');
const facilityScope = require('./plugins/facilityScope');
const dailyReportSchema = new mongoose.Schema(
  {
    reportDate: {
      type: String,
      required: true,
      index: true,
      // NOT globally unique — see the compound index below. A single global
      // unique index here would let the two facilities overwrite each other's
      // daily report, because reportService.saveReport() upserts on
      // { reportDate } alone.
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

// Tenant isolation: adds `facility`, auto-scopes every query, stamps creates.
// See models/plugins/facilityScope.js.
dailyReportSchema.plugin(facilityScope);

// One report per date PER FACILITY.
// MIGRATION: the old standalone unique index on reportDate must be dropped
// before this one can take effect —  scripts/backfillFacility.js does it.
dailyReportSchema.index({ facility: 1, reportDate: 1 }, { unique: true });

module.exports = mongoose.model('DailyReport', dailyReportSchema);