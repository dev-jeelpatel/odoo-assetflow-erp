const { Router } = require('express');
const controller = require('./audit.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  createAuditSchema,
  addAuditorSchema,
  verifyItemSchema,
  listAuditsQuerySchema,
} = require('./audit.validation');

const router = Router();

router.use(authenticate);

router.get('/', validate(listAuditsQuerySchema, 'query'), controller.listAudits);
router.get('/:id', controller.getAuditCycle);
router.get('/:id/discrepancies', controller.getDiscrepancyReport);

router.post('/', authorize('ADMIN', 'ASSET_MANAGER'), validate(createAuditSchema), controller.createAuditCycle);
router.post(
  '/:id/auditors',
  authorize('ADMIN', 'ASSET_MANAGER'),
  validate(addAuditorSchema),
  controller.addAuditor
);
router.patch('/:id/items/:itemId', validate(verifyItemSchema), controller.verifyItem);
router.post('/:id/close', authorize('ADMIN', 'ASSET_MANAGER'), controller.closeAuditCycle);

module.exports = router;
