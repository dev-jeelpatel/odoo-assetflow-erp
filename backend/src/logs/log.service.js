const prisma = require('../config/prisma');

async function listLogs({ userId, entity, entityId, action, page, pageSize }) {
  const where = {
    ...(userId && { userId }),
    ...(entity && { entity }),
    ...(entityId && { entityId }),
    ...(action && { action }),
  };

  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

module.exports = { listLogs };
