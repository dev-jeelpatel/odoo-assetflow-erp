const asyncHandler = require('../utils/asyncHandler');
const { sendCsv } = require('../utils/csv');
const service = require('./report.service');

const getDashboard = asyncHandler(async (req, res) => {
  res.json(await service.getDashboard(req.user));
});

const getUtilization = asyncHandler(async (req, res) => {
  const data = await service.getUtilization(req.query);
  if (req.query.format === 'csv') return sendCsv(res, 'utilization.csv', data.mostUsed);
  res.json(data);
});

const getMaintenanceFrequency = asyncHandler(async (req, res) => {
  const data = await service.getMaintenanceFrequency();
  if (req.query.format === 'csv') return sendCsv(res, 'maintenance-frequency.csv', data.perAsset);
  res.json(data);
});

const getDepartmentAllocationSummary = asyncHandler(async (req, res) => {
  const data = await service.getDepartmentAllocationSummary();
  if (req.query.format === 'csv') return sendCsv(res, 'department-allocation.csv', data);
  res.json({ departments: data });
});

const getBookingHeatmap = asyncHandler(async (req, res) => {
  const data = await service.getBookingHeatmap();
  if (req.query.format === 'csv') return sendCsv(res, 'booking-heatmap.csv', data);
  res.json({ heatmap: data });
});

const getNearingRetirement = asyncHandler(async (req, res) => {
  const data = await service.getNearingRetirement(req.query);
  if (req.query.format === 'csv') return sendCsv(res, 'nearing-retirement.csv', data);
  res.json({ assets: data });
});

module.exports = {
  getDashboard,
  getUtilization,
  getMaintenanceFrequency,
  getDepartmentAllocationSummary,
  getBookingHeatmap,
  getNearingRetirement,
};
