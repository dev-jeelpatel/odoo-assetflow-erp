const { z } = require('zod');

const uuid = z.string().uuid();

const createAuditSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(1000).optional(),
    departmentId: uuid.optional(),
    location: z.string().trim().max(200).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    auditorIds: z.array(uuid).min(1),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });

const addAuditorSchema = z.object({ userId: uuid });

const verifyItemSchema = z.object({
  status: z.enum(['VERIFIED', 'MISSING', 'DAMAGED']),
  remarks: z.string().trim().max(500).optional(),
});

const listAuditsQuerySchema = z.object({
  departmentId: uuid.optional(),
  isClosed: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { createAuditSchema, addAuditorSchema, verifyItemSchema, listAuditsQuerySchema };
