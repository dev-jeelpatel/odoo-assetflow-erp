const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { recordActivity } = require('../utils/activityLog');
const { notifyUser } = require('../utils/notify');

const ALLOCATION_INCLUDE = {
  asset: { select: { id: true, assetTag: true, name: true, status: true } },
  employee: { select: { id: true, name: true, email: true } },
  department: { select: { id: true, name: true } },
};

const TRANSFER_INCLUDE = {
  asset: { select: { id: true, assetTag: true, name: true, status: true } },
  fromEmployee: { select: { id: true, name: true, email: true } },
  toEmployee: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true } },
};

async function getActiveAllocation(assetId) {
  return prisma.assetAllocation.findFirst({
    where: { assetId, returnedAt: null },
    include: ALLOCATION_INCLUDE,
    orderBy: { allocatedAt: 'desc' },
  });
}

async function allocateAsset(data, req) {
  const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
  if (!asset) throw ApiError.notFound('Asset not found');

  if (asset.status === 'ALLOCATED') {
    const current = await getActiveAllocation(asset.id);
    throw ApiError.conflict(
      `Asset is currently held by ${current?.employee?.name || current?.department?.name || 'another holder'}`,
      { currentHolder: current, showTransferButton: true }
    );
  }

  if (asset.status !== 'AVAILABLE') {
    throw ApiError.conflict(`Asset cannot be allocated while status is ${asset.status}`);
  }

  if (data.employeeId) {
    const employee = await prisma.user.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw ApiError.badRequest('Employee does not exist');
  }
  if (data.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!dept) throw ApiError.badRequest('Department does not exist');
  }

  const [allocation] = await prisma.$transaction([
    prisma.assetAllocation.create({
      data: {
        assetId: data.assetId,
        employeeId: data.employeeId,
        departmentId: data.departmentId,
        expectedReturnDate: data.expectedReturnDate,
      },
      include: ALLOCATION_INCLUDE,
    }),
    prisma.asset.update({ where: { id: data.assetId }, data: { status: 'ALLOCATED' } }),
  ]);

  await recordActivity({
    req,
    action: 'ALLOCATE',
    entity: 'Asset',
    entityId: data.assetId,
    newData: allocation,
  });

  if (data.employeeId) {
    await notifyUser({
      userId: data.employeeId,
      type: 'ASSET_ASSIGNED',
      title: 'Asset allocated to you',
      message: `${asset.name} (${asset.assetTag}) has been allocated to you.`,
      referenceId: allocation.id,
    });
  }

  return allocation;
}

async function returnAsset(allocationId, { condition, notes }, req) {
  const allocation = await prisma.assetAllocation.findUnique({
    where: { id: allocationId },
    include: ALLOCATION_INCLUDE,
  });
  if (!allocation) throw ApiError.notFound('Allocation not found');
  if (allocation.returnedAt) throw ApiError.conflict('This allocation has already been returned');

  const [updated] = await prisma.$transaction([
    prisma.assetAllocation.update({
      where: { id: allocationId },
      data: { returnedAt: new Date(), returnCondition: condition, returnNotes: notes },
      include: ALLOCATION_INCLUDE,
    }),
    prisma.asset.update({ where: { id: allocation.assetId }, data: { status: 'AVAILABLE', condition } }),
  ]);

  await recordActivity({
    req,
    action: 'RETURN',
    entity: 'Asset',
    entityId: allocation.assetId,
    oldData: { allocationId, returnedAt: null },
    newData: { returnedAt: updated.returnedAt, condition, notes },
  });

  return updated;
}

