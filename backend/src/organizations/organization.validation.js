const { z } = require('zod');

const uuid = z.string().uuid();

const createDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(1).max(30).optional(),
  description: z.string().trim().max(500).optional(),
  parentId: uuid.optional(),
  headId: uuid.optional(),
});

const updateDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  code: z.string().trim().min(1).max(30).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  parentId: uuid.nullable().optional(),
  headId: uuid.nullable().optional(),
  isActive: z.boolean().optional(),
});

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  metadataSchema: z.record(z.any()).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  metadataSchema: z.record(z.any()).nullable().optional(),
});

const promoteEmployeeSchema = z.object({
  role: z.enum(['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD', 'EMPLOYEE']),
});

const updateEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  departmentId: uuid.nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const listEmployeesQuerySchema = z.object({
  search: z.string().trim().optional(),
  departmentId: uuid.optional(),
  role: z.enum(['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD', 'EMPLOYEE']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = {
  createDepartmentSchema,
  updateDepartmentSchema,
  createCategorySchema,
  updateCategorySchema,
  promoteEmployeeSchema,
  updateEmployeeSchema,
  listEmployeesQuerySchema,
};
