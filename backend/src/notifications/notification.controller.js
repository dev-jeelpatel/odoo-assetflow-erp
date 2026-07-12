const asyncHandler = require('../utils/asyncHandler');
const service = require('./notification.service');

const listNotifications = asyncHandler(async (req, res) => {
  res.json(await service.listNotifications(req.user.id, req.query));
});

const markAsRead = asyncHandler(async (req, res) => {
  res.json({ notification: await service.markAsRead(req.params.id, req.user.id) });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  await service.markAllAsRead(req.user.id);
  res.status(204).send();
});

module.exports = { listNotifications, markAsRead, markAllAsRead };
