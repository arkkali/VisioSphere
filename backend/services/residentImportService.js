const fs = require('fs');
const XLSX = require('xlsx');

const parseName = (fullName) => {
  const parts = fullName.toString().trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', middleName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1]
  };
};

exports.parseFile = (filePath, mimetype) => {
  const rows = [];

  if (mimetype === 'text/csv') {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const rawName = lines[i].split(',')[0].trim();
        if (rawName) rows.push({ rawName });
      }
    }
  } else {
    const workbook = XLSX.readFile(filePath);
    const rawJson = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
    for (let i = 1; i < rawJson.length; i++) {
      const rowData = rawJson[i];
      if (rowData && rowData.length > 0) {
        const rawName = String(rowData[0]).trim();
        if (rawName) rows.push({ rawName });
      }
    }
  }

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  return rows.map(row => ({
    originalName: row.rawName,
    ...parseName(row.rawName)
  }));
};