/**
 * idRoles.js — work out which KIND of account an id refers to.
 *
 * VisioSphere ids encode ROLE in their prefix:
 *
 *   N-<year><nn>    Nurse        (Admin.generateCustomId / Nurse.generateNurseId)
 *   G-<year><nn>    Guardian     (Guardian.generateGuardianId)
 *   E-<yy><mm><nn>  Resident     (Resident.generateResidentId)
 *   <prefix>-<6>    Facility Admin
 *
 * The admin prefix is NOT fixed. It varies per facility — `A-` for Grace's
 * Home, `STA-` for Saint Anthony — and more can be added in
 * backend/config/facilities.js. So admin detection must be "not one of the
 * other roles", never a hardcoded `startsWith('A-')`.
 *
 * That hardcoded check is exactly what made STA-202601 fail login with
 * "Invalid format or credentials provided" before the request was even sent.
 *
 * IMPORTANT: the prefix tells you the ROLE, never the FACILITY. Facility comes
 * from the `facility` claim in the JWT — see constants/houses.js. Do not try to
 * infer tenancy from an id here.
 */

const clean = (id) => String(id ?? '').trim().toUpperCase();

/** Shape shared by every id: 1-4 capital letters, hyphen, 6 digits. */
const ID_SHAPE = /^[A-Z]{1,4}-\d{6}$/;

export const isNurseId    = (id) => /^N-/.test(clean(id));
export const isGuardianId = (id) => /^G-/.test(clean(id));
export const isResidentId = (id) => /^E-/.test(clean(id));

/** Any well-formed id that is not a nurse, guardian or resident. */
export const isAdminId = (id) => {
  const v = clean(id);
  return ID_SHAPE.test(v) && !isNurseId(v) && !isGuardianId(v) && !isResidentId(v);
};

export const isEmail = (value) => String(value ?? '').includes('@');

/** 'nurse' | 'guardian' | 'resident' | 'admin' | 'email' | null */
export const roleFromId = (id) => {
  if (isEmail(id))      return 'email';
  if (isNurseId(id))    return 'nurse';
  if (isGuardianId(id)) return 'guardian';
  if (isResidentId(id)) return 'resident';
  if (isAdminId(id))    return 'admin';
  return null;
};

/** True when the value could be a sign-in identifier at all. */
export const isValidLoginIdentifier = (value) =>
  isEmail(value) || isNurseId(value) || isAdminId(value);
