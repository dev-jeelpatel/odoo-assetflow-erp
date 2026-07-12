const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');

async function listNotifications(userId, { isRead, page, pageSize }) {
  const where = { userId, ...(isRead !== undefined && { isRead }) };

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize), unreadCount };
}

async function markAsRead(id, userId) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== userId) {
    throw ApiError.notFound('Notification not found');
  }

  return prisma.notification.update({ where: { id }, data: { isRead: true } });
}

async function markAllAsRead(userId) {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}

module.exports = { listNotifications, markAsRead, markAllAsRead };
