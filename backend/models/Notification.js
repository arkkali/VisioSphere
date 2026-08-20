const mongoose = require('mongoose');
const facilityScope = require('./plugins/facilityScope');
const notificationSchema = new mongoose.Schema({
  guardianId: { 
    type: String, 
    required: true,
    index: true 
  },
  type: { 
    type: String, 
    enum: ['new_report', 'new_comment', 'system'], 
    required: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  residentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Resident', 
    required: false 
  },
  residentName: { 
    type: String, 
    required: false 
  },
  assessmentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'DailyAssessment', 
    required: false 
  },
  reportDate: {
    type: Date,
    required: false
  },
  isRead: { 
    type: Boolean, 
    default: false 
  }
}, { timestamps: true });

// Tenant isolation: adds `facility`, auto-scopes every query, stamps creates.
// See models/plugins/facilityScope.js.
notificationSchema.plugin(facilityScope);

module.exports = mongoose.model('Notification', notificationSchema);