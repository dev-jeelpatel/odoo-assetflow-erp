const prisma = require('../config/prisma');

const UPCOMING_RETURN_WINDOW_DAYS = 7;

/**
 * Builds a Prisma where-clause scoping allocations to the requesting user's
 * visibility: Admin/Asset Manager see everything, Department Head sees their
 * department, Employee sees only their own allocations.
 */
function scopeAllocations(user) {
  if (['ADMIN', 'ASSET_MANAGER'].includes(user.role)) return {};
  if (user.role === 'DEPARTMENT_HEAD' && user.departmentId) {
    return { OR: [{ departmentId: user.departmentId }, { employee: { departmentId: user.departmentId } }] };
  }
  return { employeeId: user.id };
}

async function getDashboard(user) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  const upcomingWindow = new Date(now.getTime() + UPCOMING_RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const allocationScope = scopeAllocations(user);

  const [
    assetsAvailable,
    assetsAllocated,
    maintenanceTodayCount,
    activeBookings,
    pendingTransfers,
    upcomingReturns,
    overdueReturns,
    recentActivity,
  ] = await Promise.all([
    prisma.asset.count({ where: { status: 'AVAILABLE' } }),
    prisma.asset.count({ where: { status: 'ALLOCATED' } }),
    prisma.maintenanceRequest.count({
      where: { status: { notIn: ['RESOLVED', 'REJECTED'] }, createdAt: { gte: startOfDay, lt: endOfDay } },
    }),
    prisma.resourceBooking.count({ where: { status: { in: ['UPCOMING', 'ONGOING'] } } }),
    prisma.assetTransfer.count({ where: { status: 'REQUESTED' } }),
    prisma.assetAllocation.findMany({
      where: {
        ...allocationScope,
        returnedAt: null,
        expectedReturnDate: { gte: now, lte: upcomingWindow },
      },
      include: {
        asset: { select: { id: true, assetTag: true, name: true } },
        employee: { select: { id: true, name: true } },
      },
      orderBy: { expectedReturnDate: 'asc' },
      take: 20,
    }),
    prisma.assetAllocation.findMany({
      where: { ...allocationScope, returnedAt: null, expectedReturnDate: { lt: now } },
      include: {
        asset: { select: { id: true, assetTag: true, name: true } },
        employee: { select: { id: true, name: true } },
      },
      orderBy: { expectedReturnDate: 'asc' },
      take: 20,
    }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  return {
    kpis: {
      assetsAvailable,
      assetsAllocated,
      maintenanceToday: maintenanceTodayCount,
      activeBookings,
      pendingTransfers,
      upcomingReturnsCount: upcomingReturns.length,
      overdueReturnsCount: overdueReturns.length,
    },
    upcomingReturns,
    overdueReturns,
    recentActivity,
  };
}

async function getUtilization({ limit }) {
  const [mostUsed, idle] = await Promise.all([
    prisma.asset.findMany({
      select: { id: true, assetTag: true, name: true, _count: { select: { allocations: true, bookings: true } } },
      orderBy: [{ allocations: { _count: 'desc' } }],
      take: limit,
    }),
    prisma.asset.findMany({
      where: { allocations: { none: {} }, bookings: { none: {} } },
      select: { id: true, assetTag: true, name: true, status: true, createdAt: true },
      take: limit,
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return { mostUsed, idle };
}

async function getMaintenanceFrequency() {
  const byCategory = await prisma.maintenanceRequest.groupBy({
    by: ['assetId'],
    _count: { _all: true },
  });

  const assetIds = byCategory.map((r) => r.assetId);
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, assetTag: true, name: true, categoryId: true, category: { select: { name: true } } },
  });
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  const perAsset = byCategory
    .map((r) => ({ asset: assetMap.get(r.assetId), count: r._count._all }))
    .filter((r) => r.asset)
    .sort((a, b) => b.count - a.count);

  const perCategory = {};
  for (const row of perAsset) {
    const name = row.asset.category?.name || 'Uncategorized';
    perCategory[name] = (perCategory[name] || 0) + row.count;
  }

  return {
    perAsset,
    perCategory: Object.entries(perCategory).map(([category, count]) => ({ category, count })),
  };
}

async function getDepartmentAllocationSummary() {
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      _count: { select: { assets: true } },
      assetAllocations: { where: { returnedAt: null }, select: { id: true } },
    },
  });

  return departments.map((d) => ({
    departmentId: d.id,
    departmentName: d.name,
    assetsOwned: d._count.assets,
    activeAllocations: d.assetAllocations.length,
  }));
}

async function getBookingHeatmap() {
  const bookings = await prisma.resourceBooking.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: { startTime: true },
  });

  const hourCounts = Array.from({ length: 24 }, () => 0);
  for (const b of bookings) {
    hourCounts[new Date(b.startTime).getUTCHours()] += 1;
  }

  return hourCounts.map((count, hour) => ({ hour, count }));
}

async function getNearingRetirement({ ageYears }) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - ageYears);

  return prisma.asset.findMany({
    where: {
      acquisitionDate: { lte: cutoff },
      status: { notIn: ['RETIRED', 'DISPOSED'] },
    },
    select: { id: true, assetTag: true, name: true, acquisitionDate: true, status: true },
    orderBy: { acquisitionDate: 'asc' },
  });
}

module.exports = {
  getDashboard,
  getUtilization,
  getMaintenanceFrequency,
  getDepartmentAllocationSummary,
  getBookingHeatmap,
  getNearingRetirement,
};
