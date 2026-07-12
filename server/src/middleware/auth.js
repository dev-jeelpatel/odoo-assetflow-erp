import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { ApiError, catchAsync } from '../utils/errors.js';

export const ROLES = ['ADMIN', 'ASSET_MANAGER', 'DEPT_HEAD', 'EMPLOYEE'];

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

export function setAuthCookie(res, token) {
  res.cookie('af_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // local development over http
    maxAge: 12 * 60 * 60 * 1000,
  });
}

/** Authenticates via httpOnly cookie (or Bearer header fallback) and loads the fresh user row. */
export const requireAuth = catchAsync(async (req, res, next) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.af_token || bearer;
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch {
    throw ApiError.unauthorized('Your session has expired. Please log in again.');
  }

  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.department_id, u.status, d.name AS department_name
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.id = ?`,
    [payload.sub]
  );
  const user = rows[0];
  if (!user || user.status !== 'ACTIVE') {
    throw ApiError.unauthorized('This account is inactive or no longer exists.');
  }
  req.user = user;
  next();
});

/** Role gate: requireRole('ADMIN', 'ASSET_MANAGER') */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden(`This action requires role: ${roles.join(' or ')}`));
  }
  next();
};
