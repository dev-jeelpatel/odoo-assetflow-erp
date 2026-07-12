const asyncHandler = require('../utils/asyncHandler');
const service = require('./maintenance.service');

const raiseRequest = asyncHandler(async (req, res) => {
  res.status(201).json({ request: await service.raiseRequest(req.body, req) });
});

const listMaintenance = asyncHandler(async (req, res) => {
  res.json(await service.listMaintenance(req.query));
});

const getMaintenance = asyncHandler(async (req, res) => {
  res.json({ request: await service.getMaintenance(req.params.id) });
});

const approveRequest = asyncHandler(async (req, res) => {
  res.json({ request: await service.approveRequest(req.params.id, req) });
});

const rejectRequest = asyncHandler(async (req, res) => {
  res.json({ request: await service.rejectRequest(req.params.id, req) });
});

const assignTechnician = asyncHandler(async (req, res) => {
  res.json({ request: await service.assignTechnician(req.params.id, req.body, req) });
});

const startProgress = asyncHandler(async (req, res) => {
  res.json({ request: await service.startProgress(req.params.id, req) });
});

const resolveRequest = asyncHandler(async (req, res) => {
  res.json({ request: await service.resolveRequest(req.params.id, req.body, req) });
});

module.exports = {
  raiseRequest,
  listMaintenance,
  getMaintenance,
  approveRequest,
  rejectRequest,
  assignTechnician,
  startProgress,
  resolveRequest,
};
