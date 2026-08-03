  const incidentService = require('../services/incidentService');
  const { dispatchResolutionPushToStaff } = require('../services/notificationService');
  const Admin = require('../models/Admin');
  const Nurse = require('../models/Nurse');

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
        io.emit('incident_resolved', {
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

  module.exports = {
    getIncidents,
    getUnreadCount,
    getDailyStats,
    getWeeklyStats,
    acknowledgeIncident,
    dismissIncident,
    resolveIncident
  };