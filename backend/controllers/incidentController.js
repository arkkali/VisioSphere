  const incidentService = require('../services/incidentService');
const videoService = require('../services/videoService');
  const { dispatchResolutionPushToStaff } = require('../services/notificationService');
  const Admin = require('../models/Admin');
  const Nurse = require('../models/Nurse');
const { roomFor } = require('../config/facilities');

  async function getIncidents(req, res, next) {
    try {
      const result = await incidentService.getIncidents(req.query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async function getUnreadCount(req, res, next) {
    try {
      const result = await incidentService.getUnreadCount(req.query.since);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async function getDailyStats(req, res, next) {
    try {
      const result = await incidentService.getDailyStats();
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async function getWeeklyStats(req, res, next) {
    try {
      const result = await incidentService.getWeeklyStats(req.query);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async function acknowledgeIncident(req, res, next) {
    try {
      const incident = await incidentService.acknowledgeIncident(req.params.id, req.body.userId);
      res.status(200).json(incident);
    } catch (err) {
      next(err);
    }
  }

  async function dismissIncident(req, res, next) {
    try {
      const incident = await incidentService.dismissIncident(req.params.id, req.body.userId);
      res.status(200).json(incident);
    } catch (err) {
      next(err);
    }
  }

  async function resolveIncident(req, res, next) {
    try {
      const { userId, falsePositive = false } = req.body;
      const incident = await incidentService.resolveIncident(req.params.id, userId, falsePositive);

      let resolverName = req.user?.name || null;
      if (!resolverName) {
        if (req.user?.adminId) {
          const u = await Admin.findById(req.user.adminId).select('name').lean();
          resolverName = u?.name || 'Staff';
        } else if (req.user?.nurseId) {
          const n = await Nurse.findOne({ nurseId: req.user.nurseId }).select('firstName lastName').lean();
          resolverName = n ? `${n.firstName} ${n.lastName}` : 'Staff';
        } else {
          resolverName = 'Staff';
        }
      }

      const io = req.app.get('io');
      if (io) {
        // BUGFIX (pre-existing): this was a bare io.emit, which broadcasts to
      // EVERY connected dashboard regardless of facility — so Grace's staff
      // saw Saint Anthony's incidents being resolved, and vice versa. Scoped
      // to the incident's own facility room, matching config/socket.js.
      // incident.facility is stamped by the facilityScope plugin on create, so
      // it is authoritative here (more so than re-deriving it from location).
      io.to(roomFor(incident.facility)).emit('incident_resolved', {
          _id:          incident._id,
          resolvedBy:   incident.resolvedBy,
          resolverName,
          resolvedAt:   incident.resolvedAt,
          isResolved:   true,
        });
      }

      dispatchResolutionPushToStaff(incident, resolverName);
      res.status(200).json(incident);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/incidents/:id/video-url
   *
   * Returns a short-lived signed URL for this incident's clip, or 404 if no
   * clip exists yet. The bytes are served by ai_core on the mini PC, not by
   * this process — see services/videoService.js for why.
   *
   * FACILITY SAFETY: getIncidentById runs through Incident.findById, which the
   * facilityScope plugin scopes to req.user's facility. A caller asking for an
   * incident belonging to the other facility gets null here and falls into the
   * 404 below — it never reaches videoService, so no token is ever minted for
   * a clip the caller may not see.
   */
  async function getVideoUrl(req, res, next) {
    try {
      const incident = await incidentService.getIncidentById(req.params.id);
      if (!incident) {
        const err = new Error('Incident not found');
        err.status = 404;
        throw err;
      }
      const result = await videoService.getSignedClipUrl(incident);
      if (!result) {
        return res.status(404).json({ message: 'No clip available for this incident yet' });
      }
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  module.exports = {
    getIncidents,
    getUnreadCount,
    getDailyStats,
    getWeeklyStats,
    acknowledgeIncident,
    dismissIncident,
    resolveIncident,
    getVideoUrl
  };