const { z } = require('zod');

const utilizationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const retirementQuerySchema = z.object({
  ageYears: z.coerce.number().int().min(1).max(50).default(5),
});

module.exports = { utilizationQuerySchema, retirementQuerySchema };
