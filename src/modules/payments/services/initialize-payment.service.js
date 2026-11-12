// Generate unique payment attempt IDs and references.
const { randomUUID } = require('node:crypto');

// Import the MongoDB User model.
const User = require('../../users/models/user.model');

// Import wallet validation.
const {
  requireActiveWallet
} = require('../../wallet/services/wallet.service');

// Import payment repository operations.
const {
  createOrGetPaymentAttempt,
  saveCheckoutDetails,
  markPaymentAttemptFailed
} = require('../repositories/payment.repository');

// Import Paystack transaction initialization.
const {
  initializePaystackTransaction
} = require('./paystack.service');


// --------------------------------------------------
// STEP 1: CREATE A STANDARD PAYMENT SERVICE ERROR
// --------------------------------------------------

function createPaymentServiceError(
  message,
  statusCode,
  code
) {

  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;

}


// --------------------------------------------------
// STEP 2: INITIALIZE A CUSTOMER PAYMENT
// --------------------------------------------------

async function initializePayment({
  userId,
  amount,
  idempotencyKey
}) {

  // STEP 2A:
  // Validate the authenticated customer ID.

  if (
    typeof userId !== 'string' ||
    !userId.trim()
  ) {

    throw createPaymentServiceError(
      'An authenticated customer is required.',
      401,
      'PAYMENT_AUTHENTICATION_REQUIRED'
    );

  }

    // STEP 2B:
  // Validate the Naira amount before converting it to kobo.
  // Reject non-numeric, infinite, zero, negative, and
  // amounts containing more than two decimal places.

  if (
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Math.round(amount * 100) !== amount * 100
  ) {

    throw createPaymentServiceError(
      'The payment amount must be a positive Naira amount with no more than two decimal places.',
      400,
      'INVALID_PAYMENT_AMOUNT'
    );

  }


  // Convert the validated Naira amount into kobo.

  const amountInKobo = Math.round(amount * 100);


  // Ensure the converted amount fits within JavaScript's
  // safe integer range before sending it to PostgreSQL.

  if (!Number.isSafeInteger(amountInKobo)) {

    throw createPaymentServiceError(
      'The payment amount exceeds the supported limit.',
      400,
      'INVALID_PAYMENT_AMOUNT'
    );

  }


  // STEP 2C:
  // Retrieve the customer's current account information.

  const user = await User.findById(userId)
    .select('email role isActive isEmailVerified')
    .lean();

  if (!user) {

    throw createPaymentServiceError(
      'Customer account was not found.',
      404,
      'CUSTOMER_NOT_FOUND'
    );

  }


  // STEP 2D:
  // Confirm that the account is active.

  if (user.isActive !== true) {

    throw createPaymentServiceError(
      'This customer account is inactive.',
      403,
      'CUSTOMER_ACCOUNT_INACTIVE'
    );

  }


  // STEP 2E:
  // Only customers can initialize wallet payments.

  if (user.role !== 'customer') {

    throw createPaymentServiceError(
      'Only customer accounts can initialize wallet payments.',
      403,
      'CUSTOMER_ROLE_REQUIRED'
    );

  }


  // STEP 2F:
  // Require a verified email address.
  // Paystack uses this address for the transaction.

  if (
    user.isEmailVerified !== true ||
    !user.email
  ) {

    throw createPaymentServiceError(
      'Please verify your email address before making a payment.',
      403,
      'CUSTOMER_EMAIL_NOT_VERIFIED'
    );

  }


  // STEP 2G:
  // Confirm that both the customer's wallet and
  // its linked ledger account are active.

  await requireActiveWallet({
    userId
  });


  // --------------------------------------------------
  // STEP 3: CREATE OR RETRIEVE A PAYMENT ATTEMPT
  // --------------------------------------------------

  // Generate an independent UUID for this attempt.
  const paymentAttemptId = randomUUID();

  // Generate a unique reference for Paystack.
  const paymentReference = `KM-PAY-${randomUUID()}`;

  // Create the payment attempt before contacting Paystack.
  const {
    created,
    paymentAttempt
  } = await createOrGetPaymentAttempt({

    id: paymentAttemptId,

    userId,

    reference: paymentReference,

    idempotencyKey,

    amount: amountInKobo

  });


  // --------------------------------------------------
  // STEP 4: HANDLE AN EXISTING IDEMPOTENT REQUEST
  // --------------------------------------------------

  if (!created) {

    // Never expose another customer's payment details.
    if (
      String(paymentAttempt.user_id) !== userId
    ) {

      throw createPaymentServiceError(
        'This idempotency key cannot be used for this request.',
        409,
        'PAYMENT_IDEMPOTENCY_CONFLICT'
      );

    }


    // The same key cannot be reused for another amount.
    if (
      BigInt(paymentAttempt.amount) !==
      BigInt(amountInKobo)
    ) {

      throw createPaymentServiceError(
        'This idempotency key was already used with a different amount.',
        409,
        'PAYMENT_AMOUNT_CONFLICT'
      );

    }


    // Return an existing checkout only when it is pending
    // and both checkout details are available.

    if (
      paymentAttempt.status === 'pending' &&
      paymentAttempt.authorization_url &&
      paymentAttempt.access_code
    ) {

      return {

        paymentAttemptId: paymentAttempt.id,

        reference: paymentAttempt.reference,

        amount: amountInKobo,

        currency: 'NGN',

        status: 'pending',

        authorizationUrl: paymentAttempt.authorization_url,

        accessCode: paymentAttempt.access_code,

        reused: true

      };

    }


    // Do not initialize Paystack again when the previous
    // attempt is still initializing.
    // Its previous provider request may have succeeded.

    if (paymentAttempt.status === 'initializing') {

      throw createPaymentServiceError(
        'This payment request is still being processed. Do not create another payment attempt.',
        409,
        'PAYMENT_INITIALIZATION_IN_PROGRESS'
      );

    }


    // A completed or failed attempt must never be reopened.

    throw createPaymentServiceError(
      'This payment attempt can no longer be initialized.',
      409,
      'PAYMENT_ATTEMPT_NOT_REUSABLE'
    );

  }


  // --------------------------------------------------
  // STEP 5: INITIALIZE THE TRANSACTION WITH PAYSTACK
  // --------------------------------------------------

  let checkout;

  try {

    checkout = await initializePaystackTransaction({

      email: user.email,

      amount: amountInKobo,

      reference: paymentReference

    });

  } catch (error) {

    // A definitive provider rejection means Paystack
    // has rejected this initialization request.

    if (error.definitive === true) {

      await markPaymentAttemptFailed({
        id: paymentAttemptId
      });

      throw createPaymentServiceError(
        'Paystack rejected the payment initialization request.',
        502,
        'PAYSTACK_INITIALIZATION_REJECTED'
      );

    }


    // Network errors and timeouts are ambiguous.
    // Paystack may have created the transaction.
    // Keep the attempt initializing to prevent duplicates.

    throw createPaymentServiceError(
      'Payment initialization could not be confirmed. Do not create another payment attempt.',
      503,
      'PAYSTACK_INITIALIZATION_UNCONFIRMED'
    );

  }


  // --------------------------------------------------
  // STEP 6: SAVE THE PAYSTACK CHECKOUT DETAILS
  // --------------------------------------------------

  const updatedPaymentAttempt = await saveCheckoutDetails({

    id: paymentAttemptId,

    authorizationUrl: checkout.authorizationUrl,

    accessCode: checkout.accessCode

  });


  // Confirm that PostgreSQL successfully saved the details.

  if (!updatedPaymentAttempt) {

    throw createPaymentServiceError(
      'The payment checkout could not be saved. Please contact support before retrying.',
      503,
      'PAYMENT_CHECKOUT_SAVE_FAILED'
    );

  }


  // --------------------------------------------------
  // STEP 7: RETURN SAFE CHECKOUT INFORMATION
  // --------------------------------------------------

  return {

    paymentAttemptId: updatedPaymentAttempt.id,

    reference: updatedPaymentAttempt.reference,

    amount: amountInKobo,

    currency: 'NGN',

    status: 'pending',

    authorizationUrl: updatedPaymentAttempt.authorization_url,

    accessCode: updatedPaymentAttempt.access_code,

    reused: false

  };

}


// --------------------------------------------------
// STEP 8: EXPORT THE PAYMENT SERVICE
// --------------------------------------------------

module.exports = {
  initializePayment
};
