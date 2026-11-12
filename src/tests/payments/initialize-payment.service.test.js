
/**
 * PAYMENT INITIALIZATION SERVICE TESTS
 *
 * These tests verify customer eligibility, payment amount
 * validation, idempotency, and Paystack initialization.
 *
 * All external dependencies are mocked.
 * No real database changes or Paystack requests occur.
 */

// --------------------------------------------------
// STEP 1: MOCK THE MONGODB USER MODEL
// --------------------------------------------------

jest.mock('../../modules/users/models/user.model', () => ({
  findById: jest.fn()
}));


// --------------------------------------------------
// STEP 2: MOCK THE WALLET SERVICE
// --------------------------------------------------

jest.mock('../../modules/wallet/services/wallet.service', () => ({
  requireActiveWallet: jest.fn()
}));


// --------------------------------------------------
// STEP 3: MOCK THE PAYMENT REPOSITORY
// --------------------------------------------------

jest.mock('../../modules/payments/repositories/payment.repository', () => ({
  createOrGetPaymentAttempt: jest.fn(),
  saveCheckoutDetails: jest.fn(),
  markPaymentAttemptFailed: jest.fn()
}));


// --------------------------------------------------
// STEP 4: MOCK THE PAYSTACK SERVICE
// --------------------------------------------------

jest.mock('../../modules/payments/services/paystack.service', () => ({
  initializePaystackTransaction: jest.fn()
}));


// --------------------------------------------------
// STEP 5: IMPORT THE MOCKED DEPENDENCIES
// --------------------------------------------------

const User = require('../../modules/users/models/user.model');

const {
  requireActiveWallet
} = require('../../modules/wallet/services/wallet.service');

const {
  createOrGetPaymentAttempt,
  saveCheckoutDetails,
  markPaymentAttemptFailed
} = require('../../modules/payments/repositories/payment.repository');

const {
  initializePaystackTransaction
} = require('../../modules/payments/services/paystack.service');


// --------------------------------------------------
// STEP 6: IMPORT THE SERVICE UNDER TEST
// --------------------------------------------------

const {
  initializePayment
} = require('../../modules/payments/services/initialize-payment.service');


// --------------------------------------------------
// STEP 7: DEFINE REUSABLE TEST DATA
// --------------------------------------------------

// Test customer ID.
const testUserId = '507f1f77bcf86cd799439011';

// Test payment amount in Naira.
const testAmount = 1500;

// Expected amount in kobo.
const testAmountInKobo = 150000;

// Test idempotency key.
const testIdempotencyKey = 'kobomarket-payment-test-001';

// Fake customer returned by MongoDB.
const fakeUser = {
  _id: testUserId,
  email: 'customer@example.com',
  role: 'customer',
  isActive: true,
  isEmailVerified: true
};

// Fake newly created payment attempt.
const fakePaymentAttempt = {
  id: 'payment-attempt-test-001',
  user_id: testUserId,
  reference: 'KM-PAY-TEST-001',
  amount: testAmountInKobo,
  status: 'initializing'
};

// Fake Paystack checkout response.
const fakeCheckout = {
  authorizationUrl: 'https://checkout.paystack.com/test-checkout',
  accessCode: 'test-access-code',
  reference: 'KM-PAY-TEST-001'
};

// Fake payment attempt after checkout details are saved.
const fakeUpdatedPaymentAttempt = {
  ...fakePaymentAttempt,
  status: 'pending',
  authorization_url: fakeCheckout.authorizationUrl,
  access_code: fakeCheckout.accessCode
};


// --------------------------------------------------
// STEP 8: PREPARE MOCKS BEFORE EVERY TEST
// --------------------------------------------------

beforeEach(() => {

  // Reset mock call history and previous mock behaviour.
  jest.clearAllMocks();

  // Simulate finding an eligible customer.
  User.findById.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(fakeUser)
    })
  });

  // Simulate an active wallet and ledger account.
  requireActiveWallet.mockResolvedValue({
    wallet: {
      id: '1',
      status: 'active'
    },
    ledgerAccount: {
      id: '14',
      status: 'active'
    }
  });

  // Simulate successfully creating a new payment attempt.
  createOrGetPaymentAttempt.mockResolvedValue({
    created: true,
    paymentAttempt: fakePaymentAttempt
  });

  // Simulate successful Paystack initialization.
  initializePaystackTransaction.mockResolvedValue(fakeCheckout);

  // Simulate successfully saving checkout details.
  saveCheckoutDetails.mockResolvedValue(
    fakeUpdatedPaymentAttempt
  );

  // Simulate successfully marking an attempt as failed.
  markPaymentAttemptFailed.mockResolvedValue({
    ...fakePaymentAttempt,
    status: 'failed'
  });

});

