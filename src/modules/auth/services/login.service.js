
/*
======================================================
KOBOMARKET LOGIN SERVICE
======================================================

Responsibilities:
1. Find a registered user.
2. Verify the submitted password.
3. Check account activation status.
4. Check email verification status.
5. Generate a short-lived access token.
6. Create a refresh-token session.
7. Store only the refresh-token hash in MongoDB.
*/

// Load bcryptjs to compare submitted passwords
// against the password hashes stored in MongoDB.
const bcrypt = require('bcryptjs');

// Load jsonwebtoken to generate the access token.
const jwt = require('jsonwebtoken');

// Load the MongoDB User model.
const User = require('../../users/models/user.model');

// Import the refresh-token session creation function.
const {
  createRefreshTokenSession
} = require('./refresh-token.service');

// --------------------------------------------------
// STEP 1: CREATE A STANDARD SERVICE ERROR
// --------------------------------------------------

function createServiceError(message, statusCode, code) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

// --------------------------------------------------
// STEP 2: VALIDATE ACCESS-TOKEN CONFIGURATION
// --------------------------------------------------

function getJwtConfiguration() {

  // Read the access-token secret.
  const accessSecret = process.env.JWT_ACCESS_SECRET;

  // Read the refresh-token secret.
  // We compare both secrets to ensure they are different.
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  // Read the access-token lifetime.
  const accessExpiresIn =
    process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';

  // Validate the access-token secret.
  if (
    !accessSecret ||
    accessSecret === 'my password' ||
    accessSecret.length < 32
  ) {
    throw createServiceError(
      'Access-token configuration is invalid.',
      500,
      'JWT_CONFIGURATION_ERROR'
    );
  }

  // Ensure the refresh-token secret exists.
  if (
    !refreshSecret ||
    refreshSecret === 'my password' ||
    refreshSecret.length < 32
  ) {
    throw createServiceError(
      'Refresh-token configuration is invalid.',
      500,
      'JWT_CONFIGURATION_ERROR'
    );
  }

  // Never use the same secret for both token types.
  if (accessSecret === refreshSecret) {
    throw createServiceError(
      'Access and refresh-token secrets must be different.',
      500,
      'JWT_CONFIGURATION_ERROR'
    );
  }

  return {
    accessSecret,
    accessExpiresIn
  };
}

// --------------------------------------------------
// STEP 3: AUTHENTICATE A USER
// --------------------------------------------------

async function loginUser({ email, password }) {

  // STEP 3A:
  // Find the user using their normalized email.
  //
  // The password field has select:false in the User model.
  // Explicitly request the stored password hash.

  const user = await User.findOne({
    email: email.trim().toLowerCase()
  }).select('+password');

  // STEP 3B:
  // Use the same error for unknown email addresses
  // and incorrect passwords.
  //
  // This prevents email-address enumeration.

  if (!user) {
    throw createServiceError(
      'Invalid email address or password.',
      401,
      'INVALID_CREDENTIALS'
    );
  }

  // STEP 3C:
  // Compare the submitted password with the stored hash.

  const passwordMatches = await bcrypt.compare(
    password,
    user.password
  );

  // Reject incorrect passwords.
  if (!passwordMatches) {
    throw createServiceError(
      'Invalid email address or password.',
      401,
      'INVALID_CREDENTIALS'
    );
  }

  // STEP 3D:
  // Check whether the account has been deactivated.

  if (!user.isActive) {
    throw createServiceError(
      'Your account is inactive. Please contact support.',
      403,
      'ACCOUNT_INACTIVE'
    );
  }

  // STEP 3E:
  // Require email verification before login.

  if (!user.isEmailVerified) {
    throw createServiceError(
      'Please verify your email address before logging in.',
      403,
      'EMAIL_NOT_VERIFIED'
    );
  }

  // STEP 3F:
  // Validate the JWT configuration.

  const jwtConfig = getJwtConfiguration();

  // STEP 3G:
  // Prepare the access-token payload.
  //
  // Never include passwords, password hashes,
  // email addresses or other sensitive information.

  const tokenPayload = {
    sub: user._id.toString(),
    role: user.role
  };

  // STEP 3H:
  // Generate the short-lived access token.
  //
  // This token is verified by authenticate middleware.

  const accessToken = jwt.sign(
    tokenPayload,
    jwtConfig.accessSecret,
    {
      algorithm: 'HS256',
      expiresIn: jwtConfig.accessExpiresIn,
      issuer: 'kobomarket-api',
      audience: 'kobomarket-client'
    }
  );

  // STEP 3I:
  // Create a refresh-token session.
  //
  // The refresh-token service:
  // 1. Generates a unique refresh token.
  // 2. Assigns a unique token identifier.
  // 3. Calculates the expiration date.
  // 4. Hashes the token using SHA-256.
  // 5. Stores only the hash in MongoDB.
  //
  // The original refresh token is returned to the caller.

  const refreshSession = await createRefreshTokenSession({
    userId: user._id.toString()
  });

  // STEP 3J:
  // Return safe user information and both tokens.
  //
  // Never return the password hash or stored token hash.

  return {
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified
    },

    accessToken,

    refreshToken: refreshSession.refreshToken
  };
}

// --------------------------------------------------
// STEP 4: EXPORT THE LOGIN SERVICE
// --------------------------------------------------

module.exports = {
  loginUser,
  createServiceError,
  getJwtConfiguration
};
