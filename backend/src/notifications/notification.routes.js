const { Router } = require('express');
const controller = require('./notification.controller');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { listNotificationsQuerySchema } = require('./notification.validation');

const router = Router();

router.use(authenticate);

router.get('/', validate(listNotificationsQuerySchema, 'query'), controller.listNotifications);
router.patch('/read-all', controller.markAllAsRead);
router.patch('/:id/read', controller.markAsRead);

module.exports = router;
