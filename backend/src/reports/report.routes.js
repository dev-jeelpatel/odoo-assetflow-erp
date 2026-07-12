const { Router } = require('express');
const controller = require('./report.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { utilizationQuerySchema, retirementQuerySchema } = require('./report.validation');

const router = Router();

router.use(authenticate);

router.get('/dashboard', controller.getDashboard);

router.use(authorize('ADMIN', 'ASSET_MANAGER'));
router.get('/utilization', validate(utilizationQuerySchema, 'query'), controller.getUtilization);
router.get('/maintenance-frequency', controller.getMaintenanceFrequency);
router.get('/department-allocation', controller.getDepartmentAllocationSummary);
router.get('/booking-heatmap', controller.getBookingHeatmap);
router.get('/nearing-retirement', validate(retirementQuerySchema, 'query'), controller.getNearingRetirement);

module.exports = router;
