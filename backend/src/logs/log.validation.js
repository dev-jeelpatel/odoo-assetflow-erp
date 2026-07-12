const { z } = require('zod');

const uuid = z.string().uuid();

const listLogsQuerySchema = z.object({
  userId: uuid.optional(),
  entity: z.string().trim().optional(),
  entityId: z.string().trim().optional(),
  action: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

module.exports = { listLogsQuerySchema };
