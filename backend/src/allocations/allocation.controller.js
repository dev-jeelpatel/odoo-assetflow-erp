const asyncHandler = require('../utils/asyncHandler');
const allocationService = require('./allocation.service');

const allocateAsset = asyncHandler(async (req, res) => {
  res.status(201).json({ allocation: await allocationService.allocateAsset(req.body, req) });
});

const returnAsset = asyncHandler(async (req, res) => {
  res.json({ allocation: await allocationService.returnAsset(req.params.id, req.body, req) });
});

const listAllocations = asyncHandler(async (req, res) => {
  res.json(await allocationService.listAllocations(req.query));
});

const requestTransfer = asyncHandler(async (req, res) => {
  res.status(201).json({ transfer: await allocationService.requestTransfer(req.body, req) });
});

const approveTransfer = asyncHandler(async (req, res) => {
  res.json({ transfer: await allocationService.approveTransfer(req.params.id, req) });
});

const rejectTransfer = asyncHandler(async (req, res) => {
  res.json({ transfer: await allocationService.rejectTransfer(req.params.id, req) });
});

const listTransfers = asyncHandler(async (req, res) => {
  res.json(await allocationService.listTransfers(req.query));
});

module.exports = {
  allocateAsset,
  returnAsset,
  listAllocations,
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  listTransfers,
};
