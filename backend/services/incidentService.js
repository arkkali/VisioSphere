const mongoose = require('mongoose');
const Incident = require('../models/Incident');

async function getIncidents(query) {
  const {
    since,
    severity,
    location,
    incidentType,
    source = 'cctv',
    acknowledged,
    limit = 100,
    skip = 0,
    showDismissed
  } = query;

  const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const filter = { createdAt: { $gte: sinceDate } };

  if (source !== 'all') filter.source = source;
  if (severity) filter.severity = severity;
  if (location) filter.location = location;
  if (incidentType) filter.incidentType = incidentType;
  if (acknowledged !== undefined) filter.acknowledged = acknowledged === 'true';
  if (showDismissed !== 'true') filter.dismissed = { $ne: true };

  const cappedLimit = Math.min(parseInt(limit, 10) || 100, 500);
  const skipN = parseInt(skip, 10) || 0;

  const [items, total] = await Promise.all([
    Incident.find(filter).sort({ createdAt: -1 }).skip(skipN).limit(cappedLimit).lean(),
    Incident.countDocuments(filter)
  ]);

  return { total, items };
}

/**
 * Load one incident by id.
 *
 * FACILITY SAFETY: this looks unscoped but is not. Mongoose routes findById
 * through findOne, which models/plugins/facilityScope.js intercepts with a
 * pre('findOne') hook and rewrites to include the caller's facility. Routes
 * reach here behind verifyToken, which runs next() inside runWithFacility, so
 * the context is always present. An admin from one facility passing the other
 * facility's _id gets null -> 404, never the document. Do NOT "fix" this by
 * adding .setOptions({ skipFacilityScope: true }) or by calling it from an
 * unscoped context.
 */
async function getIncidentById(id) {
  validateObjectId(id);
  return Incident.findById(id).lean();
}

async function getUnreadCount(since) {
  const sinceDate = since
    ? new Date(since)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const count = await Incident.countDocuments({
    source: 'cctv',
    acknowledged: false,
    dismissed: { $ne: true },
    createdAt: { $gte: sinceDate }
  });

  return { count };
}

async function getDailyStats() {
  const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
  const nowPH = new Date(Date.now() + PH_OFFSET_MS);
  const todayPH = new Date(Date.UTC(nowPH.getUTCFullYear(), nowPH.getUTCMonth(), nowPH.getUTCDate()));
  const todayStartUTC = new Date(todayPH.getTime() - PH_OFFSET_MS);
  const yesterdayStartUTC = new Date(todayStartUTC.getTime() - 24 * 60 * 60 * 1000);

  console.log('[getDailyStats] todayStartUTC:', todayStartUTC.toISOString());
  console.log('[getDailyStats] yesterdayStartUTC:', yesterdayStartUTC.toISOString());

  const [todayCount, yesterdayCount] = await Promise.all([
    Incident.countDocuments({ createdAt: { $gte: todayStartUTC } }),
    Incident.countDocuments({ createdAt: { $gte: yesterdayStartUTC, $lt: todayStartUTC } })
  ]);

  console.log('[getDailyStats] todayCount:', todayCount, 'yesterdayCount:', yesterdayCount);

  const diff = todayCount - yesterdayCount;

  return {
    current: todayCount,
    previous: yesterdayCount,
    diff: Math.abs(diff),
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral',
    label: diff > 0
      ? `${Math.abs(diff)} increased from yesterday`
      : diff < 0
        ? `${Math.abs(diff)} decreased from yesterday`
        : 'No changes since yesterday'
  };
}

