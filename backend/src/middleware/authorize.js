const ApiError = require('../utils/ApiError');

/**
 * Restricts a route to the given roles. Usage: authorize('ADMIN', 'ASSET_MANAGER')
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires one of roles: ${allowedRoles.join(', ')}`));
    }
    next();
  };
}

module.exports = authorize;
