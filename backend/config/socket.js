const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Incident = require('../models/Incident');
const { dispatchIncidentPushToStaff } = require('../services/notificationService');
const { facilityForCamera } = require('./facilities');
const { runWithFacility } = require('../models/plugins/facilityScope');

/** Socket.IO room a dashboard client joins, so alerts stay within a facility. */
const roomFor = (facility) => `facility:${facility}`;

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const parseAlert = (payload = {}) => {
  const { type, message = '', location = 'Unknown', alertKey, clipPath } = payload;

  const idMatch    = message.match(/^\[ID\s+(\d+)\]\s*/i);
  const trackId    = idMatch ? parseInt(idMatch[1], 10) : undefined;
  const cleanMessage = message.replace(/^\[ID\s+\d+\]\s*/i, '').trim();

  let incidentType = 'False Alarm';
  if      (/^FALL DETECTED/i.test(cleanMessage))                    incidentType = 'Fall';
  else if (/^PROLONGED FALL/i.test(cleanMessage))                   incidentType = 'Prolonged Fall';
  else if (/^LYING DOWN/i.test(cleanMessage))                       incidentType = 'Lying Down';
  else if (/AGITATION_RISK/i.test(cleanMessage))                    incidentType = 'Agitation';
  else if (/^INACTIVE\s*[—\-]\s*POSTURE/i.test(cleanMessage))       incidentType = 'Inactivity (Posture)';
  else if (/^INACTIVE/i.test(cleanMessage))                         incidentType = 'Inactivity';

  const severity = type === 'EMERGENCY' ? 'Emergency'
                 : type === 'WARNING'   ? 'Warning'
                 :                        'Info';

  return {
    source:      'cctv',
    incidentType,
    severity,
    location,
    cameraId:    location,
    description: `${incidentType} - ${location}`,
    rawMessage:  message,
    trackId,
    alertKey,
    clipPath:    clipPath || undefined,
    facility:    facilityForCamera(location),
  };
};

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        const allowed = (process.env.ALLOWED_ORIGIN || '').replace(/\/$/, '');
        const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin || '');
        if (!origin || origin === allowed || isLocalhost) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked: ${origin}`));
        }
      },
      methods: ['GET', 'POST'],
    },
  });

  // Every connecting socket must present one of two credentials:
  //   - AI_SERVICE_TOKEN (ai_core) -> tagged isAiService, allowed to write
  //     cctv_alert / cctv_alert_clip.
  //   - a valid login JWT (dashboard browser clients) -> tagged with the
  //     decoded user, read-only (never calls the write handlers below).
  // Anything else is refused at the handshake, so dashboard_alert broadcasts
  // (which include resident names/locations/incident descriptions) are no
  // longer readable by an unauthenticated client.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (token && process.env.AI_SERVICE_TOKEN && token === process.env.AI_SERVICE_TOKEN) {
      socket.isAiService = true;
      return next();
    }

    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      socket.isAiService = false;
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // Dashboard clients join their facility's room. Without this, io.emit()
    // below would deliver every alert — location, description, raw message —
    // to BOTH facilities' dashboards.
    if (!socket.isAiService && socket.user?.facility) {
      socket.join(roomFor(socket.user.facility));
    }
    console.log(
      `[Socket.io] Client connected: ${socket.id}` +
      (socket.isAiService ? ' (role: ai-service)' : '')
    );

    socket.on('cctv_alert', async (data) => {
      if (!socket.isAiService) {
        console.warn(`[Socket.io] Rejected cctv_alert from unauthenticated socket ${socket.id}`);
        return;
      }
      // ai_core's payload carries no facility, so it is derived from the
      // camera name — the only tenant signal on this path. Unregistered
      // cameras fall back to DEFAULT_FACILITY with a warning; see
      // config/facilities.js CAMERA_FACILITY.
      const facility = facilityForCamera(data?.location);

      let saved = null;

      try {
        saved = await runWithFacility(facility, () => Incident.create(parseAlert(data)));
      } catch (err) {
        console.error('[Incident] Failed to persist alert:', err.message);
      }

      if (saved) {
        // Scoped too: this reads Admin + Nurse to pick push targets, and would
        // otherwise notify the other facility's staff phones.
        runWithFacility(facility, () => dispatchIncidentPushToStaff(saved))
          .catch((err) => console.error('[Incident] push dispatch failed:', err.message));
      }

      io.to(roomFor(facility)).emit('dashboard_alert', saved ? {
        _id:          saved._id,
        source:       saved.source,
        incidentType: saved.incidentType,
        severity:     saved.severity,
        location:     saved.location,
        description:  saved.description,
        rawMessage:   saved.rawMessage,
        trackId:      saved.trackId,
        alertKey:     saved.alertKey,
        clipPath:     saved.clipPath,
        createdAt:    saved.createdAt,
        type:         data.type,
        message:      data.message,
        timestamp:    data.timestamp,
      } : data);
    });

    socket.on('cctv_alert_clip', async (data) => {
      if (!socket.isAiService) {
        console.warn(`[Socket.io] Rejected cctv_alert_clip from unauthenticated socket ${socket.id}`);
        return;
      }
      const { alertKey, clipPath, location } = data || {};
      if (!alertKey || !clipPath) return;

      const facility = facilityForCamera(location);

      try {
        // await INSIDE the context: a Mongoose Query is lazy, so returning it
        // unexecuted would run exec() after the context was torn down.
        const updated = await runWithFacility(facility, async () => Incident.findOneAndUpdate(
          { alertKey },
          { $set: { clipPath } },
          { returnDocument: 'after' }
        ));
        if (!updated) return;
        io.to(roomFor(facility)).emit('dashboard_alert_clip', { _id: updated._id, alertKey, location, clipPath });
      } catch (err) {
        console.error('[Incident] cctv_alert_clip update failed:', err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

module.exports = initSocket;