const auditService = require('../services/auditService');

const getAll = async (req, res, next) => {
  try {
    const logs = await auditService.getAll();
    res.status(200).json(logs);
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const log = await auditService.create(req.body);
    res.status(201).json(log);
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, create };