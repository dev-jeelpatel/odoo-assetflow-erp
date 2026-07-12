const { Router } = require('express');
const controller = require('./asset.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  createAssetSchema,
  updateAssetSchema,
  changeStatusSchema,
  listAssetsQuerySchema,
} = require('./asset.validation');

const router = Router();

router.use(authenticate);

router.get('/', validate(listAssetsQuerySchema, 'query'), controller.listAssets);
router.get('/lookup/:code', controller.lookupAsset);
router.get('/:id', controller.getAsset);

router.post('/', authorize('ASSET_MANAGER'), validate(createAssetSchema), controller.createAsset);
router.patch('/:id', authorize('ASSET_MANAGER'), validate(updateAssetSchema), controller.updateAsset);
router.patch(
  '/:id/status',
  authorize('ASSET_MANAGER'),
  validate(changeStatusSchema),
  controller.changeStatus
);

module.exports = router;
