/**
 * idRoles.js — work out the ROLE (and, where the prefix says so, the FACILITY)
 * behind an id.
 *
 * Ids encode facility + role in their prefix:
 *
 *                  Graces        Saint Anthony
 *   Admin          A-<yr><nn>    STA-<yr><nn>
 *   Nurse          N-<yr><nn>    STN-<yr><nn>
 *   Guardian       G-<yr><nn>    STG-<yr><nn>
 *   Resident       E-<yy><mm><nn>  (shared by both facilities)
 *
 * Nothing here may be hardcoded to a single prefix. A `startsWith('A-')` check
 * is what rejected STA-202601 at login with "Invalid format or credentials
 * provided", and a `startsWith('N-')` check would now do the same to STN- ids.
 *
 * Keep in sync with backend/config/facilities.js `idPrefixes`, which is
 * authoritative — the backend validates against it.
 */

/** prefix → { facility, role }. facility null = shared by both facilities. */
export const PREFIX_INDEX = {
  A:   { facility: 'GRACES',        role: 'admin'    },
  N:   { facility: 'GRACES',        role: 'nurse'    },
  G:   { facility: 'GRACES',        role: 'guardian' },
  STA: { facility: 'SAINT_ANTHONY', role: 'admin'    },
  STN: { facility: 'SAINT_ANTHONY', role: 'nurse'    },
  STG: { facility: 'SAINT_ANTHONY', role: 'guardian' },
  E:   { facility: null,            role: 'resident' },
};

const clean = (id) => String(id ?? '').trim().toUpperCase();

/** Every id: 1-4 capital letters, hyphen, then 6 digits. */
const ID_SHAPE = /^[A-Z]{1,4}-\d{6}$/;

const prefixOf = (id) => {
  const v = clean(id);
  const m = v.match(/^([A-Z]{1,4})-/);
  return ID_SHAPE.test(v) && m ? m[1] : null;
};

/** { prefix, facility, role } or null when the id is unrecognised. */
export const describeId = (id) => {
  const prefix = prefixOf(id);
  if (!prefix) return null;
  const meta = PREFIX_INDEX[prefix];
  return meta ? { prefix, ...meta } : null;
};

export const roleOf = (id) => describeId(id)?.role || null;

/** Facility implied by the id, or null for shared/unknown prefixes. */
export const facilityOf = (id) => describeId(id)?.facility || null;

export const isNurseId    = (id) => roleOf(id) === 'nurse';
export const isGuardianId = (id) => roleOf(id) === 'guardian';
export const isResidentId = (id) => roleOf(id) === 'resident';
export const isAdminId    = (id) => roleOf(id) === 'admin';

export const isEmail = (value) => String(value ?? '').includes('@');

/** 'nurse' | 'guardian' | 'resident' | 'admin' | 'email' | null */
export const roleFromId = (id) => (isEmail(id) ? 'email' : roleOf(id));

/** True when the value could be a sign-in identifier at all. */
export const isValidLoginIdentifier = (value) =>
  isEmail(value) || isNurseId(value) || isAdminId(value);
