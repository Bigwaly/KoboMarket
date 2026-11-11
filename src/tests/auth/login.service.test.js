
/*
======================================================
KOBOMARKET LOGIN SERVICE TESTS
======================================================

These tests verify:
1. User lookup.
2. Password verification.
3. Account activation.
4. Email verification.
5. Access-token generation.
6. Refresh-token session creation.
7. JWT configuration security.
*/

// Mock the MongoDB User model.
jest.mock('../../modules/users/models/user.model', () => ({
  findOne: jest.fn()
}));

// Mock bcrypt password comparison.
jest.mock('bcryptjs', () => ({
  compare: jest.fn()
}));

// Mock JSON Web Token generation.
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn()
}));

// Mock refresh-token session creation.
// This prevents tests from writing to MongoDB.
jest.mock('../../modules/auth/services/refresh-token.service', () => ({
  createRefreshTokenSession: jest.fn()
}));

// Import mocked dependencies.
const User = require('../../modules/users/models/user.model');

const bcrypt = require('bcryptjs');

const jwt = require('jsonwebtoken');

const {
  createRefreshTokenSession
} = require('../../modules/auth/services/refresh-token.service');

// Import login service after declaring the mocks.
const {
  loginUser,
  getJwtConfiguration
} = require('../../modules/auth/services/login.service');

// Preserve the original environment configuration.
const originalEnvironment = { ...process.env };

// Restore environment after all tests.
afterAll(() => {
  process.env = originalEnvironment;
});

// Reusable login details.
const loginData = {
  email: 'test.customer@example.com',
  password: 'SecurePass123'
};

// Reusable fake MongoDB user.
const fakeUser = {
  _id: {
    toString: () => '507f1f77bcf86cd799439011'
  },
  name: 'Test Customer',
  email: 'test.customer@example.com',
  password: 'hashed-password-value',
  role: 'customer',
  isActive: true,
  isEmailVerified: true
};

// Configure a valid JWT environment.
function setValidJwtEnvironment() {
  process.env.JWT_ACCESS_SECRET =
    'test-access-secret-with-more-than-32-characters';

  process.env.JWT_REFRESH_SECRET =
    'test-refresh-secret-with-more-than-32-characters';

  process.env.ACCESS_TOKEN_EXPIRES_IN = '15m';
}

// Prepare mocks before every test.
beforeEach(() => {
  jest.clearAllMocks();

  setValidJwtEnvironment();

  // Simulate a successful user lookup.
  User.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue(fakeUser)
  });

  // Simulate a correct password.
  bcrypt.compare.mockResolvedValue(true);

  // Simulate access-token generation.
  jwt.sign.mockReturnValue('generated-access-token');

  // Simulate successful refresh-token session creation.
  createRefreshTokenSession.mockResolvedValue({
    refreshToken: 'generated-refresh-token',
    familyId: 'test-refresh-family',
    expiresAt: new Date('2026-11-16T10:00:00.000Z')
  });
});

// --------------------------------------------------
// TEST 1: SUCCESSFUL LOGIN
// --------------------------------------------------

test('logs in a verified customer and returns safe user information and tokens', async () => {
  const result = await loginUser(loginData);

  expect(result.user).toEqual({
    id: '507f1f77bcf86cd799439011',
    name: 'Test Customer',
    email: 'test.customer@example.com',
    role: 'customer',
    isActive: true,
    isEmailVerified: true
  });

  expect(result.accessToken).toBe('generated-access-token');

  expect(result.refreshToken).toBe('generated-refresh-token');

  // Password hashes must never be returned.
  expect(result.user.password).toBeUndefined();

  expect(User.findOne).toHaveBeenCalledWith({
    email: 'test.customer@example.com'
  });

  expect(bcrypt.compare).toHaveBeenCalledWith(
    loginData.password,
    fakeUser.password
  );
});

// --------------------------------------------------
// TEST 2: EMAIL NORMALIZATION
// --------------------------------------------------

test('normalizes the email address before searching for the user', async () => {
  await loginUser({
    email: '  TEST.CUSTOMER@EXAMPLE.COM  ',
    password: loginData.password
  });

  expect(User.findOne).toHaveBeenCalledWith({
    email: 'test.customer@example.com'
  });
});

// --------------------------------------------------
// TEST 3: UNKNOWN EMAIL ADDRESS
// --------------------------------------------------

test('rejects login when the email address does not exist', async () => {
  User.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue(null)
  });

  await expect(
    loginUser(loginData)
  ).rejects.toMatchObject({
    statusCode: 401,
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email address or password.'
  });

  expect(bcrypt.compare).not.toHaveBeenCalled();

  expect(jwt.sign).not.toHaveBeenCalled();

  expect(createRefreshTokenSession).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 4: INCORRECT PASSWORD
