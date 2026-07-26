const { Server } = require('socket.io');
const Incident = require('../models/Incident');
const { dispatchIncidentPushToStaff } = require('../services/notificationService');

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
  else if (/^PACING/i.test(cleanMessage))                           incidentType = 'Pacing';
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

  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    socket.on('cctv_alert', async (data) => {
      let saved = null;

      try {
        saved = await Incident.create(parseAlert(data));
      } catch (err) {
        console.error('[Incident] Failed to persist alert:', err.message);
      }

      if (saved) {
        dispatchIncidentPushToStaff(saved);
      }

      io.emit('dashboard_alert', saved ? {
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
      const { alertKey, clipPath, location } = data || {};
      if (!alertKey || !clipPath) return;

      try {
        const updated = await Incident.findOneAndUpdate(
          { alertKey },
          { $set: { clipPath } },
          { returnDocument: 'after' }
        );
        if (!updated) return;
        io.emit('dashboard_alert_clip', { _id: updated._id, alertKey, location, clipPath });
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