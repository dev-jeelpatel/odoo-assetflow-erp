const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Verifies the JWT access token and attaches the authenticated user to req.user.
 * Re-checks user status on each request so a deactivated account is blocked immediately.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or invalid Authorization header');
  }

  const token = header.slice('Bearer '.length);
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== 'ACTIVE') {
    throw ApiError.unauthorized('Account is inactive or no longer exists');
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
  };
  next();
});

module.exports = authenticate;
