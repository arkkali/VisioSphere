const residentService = require('../services/residentService');
const residentImportService = require('../services/residentImportService');

exports.getAll = async (req, res, next) => {
  try {
    res.status(200).json(await residentService.getAll());
  } catch (err) { next(err); }
};

exports.getByNurse = async (req, res, next) => {
  try {
    res.status(200).json(await residentService.getByNurse(req.params.nurseId));
  } catch (err) { next(err); }
};

exports.getByHouse = async (req, res, next) => {
  try {
    res.status(200).json(await residentService.getByHouse(req.params.house));
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    res.status(200).json(await residentService.getStats());
  } catch (err) { next(err); }
};

exports.getStatsComparison = async (req, res, next) => {
  try {
    res.status(200).json(await residentService.getStatsComparison());
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    res.status(200).json(await residentService.getOne(req.params.id));
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const resident = await residentService.create(req.body);
    res.status(201).json({ message: 'Resident added successfully!', resident });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const resident = await residentService.update(req.params.id, req.body);
    res.status(200).json({ message: 'Resident updated successfully!', resident });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const resident = await residentService.remove(req.params.id);
    res.status(200).json({ message: 'Resident deleted successfully!', resident });
  } catch (err) { next(err); }
};

exports.batchCreate = async (req, res, next) => {
  try {
    const { residents } = req.body;
    const { created, errors } = await residentService.batchCreate(residents);
    res.status(201).json({
      message: `Successfully imported ${created.length} resident(s)`,
      importedCount: created.length,
      residents: created,
      errors: errors.length ? errors : undefined
    });
  } catch (err) { next(err); }
};

exports.importPreview = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const rows = residentImportService.parseFile(req.file.path, req.file.mimetype);
    if (rows.length === 0) return res.status(400).json({ message: 'No data found in file' });
    res.status(200).json({
      message: 'File parsed successfully for preview',
      rowCount: rows.length,
      rows
    });
  } catch (err) { next(err); }
};