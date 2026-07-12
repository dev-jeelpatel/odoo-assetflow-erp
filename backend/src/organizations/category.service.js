const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { recordActivity } = require('../utils/activityLog');

async function listCategories() {
  return prisma.assetCategory.findMany({
    include: { _count: { select: { assets: true } } },
    orderBy: { name: 'asc' },
  });
}

async function getCategory(id) {
  const category = await prisma.assetCategory.findUnique({ where: { id } });
  if (!category) throw ApiError.notFound('Asset category not found');
  return category;
}

async function createCategory(data, req) {
  const category = await prisma.assetCategory.create({ data });
  await recordActivity({ req, action: 'CREATE', entity: 'AssetCategory', entityId: category.id, newData: category });
  return category;
}

async function updateCategory(id, data, req) {
  const existing = await getCategory(id);
  const category = await prisma.assetCategory.update({ where: { id }, data });
  await recordActivity({
    req,
    action: 'UPDATE',
    entity: 'AssetCategory',
    entityId: id,
    oldData: existing,
    newData: category,
  });
  return category;
}

async function deleteCategory(id, req) {
  const existing = await getCategory(id);
  const assetCount = await prisma.asset.count({ where: { categoryId: id } });
  if (assetCount > 0) {
    throw ApiError.conflict('Cannot delete a category that still has assets assigned to it');
  }
  await prisma.assetCategory.delete({ where: { id } });
  await recordActivity({ req, action: 'DELETE', entity: 'AssetCategory', entityId: id, oldData: existing });
}

module.exports = { listCategories, getCategory, createCategory, updateCategory, deleteCategory };
