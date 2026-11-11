
// Mock the MongoDB User model.
jest.mock('../../modules/users/models/user.model', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

// Mock the email verification token model.
jest.mock('../../modules/auth/models/email-verification-token.model', () => ({
  deleteMany: jest.fn(),
  create: jest.fn(),
  findOneAndDelete: jest.fn()
}));

// Mock the reusable email service.
jest.mock('../../services/email.service', () => ({
  sendEmail: jest.fn()
}));

// Import the mocked dependencies.
const User = require('../../modules/users/models/user.model');

const EmailVerificationToken = require(
  '../../modules/auth/models/email-verification-token.model'
);

const { sendEmail } = require('../../services/email.service');

// Import the service functions after defining the mocks.
const {
  sendVerificationEmail,
  resendVerificationEmail,
  verifyEmail
} = require('../../modules/auth/services/email-verification.service');

// Use a valid local frontend URL during tests.
process.env.FRONTEND_URL = 'http://localhost:3000';

// A reusable customer ID for our tests.
const TEST_USER_ID = '507f1f77bcf86cd799439011';

// A reusable valid verification token.
const TEST_TOKEN = 'a'.repeat(64);

// Calculate the SHA-256 hash expected in the database.
const crypto = require('node:crypto');

const TEST_TOKEN_HASH = crypto
  .createHash('sha256')
  .update(TEST_TOKEN)
  .digest('hex');

// Reset mocks before every test.
beforeEach(() => {
  jest.clearAllMocks();

  process.env.FRONTEND_URL = 'http://localhost:3000';

  EmailVerificationToken.deleteMany.mockResolvedValue({
    acknowledged: true,
    deletedCount: 0
  });

  EmailVerificationToken.create.mockResolvedValue({
    _id: 'verification-token-001'
  });

  sendEmail.mockResolvedValue({
    id: 'resend-email-001'
  });
});

// =====================================================
// TEST 1: SUCCESSFUL EMAIL VERIFICATION
// =====================================================

test('verifies a customer using a valid token', async () => {
  // Simulate a matching, unexpired token record.
  EmailVerificationToken.findOneAndDelete.mockResolvedValue({
    userId: TEST_USER_ID
  });

  // Simulate a successfully verified customer.
  User.findOneAndUpdate.mockResolvedValue({
    _id: TEST_USER_ID,
    name: 'Test Customer',
    email: 'customer@example.com',
    isEmailVerified: true
  });

  const result = await verifyEmail({
    token: TEST_TOKEN
  });

  expect(result.isEmailVerified).toBe(true);

  expect(EmailVerificationToken.findOneAndDelete).toHaveBeenCalledWith({
    tokenHash: TEST_TOKEN_HASH,
    expiresAt: {
      $gt: expect.any(Date)
    }
  });

  expect(User.findOneAndUpdate).toHaveBeenCalled();
});

// =====================================================
// TEST 2: INVALID TOKEN FORMAT
// =====================================================

test('rejects a token with an invalid format', async () => {
  await expect(
    verifyEmail({
      token: 'invalid-token'
    })
  ).rejects.toMatchObject({
    statusCode: 400,
    code: 'INVALID_VERIFICATION_TOKEN'
  });

  expect(
    EmailVerificationToken.findOneAndDelete
  ).not.toHaveBeenCalled();
});

// =====================================================
// TEST 3: UNKNOWN OR EXPIRED TOKEN
// =====================================================

test('rejects a token that does not exist or has expired', async () => {
  EmailVerificationToken.findOneAndDelete.mockResolvedValue(null);

  await expect(
    verifyEmail({
      token: TEST_TOKEN
    })
  ).rejects.toMatchObject({
    statusCode: 400,
    code: 'INVALID_VERIFICATION_TOKEN'
  });

  expect(User.findOneAndUpdate).not.toHaveBeenCalled();
});

// =====================================================
// TEST 4: TOKEN CANNOT BE REUSED
// =====================================================

test('rejects a verification token that has already been consumed', async () => {
  EmailVerificationToken.findOneAndDelete.mockResolvedValue(null);

  await expect(
    verifyEmail({
      token: TEST_TOKEN
    })
  ).rejects.toMatchObject({
    statusCode: 400,
    code: 'INVALID_VERIFICATION_TOKEN'
  });
});

// =====================================================
// TEST 5: CUSTOMER DOES NOT EXIST
// =====================================================

test('rejects verification when the token belongs to a missing customer', async () => {
  EmailVerificationToken.findOneAndDelete.mockResolvedValue({
    userId: TEST_USER_ID
  });

  User.findOneAndUpdate.mockResolvedValue(null);

  await expect(
    verifyEmail({
      token: TEST_TOKEN
    })
  ).rejects.toMatchObject({
    statusCode: 400,
    code: 'EMAIL_VERIFICATION_FAILED'
  });

  expect(EmailVerificationToken.deleteMany).toHaveBeenCalledWith({
    userId: TEST_USER_ID
  });
});

// =====================================================
// TEST 6: SEND A VERIFICATION EMAIL
// =====================================================

test('generates a hashed token and sends a verification email', async () => {
  User.findById.mockResolvedValue({
    _id: TEST_USER_ID,
    name: 'Test Customer',
    email: 'customer@example.com',
    isEmailVerified: false
  });

  const result = await sendVerificationEmail({
    userId: TEST_USER_ID
  });

  expect(result.emailSent).toBe(true);

  expect(EmailVerificationToken.create).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: TEST_USER_ID,
      tokenHash: expect.any(String),
      expiresAt: expect.any(Date)
    })
  );

  // The original token must not be stored in MongoDB.
  const savedToken = EmailVerificationToken.create.mock.calls[0][0];

  expect(savedToken.tokenHash).not.toBe(TEST_TOKEN);

  expect(sendEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'customer@example.com',
      subject: 'Verify your KoboMarket email address'
    })
  );
});

// =====================================================
// TEST 7: RESEND FOR AN UNKNOWN EMAIL
// =====================================================

test('does not send an email when the account does not exist', async () => {
  User.findOne.mockResolvedValue(null);

  const result = await resendVerificationEmail({
    email: 'unknown@example.com'
  });

  expect(result.emailSent).toBe(false);

  expect(sendEmail).not.toHaveBeenCalled();
});

// =====================================================
// TEST 8: RESEND FOR AN ALREADY VERIFIED ACCOUNT
// =====================================================

test('does not resend verification to an already verified account', async () => {
  User.findOne.mockResolvedValue({
    _id: TEST_USER_ID,
    email: 'customer@example.com',
    isEmailVerified: true
  });

  const result = await resendVerificationEmail({
    email: 'customer@example.com'
  });

  expect(result.alreadyVerified).toBe(true);

  expect(sendEmail).not.toHaveBeenCalled();
});

// =====================================================
// TEST 9: RESEND FOR AN UNVERIFIED ACCOUNT
// =====================================================

test('sends a new verification email to an unverified account', async () => {
  User.findOne.mockResolvedValue({
    _id: TEST_USER_ID,
    email: 'customer@example.com',
    isEmailVerified: false
  });

  User.findById.mockResolvedValue({
    _id: TEST_USER_ID,
    name: 'Test Customer',
    email: 'customer@example.com',
    isEmailVerified: false
  });

  const result = await resendVerificationEmail({
    email: ' CUSTOMER@EXAMPLE.COM '
  });

  expect(User.findOne).toHaveBeenCalledWith({
    email: 'customer@example.com'
  });

  expect(result.emailSent).toBe(true);

  expect(sendEmail).toHaveBeenCalledTimes(1);
});
