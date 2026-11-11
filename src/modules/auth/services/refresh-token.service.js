
// Load crypto to generate secure random values and token hashes.
const crypto = require('node:crypto');

// Load jsonwebtoken to create signed refresh tokens.
const jwt = require('jsonwebtoken');

// Load the MongoDB refresh-token model.
const RefreshToken = require('../models/refresh-token.model');

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
// STEP 2: HASH A REFRESH TOKEN
// --------------------------------------------------

function hashRefreshToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

// --------------------------------------------------
// STEP 3: READ JWT CONFIGURATION
// --------------------------------------------------

function getRefreshTokenConfiguration() {
  const secret = process.env.JWT_REFRESH_SECRET;

  const expiresIn =
    process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

  if (
    !secret ||
    secret === 'my password' ||
    secret.length < 32
  ) {
    throw createServiceError(
      'Refresh-token configuration is invalid.',
      500,
      'JWT_CONFIGURATION_ERROR'
    );
  }

  return {
    secret,
    expiresIn
  };
}

// --------------------------------------------------
// STEP 4: CONVERT TOKEN LIFETIME TO MILLISECONDS
// --------------------------------------------------

function getRefreshTokenExpiry(expiresIn) {
  // Accept simple JWT duration formats such as:
  // 15m, 1h, 7d and 30s.

  const match = /^(\d+)(s|m|h|d)$/.exec(expiresIn);

  if (!match) {
    throw createServiceError(
      'Refresh-token expiry configuration is invalid.',
      500,
      'JWT_CONFIGURATION_ERROR'
    );
  }

  const amount = Number(match[1]);

  const unit = match[2];

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw createServiceError(
      'Refresh-token expiry configuration is invalid.',
      500,
      'JWT_CONFIGURATION_ERROR'
    );
  }

  const duration = amount * multipliers[unit];

  if (!Number.isSafeInteger(duration)) {
    throw createServiceError(
      'Refresh-token expiry configuration is invalid.',
      500,
      'JWT_CONFIGURATION_ERROR'
    );
  }

  return duration;
}

// --------------------------------------------------
// STEP 5: CREATE AND STORE A REFRESH-TOKEN SESSION
// --------------------------------------------------

async function createRefreshTokenSession({
  userId,
  familyId = crypto.randomUUID()
}) {
  // STEP 5A:
  // Validate the customer identifier.

  if (!userId || typeof userId !== 'string') {
    throw createServiceError(
      'A valid customer identifier is required.',
      400,
      'INVALID_USER_ID'
    );
  }

  // STEP 5B:
  // Read refresh-token configuration.

  const configuration = getRefreshTokenConfiguration();

  // STEP 5C:
  // Calculate the token expiration time.

  const expiresAt = new Date(
    Date.now() +
    getRefreshTokenExpiry(configuration.expiresIn)
  );

  // STEP 5D:
  // Generate a unique signed refresh token.

  const refreshToken = jwt.sign(
    {
      sub: userId,
      jti: crypto.randomUUID()
    },
    configuration.secret,
    {
      expiresIn: configuration.expiresIn,
      issuer: 'kobomarket-api',
      audience: 'kobomarket-client'
    }
  );

  // STEP 5E:
  // Hash the refresh token before database storage.

  const tokenHash = hashRefreshToken(refreshToken);

  // STEP 5F:
  // Store only the hash in MongoDB.

  await RefreshToken.create({
    userId,
    tokenHash,
    familyId,
    expiresAt
  });

  // STEP 5G:
  // Return the original token to the application.
  // Never return the stored hash.

  return {
    refreshToken,
    familyId,
    expiresAt
  };
}

// --------------------------------------------------
// STEP 6: EXPORT THE SERVICE FUNCTIONS
// --------------------------------------------------

module.exports = {
  createServiceError,
  hashRefreshToken,
  getRefreshTokenExpiry,
  createRefreshTokenSession
};
