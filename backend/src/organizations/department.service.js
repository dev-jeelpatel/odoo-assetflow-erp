const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { recordActivity } = require('../utils/activityLog');

async function listDepartments({ isActive } = {}) {
  return prisma.department.findMany({
    where: isActive === undefined ? undefined : { isActive: isActive === 'true' || isActive === true },
    include: {
      head: { select: { id: true, name: true, email: true } },
      parent: { select: { id: true, name: true } },
      _count: { select: { users: true, assets: true, children: true } },
    },
    orderBy: { name: 'asc' },
  });
}

async function getDepartment(id) {
  const dept = await prisma.department.findUnique({
    where: { id },
    include: {
      head: { select: { id: true, name: true, email: true } },
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true, isActive: true } },
    },
  });
  if (!dept) throw ApiError.notFound('Department not found');
  return dept;
}

async function assertHeadEligible(headId) {
  if (!headId) return;
  const head = await prisma.user.findUnique({ where: { id: headId } });
  if (!head) throw ApiError.badRequest('Assigned department head does not exist');
}

async function createDepartment(data, req) {
  if (data.parentId) {
    const parent = await prisma.department.findUnique({ where: { id: data.parentId } });
    if (!parent) throw ApiError.badRequest('Parent department does not exist');
  }
  await assertHeadEligible(data.headId);

  const dept = await prisma.department.create({ data });

  await recordActivity({ req, action: 'CREATE', entity: 'Department', entityId: dept.id, newData: dept });
  return dept;
}

async function updateDepartment(id, data, req) {
  const existing = await getDepartment(id);

  if (data.parentId) {
    if (data.parentId === id) throw ApiError.badRequest('A department cannot be its own parent');
    const parent = await prisma.department.findUnique({ where: { id: data.parentId } });
    if (!parent) throw ApiError.badRequest('Parent department does not exist');
  }
  if (data.headId) await assertHeadEligible(data.headId);

  const dept = await prisma.department.update({ where: { id }, data });

  await recordActivity({
    req,
    action: 'UPDATE',
    entity: 'Department',
    entityId: id,
    oldData: existing,
    newData: dept,
  });
  return dept;
}

async function deactivateDepartment(id, req) {
  const existing = await getDepartment(id);
  const dept = await prisma.department.update({ where: { id }, data: { isActive: false } });
  await recordActivity({
    req,
    action: 'DEACTIVATE',
    entity: 'Department',
    entityId: id,
    oldData: existing,
    newData: dept,
  });
  return dept;
}

module.exports = { listDepartments, getDepartment, createDepartment, updateDepartment, deactivateDepartment };
