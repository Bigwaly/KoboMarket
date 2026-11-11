
/**
 * ROLE-BASED AUTHORIZATION MIDDLEWARE
 *
 * This middleware controls which authenticated users can
 * access protected routes based on their assigned roles.
 *
 * Authentication answers:
 * "Who is making this request?"
 *
 * Authorization answers:
 * "Is this user allowed to perform this action?"
 */

// Define all roles supported by KoboMarket.
const ALLOWED_ROLES = Object.freeze([
  'customer',
  'vendor',
  'admin',
  'superadmin'
]);

/**
 * Create an authorization middleware for the supplied roles.
 *
 * Example:
 * authorizeRoles('admin', 'superadmin')
 *
 * Only users with either role will be allowed through.
 */
function authorizeRoles(...allowedRoles) {

  // STEP 1: Validate the roles supplied by the developer.
  if (
    allowedRoles.length === 0 ||
    allowedRoles.some(
      (role) =>
        typeof role !== 'string' ||
        !ALLOWED_ROLES.includes(role)
    )
  ) {
    throw new Error(
      'Authorization middleware requires valid allowed roles.'
    );
  }

  // STEP 2: Return the actual Express middleware.
  return function roleAuthorizationMiddleware(req, res, next) {

    // Authentication middleware must run before authorization.
    if (!req.user || !req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Authentication is required to access this resource.',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    // Check whether the authenticated user's role is permitted.
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // The user's role is authorized. Continue to the route handler.
    return next();
  };
}

// Export the middleware factory and supported roles.
module.exports = {
  authorizeRoles,
  ALLOWED_ROLES
};
