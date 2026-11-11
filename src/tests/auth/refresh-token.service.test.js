
// Mock the MongoDB refresh-token model before loading the service.
jest.mock('../../modules/auth/models/refresh-token.model', () => ({
  create: jest.fn()
}));

// Load the mocked refresh-token model.
const RefreshToken = require('../../modules/auth/models/refresh-token.model');

// Load the refresh-token service functions.
const {
  hashRefreshToken,
  getRefreshTokenExpiry,
  createRefreshTokenSession
} = require('../../modules/auth/services/refresh-token.service');

// Keep the original environment configuration.
const originalEnvironment = { ...process.env };

// Restore environment configuration after every test.
afterAll(() => {
  process.env = originalEnvironment;
});

// Reset mocks before every test.
beforeEach(() => {
  jest.clearAllMocks();

  process.env.JWT_REFRESH_SECRET =
    'test-refresh-secret-with-more-than-32-characters';

  process.env.REFRESH_TOKEN_EXPIRES_IN = '7d';

  RefreshToken.create.mockResolvedValue({
    _id: 'test-refresh-token-id'
  });
});

// --------------------------------------------------
// TEST 1: TOKEN HASHING
// --------------------------------------------------

test('generates a SHA-256 hash for a refresh token', () => {
  const hash = hashRefreshToken('sample-refresh-token');

  expect(hash).toMatch(/^[a-f0-9]{64}$/);

  expect(hash).not.toBe('sample-refresh-token');
});

// --------------------------------------------------
// TEST 2: TOKEN EXPIRATION CALCULATION
// --------------------------------------------------

test('calculates seven days in milliseconds', () => {
  expect(getRefreshTokenExpiry('7d')).toBe(
    7 * 24 * 60 * 60 * 1000
  );
});

// --------------------------------------------------
// TEST 3: INVALID EXPIRATION CONFIGURATION
// --------------------------------------------------

test('rejects an invalid expiration configuration', () => {
  expect(() => {
    getRefreshTokenExpiry('seven days');
  }).toThrow('Refresh-token expiry configuration is invalid.');
});

// --------------------------------------------------
// TEST 4: REFRESH TOKEN CREATION
// --------------------------------------------------

test('creates a refresh token and stores only its hash', async () => {
  const result = await createRefreshTokenSession({
    userId: '507f1f77bcf86cd799439011'
  });

  expect(result.refreshToken).toBeDefined();

  expect(result.familyId).toBeDefined();

  expect(result.expiresAt).toBeInstanceOf(Date);

  expect(RefreshToken.create).toHaveBeenCalledTimes(1);

  const savedRecord = RefreshToken.create.mock.calls[0][0];

  expect(savedRecord.userId).toBe(
    '507f1f77bcf86cd799439011'
  );

  expect(savedRecord.tokenHash).toMatch(/^[a-f0-9]{64}$/);

  expect(savedRecord.tokenHash).not.toBe(
    result.refreshToken
  );

  expect(savedRecord.familyId).toBe(result.familyId);

  expect(savedRecord.expiresAt).toBeInstanceOf(Date);
});

// --------------------------------------------------
// TEST 5: STRONG SECRET VALIDATION
// --------------------------------------------------

test('rejects a weak refresh-token secret', async () => {
  process.env.JWT_REFRESH_SECRET = 'weak-secret';

  await expect(
    createRefreshTokenSession({
      userId: '507f1f77bcf86cd799439011'
    })
  ).rejects.toMatchObject({
    statusCode: 500,
    code: 'JWT_CONFIGURATION_ERROR'
  });

  expect(RefreshToken.create).not.toHaveBeenCalled();
});

// --------------------------------------------------
// TEST 6: INVALID USER IDENTIFIER
// --------------------------------------------------

test('rejects an invalid user identifier', async () => {
  await expect(
    createRefreshTokenSession({
      userId: null
    })
  ).rejects.toMatchObject({
    statusCode: 400,
    code: 'INVALID_USER_ID'
  });

  expect(RefreshToken.create).not.toHaveBeenCalled();
});
