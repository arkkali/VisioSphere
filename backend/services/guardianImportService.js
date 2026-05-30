const fs = require('fs');
const XLSX = require('xlsx');
const Guardian = require('../models/Guardian');

const FIELD_MAP = {
  firstName:  ['First Name',  'firstName',  'FIRST NAME'],
  middleName: ['Middle Name', 'middleName', 'MIDDLE NAME'],
  lastName:   ['Last Name',   'lastName',   'LAST NAME'],
  email:      ['Email',       'email',      'EMAIL'],
  phone:      ['Phone',       'phone',      'PHONE'],
  gender:     ['Gender (M/F)','gender',     'GENDER'],
};

const resolveField = (row, keys) => keys.reduce((val, key) => val ?? row[key], undefined);

const parseRows = (filePath, mimetype) => {
  if (mimetype === 'text/csv') {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n').slice(1)
      .filter(l => l.trim())
      .map(line => {
        const [firstName, middleName, lastName, email, phone, gender] =
          line.split(',').map(c => c.trim());
        return { firstName, middleName, lastName, email, phone, gender };
      });
  }
  const workbook = XLSX.readFile(filePath);
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
};

const createGuardianFromRow = async (row) => {
  const firstName  = resolveField(row, FIELD_MAP.firstName);
  const middleName = resolveField(row, FIELD_MAP.middleName) || '';
  const lastName   = resolveField(row, FIELD_MAP.lastName);
  const email      = resolveField(row, FIELD_MAP.email);
  const phone      = resolveField(row, FIELD_MAP.phone) || '';
  const gender     = resolveField(row, FIELD_MAP.gender) || '';

  if (!firstName || !lastName || !email)
    throw new Error('Missing required fields (First Name, Last Name, Email)');

  if (gender && !['M', 'F'].includes(gender.toUpperCase()))
    throw new Error('Invalid gender (must be M or F)');

  const guardianId = await Guardian.generateGuardianId();
  return new Guardian({
    guardianId, firstName, middleName, lastName, email, phone,
    gender: gender ? gender.toUpperCase() : '',
    status: 'PENDING', isPasswordSet: false, password: null, isFirstLogin: true
  }).save();
};

exports.importFromFile = async (filePath, mimetype) => {
  const rows = parseRows(filePath, mimetype);
  const created = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      created.push(await createGuardianFromRow(rows[i]));
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err.message}`);
    }
  }

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return { created, errors };
};