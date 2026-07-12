const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { listLogsQuerySchema } = require('./log.validation');
const service = require('./log.service');

const router = Router();

router.use(authenticate, authorize('ADMIN'));

router.get(
  '/',
  validate(listLogsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await service.listLogs(req.query));
  })
);

module.exports = router;
