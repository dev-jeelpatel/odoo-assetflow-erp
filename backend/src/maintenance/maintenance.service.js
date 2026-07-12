const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { recordActivity } = require('../utils/activityLog');
const { notifyUser } = require('../utils/notify');

const MAINTENANCE_INCLUDE = {
  asset: { select: { id: true, assetTag: true, name: true, status: true } },
  raisedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true } },
  attachments: true,
};

async function raiseRequest(data, req) {
  const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
  if (!asset) throw ApiError.notFound('Asset not found');

  const request = await prisma.maintenanceRequest.create({
    data: {
      assetId: data.assetId,
      raisedById: req.user.id,
      issue: data.issue,
      priority: data.priority,
      status: 'PENDING',
      ...(data.attachments?.length && {
        attachments: {
          create: data.attachments.map((a) => ({ ...a, type: 'MAINTENANCE_ATTACHMENT' })),
        },
      }),
    },
    include: MAINTENANCE_INCLUDE,
  });

  await recordActivity({
    req,
    action: 'RAISE',
    entity: 'MaintenanceRequest',
    entityId: request.id,
    newData: request,
  });

  return request;
}

async function listMaintenance(query) {
  const { assetId, status, priority, raisedById, page, pageSize } = query;
  const where = {
    ...(assetId && { assetId }),
    ...(status && { status }),
    ...(priority && { priority }),
    ...(raisedById && { raisedById }),
  };

  const [items, total] = await Promise.all([
    prisma.maintenanceRequest.findMany({
      where,
      include: MAINTENANCE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.maintenanceRequest.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

async function getMaintenance(id) {
  const request = await prisma.maintenanceRequest.findUnique({ where: { id }, include: MAINTENANCE_INCLUDE });
  if (!request) throw ApiError.notFound('Maintenance request not found');
  return request;
}

function assertStatus(request, expected) {
  if (request.status !== expected) {
    throw ApiError.conflict(`Request must be ${expected} for this action (currently ${request.status})`);
  }
}

async function approveRequest(id, req) {
  const request = await getMaintenance(id);
  assertStatus(request, 'PENDING');

  const [, updated] = await prisma.$transaction([
    prisma.asset.update({ where: { id: request.assetId }, data: { status: 'UNDER_MAINTENANCE' } }),
    prisma.maintenanceRequest.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: req.user.id },
      include: MAINTENANCE_INCLUDE,
    }),
  ]);

  await recordActivity({
    req,
    action: 'APPROVE',
    entity: 'MaintenanceRequest',
    entityId: id,
    oldData: { status: 'PENDING' },
    newData: updated,
  });

  await notifyUser({
    userId: request.raisedById,
    type: 'MAINTENANCE_UPDATE',
    title: 'Maintenance request approved',
    message: `Your maintenance request for ${request.asset.name} was approved.`,
    referenceId: id,
  });

  return updated;
}

async function rejectRequest(id, req) {
  const request = await getMaintenance(id);
  assertStatus(request, 'PENDING');

  const updated = await prisma.maintenanceRequest.update({
    where: { id },
    data: { status: 'REJECTED', approvedById: req.user.id },
    include: MAINTENANCE_INCLUDE,
  });

  await recordActivity({
    req,
    action: 'REJECT',
    entity: 'MaintenanceRequest',
    entityId: id,
    oldData: { status: 'PENDING' },
    newData: updated,
  });

  await notifyUser({
    userId: request.raisedById,
    type: 'MAINTENANCE_UPDATE',
    title: 'Maintenance request rejected',
    message: `Your maintenance request for ${request.asset.name} was rejected.`,
    referenceId: id,
  });

  return updated;
}

async function assignTechnician(id, { technicianName }, req) {
  const request = await getMaintenance(id);
  assertStatus(request, 'APPROVED');

  const updated = await prisma.maintenanceRequest.update({
    where: { id },
    data: { status: 'TECHNICIAN_ASSIGNED', technicianName },
    include: MAINTENANCE_INCLUDE,
  });

  await recordActivity({
    req,
    action: 'ASSIGN_TECHNICIAN',
    entity: 'MaintenanceRequest',
    entityId: id,
    oldData: { status: 'APPROVED' },
    newData: updated,
  });

  return updated;
}

async function startProgress(id, req) {
  const request = await getMaintenance(id);
  assertStatus(request, 'TECHNICIAN_ASSIGNED');

  const updated = await prisma.maintenanceRequest.update({
    where: { id },
    data: { status: 'IN_PROGRESS' },
    include: MAINTENANCE_INCLUDE,
  });

  await recordActivity({
    req,
    action: 'START_PROGRESS',
    entity: 'MaintenanceRequest',
    entityId: id,
    oldData: { status: 'TECHNICIAN_ASSIGNED' },
    newData: updated,
  });

  return updated;
}

async function resolveRequest(id, { resolutionNotes }, req) {
  const request = await getMaintenance(id);
  if (!['TECHNICIAN_ASSIGNED', 'IN_PROGRESS'].includes(request.status)) {
    throw ApiError.conflict(
      `Request must be TECHNICIAN_ASSIGNED or IN_PROGRESS to resolve (currently ${request.status})`
    );
  }

  const [, updated] = await prisma.$transaction([
    prisma.asset.update({ where: { id: request.assetId }, data: { status: 'AVAILABLE' } }),
    prisma.maintenanceRequest.update({
      where: { id },
      data: { status: 'RESOLVED', resolutionNotes, resolvedAt: new Date() },
      include: MAINTENANCE_INCLUDE,
    }),
  ]);

  await recordActivity({
    req,
    action: 'RESOLVE',
    entity: 'MaintenanceRequest',
    entityId: id,
    oldData: { status: request.status },
    newData: updated,
  });

  await notifyUser({
    userId: request.raisedById,
    type: 'MAINTENANCE_UPDATE',
    title: 'Maintenance resolved',
    message: `Maintenance for ${request.asset.name} has been resolved. The asset is available again.`,
    referenceId: id,
  });

  return updated;
}

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
