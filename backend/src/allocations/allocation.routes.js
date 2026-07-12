const { Router } = require('express');
const controller = require('./allocation.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  allocateAssetSchema,
  returnAssetSchema,
  requestTransferSchema,
  listAllocationsQuerySchema,
  listTransfersQuerySchema,
} = require('./allocation.validation');

const router = Router();

router.use(authenticate);

router.get('/', validate(listAllocationsQuerySchema, 'query'), controller.listAllocations);
router.post('/', authorize('ASSET_MANAGER'), validate(allocateAssetSchema), controller.allocateAsset);
router.post(
  '/:id/return',
  authorize('ASSET_MANAGER'),
  validate(returnAssetSchema),
  controller.returnAsset
);

router.get('/transfers', validate(listTransfersQuerySchema, 'query'), controller.listTransfers);
router.post('/transfers', validate(requestTransferSchema), controller.requestTransfer);
router.patch(
  '/transfers/:id/approve',
  authorize('ASSET_MANAGER', 'DEPARTMENT_HEAD'),
  controller.approveTransfer
);
router.patch(
  '/transfers/:id/reject',
  authorize('ASSET_MANAGER', 'DEPARTMENT_HEAD'),
  controller.rejectTransfer
);

module.exports = router;
