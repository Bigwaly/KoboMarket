
// Mock the email-verification service.
//
// The registration controller loads the registration service,
// which imports this service. Mocking it prevents Jest from
// initializing the real Resend email client during these tests.

jest.mock('../../modules/auth/services/email-verification.service', () => ({
  verifyEmail: jest.fn(),
  resendVerificationEmail: jest.fn(),
  sendVerificationEmail: jest.fn()
}));



// Mock the login service before loading the Express application.
jest.mock('../../modules/auth/services/login.service', () => ({
  loginUser: jest.fn()
}));

// Import Supertest to send HTTP requests to Express.
const request = require('supertest');

// Import the mocked login service.
const {
  loginUser
} = require('../../modules/auth/services/login.service');

// Import the Express application.
const app = require('../../app');

// Import the login rate limiter so its counter can be reset.
const {
  loginRateLimit
} = require('../../middleware/auth-rate-limit.middleware');

// Test account credentials.
const validCredentials = {
  email: 'customer@example.com',
  password: 'StrongPassword123!'
};

// Successful login response returned by the mocked service.
const successfulLoginResult = {
  user: {
    id: '507f1f77bcf86cd799439011',
    name: 'Test Customer',
    email: 'customer@example.com',
    role: 'customer',
    isActive: true,
    isEmailVerified: true
  },
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token'
};

// Reset mocks and the rate limiter before every test.
beforeEach(() => {
  jest.clearAllMocks();

  // Reset the login rate limiter for the local test IP.
  loginRateLimit.resetKey('127.0.0.1');
});

// =====================================================
// TEST 1: SUCCESSFUL LOGIN
// =====================================================

test('returns HTTP 200 when login succeeds', async () => {
  loginUser.mockResolvedValue(successfulLoginResult);

  const response = await request(app)
    .post('/api/auth/login')
    .send(validCredentials);

  expect(response.status).toBe(200);

  expect(response.body.success).toBe(true);

  expect(response.body.message).toBe('Login successful.');

  expect(response.body.data.user.email).toBe(
    'customer@example.com'
  );

  expect(response.body.data.accessToken).toBe(
    'mock-access-token'
  );

  expect(response.body.data.refreshToken).toBe(
    'mock-refresh-token'
  );

  expect(loginUser).toHaveBeenCalledWith(validCredentials);
});

// =====================================================
// TEST 2: EMAIL NORMALIZATION
// =====================================================

test('normalizes the email address before calling the login service', async () => {
  loginUser.mockResolvedValue(successfulLoginResult);

  const response = await request(app)
    .post('/api/auth/login')
    .send({
      email: '  CUSTOMER@EXAMPLE.COM  ',
      password: 'StrongPassword123!'
    });

  expect(response.status).toBe(200);

  expect(loginUser).toHaveBeenCalledWith({
    email: 'customer@example.com',
    password: 'StrongPassword123!'
  });
});

// =====================================================
// TEST 3: INVALID EMAIL ADDRESS
// =====================================================

test('returns HTTP 400 when the email address is invalid', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'invalid-email',
      password: 'StrongPassword123!'
    });

  expect(response.status).toBe(400);

  expect(response.body.success).toBe(false);

  expect(response.body.message).toBe(
    'Login validation failed.'
  );

  expect(loginUser).not.toHaveBeenCalled();
});

// =====================================================
// TEST 4: MISSING PASSWORD
// =====================================================

test('returns HTTP 400 when the password is missing', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'customer@example.com'
    });

  expect(response.status).toBe(400);

  expect(response.body.success).toBe(false);

  expect(loginUser).not.toHaveBeenCalled();
});

// =====================================================
// TEST 5: INCORRECT LOGIN CREDENTIALS
// =====================================================

test('returns HTTP 401 when the login credentials are incorrect', async () => {
  const loginError = new Error('Invalid email or password.');

  loginError.statusCode = 401;
  loginError.code = 'INVALID_CREDENTIALS';

  loginUser.mockRejectedValue(loginError);

  const response = await request(app)
    .post('/api/auth/login')
    .send(validCredentials);

  expect(response.status).toBe(401);

  expect(response.body.success).toBe(false);

  expect(response.body.code).toBe('INVALID_CREDENTIALS');
});

// =====================================================
// TEST 6: INACTIVE ACCOUNT
// =====================================================

test('returns HTTP 403 when the account is inactive', async () => {
  const loginError = new Error('This account is inactive.');

  loginError.statusCode = 403;
  loginError.code = 'ACCOUNT_INACTIVE';

  loginUser.mockRejectedValue(loginError);

  const response = await request(app)
    .post('/api/auth/login')
    .send(validCredentials);

  expect(response.status).toBe(403);

  expect(response.body.success).toBe(false);

  expect(response.body.code).toBe('ACCOUNT_INACTIVE');
});

// =====================================================
// TEST 7: UNVERIFIED EMAIL
// =====================================================

test('returns HTTP 403 when the email address is not verified', async () => {
  const loginError = new Error('Please verify your email address.');

  loginError.statusCode = 403;
  loginError.code = 'EMAIL_NOT_VERIFIED';

  loginUser.mockRejectedValue(loginError);

  const response = await request(app)
    .post('/api/auth/login')
    .send(validCredentials);

  expect(response.status).toBe(403);

  expect(response.body.success).toBe(false);

  expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
});

// =====================================================
// TEST 8: UNEXPECTED SERVER ERROR
// =====================================================

test('returns HTTP 500 without exposing unexpected internal errors', async () => {
  loginUser.mockRejectedValue(
    new Error('Sensitive internal database error.')
  );

  // Prevent the expected error log from cluttering test output.
  const consoleErrorSpy = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  try {
    const response = await request(app)
      .post('/api/auth/login')
      .send(validCredentials);

    expect(response.status).toBe(500);

    expect(response.body.success).toBe(false);

    expect(response.body.message).toBe(
      'An unexpected error occurred during login.'
    );

    expect(response.body.message).not.toContain(
      'Sensitive internal database error.'
    );
  } finally {
    consoleErrorSpy.mockRestore();
  }
});

// =====================================================
// TEST 9: LOGIN RATE LIMITING
// =====================================================

test('returns HTTP 429 after more than 5 login attempts within 15 minutes', async () => {
  // Every login attempt will otherwise succeed.
  loginUser.mockResolvedValue(successfulLoginResult);

  // The first five requests should be allowed.
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await request(app)
      .post('/api/auth/login')
      .send(validCredentials);

    expect(response.status).toBe(200);
  }

  // The sixth request should be rejected by the rate limiter.
  const limitedResponse = await request(app)
    .post('/api/auth/login')
    .send(validCredentials);

  expect(limitedResponse.status).toBe(429);

  expect(limitedResponse.body.success).toBe(false);

  expect(limitedResponse.body.message).toContain(
    'Too many login attempts'
  );

  // The sixth request must not reach the login service.
  expect(loginUser).toHaveBeenCalledTimes(5);
});

// =====================================================
// TEST 10: UNKNOWN AUTHENTICATION ENDPOINT
// =====================================================

test('returns HTTP 404 for an unknown authentication endpoint', async () => {
  const response = await request(app)
    .post('/api/auth/unknown-endpoint')
    .send({});

  expect(response.status).toBe(404);

  expect(response.body.success).toBe(false);
});
