  const incidentService = require('../services/incidentService');
const videoService = require('../services/videoService');
  const { dispatchResolutionPushToStaff } = require('../services/notificationService');
  const Admin = require('../models/Admin');
  const Nurse = require('../models/Nurse');
const { roomFor } = require('../config/facilities');
const auditService = require('../services/auditService');

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

  /** Name to record in the audit trail for whoever is making this request. */
  function actorFrom(req) {
    return {
      actorName: req.user?.name || req.user?.customId || 'Unknown',
      actorRole: req.user?.role || 'Staff',
      actorId: req.user?.customId || null,
    };
  }

  /**
   * GET /api/incidents/thumbnail-urls?ids=a,b,c
   *
   * Signed poster URLs for many incidents in ONE round trip. The grid needs a
   * thumbnail per card; doing that as one request per card would be dozens of
   * calls through the tunnel on every page load, and resolving them from the
   * clip list endpoint instead would mint tokens on every dashboard poll for
   * clips nobody is looking at.
   *
   * Ids the caller's facility does not own simply do not come back -- the lookup
   * is facility-scoped, so this cannot be used to probe the other facility.
   */
  async function getThumbnailUrls(req, res, next) {
    try {
      const raw = String(req.query.ids || '').trim();
      if (!raw) return res.status(200).json({});

      const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);
      const incidents = await incidentService.getIncidentsByIds(ids);
      const urls = await videoService.getSignedPosterUrls(incidents);
      res.status(200).json(urls);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/incidents/:id/clip
   * Body: { incidentType?, severity?, note? }
   *
   * Corrects what a recording was classified as. The video itself is immutable --
   * "editing" a clip means fixing the record attached to it, which is the part
   * that is actually ever wrong: the detector labels a resident sitting down
   * heavily as a fall, and a nurse who watched the clip knows better.
   *
   * Audit-logged with both old and new values, because a reclassification changes
   * the facility's incident statistics and anyone reviewing those later needs to
   * see that it was changed, by whom, and from what.
   */
  async function updateClip(req, res, next) {
    try {
      const { incidentType, severity, note } = req.body || {};
      const { incident, before } = await incidentService.updateIncidentDetails(
        req.params.id,
        { incidentType, severity, note }
      );

      const actor = actorFrom(req);
      await auditService.create({
        category: 'Incident',
        event: 'Clip Record Updated',
        ...actor,
        purpose: 'Correct the classification or notes on a recorded event',
        status: 'success',
        oldValues: {
          incidentType: before.incidentType,
          severity: before.severity,
          note: before.note || '',
        },
        newValues: {
          incidentType: incident.incidentType,
          severity: incident.severity,
          note: incident.note || '',
        },
      }).catch((err) => console.error('[audit] clip update log failed:', err.message));

      res.status(200).json(incident);
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/incidents/:id/clip
   *
   * Removes the recording from the mini PC and clears clipPath. The INCIDENT
   * document survives on purpose -- see models/Incident.js. Deleting the record
   * too would let anyone quietly reduce the facility's fall count by deleting
   * the evidence, which is precisely the thing an audit trail exists to prevent.
   *
   * Ordering is deliberate: the file is deleted FIRST, and clipPath is cleared
   * only once the recorder confirms. Doing it the other way round would leave
   * orphaned footage on disk that nothing in the system references any more.
   */
  async function deleteClip(req, res, next) {
    try {
      const incident = await incidentService.getIncidentById(req.params.id);
      if (!incident) {
        const err = new Error('Incident not found');
        err.status = 404;
        throw err;
      }
      if (!incident.clipPath) {
        return res.status(404).json({ message: 'This incident has no clip to delete' });
      }

      const actor = actorFrom(req);
      const result = await videoService.deleteClip(incident);
      const updated = await incidentService.clearClipPath(req.params.id, actor.actorName);

      await auditService.create({
        category: 'Incident',
        event: 'Clip Deleted',
        ...actor,
        purpose: 'Remove a recorded event clip from storage',
        status: 'success',
        oldValues: { clipPath: incident.clipPath, location: incident.location },
        newValues: { deletedFiles: result.deleted },
      }).catch((err) => console.error('[audit] clip delete log failed:', err.message));

      res.status(200).json({
        _id: updated._id,
        clipDeletedAt: updated.clipDeletedAt,
        deleted: result.deleted,
      });
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
    getVideoUrl,
    getThumbnailUrls,
    updateClip,
    deleteClip
  };