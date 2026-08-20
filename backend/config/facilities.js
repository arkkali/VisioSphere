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
 *             Saint Anthony. Resolved at login from the id they already type.
 *
 *   Nurses &  the prefix carries facility AND role:
 *   guardians   Graces         N-  nurse    G-  guardian
 *               Saint Anthony  STN nurse    STG guardian
 *
 *   Residents still share the 'E-' prefix across both facilities, so their
 *             tenancy comes from the `facility` field, stamped automatically at
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
    // Id prefixes per role. The prefix identifies BOTH the facility and the
    // role, so no record needs to be asked which facility it belongs to.
    idPrefixes: { admin: 'A', nurse: 'N', guardian: 'G', resident: 'E' },
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
    // STA = Saint Anthony Admin, STN = Saint Anthony Nurse,
    // STG = Saint Anthony Guardian.
    // NOTE: residents still use the shared 'E-' prefix at both facilities —
    // that was not part of the request. Their ids stay unique because the
    // generators scan unscoped; tenancy still comes from the `facility` field.
    // Say the word if you want STE- as well.
    idPrefixes: { admin: 'STA', nurse: 'STN', guardian: 'STG', resident: 'E' },
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
 * Nurse and guardian prefixes are facility-specific too (STN-, STG-). Only the
 * resident prefix ('E-') is still shared between facilities.
 */
const ROLES = ['admin', 'nurse', 'guardian', 'resident'];

/**
 * prefix → { facility, role }, built from FACILITIES so a new facility is
 * declared in exactly one place.
 *
 * A prefix used by BOTH facilities (currently only 'E' for residents) resolves
 * to facility: null — it identifies the role but carries no tenancy, so
 * callers must fall back to the record's `facility` field.
 */
const PREFIX_INDEX = (() => {
  const index = {};
  for (const key of FACILITY_KEYS) {
    for (const role of ROLES) {
      const prefix = (FACILITIES[key].idPrefixes?.[role] || '').toUpperCase();
      if (!prefix) continue;
      if (index[prefix] && index[prefix].facility !== key) {
        index[prefix] = { facility: null, role, shared: true };  // used by both
      } else {
        index[prefix] = { facility: key, role, shared: false };
      }
    }
  }
  return index;
})();

/** Back-compat: admin prefix → facility. */
const ADMIN_PREFIX_FACILITY = Object.entries(PREFIX_INDEX).reduce((map, [prefix, meta]) => {
  if (meta.role === 'admin' && meta.facility) map[prefix] = meta.facility;
  return map;
}, {});

const isFacility = (value) => FACILITY_KEYS.includes(value);

/**
 * Facility for an admin customId, from its prefix. Returns null when the
 * prefix is not registered — callers must treat that as "unknown", never as a
 * default, or an unregistered prefix would silently land in one tenant.
 */
const parsePrefix = (id) => {
  const match = String(id ?? '').trim().toUpperCase().match(/^([A-Z]{1,4})-/);
  return match ? match[1] : null;
};

/**
 * What an id tells us: { prefix, facility, role }, or null if unrecognised.
 * facility is null for prefixes shared by both facilities.
 */
const describeId = (id) => {
  const prefix = parsePrefix(id);
  if (!prefix) return null;
  const meta = PREFIX_INDEX[prefix];
  return meta ? { prefix, facility: meta.facility, role: meta.role, shared: meta.shared } : null;
};

/** Facility implied by any id, or null when the prefix is shared/unknown. */
const facilityForId = (id) => describeId(id)?.facility || null;

/** Facility for an ADMIN id specifically (used at login). */
const facilityForAdminId = (customId) => {
  const meta = describeId(customId);
  return meta && meta.role === 'admin' ? meta.facility : null;
};

/** Role implied by an id prefix: 'admin' | 'nurse' | 'guardian' | 'resident'. */
const roleForId = (id) => describeId(id)?.role || null;

/** The id prefix a new record of `role` at `facilityKey` should use. */
const idPrefixFor = (facilityKey, role) => FACILITIES[facilityKey]?.idPrefixes?.[role] || null;

/** Back-compat alias. */
const adminPrefixFor = (facilityKey) => idPrefixFor(facilityKey, 'admin');

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
  PREFIX_INDEX,
  ROLES,
  isFacility,
  describeId,
  facilityForId,
  facilityForAdminId,
  roleForId,
  idPrefixFor,
  adminPrefixFor,
  facilityForCamera,
  housesFor,
  facilityForHouse,
};