async function getWeeklyStats(query) {
  const tz = query.tz || 'UTC';
  const weekStart = query.weekStart;
  const days = Math.min(parseInt(query.days, 10) || 7, 90);

  let since, until, windowDays, anchorISO;

  if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    since = new Date(weekStart + 'T00:00:00Z');
    until = new Date(since.getTime() + 7 * 24 * 60 * 60 * 1000);
    windowDays = 7;
    anchorISO = weekStart;
  } else {
    until = new Date();
    since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    windowDays = days;
    anchorISO = null;
  }

  const rows = await Incident.aggregate([
    { $match: { createdAt: { $gte: since, $lt: until }, source: 'cctv' } },
    {
      $addFields: {
        category: {
          $switch: {
            branches: [
              { case: { $in: ['$incidentType', ['Fall', 'Prolonged Fall']] }, then: 'Fall' },
              { case: { $eq: ['$incidentType', 'Agitation'] }, then: 'Agitation' },
              { case: { $in: ['$incidentType', ['Inactivity', 'Inactivity (Posture)']] }, then: 'Inactivity' },
              { case: { $eq: ['$incidentType', 'Lying Down'] }, then: 'Lying Down' }
            ],
            default: 'Other'
          }
        }
      }
    },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
          severity: '$severity',
          category: '$category'
        },
        count: { $sum: 1 }
      }
    }
  ]);

  const emptyDay = (d) => ({
    date: d,
    Emergency: 0, Warning: 0, Info: 0,
    Fall: 0, Agitation: 0, Inactivity: 0, 'Lying Down': 0, Other: 0,
    total: 0
  });

  const byDay = {};
  for (const r of rows) {
    const d = r._id.day;
    byDay[d] = byDay[d] || emptyDay(d);
    byDay[d][r._id.severity] = (byDay[d][r._id.severity] || 0) + r.count;
    byDay[d][r._id.category] = (byDay[d][r._id.category] || 0) + r.count;
    byDay[d].total += r.count;
  }

  const result = [];

  if (anchorISO) {
    const [y, m, d] = anchorISO.split('-').map(Number);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d + i));
      const iso = dt.toISOString().slice(0, 10);
      result.push(byDay[iso] || emptyDay(iso));
    }
  } else {
    for (let i = windowDays - 1; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      let iso;
      try {
        iso = dt.toLocaleDateString('en-CA', { timeZone: tz });
      } catch (_) {
        iso = dt.toLocaleDateString('en-CA', { timeZone: 'UTC' });
      }
      result.push(byDay[iso] || emptyDay(iso));
    }
  }

  return result;
}

/**
 * These *By fields are `ref: 'User'` ObjectIds, but callers pass whatever is in
 * req.body.userId — sometimes a business id like "STA-202601", which would
 * throw a CastError and turn a successful resolve into a 500. Store it only
 * when it really is an ObjectId; otherwise keep the previous behaviour (null).
 */
function toObjectIdOrNull(value) {
  return mongoose.Types.ObjectId.isValid(value) ? value : null;
}

function validateObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const err = new Error('Invalid Incident ID format');
    err.status = 400;
    throw err;
  }
}

async function acknowledgeIncident(id, userId) {
  validateObjectId(id);
  const incident = await Incident.findByIdAndUpdate(
    id,
    { acknowledged: true, acknowledgedBy: toObjectIdOrNull(userId), acknowledgedAt: new Date() },
    { returnDocument: 'after' }
  );
  if (!incident) {
    const err = new Error('Incident not found');
    err.status = 404;
    throw err;
  }
  return incident;
}

async function dismissIncident(id, userId) {
  validateObjectId(id);
  const incident = await Incident.findByIdAndUpdate(
    id,
    { dismissed: true, dismissedBy: toObjectIdOrNull(userId), dismissedAt: new Date() },
    { returnDocument: 'after' }
  );
  if (!incident) {
    const err = new Error('Incident not found');
    err.status = 404;
    throw err;
  }
  return incident;
}

/**
 * BUGFIX (pre-existing): the signature used to be (id, falsePositive) while
 * incidentController has always called it as (id, userId, falsePositive). The
 * userId string landed in the falsePositive slot, so EVERY resolved incident
 * was written with falsePositive: true — silently corrupting the false-positive
 * rate in reports. Signature now matches the caller.
 */
async function resolveIncident(id, userId, falsePositive) {
  validateObjectId(id);
  const incident = await Incident.findByIdAndUpdate(
    id,
    {
      isResolved: true,
      resolvedBy: toObjectIdOrNull(userId),
      resolvedAt: new Date(),
      falsePositive: !!falsePositive,
    },
    { returnDocument: 'after' }
  );
  if (!incident) {
    const err = new Error('Incident not found');
    err.status = 404;
    throw err;
  }
  return incident;
}

module.exports = {
  getIncidents,
  getIncidentById,
  getUnreadCount,
  getDailyStats,
  getWeeklyStats,
  acknowledgeIncident,
  dismissIncident,
  resolveIncident
};