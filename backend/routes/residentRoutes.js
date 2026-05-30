const router = require('express').Router();
const ctrl = require('../controllers/residentController');
const { spreadsheetUpload } = require('../config/multer');
const { verifyToken } = require('../middleware/auth');
const { uploadLimiter, writeLimiter, readLimiter } = require('../config/rateLimiter');

router.get('/all',                                                    verifyToken, readLimiter,                ctrl.getAll);
router.get('/stats',                                                  verifyToken, readLimiter,                ctrl.getStats);
router.get('/stats/comparison',                                       verifyToken, readLimiter,                ctrl.getStatsComparison);
router.get('/nurse/:nurseId',                                         verifyToken, readLimiter,                ctrl.getByNurse);
router.get('/filter/house/:house',                                    verifyToken, readLimiter,                ctrl.getByHouse);
router.post('/add',                                                   verifyToken, writeLimiter,               ctrl.create);
router.post('/batch',                                                 verifyToken, writeLimiter,               ctrl.batchCreate);
router.post('/import', verifyToken, uploadLimiter, writeLimiter,      spreadsheetUpload.single('file'),        ctrl.importPreview);
router.get('/:id',                                                    verifyToken, readLimiter,                ctrl.getOne);
router.put('/:id',                                                    verifyToken, writeLimiter,               ctrl.update);
router.delete('/:id',                                                 verifyToken, writeLimiter,               ctrl.remove);

module.exports = router;