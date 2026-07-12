const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { recordActivity } = require('../utils/activityLog');
const { notifyUser } = require('../utils/notify');

const BOOKING_INCLUDE = {
  asset: { select: { id: true, assetTag: true, name: true, location: true } },
  bookedBy: { select: { id: true, name: true, email: true } },
};

const ACTIVE_STATUSES = ['UPCOMING', 'ONGOING'];

function computeStatus(startTime, endTime, now = new Date()) {
  if (now < startTime) return 'UPCOMING';
  if (now >= startTime && now < endTime) return 'ONGOING';
  return 'COMPLETED';
}

async function assertNoOverlap({ assetId, startTime, endTime, excludeBookingId }) {
  const overlapping = await prisma.resourceBooking.findFirst({
    where: {
      assetId,
      status: { in: ACTIVE_STATUSES },
      ...(excludeBookingId && { id: { not: excludeBookingId } }),
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    include: BOOKING_INCLUDE,
  });

  if (overlapping) {
    throw ApiError.conflict('This time slot overlaps with an existing booking', {
      conflictingBooking: overlapping,
    });
  }
}

async function createBooking(data, req) {
  const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
  if (!asset) throw ApiError.notFound('Asset not found');
  if (!asset.isBookable) throw ApiError.badRequest('This asset is not marked as a shared/bookable resource');
  if (['UNDER_MAINTENANCE', 'LOST', 'RETIRED', 'DISPOSED'].includes(asset.status)) {
    throw ApiError.conflict(`Asset is currently ${asset.status} and cannot be booked`);
  }

  await assertNoOverlap(data);

  const booking = await prisma.resourceBooking.create({
    data: {
      assetId: data.assetId,
      bookedById: req.user.id,
      title: data.title,
      startTime: data.startTime,
      endTime: data.endTime,
      remarks: data.remarks,
      status: computeStatus(data.startTime, data.endTime),
    },
    include: BOOKING_INCLUDE,
  });

  await recordActivity({ req, action: 'CREATE', entity: 'ResourceBooking', entityId: booking.id, newData: booking });

  return booking;
}

async function listBookings(query) {
  const { assetId, bookedById, status, from, to, page, pageSize } = query;

  const where = {
    ...(assetId && { assetId }),
    ...(bookedById && { bookedById }),
    ...(status && { status }),
    ...((from || to) && {
      AND: [...(from ? [{ endTime: { gt: from } }] : []), ...(to ? [{ startTime: { lt: to } }] : [])],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.resourceBooking.findMany({
      where,
      include: BOOKING_INCLUDE,
      orderBy: { startTime: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.resourceBooking.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

async function getBooking(id) {
  const booking = await prisma.resourceBooking.findUnique({ where: { id }, include: BOOKING_INCLUDE });
  if (!booking) throw ApiError.notFound('Booking not found');
  return booking;
}

function assertCanModify(booking, req) {
  const isOwner = booking.bookedById === req.user.id;
  const isPrivileged = ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'].includes(req.user.role);
  if (!isOwner && !isPrivileged) {
    throw ApiError.forbidden('You can only modify your own bookings');
  }
}

async function rescheduleBooking(id, data, req) {
  const booking = await getBooking(id);
  assertCanModify(booking, req);
  if (!ACTIVE_STATUSES.includes(booking.status)) {
    throw ApiError.conflict(`Cannot reschedule a booking that is ${booking.status}`);
  }

  await assertNoOverlap({ assetId: booking.assetId, ...data, excludeBookingId: id });

  const updated = await prisma.resourceBooking.update({
    where: { id },
    data: { startTime: data.startTime, endTime: data.endTime, status: computeStatus(data.startTime, data.endTime) },
    include: BOOKING_INCLUDE,
  });

  await recordActivity({
    req,
    action: 'RESCHEDULE',
    entity: 'ResourceBooking',
    entityId: id,
    oldData: { startTime: booking.startTime, endTime: booking.endTime },
    newData: { startTime: updated.startTime, endTime: updated.endTime },
  });

  return updated;
}

async function cancelBooking(id, req) {
  const booking = await getBooking(id);
  assertCanModify(booking, req);
  if (!ACTIVE_STATUSES.includes(booking.status)) {
    throw ApiError.conflict(`Cannot cancel a booking that is ${booking.status}`);
  }

  const updated = await prisma.resourceBooking.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: BOOKING_INCLUDE,
  });

  await recordActivity({
    req,
    action: 'CANCEL',
    entity: 'ResourceBooking',
    entityId: id,
    oldData: { status: booking.status },
    newData: { status: 'CANCELLED' },
  });

  if (booking.bookedById !== req.user.id) {
    await notifyUser({
      userId: booking.bookedById,
      type: 'BOOKING_CANCELLED',
      title: 'Booking cancelled',
      message: `Your booking for ${booking.asset?.name || 'a resource'} was cancelled.`,
      referenceId: id,
    });
  }

  return updated;
}

module.exports = { createBooking, listBookings, getBooking, rescheduleBooking, cancelBooking, computeStatus };
