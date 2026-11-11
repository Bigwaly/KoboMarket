
// Mock the email verification service before loading the app.
jest.mock('../../modules/auth/services/email-verification.service', () => ({
  verifyEmail: jest.fn(),
  resendVerificationEmail: jest.fn(),
  sendVerificationEmail: jest.fn()
}));

// Import Supertest to make HTTP requests to Express.
const request = require('supertest');

// Import the mocked verification service.
const {
  verifyEmail,
  resendVerificationEmail
} = require('../../modules/auth/services/email-verification.service');

// Import the Express application.
const app = require('../../app');

// Import rate-limit middleware so test counters can be reset.
const {
  verifyEmailRateLimit,
  resendVerificationRateLimit
} = require('../../middleware/auth-rate-limit.middleware');

// Reset mocks and rate-limit counters before every test.
beforeEach(() => {
  // Clear all mocked function calls and results.
  jest.clearAllMocks();

  // Reset the verification rate limiter for the local test IP.
  verifyEmailRateLimit.resetKey('127.0.0.1');

  // Reset the resend rate limiter for the local test IP.
  resendVerificationRateLimit.resetKey('127.0.0.1');
});

// =====================================================
// TEST 1: SUCCESSFUL EMAIL VERIFICATION
// =====================================================

test('returns HTTP 200 when email verification succeeds', async () => {
  verifyEmail.mockResolvedValue({
    id: '507f1f77bcf86cd799439011',
    name: 'Test Customer',
    email: 'customer@example.com',
    isEmailVerified: true
  });

  const response = await request(app)
    .post('/api/auth/verify-email')
    .send({
      token: 'a'.repeat(64)
    });

  expect(response.status).toBe(200);

  expect(response.body.success).toBe(true);

  expect(response.body.data.user.isEmailVerified).toBe(true);

  expect(verifyEmail).toHaveBeenCalledWith({
    token: 'a'.repeat(64)
  });
});

// =====================================================
// TEST 2: INVALID VERIFICATION REQUEST
// =====================================================

test('returns HTTP 400 when the verification token is invalid', async () => {
  const response = await request(app)
    .post('/api/auth/verify-email')
    .send({
      token: 'invalid-token'
    });

  expect(response.status).toBe(400);

  expect(response.body.success).toBe(false);

  expect(verifyEmail).not.toHaveBeenCalled();
});

// =====================================================
// TEST 3: INVALID OR EXPIRED TOKEN
// =====================================================

test('returns HTTP 400 when the service rejects the token', async () => {
  const verificationError = new Error(
    'Invalid or expired verification link.'
  );

  verificationError.statusCode = 400;
  verificationError.code = 'INVALID_VERIFICATION_TOKEN';

  verifyEmail.mockRejectedValue(verificationError);

  const response = await request(app)
    .post('/api/auth/verify-email')
    .send({
      token: 'b'.repeat(64)
    });

  expect(response.status).toBe(400);

  expect(response.body.code).toBe('INVALID_VERIFICATION_TOKEN');
});

// =====================================================
// TEST 4: SUCCESSFUL RESEND REQUEST
// =====================================================

test('returns HTTP 202 when a verification email is requested', async () => {
  resendVerificationEmail.mockResolvedValue({
    emailSent: true
  });

  const response = await request(app)
    .post('/api/auth/resend-verification')
    .send({
      email: 'customer@example.com'
    });

  expect(response.status).toBe(202);

  expect(response.body.success).toBe(true);

  expect(response.body.message).toContain(
    'If an unverified account exists'
  );

  expect(resendVerificationEmail).toHaveBeenCalledWith({
    email: 'customer@example.com'
  });
});

// =====================================================
// TEST 5: UNKNOWN EMAIL ADDRESS
// =====================================================

test('returns the same HTTP 202 response for an unknown email', async () => {
  resendVerificationEmail.mockResolvedValue({
    emailSent: false
  });

  const response = await request(app)
    .post('/api/auth/resend-verification')
    .send({
      email: 'unknown@example.com'
    });

  expect(response.status).toBe(202);

  expect(response.body.success).toBe(true);

  expect(response.body.message).toContain(
    'If an unverified account exists'
  );
});

// =====================================================
// TEST 6: EMAIL SERVICE FAILURE
// =====================================================

test('does not expose email delivery errors to the caller', async () => {
  resendVerificationEmail.mockRejectedValue(
    new Error('Simulated Resend delivery failure.')
  );

  const response = await request(app)
    .post('/api/auth/resend-verification')
    .send({
      email: 'customer@example.com'
    });

  expect(response.status).toBe(202);

  expect(response.body.success).toBe(true);

  expect(response.body.message).toContain(
    'If an unverified account exists'
  );
});

// =====================================================
// TEST 7: INVALID RESEND REQUEST
// =====================================================

test('returns HTTP 400 when the resend email address is invalid', async () => {
  const response = await request(app)
    .post('/api/auth/resend-verification')
    .send({
      email: 'not-an-email'
    });

  expect(response.status).toBe(400);

  expect(response.body.success).toBe(false);

  expect(resendVerificationEmail).not.toHaveBeenCalled();
});

// =====================================================
// TEST 8: NON-EXISTENT API ENDPOINT
// =====================================================

test('returns HTTP 404 for an unknown API endpoint', async () => {
  const response = await request(app)
    .post('/api/auth/unknown-endpoint')
    .send({});

  expect(response.status).toBe(404);

  expect(response.body.success).toBe(false);
});