// --------------------------------------------------
// TEST 1: SUCCESSFUL PAYMENT INITIALIZATION
// --------------------------------------------------

test('initializes a customer payment successfully', async () => {

  const result = await initializePayment({
    userId: testUserId,
    amount: testAmount,
    idempotencyKey: testIdempotencyKey
  });

  // Confirm the correct customer was retrieved.
  expect(User.findById).toHaveBeenCalledWith(testUserId);

  // Confirm the active wallet was checked.
  expect(requireActiveWallet).toHaveBeenCalledWith({
    userId: testUserId
  });

  // Confirm the payment attempt was created in kobo.
  expect(createOrGetPaymentAttempt).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: testUserId,
      idempotencyKey: testIdempotencyKey,
      amount: testAmountInKobo
    })
  );

  // Confirm Paystack received the customer's email.
  expect(initializePaystackTransaction).toHaveBeenCalledWith(
    expect.objectContaining({
      email: fakeUser.email,
      amount: testAmountInKobo,
   reference: expect.stringMatching(/^KM-PAY-[0-9a-f-]{36}$/)
    })
  );

  // Confirm checkout details were saved.
  expect(saveCheckoutDetails).toHaveBeenCalledWith({
    id: expect.any(String),
    authorizationUrl: fakeCheckout.authorizationUrl,
    accessCode: fakeCheckout.accessCode
  });

  // Confirm the returned payment information.
  expect(result).toEqual({
    paymentAttemptId: fakeUpdatedPaymentAttempt.id,
    reference: fakeUpdatedPaymentAttempt.reference,
    amount: testAmountInKobo,
    currency: 'NGN',
    status: 'pending',
    authorizationUrl: fakeCheckout.authorizationUrl,
    accessCode: fakeCheckout.accessCode,
    reused: false
  });

});


// --------------------------------------------------
// TEST 2: REUSE AN EXISTING PENDING PAYMENT
// --------------------------------------------------

