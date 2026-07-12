const { Router } = require('express');
const controller = require('./organization.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  createDepartmentSchema,
  updateDepartmentSchema,
  createCategorySchema,
  updateCategorySchema,
  promoteEmployeeSchema,
  updateEmployeeSchema,
  listEmployeesQuerySchema,
} = require('./organization.validation');

const router = Router();

router.use(authenticate);

// Departments — Admin manages; everyone else may read for allocation/booking dropdowns.
router.get('/departments', controller.listDepartments);
router.get('/departments/:id', controller.getDepartment);
router.post('/departments', authorize('ADMIN'), validate(createDepartmentSchema), controller.createDepartment);
router.patch('/departments/:id', authorize('ADMIN'), validate(updateDepartmentSchema), controller.updateDepartment);
router.delete('/departments/:id', authorize('ADMIN'), controller.deactivateDepartment);

// Asset Categories — Admin manages; everyone else may read for registration forms.
router.get('/categories', controller.listCategories);
router.get('/categories/:id', controller.getCategory);
router.post('/categories', authorize('ADMIN'), validate(createCategorySchema), controller.createCategory);
router.patch('/categories/:id', authorize('ADMIN'), validate(updateCategorySchema), controller.updateCategory);
router.delete('/categories/:id', authorize('ADMIN'), controller.deleteCategory);

// Employee Directory — Admin only. This is the sole place roles are assigned.
router.get(
  '/employees',
  authorize('ADMIN'),
  validate(listEmployeesQuerySchema, 'query'),
  controller.listEmployees
);
router.get('/employees/:id', authorize('ADMIN'), controller.getEmployee);
router.patch('/employees/:id', authorize('ADMIN'), validate(updateEmployeeSchema), controller.updateEmployee);
router.patch(
  '/employees/:id/role',
  authorize('ADMIN'),
  validate(promoteEmployeeSchema),
  controller.updateEmployeeRole
);

module.exports = router;
