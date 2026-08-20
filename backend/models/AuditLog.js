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
  //
  // required:false — unlike every other tenant model, AuditLog must record
  // events that happen BEFORE a facility is known, or where none exists: a
  // failed login for an account that does not exist has no facility. Auth
  // routes run unscoped (middleware/auth.js crossFacility), so those writes
  // have no context to stamp from. Reads are still scoped, so rows with a null
  // facility are invisible to both tenants' audit views by design — use
  // runUnscoped() to review unattributable auth failures.
  auditLogSchema.plugin(facilityScope, { required: false });

  module.exports = mongoose.model('AuditLog', auditLogSchema);