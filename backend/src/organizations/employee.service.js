const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { recordActivity } = require('../utils/activityLog');

const SELECT_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  createdAt: true,
};

async function listEmployees({ search, departmentId, role, status, page, pageSize }) {
  const where = {
    ...(departmentId && { departmentId }),
    ...(role && { role }),
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: SELECT_FIELDS,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

async function getEmployee(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: SELECT_FIELDS });
  if (!user) throw ApiError.notFound('Employee not found');
  return user;
}

/**
 * The only place in the system where a role is assigned. Admin promotes an
 * Employee to Department Head / Asset Manager (or demotes back to Employee).
 */
async function updateEmployeeRole(id, role, req) {
  const existing = await getEmployee(id);

  if (existing.role === 'ADMIN' && role !== 'ADMIN' && req.user.id === id) {
    throw ApiError.badRequest('Admins cannot demote themselves');
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: SELECT_FIELDS,
  });

  await recordActivity({
    req,
    action: 'ROLE_CHANGE',
    entity: 'User',
    entityId: id,
    oldData: { role: existing.role },
    newData: { role: user.role },
  });

  return user;
}

async function updateEmployee(id, data, req) {
  const existing = await getEmployee(id);

  if (data.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!dept) throw ApiError.badRequest('Department does not exist');
  }

  const user = await prisma.user.update({ where: { id }, data, select: SELECT_FIELDS });

  await recordActivity({
    req,
    action: 'UPDATE',
    entity: 'User',
    entityId: id,
    oldData: existing,
    newData: user,
  });

  return user;
}

module.exports = { listEmployees, getEmployee, updateEmployeeRole, updateEmployee };
