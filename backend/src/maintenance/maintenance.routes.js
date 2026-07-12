const { Router } = require('express');
const controller = require('./maintenance.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  raiseRequestSchema,
  assignTechnicianSchema,
  resolveSchema,
  listMaintenanceQuerySchema,
} = require('./maintenance.validation');

const router = Router();

router.use(authenticate);

router.get('/', validate(listMaintenanceQuerySchema, 'query'), controller.listMaintenance);
router.get('/:id', controller.getMaintenance);
router.post('/', validate(raiseRequestSchema), controller.raiseRequest);

router.patch('/:id/approve', authorize('ASSET_MANAGER'), controller.approveRequest);
router.patch('/:id/reject', authorize('ASSET_MANAGER'), controller.rejectRequest);
router.patch(
  '/:id/assign-technician',
  authorize('ASSET_MANAGER'),
  validate(assignTechnicianSchema),
  controller.assignTechnician
);
router.patch('/:id/start', authorize('ASSET_MANAGER'), controller.startProgress);
router.patch('/:id/resolve', authorize('ASSET_MANAGER'), validate(resolveSchema), controller.resolveRequest);

module.exports = router;