// --------------------------------------------------

test('rejects login when the password is incorrect', async () => {
  bcrypt.compare.mockResolvedValue(false);

  await expect(
    loginUser(loginData)
  ).rejects.toMatchObject({
    statusCode: 401,
    code: 'INVALID_CREDENTIALS'
  });

  expect(jwt.sign).not.toHaveBeenCalled();

  expect(createRefreshTokenSession).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 5: INACTIVE ACCOUNT
// --------------------------------------------------

test('rejects login when the user account is inactive', async () => {
  User.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      ...fakeUser,
      isActive: false
    })
  });

  await expect(
    loginUser(loginData)
  ).rejects.toMatchObject({
    statusCode: 403,
    code: 'ACCOUNT_INACTIVE'
  });

  expect(jwt.sign).not.toHaveBeenCalled();

  expect(createRefreshTokenSession).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 6: UNVERIFIED EMAIL
// --------------------------------------------------

test('rejects login when the user email is not verified', async () => {
  User.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      ...fakeUser,
      isEmailVerified: false
    })
  });

  await expect(
    loginUser(loginData)
  ).rejects.toMatchObject({
    statusCode: 403,
    code: 'EMAIL_NOT_VERIFIED'
  });

  expect(jwt.sign).not.toHaveBeenCalled();

  expect(createRefreshTokenSession).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 7: ACCESS-TOKEN GENERATION
// --------------------------------------------------

test('generates an access token with the expected payload and options', async () => {
  await loginUser(loginData);

  expect(jwt.sign).toHaveBeenCalledWith(
    {
      sub: '507f1f77bcf86cd799439011',
      role: 'customer'
    },
    process.env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '15m',
      issuer: 'kobomarket-api',
      audience: 'kobomarket-client'
    }
  );
});

// --------------------------------------------------
// TEST 8: REFRESH-TOKEN SESSION CREATION
// --------------------------------------------------

test('creates a refresh-token session using the MongoDB user identifier', async () => {
  await loginUser(loginData);

  expect(createRefreshTokenSession).toHaveBeenCalledTimes(1);

  expect(createRefreshTokenSession).toHaveBeenCalledWith({
    userId: '507f1f77bcf86cd799439011'
  });
});

// --------------------------------------------------
// TEST 9: MISSING ACCESS-TOKEN SECRET
// --------------------------------------------------

test('rejects login when the access-token secret is missing', async () => {
  delete process.env.JWT_ACCESS_SECRET;

  await expect(
    loginUser(loginData)
  ).rejects.toMatchObject({
    statusCode: 500,
    code: 'JWT_CONFIGURATION_ERROR'
  });

  expect(jwt.sign).not.toHaveBeenCalled();

  expect(createRefreshTokenSession).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 10: WEAK ACCESS-TOKEN SECRET
// --------------------------------------------------

test('rejects login when the access-token secret is too short', async () => {
  process.env.JWT_ACCESS_SECRET = 'weak-secret';

  await expect(
    loginUser(loginData)
  ).rejects.toMatchObject({
    statusCode: 500,
    code: 'JWT_CONFIGURATION_ERROR'
  });

  expect(jwt.sign).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 11: MISSING REFRESH-TOKEN SECRET
// --------------------------------------------------

test('rejects login when the refresh-token secret is missing', async () => {
  delete process.env.JWT_REFRESH_SECRET;

  await expect(
    loginUser(loginData)
  ).rejects.toMatchObject({
    statusCode: 500,
    code: 'JWT_CONFIGURATION_ERROR'
  });

  expect(jwt.sign).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 12: WEAK REFRESH-TOKEN SECRET
// --------------------------------------------------

test('rejects login when the refresh-token secret is too short', async () => {
  process.env.JWT_REFRESH_SECRET = 'weak-secret';

  await expect(
    loginUser(loginData)
  ).rejects.toMatchObject({
    statusCode: 500,
    code: 'JWT_CONFIGURATION_ERROR'
  });

  expect(jwt.sign).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 13: IDENTICAL TOKEN SECRETS
// --------------------------------------------------

test('rejects login when access and refresh-token secrets are identical', async () => {
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_ACCESS_SECRET;

  await expect(
    loginUser(loginData)
  ).rejects.toMatchObject({
    statusCode: 500,
    code: 'JWT_CONFIGURATION_ERROR'
  });

  expect(jwt.sign).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 14: JWT CONFIGURATION
// --------------------------------------------------

test('returns the correct access-token configuration', () => {
  const configuration = getJwtConfiguration();

  expect(configuration).toEqual({
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: '15m'
  });
});
