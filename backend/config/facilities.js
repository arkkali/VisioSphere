/**
 * facilities.js — the single source of truth for tenancy.
 *
 * VisioSphere serves two independent care facilities. Their data must never
 * mix: staff, residents, guardians, assessments, incidents and audit logs all
 * belong to exactly one facility.
 *
 * IMPORTANT — why facility is NOT derived from the customId prefix:
 * the prefixes encode ROLE, not facility. Admin.generateCustomId() mints
 * `A-` for admins, `N-` for nurses, `G-` for guardians, and Resident mints
 * `E-`. A nurse at either facility is `N-2026nn`, so there is no facility
 * signal in a nurse, guardian or resident id at all. Tenancy is therefore
 * carried by an explicit `facility` field on every document.
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

const isFacility = (value) => FACILITY_KEYS.includes(value);

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
  isFacility,
  facilityForCamera,
  housesFor,
  facilityForHouse,
};
