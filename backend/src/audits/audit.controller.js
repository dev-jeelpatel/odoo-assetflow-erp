const asyncHandler = require('../utils/asyncHandler');
const service = require('./audit.service');

const createAuditCycle = asyncHandler(async (req, res) => {
  res.status(201).json({ audit: await service.createAuditCycle(req.body, req) });
});

const listAudits = asyncHandler(async (req, res) => {
  res.json(await service.listAudits(req.query));
});

const getAuditCycle = asyncHandler(async (req, res) => {
  res.json({ audit: await service.getAuditCycle(req.params.id) });
});

const addAuditor = asyncHandler(async (req, res) => {
  res.status(201).json({ audit: await service.addAuditor(req.params.id, req.body.userId, req) });
});

const verifyItem = asyncHandler(async (req, res) => {
  res.json({ item: await service.verifyItem(req.params.id, req.params.itemId, req.body, req) });
});

const closeAuditCycle = asyncHandler(async (req, res) => {
  res.json(await service.closeAuditCycle(req.params.id, req));
});

const getDiscrepancyReport = asyncHandler(async (req, res) => {
  res.json({ discrepancies: await service.getDiscrepancyReport(req.params.id) });
});

module.exports = { createAuditCycle, listAudits, getAuditCycle, addAuditor, verifyItem, closeAuditCycle, getDiscrepancyReport };
