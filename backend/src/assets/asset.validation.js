const { z } = require('zod');

const uuid = z.string().uuid();

const conditionEnum = z.enum(['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED']);
const statusEnum = z.enum([
  'AVAILABLE',
  'ALLOCATED',
  'RESERVED',
  'UNDER_MAINTENANCE',
  'LOST',
  'RETIRED',
  'DISPOSED',
]);

const createAssetSchema = z.object({
  name: z.string().trim().min(2).max(150),
  categoryId: uuid,
  serialNumber: z.string().trim().min(1).max(100).optional(),
  acquisitionDate: z.coerce.date().optional(),
  acquisitionCost: z.coerce.number().nonnegative().optional(),
  condition: conditionEnum.default('GOOD'),
  location: z.string().trim().max(200).optional(),
  departmentId: uuid.optional(),
  isBookable: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

const updateAssetSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  categoryId: uuid.optional(),
  serialNumber: z.string().trim().min(1).max(100).nullable().optional(),
  acquisitionDate: z.coerce.date().nullable().optional(),
  acquisitionCost: z.coerce.number().nonnegative().nullable().optional(),
  condition: conditionEnum.optional(),
  location: z.string().trim().max(200).nullable().optional(),
  departmentId: uuid.nullable().optional(),
  isBookable: z.boolean().optional(),
  metadata: z.record(z.any()).nullable().optional(),
});

// Direct status transitions outside the allocation/maintenance/audit workflows
// (e.g. Admin manually retiring or disposing an asset).
const changeStatusSchema = z.object({
  status: statusEnum,
  reason: z.string().trim().max(500).optional(),
});

const listAssetsQuerySchema = z.object({
  search: z.string().trim().optional(),
  assetTag: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  categoryId: uuid.optional(),
  status: statusEnum.optional(),
  departmentId: uuid.optional(),
  location: z.string().trim().optional(),
  isBookable: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = {
  createAssetSchema,
  updateAssetSchema,
  changeStatusSchema,
  listAssetsQuerySchema,
};
