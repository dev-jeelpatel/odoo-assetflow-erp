const asyncHandler = require('../utils/asyncHandler');
const departmentService = require('./department.service');
const categoryService = require('./category.service');
const employeeService = require('./employee.service');

// Departments
const listDepartments = asyncHandler(async (req, res) => {
  res.json({ departments: await departmentService.listDepartments(req.query) });
});

const getDepartment = asyncHandler(async (req, res) => {
  res.json({ department: await departmentService.getDepartment(req.params.id) });
});

const createDepartment = asyncHandler(async (req, res) => {
  res.status(201).json({ department: await departmentService.createDepartment(req.body, req) });
});

const updateDepartment = asyncHandler(async (req, res) => {
  res.json({ department: await departmentService.updateDepartment(req.params.id, req.body, req) });
});

const deactivateDepartment = asyncHandler(async (req, res) => {
  res.json({ department: await departmentService.deactivateDepartment(req.params.id, req) });
});

// Categories
const listCategories = asyncHandler(async (req, res) => {
  res.json({ categories: await categoryService.listCategories() });
});

const getCategory = asyncHandler(async (req, res) => {
  res.json({ category: await categoryService.getCategory(req.params.id) });
});

const createCategory = asyncHandler(async (req, res) => {
  res.status(201).json({ category: await categoryService.createCategory(req.body, req) });
});

const updateCategory = asyncHandler(async (req, res) => {
  res.json({ category: await categoryService.updateCategory(req.params.id, req.body, req) });
});

const deleteCategory = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory(req.params.id, req);
  res.status(204).send();
});

// Employees
const listEmployees = asyncHandler(async (req, res) => {
  res.json(await employeeService.listEmployees(req.query));
});

const getEmployee = asyncHandler(async (req, res) => {
  res.json({ employee: await employeeService.getEmployee(req.params.id) });
});

const updateEmployee = asyncHandler(async (req, res) => {
  res.json({ employee: await employeeService.updateEmployee(req.params.id, req.body, req) });
});

const updateEmployeeRole = asyncHandler(async (req, res) => {
  res.json({ employee: await employeeService.updateEmployeeRole(req.params.id, req.body.role, req) });
});

module.exports = {
  listDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  listEmployees,
  getEmployee,
  updateEmployee,
  updateEmployeeRole,
};
