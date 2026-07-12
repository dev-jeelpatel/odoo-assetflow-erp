const QRCode = require('qrcode');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { recordActivity } = require('../utils/activityLog');

const ASSET_TAG_PREFIX = 'AF-';
const ASSET_TAG_PAD = 4;

// Manually-triggered transitions an Admin/Asset Manager may apply directly.
// Transitions driven by the allocation/maintenance/audit workflows are enforced
// in their own services, not here.
const ALLOWED_MANUAL_TRANSITIONS = {
  AVAILABLE: ['UNDER_MAINTENANCE', 'RESERVED', 'LOST', 'RETIRED', 'DISPOSED'],
  UNDER_MAINTENANCE: ['AVAILABLE'],
  RESERVED: ['AVAILABLE'],
  LOST: ['AVAILABLE', 'RETIRED', 'DISPOSED'],
  RETIRED: ['DISPOSED', 'AVAILABLE'],
  ALLOCATED: [],
  DISPOSED: [],
};

const HISTORY_INCLUDE = {
  category: true,
  department: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  allocations: {
    orderBy: { allocatedAt: 'desc' },
    include: {
      employee: { select: { id: true, name: true, email: true } },
      department: { select: { id: true, name: true } },
    },
  },
  transfers: {
    orderBy: { createdAt: 'desc' },
    include: {
      fromEmployee: { select: { id: true, name: true } },
      toEmployee: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  },
  maintenanceRequests: {
    orderBy: { createdAt: 'desc' },
    include: {
      raisedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  },
  attachments: true,
};

async function nextAssetTag() {
  const row = await prisma.assetTagSequence.create({ data: {} });
  return `${ASSET_TAG_PREFIX}${String(row.id).padStart(ASSET_TAG_PAD, '0')}`;
}

async function generateQrCode(assetTag) {
  return QRCode.toDataURL(`ASSETFLOW:${assetTag}`);
}

async function createAsset(data, req) {
  if (data.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!dept) throw ApiError.badRequest('Department does not exist');
  }
  const category = await prisma.assetCategory.findUnique({ where: { id: data.categoryId } });
  if (!category) throw ApiError.badRequest('Asset category does not exist');

  const assetTag = await nextAssetTag();
  const qrCode = await generateQrCode(assetTag);

  const asset = await prisma.asset.create({
    data: {
      ...data,
      assetTag,
      qrCode,
      status: 'AVAILABLE',
      createdById: req.user.id,
    },
    include: HISTORY_INCLUDE,
  });

  await recordActivity({ req, action: 'CREATE', entity: 'Asset', entityId: asset.id, newData: asset });
  return asset;
}

async function listAssets(query) {
  const { search, assetTag, serialNumber, categoryId, status, departmentId, location, isBookable, page, pageSize } =
    query;

  const where = {
    ...(assetTag && { assetTag: { contains: assetTag } }),
    ...(serialNumber && { serialNumber: { contains: serialNumber } }),
    ...(categoryId && { categoryId }),
    ...(status && { status }),
    ...(departmentId && { departmentId }),
    ...(location && { location: { contains: location } }),
    ...(isBookable !== undefined && { isBookable }),
    ...(search && {
      OR: [
        { name: { contains: search } },
        { assetTag: { contains: search } },
        { serialNumber: { contains: search } },
        { location: { contains: search } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.asset.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

async function getAsset(id) {
  const asset = await prisma.asset.findUnique({ where: { id }, include: HISTORY_INCLUDE });
  if (!asset) throw ApiError.notFound('Asset not found');
  return asset;
}

async function getAssetByTagOrQr(code) {
  const asset = await prisma.asset.findFirst({
    where: { OR: [{ assetTag: code }, { serialNumber: code }] },
    include: HISTORY_INCLUDE,
  });
  if (!asset) throw ApiError.notFound('No asset matches that tag / serial / QR code');
  return asset;
}

async function updateAsset(id, data, req) {
  const existing = await getAsset(id);

  if (data.categoryId) {
    const category = await prisma.assetCategory.findUnique({ where: { id: data.categoryId } });
    if (!category) throw ApiError.badRequest('Asset category does not exist');
  }
  if (data.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!dept) throw ApiError.badRequest('Department does not exist');
  }

  const asset = await prisma.asset.update({ where: { id }, data, include: HISTORY_INCLUDE });

  await recordActivity({
    req,
    action: 'UPDATE',
    entity: 'Asset',
    entityId: id,
    oldData: existing,
    newData: asset,
  });
  return asset;
}

async function changeStatus(id, { status, reason }, req) {
  const existing = await getAsset(id);

  const allowed = ALLOWED_MANUAL_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(status)) {
    throw ApiError.conflict(
      `Cannot transition asset from ${existing.status} to ${status}. Allowed: ${allowed.join(', ') || 'none'}`
    );
  }

  const asset = await prisma.asset.update({ where: { id }, data: { status }, include: HISTORY_INCLUDE });

  await recordActivity({
    req,
    action: 'STATUS_CHANGE',
    entity: 'Asset',
    entityId: id,
    oldData: { status: existing.status },
    newData: { status: asset.status, reason },
  });
  return asset;
}

module.exports = {
  createAsset,
  listAssets,
  getAsset,
  getAssetByTagOrQr,
  updateAsset,
  changeStatus,
  ALLOWED_MANUAL_TRANSITIONS,
};
