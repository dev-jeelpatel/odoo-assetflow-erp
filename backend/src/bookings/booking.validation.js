const { z } = require('zod');

const uuid = z.string().uuid();

const createBookingSchema = z
  .object({
    assetId: uuid,
    title: z.string().trim().max(150).optional(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    remarks: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });

const rescheduleBookingSchema = z
  .object({
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });

const listBookingsQuerySchema = z.object({
  assetId: uuid.optional(),
  bookedById: uuid.optional(),
  status: z.enum(['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

module.exports = { createBookingSchema, rescheduleBookingSchema, listBookingsQuerySchema };
