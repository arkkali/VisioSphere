/**
 * facilities.js — the single source of truth for tenancy.
 *
 * VisioSphere serves two independent care facilities. Their data must never
 * mix: staff, residents, guardians, assessments, incidents and audit logs all
 * belong to exactly one facility.
 *
 * HOW A RECORD GETS ITS FACILITY — nobody ever types or selects it.
 *
 *   Admins    the id prefix IS the facility. A-****** is Graces, STA-****** is
 *             Saint Anthony (ADMIN_PREFIX_FACILITY below). Resolved at login
 *             from the id the admin already signs in with.
 *
 *   Everyone  nurses (N-), guardians (G-) and residents (E-) use prefixes that
 *   else      encode ROLE and are identical at both facilities — there is no
 *             facility signal in those ids to read. They instead inherit the
 *             facility of the admin who creates them, stamped automatically at
 *             insert time by models/plugins/facilityScope.js.
 *
 *   Incidents from the camera that raised them (CAMERA_FACILITY below).
 *
 * Every document still stores a `facility` field — that is what queries filter
 * on. For admins it mirrors the prefix; if the two ever disagree the prefix
 * wins and adminAuthService logs the mismatch.
 */

const FACILITIES = {
  GRACES: {
    key: 'GRACES',
    name: "Grace's Home for the Aged",
    shortName: 'Graces',
    // Prefix used when seeding admin ids for this facility. Purely cosmetic —
    // nothing derives tenancy from it. See the note above.
    adminIdPrefix: 'A',
    // Exactly the list currently hardcoded in the four Add/Edit modals —
    // including 'Louis S. Coson Hall', which does not start with "House of".
    houses: [
      'House of St. Charbel',
      'House of St. Francis',
      'House of St. Gabriel',
      'House of St. Rose of Lima',
      'House of St. Sebastian',
      'Louis S. Coson Hall',
    ],
  },
  SAINT_ANTHONY: {
    key: 'SAINT_ANTHONY',
    name: 'Saint Anthony de Padua Home Care Center',
    shortName: 'Saint Anthony',
    adminIdPrefix: 'STA',
    houses: [
      'House of Saint Anthony',
    ],
  },
};

const FACILITY_KEYS = Object.keys(FACILITIES);

/** Default for backfilled/legacy rows — all pre-existing data is Graces. */
const DEFAULT_FACILITY = FACILITIES.GRACES.key;

/**
 * Camera (ai_core cam_id / Incident.location) → facility.
 *
 * ai_core emits `location` as the camera name, which is the only facility
 * signal available on the CCTV alert path — the socket payload carries nothing
 * else. Every new camera MUST be registered here or its incidents fall back to
 * DEFAULT_FACILITY (and a warning is logged).
 *
 * NOTE the naming mismatch that predates this file: cameras are "House of
 * Gabriel" while resident/nurse house assignments are "House of St. Gabriel".
 * They are different strings, so incidents cannot currently be joined to
 * residents by house. Left as-is deliberately — renaming either side would
 * invalidate existing rows. Worth reconciling separately.
 */
const CAMERA_FACILITY = {
  'House of Charbel': FACILITIES.GRACES.key,
  'House of Gabriel': FACILITIES.GRACES.key,
  'Future CCTV 1':    FACILITIES.GRACES.key,
  'Future CCTV 2':    FACILITIES.SAINT_ANTHONY.key,
};

/**
 * Admin id prefix → facility. THIS IS THE AUTHORITY for admin accounts:
 *
 *   A-202602    → Grace's Home for the Aged
 *   STA-202601  → Saint Anthony de Padua Home Care Center
 *
 * Nobody types their facility anywhere; it is read off the id they already
 * sign in with. Built from FACILITIES so a new facility only has to be
 * declared once, above.
 *
 * Only ADMIN ids carry a facility. Nurse (N-), Guardian (G-) and Resident (E-)
 * prefixes encode role and are shared by both facilities, so those records
 * inherit the facility of the admin who creates them — see
 * models/plugins/facilityScope.js, which stamps it at insert time.
 */
const ADMIN_PREFIX_FACILITY = FACILITY_KEYS.reduce((map, key) => {
  map[FACILITIES[key].adminIdPrefix.toUpperCase()] = key;
  return map;
}, {});

const isFacility = (value) => FACILITY_KEYS.includes(value);

/**
 * Facility for an admin customId, from its prefix. Returns null when the
 * prefix is not registered — callers must treat that as "unknown", never as a
 * default, or an unregistered prefix would silently land in one tenant.
 */
const facilityForAdminId = (customId) => {
  const match = String(customId ?? '').trim().toUpperCase().match(/^([A-Z]{1,4})-\d{6}$/);
  return match ? (ADMIN_PREFIX_FACILITY[match[1]] || null) : null;
};

/** The id prefix a newly generated admin id should use for this facility. */
const adminPrefixFor = (facilityKey) => FACILITIES[facilityKey]?.adminIdPrefix || null;

const facilityForCamera = (cameraId) => {
  const match = CAMERA_FACILITY[cameraId];
  if (match) return match;
  console.warn(
    `[facility] Camera "${cameraId}" is not registered in CAMERA_FACILITY; ` +
    `defaulting its incidents to ${DEFAULT_FACILITY}. Add it to config/facilities.js.`
  );
  return DEFAULT_FACILITY;
};

const housesFor = (facilityKey) => FACILITIES[facilityKey]?.houses || [];

const facilityForHouse = (house) =>
  FACILITY_KEYS.find((k) => FACILITIES[k].houses.includes(house)) || null;

module.exports = {
  FACILITIES,
  FACILITY_KEYS,
  DEFAULT_FACILITY,
  CAMERA_FACILITY,
  ADMIN_PREFIX_FACILITY,
  isFacility,
  facilityForAdminId,
  adminPrefixFor,
  facilityForCamera,
  housesFor,
  facilityForHouse,
};