async function listAllocations(query) {
  const { assetId, employeeId, departmentId, active, overdue, page, pageSize } = query;

  const where = {
    ...(assetId && { assetId }),
    ...(employeeId && { employeeId }),
    ...(departmentId && { departmentId }),
    ...(active !== undefined && (active ? { returnedAt: null } : { returnedAt: { not: null } })),
    ...(overdue && {
      returnedAt: null,
      expectedReturnDate: { lt: new Date() },
    }),
  };

  const [items, total] = await Promise.all([
    prisma.assetAllocation.findMany({
      where,
      include: ALLOCATION_INCLUDE,
      orderBy: { allocatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.assetAllocation.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ── Transfers ──────────────────────────────────────────────

async function requestTransfer(data, req) {
  const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
  if (!asset) throw ApiError.notFound('Asset not found');
  if (asset.status !== 'ALLOCATED') {
    throw ApiError.conflict('Only currently allocated assets can be transferred');
  }

  const current = await getActiveAllocation(asset.id);
  const toEmployeeId = data.toEmployeeId || req.user.id;

  if (current?.employeeId === toEmployeeId) {
    throw ApiError.badRequest('Asset is already held by this employee');
  }

  const transfer = await prisma.assetTransfer.create({
    data: {
      assetId: data.assetId,
      fromEmployeeId: current?.employeeId,
      toEmployeeId,
      reason: data.reason,
      status: 'REQUESTED',
    },
    include: TRANSFER_INCLUDE,
  });

  await recordActivity({
    req,
    action: 'TRANSFER_REQUESTED',
    entity: 'AssetTransfer',
    entityId: transfer.id,
    newData: transfer,
  });

  return transfer;
}

async function approveTransfer(transferId, req) {
  const transfer = await prisma.assetTransfer.findUnique({ where: { id: transferId }, include: TRANSFER_INCLUDE });
  if (!transfer) throw ApiError.notFound('Transfer request not found');
  if (transfer.status !== 'REQUESTED') {
    throw ApiError.conflict(`Transfer request is already ${transfer.status}`);
  }

  const currentAllocation = await getActiveAllocation(transfer.assetId);

  const [, , updatedTransfer] = await prisma.$transaction([
    ...(currentAllocation
      ? [
          prisma.assetAllocation.update({
            where: { id: currentAllocation.id },
            data: { returnedAt: new Date() },
          }),
        ]
      : []),
    prisma.assetAllocation.create({
      data: { assetId: transfer.assetId, employeeId: transfer.toEmployeeId },
    }),
    prisma.assetTransfer.update({
      where: { id: transferId },
      data: { status: 'COMPLETED', approvedById: req.user.id },
      include: TRANSFER_INCLUDE,
    }),
  ]);

  await recordActivity({
    req,
    action: 'TRANSFER_APPROVED',
    entity: 'AssetTransfer',
    entityId: transferId,
    oldData: { status: 'REQUESTED' },
    newData: updatedTransfer,
  });

  if (transfer.toEmployeeId) {
    await notifyUser({
      userId: transfer.toEmployeeId,
      type: 'TRANSFER_APPROVED',
      title: 'Asset transfer approved',
      message: `Transfer for asset has been approved and re-allocated to you.`,
      referenceId: transferId,
    });
  }

  return updatedTransfer;
}

async function rejectTransfer(transferId, req) {
  const transfer = await prisma.assetTransfer.findUnique({ where: { id: transferId } });
  if (!transfer) throw ApiError.notFound('Transfer request not found');
  if (transfer.status !== 'REQUESTED') {
    throw ApiError.conflict(`Transfer request is already ${transfer.status}`);
  }

  const updated = await prisma.assetTransfer.update({
    where: { id: transferId },
    data: { status: 'REJECTED', approvedById: req.user.id },
    include: TRANSFER_INCLUDE,
  });

  await recordActivity({
    req,
    action: 'TRANSFER_REJECTED',
    entity: 'AssetTransfer',
    entityId: transferId,
    oldData: { status: 'REQUESTED' },
    newData: updated,
  });

  if (transfer.toEmployeeId) {
    await notifyUser({
      userId: transfer.toEmployeeId,
      type: 'TRANSFER_REJECTED',
      title: 'Asset transfer rejected',
      message: 'Your asset transfer request was rejected.',
      referenceId: transferId,
    });
  }

  return updated;
}

async function listTransfers(query) {
  const { assetId, status, page, pageSize } = query;
  const where = { ...(assetId && { assetId }), ...(status && { status }) };

  const [items, total] = await Promise.all([
    prisma.assetTransfer.findMany({
      where,
      include: TRANSFER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.assetTransfer.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

module.exports = {
  allocateAsset,
  returnAsset,
  listAllocations,
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  listTransfers,
};
