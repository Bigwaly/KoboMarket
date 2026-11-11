
// Mock the MongoDB User model.
jest.mock('../../modules/users/models/user.model', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  deleteOne: jest.fn()
}));

// Mock the PostgreSQL wallet service.
jest.mock('../../modules/wallet/services/wallet.service', () => ({
  createWallet: jest.fn(),
  getWalletByUserId: jest.fn()
}));

// Mock the email verification service.
// This prevents tests from sending real emails.
jest.mock('../../modules/auth/services/email-verification.service', () => ({
  sendVerificationEmail: jest.fn()
}));

// Import the mocked dependencies.
const User = require('../../modules/users/models/user.model');

const {
  createWallet,
  getWalletByUserId
} = require('../../modules/wallet/services/wallet.service');

const {
  sendVerificationEmail
} = require('../../modules/auth/services/email-verification.service');

// Import the registration service after declaring its mocks.
const {
  registerUser
} = require('../../modules/auth/services/register.service');

// Reusable registration details.
const registrationData = {
  name: 'Test Customer',
  email: 'test.customer@example.com',
  password: 'SecurePass123'
};

// Reusable fake MongoDB customer.
const fakeUser = {
  _id: {
    toString: () => '507f1f77bcf86cd799439011'
  },
  name: 'Test Customer',
  email: 'test.customer@example.com',
  role: 'customer',
  isActive: true,
  isEmailVerified: false,
  createdAt: new Date('2026-11-08T10:00:00.000Z')
};

// Prepare fresh mocks before every test.
beforeEach(() => {
  jest.clearAllMocks();

  User.findOne.mockResolvedValue(null);

  User.create.mockResolvedValue(fakeUser);

  User.deleteOne.mockResolvedValue({
    deletedCount: 1
  });

  createWallet.mockResolvedValue({
    success: true
  });

  getWalletByUserId.mockResolvedValue({
    wallet: {
      id: '1'
    },
    ledgerAccount: {
      id: '14'
    }
  });

  // Simulate successful verification email delivery.
  sendVerificationEmail.mockResolvedValue({
    emailSent: true,
    expiresAt: new Date('2026-11-08T10:15:00.000Z')
  });
});

// TEST 1: Normal registration and email delivery succeed.
test('registers a customer, creates a wallet and sends verification email', async () => {
  const result = await registerUser(registrationData);

  expect(result.user.email).toBe(registrationData.email);

  expect(result.user.role).toBe('customer');

  expect(result.verificationEmailSent).toBe(true);

  expect(createWallet).toHaveBeenCalledWith({
    userId: fakeUser._id.toString()
  });

  expect(sendVerificationEmail).toHaveBeenCalledWith({
    userId: fakeUser._id.toString()
  });

  expect(User.deleteOne).not.toHaveBeenCalled();
});

// TEST 2: Wallet creation fails and no wallet exists.
test('deletes the MongoDB customer when wallet creation fails and no wallet exists', async () => {
  createWallet.mockRejectedValue(
    new Error('Simulated PostgreSQL wallet creation failure.')
  );

  getWalletByUserId.mockRejectedValue(
    Object.assign(
      new Error('Wallet not found for this user.'),
      {
        statusCode: 404,
        code: 'WALLET_NOT_FOUND'
      }
    )
  );

  await expect(
    registerUser(registrationData)
  ).rejects.toMatchObject({
    statusCode: 503,
    code: 'REGISTRATION_INCOMPLETE'
  });

  expect(User.deleteOne).toHaveBeenCalledWith({
    _id: fakeUser._id
  });

  // Email must not be sent when wallet creation is incomplete.
  expect(sendVerificationEmail).not.toHaveBeenCalled();
});

// TEST 3: Wallet creation reports failure, but a complete wallet exists.
test('preserves the customer when wallet and ledger account already exist', async () => {
  createWallet.mockRejectedValue(
    new Error('Simulated lost COMMIT confirmation.')
  );

  getWalletByUserId.mockResolvedValue({
    wallet: {
      id: '1'
    },
    ledgerAccount: {
      id: '14'
    }
  });

  const result = await registerUser(registrationData);

  expect(result.user.email).toBe(registrationData.email);

  expect(result.verificationEmailSent).toBe(true);

  expect(User.deleteOne).not.toHaveBeenCalled();

  expect(getWalletByUserId).toHaveBeenCalledWith({
    userId: fakeUser._id.toString()
  });

  expect(sendVerificationEmail).toHaveBeenCalledWith({
    userId: fakeUser._id.toString()
  });
});

// TEST 4: PostgreSQL verification itself fails.
test('preserves the customer when wallet state cannot be verified', async () => {
  createWallet.mockRejectedValue(
    new Error('Simulated wallet creation failure.')
  );

  getWalletByUserId.mockRejectedValue(
    new Error('Simulated PostgreSQL connection failure.')
  );

  await expect(
    registerUser(registrationData)
  ).rejects.toMatchObject({
    statusCode: 503,
    code: 'REGISTRATION_REQUIRES_RECONCILIATION'
  });

  expect(User.deleteOne).not.toHaveBeenCalled();

  // Email must not be sent while wallet state is uncertain.
  expect(sendVerificationEmail).not.toHaveBeenCalled();
});

// TEST 5: Email delivery fails after account and wallet creation.
test('preserves the customer and wallet when verification email delivery fails', async () => {
  sendVerificationEmail.mockRejectedValue(
    new Error('Simulated Resend delivery failure.')
  );

  const result = await registerUser(registrationData);

  expect(result.user.email).toBe(registrationData.email);

  expect(result.verificationEmailSent).toBe(false);

  expect(createWallet).toHaveBeenCalled();

  expect(sendVerificationEmail).toHaveBeenCalled();

  // A failed email must not delete the customer.
  expect(User.deleteOne).not.toHaveBeenCalled();
});
