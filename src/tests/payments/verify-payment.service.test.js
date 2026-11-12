/**
 * PAYMENT VERIFICATION SERVICE TESTS
 *
 * These tests verify:
 * - Payment ownership and customer eligibility.
 * - Paystack transaction verification.
 * - Payment amount, currency and email matching.
 * - Wallet funding and idempotency.
 * - Payment status updates.
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
  fundWallet: jest.fn()
}));


// --------------------------------------------------
// STEP 3: MOCK THE PAYMENT REPOSITORY
// --------------------------------------------------

jest.mock('../../modules/payments/repositories/payment.repository', () => ({
  getPaymentAttemptByReference: jest.fn(),
  markPaymentAttemptSuccessful: jest.fn()
}));


// --------------------------------------------------
// STEP 4: MOCK THE PAYSTACK SERVICE
// --------------------------------------------------

jest.mock('../../modules/payments/services/paystack.service', () => ({
  verifyPaystackTransaction: jest.fn()
}));


// --------------------------------------------------
// STEP 5: IMPORT THE MOCKED DEPENDENCIES
// --------------------------------------------------

const User = require('../../modules/users/models/user.model');

const {
  fundWallet
} = require('../../modules/wallet/services/wallet.service');

const {
  getPaymentAttemptByReference,
  markPaymentAttemptSuccessful
} = require('../../modules/payments/repositories/payment.repository');

const {
  verifyPaystackTransaction
} = require('../../modules/payments/services/paystack.service');


// --------------------------------------------------
// STEP 6: IMPORT THE SERVICE UNDER TEST
// --------------------------------------------------

const {
  verifyPayment
} = require('../../modules/payments/services/verify-payment.service');


// --------------------------------------------------
// STEP 7: DEFINE REUSABLE TEST DATA
// --------------------------------------------------

// Test customer ID.
const testUserId = '507f1f77bcf86cd799439011';

// Test payment reference.
const testReference = 'KM-PAY-TEST-001';

// Expected payment amount in kobo.
const testAmountInKobo = 150000;

// Fake eligible customer returned by MongoDB.
const fakeUser = {
  _id: testUserId,
  email: 'customer@example.com',
  role: 'customer',
  isActive: true,
  isEmailVerified: true
};

// Fake pending payment attempt stored in PostgreSQL.
const fakePaymentAttempt = {
  id: 'payment-attempt-test-001',
  user_id: testUserId,
  reference: testReference,
  amount: testAmountInKobo,
  currency: 'NGN',
  status: 'pending'
};

// Fake successful transaction returned by Paystack.
const fakeVerifiedPayment = {
  reference: testReference,
  status: 'success',
  amount: testAmountInKobo,
  currency: 'NGN',
  customer: {
    email: fakeUser.email
  }
};

// Fake result returned after wallet funding.
const fakeWalletFundingResult = {
  walletId: '1',
  transactionId: 'wallet-transaction-test-001',
  amount: testAmountInKobo,
  balance: 150000,
  idempotentReplay: false
};

// Fake payment attempt after being marked successful.
const fakeSuccessfulPaymentAttempt = {
  ...fakePaymentAttempt,
  status: 'success',
  verified_at: new Date()
};


// --------------------------------------------------
// STEP 8: PREPARE MOCKS BEFORE EVERY TEST
// --------------------------------------------------

beforeEach(() => {

  // Reset mock call history and previous mock behaviour.
  jest.clearAllMocks();

  // Simulate retrieving an eligible customer from MongoDB.
  User.findById.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(fakeUser)
    })
  });

  // Simulate retrieving the customer's pending payment.
  getPaymentAttemptByReference.mockResolvedValue(
    fakePaymentAttempt
  );

  // Simulate successful verification by Paystack.
  verifyPaystackTransaction.mockResolvedValue(
    fakeVerifiedPayment
  );

  // Simulate successful wallet funding.
  fundWallet.mockResolvedValue(
    fakeWalletFundingResult
  );

  // Simulate successfully updating the payment status.
  markPaymentAttemptSuccessful.mockResolvedValue(
    fakeSuccessfulPaymentAttempt
  );

});


// --------------------------------------------------
// TEST 1: SUCCESSFUL PAYMENT VERIFICATION
// --------------------------------------------------

test('verifies a successful Paystack payment and funds the customer wallet', async () => {

  // STEP 1:
  // Call the verification service using the customer's
  // authenticated ID and the Paystack payment reference.

  const result = await verifyPayment({

    userId: testUserId,

    reference: testReference

  });


  // STEP 2:
  // Confirm that the correct local payment attempt
  // was retrieved using its reference.

  expect(getPaymentAttemptByReference).toHaveBeenCalledWith({

    reference: testReference

  });


  // STEP 3:
  // Confirm that the correct customer was retrieved
  // from MongoDB.

  expect(User.findById).toHaveBeenCalledWith(testUserId);


  // STEP 4:
  // Confirm that Paystack was asked to verify the
  // locally stored payment reference.

  expect(verifyPaystackTransaction).toHaveBeenCalledWith({

    reference: testReference

  });


  // STEP 5:
  // Confirm that the wallet funding service received
  // the trusted local payment details.
  //
  // The amount and reference must come from our
  // PostgreSQL payment attempt, not the frontend.

  expect(fundWallet).toHaveBeenCalledWith({

    userId: testUserId,

    verifiedPayment: {

      status: 'success',

      amount: testAmountInKobo,

      reference: testReference,

      currency: 'NGN'

    },

    idempotencyKey: `PAYSTACK:${testReference}`

  });


  // STEP 6:
  // Confirm that the local payment attempt was
  // marked successful after wallet funding.

  expect(markPaymentAttemptSuccessful).toHaveBeenCalledWith({

    id: fakePaymentAttempt.id

  });


  // STEP 7:
  // Confirm that the service returned the expected
  // successful payment verification result.

  expect(result).toEqual({

    success: true,

    alreadyCompleted: false,

    message: 'Payment verified and wallet funded successfully.',

    payment: {

      reference: testReference,

      status: 'success',

      amount: testAmountInKobo,

      currency: 'NGN'

    },

    walletFunding: fakeWalletFundingResult

  });

});


// --------------------------------------------------
// TEST 2: PAYMENT ATTEMPT NOT FOUND
// --------------------------------------------------

test('rejects verification when the payment reference does not exist', async () => {

  // Simulate a reference that does not exist locally.
  getPaymentAttemptByReference.mockResolvedValue(null);


  // Attempt payment verification and capture the error.
  await expect(
    verifyPayment({
      userId: testUserId,
      reference: testReference
    })
  ).rejects.toMatchObject({

    statusCode: 404,

    code: 'PAYMENT_ATTEMPT_NOT_FOUND'

  });


  // Paystack must not be contacted.
  expect(verifyPaystackTransaction).not.toHaveBeenCalled();


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // The payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 3: PAYMENT OWNERSHIP MISMATCH
// --------------------------------------------------

test('rejects verification when the payment belongs to another customer', async () => {

  // Simulate a payment attempt belonging to another customer.
  getPaymentAttemptByReference.mockResolvedValue({

    ...fakePaymentAttempt,

    user_id: '507f1f77bcf86cd799439099'

  });


  // Attempt verification using the wrong customer's ID.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 403,

    code: 'PAYMENT_OWNERSHIP_MISMATCH'

  });


  // MongoDB customer lookup must not occur.
  expect(User.findById).not.toHaveBeenCalled();


  // Paystack must not be contacted.
  expect(verifyPaystackTransaction).not.toHaveBeenCalled();


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 4: ALREADY-SUCCESSFUL PAYMENT
// --------------------------------------------------

test('returns an already-completed result without funding the wallet again', async () => {

  // Simulate a payment that was successfully completed earlier.
  getPaymentAttemptByReference.mockResolvedValue({

    ...fakePaymentAttempt,

    status: 'success'

  });


  // Attempt to verify the already-completed payment.
  const result = await verifyPayment({

    userId: testUserId,

    reference: testReference

  });


  // Confirm that the service recognises the completed payment.
  expect(result).toEqual({

    success: true,

    alreadyCompleted: true,

    message: 'This payment has already been verified.',

    payment: {

      reference: testReference,

      status: 'success'

    }

  });


  // MongoDB customer lookup is unnecessary.
  expect(User.findById).not.toHaveBeenCalled();


  // Paystack must not be contacted again.
  expect(verifyPaystackTransaction).not.toHaveBeenCalled();


  // Most importantly, the wallet must not be funded twice.
  expect(fundWallet).not.toHaveBeenCalled();


  // The payment status must not be updated again.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 5: PAYMENT IS NOT PENDING
// --------------------------------------------------

test('rejects verification when the payment status is not pending', async () => {

  // Simulate a payment attempt that has already failed.
  getPaymentAttemptByReference.mockResolvedValue({

    ...fakePaymentAttempt,

    status: 'failed'

  });


  // Attempt to verify the failed payment.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 409,

    code: 'PAYMENT_NOT_PENDING'

  });


  // MongoDB customer lookup must not occur.
  expect(User.findById).not.toHaveBeenCalled();


  // Paystack must not be contacted.
  expect(verifyPaystackTransaction).not.toHaveBeenCalled();


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 6: CUSTOMER ACCOUNT NOT FOUND
// --------------------------------------------------

test('rejects verification when the associated customer account does not exist', async () => {

  // Simulate a customer account that no longer exists.
  User.findById.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    })
  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 404,

    code: 'PAYMENT_CUSTOMER_NOT_FOUND'

  });


  // Confirm that the customer lookup occurred.
  expect(User.findById).toHaveBeenCalledWith(testUserId);


  // Paystack must not be contacted.
  expect(verifyPaystackTransaction).not.toHaveBeenCalled();


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});




// --------------------------------------------------
// TEST 7: INACTIVE CUSTOMER ACCOUNT
// --------------------------------------------------

test('rejects verification when the customer account is inactive', async () => {

  // Simulate an existing customer whose account is inactive.
  User.findById.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        ...fakeUser,
        isActive: false
      })
    })
  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 403,

    code: 'PAYMENT_CUSTOMER_NOT_ELIGIBLE'

  });


  // Paystack must not be contacted.
  expect(verifyPaystackTransaction).not.toHaveBeenCalled();


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 8: CUSTOMER EMAIL NOT VERIFIED
// --------------------------------------------------

test('rejects verification when the customer email is not verified', async () => {

  // Simulate an active customer with an unverified email.
  User.findById.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        ...fakeUser,
        isEmailVerified: false
      })
    })
  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 403,

    code: 'PAYMENT_CUSTOMER_NOT_ELIGIBLE'

  });


  // Paystack must not be contacted.
  expect(verifyPaystackTransaction).not.toHaveBeenCalled();


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 9: ACCOUNT ROLE IS NOT CUSTOMER
// --------------------------------------------------

test('rejects verification when the associated account is not a customer', async () => {

  // Simulate an active, email-verified staff account.
  User.findById.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        ...fakeUser,
        role: 'staff'
      })
    })
  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 403,

    code: 'PAYMENT_CUSTOMER_NOT_ELIGIBLE'

  });


  // Paystack must not be contacted.
  expect(verifyPaystackTransaction).not.toHaveBeenCalled();


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 10: INVALID PAYSTACK TRANSACTION RESPONSE
// --------------------------------------------------

test('rejects verification when Paystack returns an invalid transaction response', async () => {

  // Simulate Paystack returning null instead of a transaction object.
  verifyPaystackTransaction.mockResolvedValue(null);


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 502,

    code: 'INVALID_PAYSTACK_TRANSACTION'

  });


  // Confirm that Paystack verification was attempted.
  expect(verifyPaystackTransaction).toHaveBeenCalledWith({
    reference: testReference
  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 11: PAYSTACK REFERENCE MISMATCH
// --------------------------------------------------

test('rejects verification when the Paystack reference does not match the local payment reference', async () => {

  // Simulate a successful Paystack transaction with a different reference.
  verifyPaystackTransaction.mockResolvedValue({

    ...fakeVerifiedPayment,

    reference: 'KM-PAY-ANOTHER-TRANSACTION'

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 409,

    code: 'PAYMENT_REFERENCE_MISMATCH'

  });


  // Confirm that Paystack was queried using our local reference.
  expect(verifyPaystackTransaction).toHaveBeenCalledWith({
    reference: testReference
  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 12: PAYSTACK PAYMENT NOT SUCCESSFUL
// --------------------------------------------------

test('rejects verification when Paystack has not confirmed successful payment', async () => {

  // Simulate Paystack returning a failed transaction.
  verifyPaystackTransaction.mockResolvedValue({

    ...fakeVerifiedPayment,

    status: 'failed'

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 409,

    code: 'PAYMENT_NOT_SUCCESSFUL'

  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 13: INVALID PAYSTACK PAYMENT AMOUNT
// --------------------------------------------------

test('rejects verification when Paystack returns the amount as a string', async () => {

  // Simulate Paystack returning a string instead of an integer.
  verifyPaystackTransaction.mockResolvedValue({

    ...fakeVerifiedPayment,

    amount: String(testAmountInKobo)

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 502,

    code: 'INVALID_PAYSTACK_PAYMENT_AMOUNT'

  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 14: ZERO PAYSTACK PAYMENT AMOUNT
// --------------------------------------------------

test('rejects verification when Paystack returns a zero payment amount', async () => {

  // Simulate Paystack returning zero kobo.
  verifyPaystackTransaction.mockResolvedValue({

    ...fakeVerifiedPayment,

    amount: 0

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 502,

    code: 'INVALID_PAYSTACK_PAYMENT_AMOUNT'

  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 15: NEGATIVE PAYSTACK PAYMENT AMOUNT
// --------------------------------------------------

test('rejects verification when Paystack returns a negative payment amount', async () => {

  // Simulate Paystack returning a negative amount.
  verifyPaystackTransaction.mockResolvedValue({

    ...fakeVerifiedPayment,

    amount: -150000

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 502,

    code: 'INVALID_PAYSTACK_PAYMENT_AMOUNT'

  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 16: DECIMAL PAYSTACK PAYMENT AMOUNT
// --------------------------------------------------

test('rejects verification when Paystack returns a decimal payment amount', async () => {

  // Simulate Paystack returning a fractional kobo amount.
  verifyPaystackTransaction.mockResolvedValue({

    ...fakeVerifiedPayment,

    amount: 150000.5

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 502,

    code: 'INVALID_PAYSTACK_PAYMENT_AMOUNT'

  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 17: PAYSTACK PAYMENT AMOUNT MISMATCH
// --------------------------------------------------

test('rejects verification when the Paystack amount differs from the local payment amount', async () => {

  // Simulate Paystack confirming a different amount.
  verifyPaystackTransaction.mockResolvedValue({

    ...fakeVerifiedPayment,

    amount: testAmountInKobo + 10000

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 409,

    code: 'PAYMENT_AMOUNT_MISMATCH'

  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 18: PAYSTACK PAYMENT CURRENCY MISMATCH
// --------------------------------------------------

test('rejects verification when Paystack returns a currency other than NGN', async () => {

  // Simulate Paystack confirming payment in USD.
  verifyPaystackTransaction.mockResolvedValue({

    ...fakeVerifiedPayment,

    currency: 'USD'

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 409,

    code: 'PAYMENT_CURRENCY_MISMATCH'

  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 19: PAYSTACK CUSTOMER EMAIL MISMATCH
// --------------------------------------------------

test('rejects verification when the Paystack customer email differs from the registered email', async () => {

  // Simulate Paystack returning a different customer email.
  verifyPaystackTransaction.mockResolvedValue({

    ...fakeVerifiedPayment,

    customer: {

      email: 'another-customer@example.com'

    }

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 409,

    code: 'PAYMENT_CUSTOMER_EMAIL_MISMATCH'

  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 20: MISSING PAYSTACK CUSTOMER EMAIL
// --------------------------------------------------

test('rejects verification when Paystack does not return customer information', async () => {

  // Simulate Paystack returning a successful transaction
  // without the customer information object.
  verifyPaystackTransaction.mockResolvedValue({

    ...fakeVerifiedPayment,

    customer: undefined

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 502,

    code: 'INVALID_PAYSTACK_CUSTOMER_EMAIL'

  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 21: EMPTY PAYSTACK CUSTOMER EMAIL
// --------------------------------------------------

test('rejects verification when Paystack returns an empty customer email', async () => {

  // Simulate Paystack returning customer information
  // with an empty email address.
  verifyPaystackTransaction.mockResolvedValue({

    ...fakeVerifiedPayment,

    customer: {

      email: ''

    }

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 502,

    code: 'INVALID_PAYSTACK_CUSTOMER_EMAIL'

  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 22: WHITESPACE-ONLY PAYSTACK CUSTOMER EMAIL
// --------------------------------------------------

test('rejects verification when Paystack returns a whitespace-only customer email', async () => {

  // Simulate Paystack returning an email containing
  // spaces but no actual email address.
  verifyPaystackTransaction.mockResolvedValue({

    ...fakeVerifiedPayment,

    customer: {

      email: '     '

    }

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 502,

    code: 'INVALID_PAYSTACK_CUSTOMER_EMAIL'

  });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 23: INVALID LOCAL PAYMENT CURRENCY
// --------------------------------------------------

test('rejects verification when the locally stored payment currency is not NGN', async () => {

  // Simulate a PostgreSQL payment attempt recorded in USD.
  getPaymentAttemptByReference.mockResolvedValue({

    ...fakePaymentAttempt,

    currency: 'USD'

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 500,

    code: 'INVALID_LOCAL_PAYMENT_CURRENCY'

  });


  // Paystack verification must not be called.
  expect(verifyPaystackTransaction).toHaveBeenCalledWith({ reference: testReference });


  // The wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 24: WALLET FUNDING FAILURE
// --------------------------------------------------

test('does not mark payment successful when wallet funding fails', async () => {

  // Simulate a failure during the wallet funding transaction.
  fundWallet.mockRejectedValue(

    new Error('Wallet funding transaction failed.')

  );


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toThrow('Wallet funding transaction failed.');


  // Confirm that wallet funding was attempted.
  expect(fundWallet).toHaveBeenCalledTimes(1);


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 25: CONCURRENT PAYMENT STATUS UPDATE
// --------------------------------------------------

test('accepts concurrent verification when another request has already marked payment successful', async () => {

  // Simulate another verification request updating
  // the payment status before this request completes.
  markPaymentAttemptSuccessful.mockResolvedValue(null);


  // The second database lookup confirms that the
  // payment has already been marked successful.
  getPaymentAttemptByReference
    .mockResolvedValueOnce(fakePaymentAttempt)
    .mockResolvedValueOnce({

      ...fakePaymentAttempt,

      status: 'success'

    });


  // Attempt payment verification.
  const result = await verifyPayment({

    userId: testUserId,

    reference: testReference

  });


  // The wallet funding operation must complete.
  expect(fundWallet).toHaveBeenCalledTimes(1);


  // The payment status update must have been attempted.
  expect(markPaymentAttemptSuccessful).toHaveBeenCalledWith({

    id: fakePaymentAttempt.id

  });


  // The latest payment attempt must have been retrieved.
  expect(getPaymentAttemptByReference).toHaveBeenCalledTimes(2);


  // The verification should still return success.
  expect(result.success).toBe(true);

  expect(result.alreadyCompleted).toBe(false);

});


// --------------------------------------------------
// TEST 26: PAYMENT STATUS UPDATE CONFLICT
// --------------------------------------------------

test('rejects when payment status cannot be confirmed after wallet funding', async () => {

  // Simulate a failed payment status update.
  markPaymentAttemptSuccessful.mockResolvedValue(null);


  // The second lookup confirms that the payment
  // is still pending rather than successful.
  getPaymentAttemptByReference
    .mockResolvedValueOnce(fakePaymentAttempt)
    .mockResolvedValueOnce(fakePaymentAttempt);


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 409,

    code: 'PAYMENT_STATUS_UPDATE_CONFLICT'

  });


  // Wallet funding must have completed first.
  expect(fundWallet).toHaveBeenCalledTimes(1);


  // Payment status update must have been attempted.
  expect(markPaymentAttemptSuccessful).toHaveBeenCalledTimes(1);


  // The service must check the latest payment status.
  expect(getPaymentAttemptByReference).toHaveBeenCalledTimes(2);

});


// --------------------------------------------------
// TEST 27: INVALID LOCAL PAYMENT AMOUNT
// --------------------------------------------------

test('rejects verification when the locally stored payment amount is invalid', async () => {

  // Simulate PostgreSQL returning an invalid amount.
  getPaymentAttemptByReference.mockResolvedValue({

    ...fakePaymentAttempt,

    amount: 'INVALID_AMOUNT'

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 500,

    code: 'INVALID_LOCAL_PAYMENT_AMOUNT'

  });


  // Paystack verification has already occurred before
  // the local amount conversion in the service.
  expect(verifyPaystackTransaction).toHaveBeenCalledTimes(1);


  // Wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 28: ZERO LOCAL PAYMENT AMOUNT
// --------------------------------------------------

test('rejects verification when the locally stored payment amount is zero', async () => {

  // Simulate a payment attempt with zero kobo.
  getPaymentAttemptByReference.mockResolvedValue({

    ...fakePaymentAttempt,

    amount: '0'

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 409,

    code: 'PAYMENT_AMOUNT_MISMATCH'

  });


  // Paystack verification occurs before amount comparison.
  expect(verifyPaystackTransaction).toHaveBeenCalledTimes(1);


  // Wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 29: NEGATIVE LOCAL PAYMENT AMOUNT
// --------------------------------------------------

test('rejects verification when the locally stored payment amount is negative', async () => {

  // Simulate a payment attempt with a negative amount.
  getPaymentAttemptByReference.mockResolvedValue({

    ...fakePaymentAttempt,

    amount: '-150000'

  });


  // Attempt payment verification.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 409,

    code: 'PAYMENT_AMOUNT_MISMATCH'

  });


  // Paystack verification occurs before amount comparison.
  expect(verifyPaystackTransaction).toHaveBeenCalledTimes(1);


  // Wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();


  // Payment status must not be updated.
  expect(markPaymentAttemptSuccessful).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 30: EMPTY CUSTOMER ID
// --------------------------------------------------

test('rejects verification when the customer ID is empty', async () => {

  // Attempt verification without a customer ID.
  await expect(
    verifyPayment({

      userId: '',

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 401,

    code: 'PAYMENT_AUTHENTICATION_REQUIRED'

  });


  // Payment lookup must not occur.
  expect(getPaymentAttemptByReference).not.toHaveBeenCalled();


  // Customer lookup must not occur.
  expect(User.findById).not.toHaveBeenCalled();


  // Paystack must not be contacted.
  expect(verifyPaystackTransaction).not.toHaveBeenCalled();


  // Wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 31: WHITESPACE-ONLY CUSTOMER ID
// --------------------------------------------------

test('rejects verification when the customer ID contains only whitespace', async () => {

  // Simulate an authenticated request with an invalid
  // customer ID containing spaces only.
  await expect(
    verifyPayment({

      userId: '     ',

      reference: testReference

    })
  ).rejects.toMatchObject({

    statusCode: 401,

    code: 'PAYMENT_AUTHENTICATION_REQUIRED'

  });


  // No payment lookup should occur.
  expect(getPaymentAttemptByReference).not.toHaveBeenCalled();


  // No customer lookup should occur.
  expect(User.findById).not.toHaveBeenCalled();


  // Paystack must not be contacted.
  expect(verifyPaystackTransaction).not.toHaveBeenCalled();


  // Wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 32: EMPTY PAYMENT REFERENCE
// --------------------------------------------------

test('rejects verification when the payment reference is empty', async () => {

  // Attempt verification without a payment reference.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: ''

    })
  ).rejects.toMatchObject({

    statusCode: 400,

    code: 'INVALID_PAYMENT_REFERENCE'

  });


  // No payment lookup should occur.
  expect(getPaymentAttemptByReference).not.toHaveBeenCalled();


  // No customer lookup should occur.
  expect(User.findById).not.toHaveBeenCalled();


  // Paystack must not be contacted.
  expect(verifyPaystackTransaction).not.toHaveBeenCalled();


  // Wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 33: WHITESPACE-ONLY PAYMENT REFERENCE
// --------------------------------------------------

test('rejects verification when the payment reference contains only whitespace', async () => {

  // Attempt verification with spaces instead of a reference.
  await expect(
    verifyPayment({

      userId: testUserId,

      reference: '     '

    })
  ).rejects.toMatchObject({

    statusCode: 400,

    code: 'INVALID_PAYMENT_REFERENCE'

  });


  // No payment lookup should occur.
  expect(getPaymentAttemptByReference).not.toHaveBeenCalled();


  // No customer lookup should occur.
  expect(User.findById).not.toHaveBeenCalled();


  // Paystack must not be contacted.
  expect(verifyPaystackTransaction).not.toHaveBeenCalled();


  // Wallet must not be funded.
  expect(fundWallet).not.toHaveBeenCalled();

});
