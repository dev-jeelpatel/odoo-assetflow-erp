const asyncHandler = require('../utils/asyncHandler');
const assetService = require('./asset.service');

const createAsset = asyncHandler(async (req, res) => {
  res.status(201).json({ asset: await assetService.createAsset(req.body, req) });
});

const listAssets = asyncHandler(async (req, res) => {
  res.json(await assetService.listAssets(req.query));
});

const getAsset = asyncHandler(async (req, res) => {
  res.json({ asset: await assetService.getAsset(req.params.id) });
});

const lookupAsset = asyncHandler(async (req, res) => {
  res.json({ asset: await assetService.getAssetByTagOrQr(req.params.code) });
});

const updateAsset = asyncHandler(async (req, res) => {
  res.json({ asset: await assetService.updateAsset(req.params.id, req.body, req) });
});

const changeStatus = asyncHandler(async (req, res) => {
  res.json({ asset: await assetService.changeStatus(req.params.id, req.body, req) });
});

module.exports = { createAsset, listAssets, getAsset, lookupAsset, updateAsset, changeStatus };