test('reuses an existing pending payment with the same idempotency key', async () => {

  const existingPaymentAttempt = {
    ...fakeUpdatedPaymentAttempt
  };

  createOrGetPaymentAttempt.mockResolvedValue({
    created: false,
    paymentAttempt: existingPaymentAttempt
  });

  const result = await initializePayment({
    userId: testUserId,
    amount: testAmount,
    idempotencyKey: testIdempotencyKey
  });

  // Existing checkout details must be returned.
  expect(result.reused).toBe(true);

  expect(result.authorizationUrl).toBe(
    fakeCheckout.authorizationUrl
  );

  expect(result.accessCode).toBe(
    fakeCheckout.accessCode
  );

  // Paystack must not be contacted again.
  expect(initializePaystackTransaction).not.toHaveBeenCalled();

  // Existing checkout details must not be rewritten.
  expect(saveCheckoutDetails).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 3: REJECT AN INVALID PAYMENT AMOUNT
// --------------------------------------------------

test.each([
  0,
  -100,
  NaN,
  Infinity,
  '1500',
  1500.123
])('rejects an invalid payment amount: %s', async (invalidAmount) => {

  await expect(
    initializePayment({
      userId: testUserId,
      amount: invalidAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 400,
    code: 'INVALID_PAYMENT_AMOUNT'
  });

  // Invalid amounts must be rejected before database access.
  expect(User.findById).not.toHaveBeenCalled();

  expect(createOrGetPaymentAttempt).not.toHaveBeenCalled();

  expect(initializePaystackTransaction).not.toHaveBeenCalled();

});


// --------------------------------------------------
// HELPER: MOCK A CUSTOMER RECORD
// --------------------------------------------------

function mockCustomerRecord(customer) {

  User.findById.mockReturnValue({

    select: jest.fn().mockReturnValue({

      lean: jest.fn().mockResolvedValue(customer)

    })

  });

}


// --------------------------------------------------
// TEST 4: CUSTOMER DOES NOT EXIST
// --------------------------------------------------

test('rejects payment initialization when the customer does not exist', async () => {

  mockCustomerRecord(null);

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 404,
    code: 'CUSTOMER_NOT_FOUND'
  });

  expect(requireActiveWallet).not.toHaveBeenCalled();

  expect(createOrGetPaymentAttempt).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 5: CUSTOMER ACCOUNT IS INACTIVE
// --------------------------------------------------

test('rejects payment initialization for an inactive customer', async () => {

  mockCustomerRecord({
    ...fakeUser,
    isActive: false
  });

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 403,
    code: 'CUSTOMER_ACCOUNT_INACTIVE'
  });

  expect(requireActiveWallet).not.toHaveBeenCalled();

  expect(createOrGetPaymentAttempt).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 6: USER DOES NOT HAVE THE CUSTOMER ROLE
// --------------------------------------------------

test('rejects payment initialization for a non-customer role', async () => {

  mockCustomerRecord({
    ...fakeUser,
    role: 'admin'
  });

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 403,
    code: 'CUSTOMER_ROLE_REQUIRED'
  });

  expect(requireActiveWallet).not.toHaveBeenCalled();

  expect(createOrGetPaymentAttempt).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 7: CUSTOMER EMAIL IS NOT VERIFIED
// --------------------------------------------------

test('rejects payment initialization when the customer email is not verified', async () => {

  mockCustomerRecord({
    ...fakeUser,
    isEmailVerified: false
  });

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 403,
    code: 'CUSTOMER_EMAIL_NOT_VERIFIED'
  });

  expect(requireActiveWallet).not.toHaveBeenCalled();

  expect(createOrGetPaymentAttempt).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 8: CUSTOMER WALLET IS NOT ACTIVE
// --------------------------------------------------

test('rejects payment initialization when the wallet is inactive', async () => {

  requireActiveWallet.mockRejectedValue(
    Object.assign(
      new Error('Wallet is inactive.'),
      {
        statusCode: 403,
        code: 'WALLET_NOT_ACTIVE'
      }
    )
  );

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 403,
    code: 'WALLET_NOT_ACTIVE'
  });

  expect(createOrGetPaymentAttempt).not.toHaveBeenCalled();

  expect(initializePaystackTransaction).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 9: IDEMPOTENCY KEY BELONGS TO ANOTHER CUSTOMER
// --------------------------------------------------

test('rejects an idempotency key belonging to another customer', async () => {

  createOrGetPaymentAttempt.mockResolvedValue({

    created: false,

    paymentAttempt: {
      ...fakeUpdatedPaymentAttempt,
      user_id: '507f1f77bcf86cd799439099'
    }

  });

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 409,
    code: 'PAYMENT_IDEMPOTENCY_CONFLICT'
  });

  expect(initializePaystackTransaction).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 10: IDEMPOTENCY KEY REUSED WITH ANOTHER AMOUNT
// --------------------------------------------------

test('rejects an idempotency key previously used with a different amount', async () => {

  createOrGetPaymentAttempt.mockResolvedValue({

    created: false,

    paymentAttempt: {
      ...fakeUpdatedPaymentAttempt,
      amount: 250000
    }

  });

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 409,
    code: 'PAYMENT_AMOUNT_CONFLICT'
  });

  expect(initializePaystackTransaction).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 11: EXISTING INITIALIZATION IS STILL PROCESSING
// --------------------------------------------------

test('does not initialize Paystack again when an attempt is still initializing', async () => {

  createOrGetPaymentAttempt.mockResolvedValue({

    created: false,

    paymentAttempt: {
      ...fakePaymentAttempt,
      status: 'initializing'
    }

  });

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 409,
    code: 'PAYMENT_INITIALIZATION_IN_PROGRESS'
  });

  expect(initializePaystackTransaction).not.toHaveBeenCalled();

  expect(saveCheckoutDetails).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 12: FAILED ATTEMPT CANNOT BE REOPENED
// --------------------------------------------------

test('does not reopen a previously failed payment attempt', async () => {

  createOrGetPaymentAttempt.mockResolvedValue({

    created: false,

    paymentAttempt: {
      ...fakePaymentAttempt,
      status: 'failed'
    }

  });

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 409,
    code: 'PAYMENT_ATTEMPT_NOT_REUSABLE'
  });

  expect(initializePaystackTransaction).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 13: COMPLETED ATTEMPT CANNOT BE REOPENED
// --------------------------------------------------

test('does not reopen a previously successful payment attempt', async () => {

  createOrGetPaymentAttempt.mockResolvedValue({

    created: false,

    paymentAttempt: {
      ...fakeUpdatedPaymentAttempt,
      status: 'success'
    }

  });

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 409,
    code: 'PAYMENT_ATTEMPT_NOT_REUSABLE'
  });

  expect(initializePaystackTransaction).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 14: DEFINITIVE PAYSTACK REJECTION
// --------------------------------------------------

test('marks the payment attempt as failed after a definitive Paystack rejection', async () => {

  initializePaystackTransaction.mockRejectedValue(
    Object.assign(
      new Error('Paystack rejected the transaction.'),
      {
        definitive: true
      }
    )
  );

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 502,
    code: 'PAYSTACK_INITIALIZATION_REJECTED'
  });

  // A definitive rejection must mark the attempt as failed.
  expect(markPaymentAttemptFailed).toHaveBeenCalledWith({
    id: expect.any(String)
  });

  expect(saveCheckoutDetails).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 15: AMBIGUOUS PAYSTACK FAILURE
// --------------------------------------------------

test('keeps the payment attempt initializing after an ambiguous Paystack failure', async () => {

  initializePaystackTransaction.mockRejectedValue(
    new Error('Simulated network timeout.')
  );

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 503,
    code: 'PAYSTACK_INITIALIZATION_UNCONFIRMED'
  });

  // An ambiguous failure must not mark the attempt as failed.
  expect(markPaymentAttemptFailed).not.toHaveBeenCalled();

  // Checkout details must not be saved without confirmation.
  expect(saveCheckoutDetails).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 16: FAILURE TO SAVE CHECKOUT DETAILS
// --------------------------------------------------

test('rejects when Paystack succeeds but checkout details cannot be saved', async () => {

  saveCheckoutDetails.mockResolvedValue(null);

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 503,
    code: 'PAYMENT_CHECKOUT_SAVE_FAILED'
  });

  expect(initializePaystackTransaction).toHaveBeenCalled();

  expect(saveCheckoutDetails).toHaveBeenCalled();

});

// --------------------------------------------------
// TEST 17: MISSING CUSTOMER ID
// --------------------------------------------------

test('rejects payment initialization without a valid customer ID', async () => {

  await expect(
    initializePayment({
      userId: '',
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 401,
    code: 'PAYMENT_AUTHENTICATION_REQUIRED'
  });

  expect(User.findById).not.toHaveBeenCalled();

  expect(createOrGetPaymentAttempt).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 18: AMOUNT EXCEEDS THE SAFE INTEGER LIMIT
// --------------------------------------------------

test('rejects a payment amount that exceeds the supported kobo limit', async () => {

  await expect(
    initializePayment({
      userId: testUserId,
      amount: Number.MAX_SAFE_INTEGER,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 400,
    code: 'INVALID_PAYMENT_AMOUNT'
  });

  // The amount must be rejected before database access.
  expect(User.findById).not.toHaveBeenCalled();

  expect(createOrGetPaymentAttempt).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 19: CUSTOMER EMAIL IS MISSING
// --------------------------------------------------

test('rejects payment initialization when the customer has no email address', async () => {

  mockCustomerRecord({
    ...fakeUser,
    email: ''
  });

  await expect(
    initializePayment({
      userId: testUserId,
      amount: testAmount,
      idempotencyKey: testIdempotencyKey
    })
  ).rejects.toMatchObject({
    statusCode: 403,
    code: 'CUSTOMER_EMAIL_NOT_VERIFIED'
  });

  expect(requireActiveWallet).not.toHaveBeenCalled();

  expect(createOrGetPaymentAttempt).not.toHaveBeenCalled();

});
