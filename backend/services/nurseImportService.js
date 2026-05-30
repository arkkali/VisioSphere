const fs = require('fs');
const XLSX = require('xlsx');
const Nurse = require('../models/Nurse');

const FIELD_MAP = {
  firstName:     ['First Name',     'firstName',     'FIRST NAME'],
  middleName:    ['Middle Name',    'middleName',    'MIDDLE NAME'],
  lastName:      ['Last Name',      'lastName',      'LAST NAME'],
  email:         ['Email',          'email',         'EMAIL'],
  houseAssigned: ['House Assigned', 'houseAssigned', 'HOUSE ASSIGNED'],
};

const resolveField = (row, keys) => keys.reduce((val, key) => val ?? row[key], undefined);

const parseRows = (filePath, mimetype) => {
  if (mimetype === 'text/csv') {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .slice(1)
      .filter(l => l.trim())
      .map(line => {
        const [firstName, middleName, lastName, email, houseAssigned] =
          line.split(',').map(c => c.trim());
        return { firstName, middleName, lastName, email, houseAssigned };
      });
  }
  const workbook = XLSX.readFile(filePath);
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
};

const createNurseFromRow = async (row) => {
  const firstName     = resolveField(row, FIELD_MAP.firstName);
  const middleName    = resolveField(row, FIELD_MAP.middleName) || '';
  const lastName      = resolveField(row, FIELD_MAP.lastName);
  const email         = resolveField(row, FIELD_MAP.email);
  const houseAssigned = resolveField(row, FIELD_MAP.houseAssigned);

  if (!firstName || !lastName || !email || !houseAssigned)
    throw new Error('Missing required fields');

  const nurseId = await Nurse.generateNurseId();
  return new Nurse({
    nurseId, firstName, middleName, lastName, email, houseAssigned,
    status: 'Active', isFirstLogin: true, password: null, assignedElders: []
  }).save();
};

exports.importFromFile = async (filePath, mimetype) => {
  const rows = parseRows(filePath, mimetype);
  const created = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      created.push(await createNurseFromRow(rows[i]));
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err.message}`);
    }
  }

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return { created, errors };
};