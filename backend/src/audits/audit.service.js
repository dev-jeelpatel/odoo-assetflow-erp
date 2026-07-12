const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { recordActivity } = require('../utils/activityLog');
const { notifyUser } = require('../utils/notify');

const AUDIT_INCLUDE = {
  department: { select: { id: true, name: true } },
  auditors: { include: { user: { select: { id: true, name: true, email: true } } } },
  items: {
    include: { asset: { select: { id: true, assetTag: true, name: true, location: true, status: true } } },
  },
};

async function createAuditCycle(data, req) {
  if (data.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!dept) throw ApiError.badRequest('Department does not exist');
  }

  const auditors = await prisma.user.findMany({ where: { id: { in: data.auditorIds } } });
  if (auditors.length !== data.auditorIds.length) {
    throw ApiError.badRequest('One or more auditors do not exist');
  }

  const assetsInScope = await prisma.asset.findMany({
    where: {
      status: { notIn: ['DISPOSED'] },
      ...(data.departmentId && { departmentId: data.departmentId }),
      ...(data.location && { location: { contains: data.location, mode: 'insensitive' } }),
    },
    select: { id: true, location: true },
  });

  const cycle = await prisma.auditCycle.create({
    data: {
      title: data.title,
      description: data.description,
      departmentId: data.departmentId,
      location: data.location,
      startDate: data.startDate,
      endDate: data.endDate,
      auditors: { create: data.auditorIds.map((userId) => ({ userId })) },
      items: {
        create: assetsInScope.map((asset) => ({
          assetId: asset.id,
          expectedLocation: asset.location,
        })),
      },
    },
    include: AUDIT_INCLUDE,
  });

  await recordActivity({ req, action: 'CREATE', entity: 'AuditCycle', entityId: cycle.id, newData: cycle });

  await Promise.all(
    data.auditorIds.map((userId) =>
      notifyUser({
        userId,
        type: 'AUDIT_DISCREPANCY',
        title: 'Assigned to audit cycle',
        message: `You have been assigned as an auditor for "${cycle.title}".`,
        referenceId: cycle.id,
      })
    )
  );

  return cycle;
}

async function listAudits(query) {
  const { departmentId, isClosed, page, pageSize } = query;
  const where = { ...(departmentId && { departmentId }), ...(isClosed !== undefined && { isClosed }) };

  const [items, total] = await Promise.all([
    prisma.auditCycle.findMany({
      where,
      include: AUDIT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditCycle.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

async function getAuditCycle(id) {
  const cycle = await prisma.auditCycle.findUnique({ where: { id }, include: AUDIT_INCLUDE });
  if (!cycle) throw ApiError.notFound('Audit cycle not found');
  return cycle;
}

async function addAuditor(auditId, userId, req) {
  const cycle = await getAuditCycle(auditId);
  if (cycle.isClosed) throw ApiError.conflict('Cannot modify a closed audit cycle');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.badRequest('User does not exist');

  const auditor = await prisma.auditAuditor.create({ data: { auditId, userId } });

  await recordActivity({ req, action: 'ADD_AUDITOR', entity: 'AuditCycle', entityId: auditId, newData: auditor });

  await notifyUser({
    userId,
    type: 'AUDIT_DISCREPANCY',
    title: 'Assigned to audit cycle',
    message: `You have been assigned as an auditor for "${cycle.title}".`,
    referenceId: auditId,
  });

  return getAuditCycle(auditId);
}

async function verifyItem(auditId, itemId, { status, remarks }, req) {
  const cycle = await getAuditCycle(auditId);
  if (cycle.isClosed) throw ApiError.conflict('Cannot modify a closed audit cycle');

  const item = cycle.items.find((i) => i.id === itemId);
  if (!item) throw ApiError.notFound('Audit item not found in this cycle');

  const isAssignedAuditor = cycle.auditors.some((a) => a.userId === req.user.id);
  if (!isAssignedAuditor && !['ADMIN', 'ASSET_MANAGER'].includes(req.user.role)) {
    throw ApiError.forbidden('Only assigned auditors can verify items in this cycle');
  }

  const updated = await prisma.auditItem.update({
    where: { id: itemId },
    data: { status, remarks },
    include: { asset: { select: { id: true, assetTag: true, name: true } } },
  });

  await recordActivity({
    req,
    action: 'VERIFY_ITEM',
    entity: 'AuditItem',
    entityId: itemId,
    oldData: { status: item.status },
    newData: updated,
  });

  return updated;
}

function getDiscrepancies(cycle) {
  return cycle.items.filter((item) => item.status !== 'VERIFIED');
}

async function closeAuditCycle(id, req) {
  const cycle = await getAuditCycle(id);
  if (cycle.isClosed) throw ApiError.conflict('Audit cycle is already closed');

  const missingAssetIds = cycle.items.filter((i) => i.status === 'MISSING').map((i) => i.assetId);
  const damagedAssetIds = cycle.items.filter((i) => i.status === 'DAMAGED').map((i) => i.assetId);

  await prisma.$transaction([
    ...(missingAssetIds.length
      ? [prisma.asset.updateMany({ where: { id: { in: missingAssetIds } }, data: { status: 'LOST' } })]
      : []),
    ...(damagedAssetIds.length
      ? [prisma.asset.updateMany({ where: { id: { in: damagedAssetIds } }, data: { condition: 'DAMAGED' } })]
      : []),
    prisma.auditCycle.update({ where: { id }, data: { isClosed: true } }),
  ]);

  const closed = await getAuditCycle(id);
  const discrepancies = getDiscrepancies(closed);

  await recordActivity({
    req,
    action: 'CLOSE',
    entity: 'AuditCycle',
    entityId: id,
    newData: { discrepancyCount: discrepancies.length, missingAssetIds, damagedAssetIds },
  });

  return { cycle: closed, discrepancyReport: discrepancies };
}

async function getDiscrepancyReport(id) {
  const cycle = await getAuditCycle(id);
  return getDiscrepancies(cycle);
}

module.exports = {
  createAuditCycle,
  listAudits,
  getAuditCycle,
  addAuditor,
  verifyItem,
  closeAuditCycle,
  getDiscrepancyReport,
};
