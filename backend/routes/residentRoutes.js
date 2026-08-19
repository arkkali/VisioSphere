const router = require('express').Router();
const ctrl = require('../controllers/residentController');
const { spreadsheetUpload } = require('../config/multer');
const { verifyToken, authorizeRoles } = require('../middleware/auth');
const { uploadLimiter, writeLimiter, readLimiter } = require('../config/rateLimiter');

// Act 4: new resource-style, paginated list. GET /all kept below, unpaginated,
// because the current frontend's Elders page still calls it directly (safety note: don't break the client).
router.get('/',                                                       verifyToken, readLimiter,                ctrl.getPaginated);
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
// Act 5: Facility-Admin-only. Deleting a resident record was previously only hidden in the UI
// (BulkActionBar hides Delete when isNurseView) — the server accepted any valid token regardless
// of role. authorizeRoles existed in middleware/auth.js but was never wired into any route.
router.delete('/:id',                                                 verifyToken, authorizeRoles('Facility Admin'), writeLimiter, ctrl.remove);

module.exports = router;