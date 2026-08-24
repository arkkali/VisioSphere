const mongoose = require('mongoose');
const Incident = require('../models/Incident');

// Cap on ids accepted by the thumbnail batch endpoint. Matches the clip
// list's own page size ceiling; a larger batch would mean signing tokens
// for clips that are not on screen.
const MAX_BATCH_IDS = 100;

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

/**
 * Load several incidents at once, for the thumbnail batch endpoint.
 *
 * FACILITY SAFETY: same story as getIncidentById -- the facilityScope plugin's
 * pre('find') hook rewrites this to include the caller's facility, so ids
 * belonging to the other facility simply do not come back. A caller can
 * therefore pass any ids they like and still only ever learn about their own.
 * Invalid ObjectIds are dropped rather than throwing, because one malformed id
 * in a batch of fifty should not fail the whole grid.
 */
async function getIncidentsByIds(ids = []) {
  const valid = ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .slice(0, MAX_BATCH_IDS);
  if (!valid.length) return [];
  return Incident.find({ _id: { $in: valid } })
    .select('_id clipPath')
    .lean();
}

/**
 * Severity implied by an incident type.
 *
 * Reclassifying has to move severity too. ai_core sets severity from its own
 * alert level at detection time, so an incident that came in as "Fall" carries
 * Emergency. Relabel it "False Alarm" and leave severity alone, and it keeps
 * counting toward the Emergency totals on the dashboard and in the weekly
 * chart -- the correction would show in the clip list while the statistics
 * still reported the mistake. An explicit severity in the payload overrides
 * this.
 */
const SEVERITY_FOR_TYPE = {
  'Fall': 'Emergency',
  'Prolonged Fall': 'Emergency',
  'Lying Down': 'Warning',
  'Agitation': 'Warning',
  'Inactivity': 'Warning',
  'Inactivity (Posture)': 'Warning',
  'Unusual Movement': 'Warning',
  'False Alarm': 'Info',
};

/** Values Incident.incidentType actually accepts, read off the schema itself
 *  so this can never drift from the model's enum. */
const ALLOWED_INCIDENT_TYPES = Incident.schema.path('incidentType').enumValues;

/**
 * Correct one incident's classification and/or attach a note.
 *
 * Returns { incident, before } so the caller can write a meaningful audit entry
 * -- an audit log that records only the new value cannot answer "what did this
 * used to say", which is the question anyone reviewing a correction will ask.
 */
async function updateIncidentDetails(id, changes = {}) {
  validateObjectId(id);

  const before = await Incident.findById(id).lean();
  if (!before) {
    const err = new Error('Incident not found');
    err.status = 404;
    throw err;
  }

  const update = {};

  if (changes.incidentType !== undefined) {
    if (!ALLOWED_INCIDENT_TYPES.includes(changes.incidentType)) {
      const err = new Error(
        `Invalid event type. Expected one of: ${ALLOWED_INCIDENT_TYPES.join(', ')}`
      );
      err.status = 400;
      throw err;
    }
    update.incidentType = changes.incidentType;
    update.severity =
      changes.severity || SEVERITY_FOR_TYPE[changes.incidentType] || before.severity;
  } else if (changes.severity !== undefined) {
    update.severity = changes.severity;
  }

  if (changes.note !== undefined) {
    if (typeof changes.note !== 'string') {
      const err = new Error('Note must be text');
      err.status = 400;
      throw err;
    }
    if (changes.note.length > 500) {
      const err = new Error('Note is too long (500 characters maximum)');
      err.status = 400;
      throw err;
    }
    update.note = changes.note.trim();
  }

  if (!Object.keys(update).length) {
    const err = new Error('Nothing to update');
    err.status = 400;
    throw err;
  }

  const incident = await Incident.findByIdAndUpdate(id, update, {
    returnDocument: 'after',
    runValidators: true,
  });

  return { incident, before };
}

/**
 * Clear the clip reference after the file has actually been deleted on the
 * recorder. Call this ONLY after videoService.deleteClip resolves -- clearing
 * first would leave a record claiming the recording is gone while the file
 * sits on disk.
 *
 * The incident document itself is kept. See the comment on clipDeletedAt in
 * models/Incident.js for why.
 */
async function clearClipPath(id, actorName) {
  validateObjectId(id);
  const incident = await Incident.findByIdAndUpdate(
    id,
    {
      $unset: { clipPath: '' },
      $set: { clipDeletedAt: new Date(), clipDeletedBy: actorName || 'Unknown' },
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
  getIncidentsByIds,
  updateIncidentDetails,
  clearClipPath,
  ALLOWED_INCIDENT_TYPES,
  MAX_BATCH_IDS,
  getUnreadCount,
  getDailyStats,
  getWeeklyStats,
  acknowledgeIncident,
  dismissIncident,
  resolveIncident
};