const mongoose = require('mongoose');
const facilityScope = require('./plugins/facilityScope');
const incidentSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ['cctv', 'manual'],
      default: 'cctv',
      required: true,
      index: true,
    },
    incidentType: {
      type: String,
      enum: [
        'Fall',
        'Prolonged Fall',
        'Lying Down',
        'Agitation',
        'Inactivity',
        'Inactivity (Posture)',
        'Unusual Movement',
        'False Alarm',
      ],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ['Emergency', 'Warning', 'Info'],
      default: 'Warning',
      required: true,
      index: true,
    },
    location: { type: String, required: true, index: true },
    cameraId: { type: String },
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resident',
      required: false,
      default: null,
      index: true,
    },
    description: { type: String },
    rawMessage: { type: String },
    trackId: { type: Number },
    alertKey: { type: String, index: true },
    clipPath: { type: String },
    // Free-text correction/context a nurse or admin attaches when
    // reviewing the recording. Capped so one pasted handover note
    // cannot bloat every incident query that returns this document.
    note: { type: String, maxlength: 500, default: '' },
    // Set when a clip is deleted. The INCIDENT survives deliberately:
    // removing the recording must not erase the fact that a fall was
    // detected, or the deletion would quietly rewrite the facility's
    // incident statistics. clipPath is cleared, these two remember
    // that a recording once existed and who removed it.
    clipDeletedAt: { type: Date },
    clipDeletedBy: { type: String },
    isResolved: { type: Boolean, default: false, index: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    acknowledged: { type: Boolean, default: false, index: true },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: { type: Date },
    falsePositive: { type: Boolean, default: false },
    dismissed: { type: Boolean, default: false, index: true },
    dismissedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dismissedAt: { type: Date },
  },
  { timestamps: true }
);

incidentSchema.index({ createdAt: -1, severity: 1 });

// Tenant isolation: adds `facility`, auto-scopes every query, stamps creates.
// See models/plugins/facilityScope.js.
incidentSchema.plugin(facilityScope);

module.exports = mongoose.model('Incident', incidentSchema);