/**
 * houses.js — the single source of truth for house lists on the frontend.
 *
 * Previously each of AddResidentModal, EditResidentModal, AddNurseModal and
 * EditNurseModal carried its own hardcoded copy of the same array. Four copies
 * drift; this is one.
 *
 * Houses belong to a facility. A Graces admin must never be offered a Saint
 * Anthony house, or they could assign a resident across the tenant boundary —
 * the backend would reject the write, but the UI should not offer it at all.
 *
 * Keep in sync with backend/config/facilities.js — that file is authoritative
 * and the backend validates against it.
 */

export const FACILITY_HOUSES = {
  GRACES: [
    'House of St. Charbel',
    'House of St. Francis',
    'House of St. Gabriel',
    'House of St. Rose of Lima',
    'House of St. Sebastian',
    'Louis S. Coson Hall',
  ],
  SAINT_ANTHONY: [
    'House of Saint Anthony',
  ],
};

export const FACILITY_NAMES = {
  GRACES: "Grace's Home for the Aged",
  SAINT_ANTHONY: 'Saint Anthony de Padua Home Care Center',
};

/** The signed-in user's facility, stashed at login alongside the token. */
export const currentFacility = () => localStorage.getItem('facility') || null;

/**
 * Houses the signed-in user may choose from.
 *
 * Returns [] for an unknown facility rather than falling back to every house —
 * an empty dropdown is an obvious bug report, whereas a silent fallback would
 * quietly re-introduce the cross-facility leak this exists to prevent.
 */
export const housesForCurrentUser = () => FACILITY_HOUSES[currentFacility()] || [];

export const housesFor = (facility) => FACILITY_HOUSES[facility] || [];

/**
 * Whether "house" is a meaningful choice at the signed-in user's facility.
 *
 * Houses are a Grace's concept: it is split across six of them, so which house
 * a nurse or resident belongs to carries real information. Saint Anthony is a
 * single building — every one of its staff and residents is in the same place,
 * so a House column shows the same string on every row and a House dropdown
 * offers exactly one option. Both are noise, and worse, the dropdown implies a
 * decision that does not exist.
 *
 * Driven off the house count rather than a `=== 'GRACES'` check, so a second
 * single-house facility gets the right behaviour for free, and Grace's would
 * keep the column even if its house list changed.
 */
export const hasHouseChoice = () => housesForCurrentUser().length > 1;

/**
 * The house to use when there is no choice to offer, or null when the facility
 * genuinely has several.
 *
 * Edit forms seed from the STORED value, which is exactly how a Saint Anthony
 * nurse holding a Grace's house would keep it: the field is hidden, so nobody
 * can correct it, and saving would write the wrong value straight back. Seeding
 * from here instead makes every edit self-heal.
 */
export const soleHouse = () => {
  const houses = housesForCurrentUser();
  return houses.length === 1 ? houses[0] : null;
};

/** Which facility a house belongs to, or null if unrecognised. */
export const facilityForHouse = (house) =>
  Object.keys(FACILITY_HOUSES).find((f) => FACILITY_HOUSES[f].includes(house)) || null;
