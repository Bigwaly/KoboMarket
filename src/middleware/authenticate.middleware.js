
// Load jsonwebtoken to verify incoming access tokens.
const jwt = require('jsonwebtoken');

// Load the MongoDB User model.
const User = require('../modules/users/models/user.model');

// --------------------------------------------------
// STEP 1: DEFINE AUTHENTICATION ERROR RESPONSES
// --------------------------------------------------

function sendAuthenticationError(res, statusCode, message, code) {
  return res.status(statusCode).json({
    success: false,
    message,
    code
  });
}

// --------------------------------------------------
// STEP 2: VALIDATE ACCESS-TOKEN CONFIGURATION
// --------------------------------------------------

function getAccessTokenConfiguration() {
  // Read the access-token secret.
  const accessSecret = process.env.JWT_ACCESS_SECRET;

  // Read the refresh-token secret.
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  // Ensure the access-token secret is sufficiently strong.
  if (
    !accessSecret ||
    accessSecret.length < 32 ||
    accessSecret === 'my password' ||
    !refreshSecret ||
    refreshSecret.length < 32 ||
    accessSecret === refreshSecret
  ) {
    const error = new Error(
      'Authentication server configuration is invalid.'
    );

    error.statusCode = 500;
    error.code = 'JWT_CONFIGURATION_ERROR';

    throw error;
  }

  return {
    accessSecret
  };
}

// --------------------------------------------------
// STEP 3: AUTHENTICATE INCOMING REQUESTS
// --------------------------------------------------

async function authenticate(req, res, next) {
  // STEP 3A:
  // Read the Authorization header.

  const authorizationHeader = req.headers.authorization;

  // Reject requests without an Authorization header.
  if (!authorizationHeader) {
    return sendAuthenticationError(
      res,
      401,
      'Authentication is required to access this resource.',
      'AUTHENTICATION_REQUIRED'
    );
  }

  // STEP 3B:
  // Validate the Bearer token format.

  const bearerMatch =
    /^Bearer\s+(\S+)$/i.exec(authorizationHeader);

  if (!bearerMatch) {
    return sendAuthenticationError(
      res,
      401,
      'A valid Bearer access token is required.',
      'INVALID_AUTHORIZATION_HEADER'
    );
  }

  // Extract the access token.
  const accessToken = bearerMatch[1];

  // STEP 3C:
  // Read JWT configuration.

  let configuration;

  try {
    configuration = getAccessTokenConfiguration();
  } catch (error) {
    return sendAuthenticationError(
      res,
      500,
      'Authentication service is temporarily unavailable.',
      'JWT_CONFIGURATION_ERROR'
    );
  }

  // STEP 3D:
  // Verify the access token.

  let decodedToken;

  try {
    decodedToken = jwt.verify(
      accessToken,
      configuration.accessSecret,
      {
        algorithms: ['HS256'],
        issuer: 'kobomarket-api',
        audience: 'kobomarket-client'
      }
    );
  } catch (error) {
    // This covers expired, malformed, incorrectly signed,
    // and otherwise invalid JWT access tokens.

    return sendAuthenticationError(
      res,
      401,
      'Your access token is invalid or has expired.',
      'INVALID_ACCESS_TOKEN'
    );
  }

  // STEP 3E:
  // Validate the token payload.

  if (
    !decodedToken ||
    typeof decodedToken !== 'object' ||
    typeof decodedToken.sub !== 'string' ||
    !/^[a-fA-F0-9]{24}$/.test(decodedToken.sub) ||
    typeof decodedToken.role !== 'string'
  ) {
    return sendAuthenticationError(
      res,
      401,
      'Your access token is invalid or has expired.',
      'INVALID_ACCESS_TOKEN'
    );
  }

  // STEP 3F:
  // Retrieve the current user from MongoDB.

  let user;

  try {
    user = await User.findById(decodedToken.sub);
  } catch (error) {
    // Database failures must not be mistaken for invalid tokens.

    return sendAuthenticationError(
      res,
      500,
      'Authentication could not be completed. Please try again.',
      'AUTHENTICATION_FAILED'
    );
  }

  // STEP 3G:
  // Reject tokens belonging to users who no longer exist.

  if (!user) {
    return sendAuthenticationError(
      res,
      401,
      'Your access token is invalid or has expired.',
      'INVALID_ACCESS_TOKEN'
    );
  }

  // STEP 3H:
  // Check the current account status.

  if (!user.isActive) {
    return sendAuthenticationError(
      res,
      403,
      'Your account is inactive. Please contact support.',
      'ACCOUNT_INACTIVE'
    );
  }

  // STEP 3I:
  // Confirm that the token role matches the current
  // role stored in MongoDB.

  if (decodedToken.role !== user.role) {
    return sendAuthenticationError(
      res,
      401,
      'Your access token is invalid or has expired.',
      'INVALID_ACCESS_TOKEN'
    );
  }

  // STEP 3J:
  // Attach safe authenticated-user information to
  // the Express request object.

  req.user = {
    id: user._id.toString(),
    role: user.role
  };

  // STEP 3K:
  // Allow the request to continue to the next handler.

  return next();
}

// --------------------------------------------------
// STEP 4: EXPORT AUTHENTICATION MIDDLEWARE
// --------------------------------------------------

module.exports = {
  authenticate,
  getAccessTokenConfiguration
};
