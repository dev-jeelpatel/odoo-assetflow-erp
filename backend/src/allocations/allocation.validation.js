const { z } = require('zod');

const uuid = z.string().uuid();
const conditionEnum = z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED']);

const allocateAssetSchema = z
  .object({
    assetId: uuid,
    employeeId: uuid.optional(),
    departmentId: uuid.optional(),
    expectedReturnDate: z.coerce.date().optional(),
  })
  .refine((data) => data.employeeId || data.departmentId, {
    message: 'Either employeeId or departmentId must be provided',
  });

const returnAssetSchema = z.object({
  condition: conditionEnum,
  notes: z.string().trim().max(1000).optional(),
});

const requestTransferSchema = z.object({
  assetId: uuid,
  toEmployeeId: uuid.optional(),
  reason: z.string().trim().max(500).optional(),
});

const listAllocationsQuerySchema = z.object({
  assetId: uuid.optional(),
  employeeId: uuid.optional(),
  departmentId: uuid.optional(),
  active: z.coerce.boolean().optional(),
  overdue: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const listTransfersQuerySchema = z.object({
  assetId: uuid.optional(),
  status: z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = {
  allocateAssetSchema,
  returnAssetSchema,
  requestTransferSchema,
  listAllocationsQuerySchema,
  listTransfersQuerySchema,
};
