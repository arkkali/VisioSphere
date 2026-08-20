  const mongoose = require('mongoose');

  const facilityScope = require('./plugins/facilityScope');
  const auditLogSchema = new mongoose.Schema({
    category: {
      type: String,
      required: true
    },
    event: {
      type: String,
      required: true
    },
    actorName: {
      type: String,
      required: true
    },
    actorRole: {
      type: String,
      default: 'System'
    },
    actorId: {
      type: String,
      default: null
    },
    purpose: {
      type: String,
      required: true
    },
    status: {
      type: String,
      required: true
    },
    oldValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    newValues: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  }, { timestamps: true });


  // Tenant isolation: adds `facility`, auto-scopes every query, stamps creates.

  // See models/plugins/facilityScope.js.

  auditLogSchema.plugin(facilityScope);


  module.exports = mongoose.model('AuditLog', auditLogSchema);