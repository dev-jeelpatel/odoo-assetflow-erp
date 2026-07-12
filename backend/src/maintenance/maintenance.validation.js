const { z } = require('zod');

const uuid = z.string().uuid();

const attachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileUrl: z.string().trim().url(),
  fileSize: z.number().int().nonnegative().optional(),
  mimeType: z.string().trim().max(100).optional(),
});

const raiseRequestSchema = z.object({
  assetId: uuid,
  issue: z.string().trim().min(3).max(1000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  attachments: z.array(attachmentSchema).max(10).optional(),
});

const assignTechnicianSchema = z.object({
  technicianName: z.string().trim().min(2).max(150),
});

const resolveSchema = z.object({
  resolutionNotes: z.string().trim().max(1000).optional(),
});

const listMaintenanceQuerySchema = z.object({
  assetId: uuid.optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'TECHNICIAN_ASSIGNED', 'IN_PROGRESS', 'RESOLVED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  raisedById: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = {
  raiseRequestSchema,
  assignTechnicianSchema,
  resolveSchema,
  listMaintenanceQuerySchema,
};
