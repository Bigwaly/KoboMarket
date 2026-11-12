// --------------------------------------------------
// PAYSTACK PAYMENT VERIFICATION SERVICE
// --------------------------------------------------
//
// This service verifies Paystack transactions and,
// after successful verification, funds customer wallets.
//
// IMPORTANT:
// A wallet must NEVER be funded using unverified
// payment information.
//


// --------------------------------------------------
// STEP 1: IMPORT THE MONGODB USER MODEL
// --------------------------------------------------

const User = require('../../users/models/user.model');


// --------------------------------------------------
// STEP 2: IMPORT THE WALLET FUNDING SERVICE
// --------------------------------------------------
//
// fundWallet performs the financial operations:
// - Double-entry ledger posting.
// - Wallet balance update.
// - Wallet transaction recording.
// - Idempotency protection.
//

const {
  fundWallet
} = require('../../wallet/services/wallet.service');


// --------------------------------------------------
// STEP 3: IMPORT PAYMENT REPOSITORY OPERATIONS
// --------------------------------------------------

const {
  getPaymentAttemptByReference,
  markPaymentAttemptSuccessful
} = require('../repositories/payment.repository');


// --------------------------------------------------
// STEP 4: IMPORT PAYSTACK VERIFICATION
// --------------------------------------------------

const {
  verifyPaystackTransaction
} = require('./paystack.service');


// --------------------------------------------------
// STEP 5: CREATE A STANDARD PAYMENT SERVICE ERROR
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
// STEP 6: VERIFY A CUSTOMER PAYMENT
// --------------------------------------------------

async function verifyPayment({
  userId,
  reference
}) {

  // STEP 6A:
  // Confirm that an authenticated customer ID was supplied.

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


  // STEP 6B:
  // Validate the Paystack payment reference.

  if (
    typeof reference !== 'string' ||
    !reference.trim() ||
    reference.trim().length > 150
  ) {

    throw createPaymentServiceError(
      'A valid payment reference is required.',
      400,
      'INVALID_PAYMENT_REFERENCE'
    );

  }


  // Normalize the supplied values.
  // This prevents accidental whitespace differences.

  const normalizedUserId = userId.trim();

  const normalizedReference = reference.trim();

    // --------------------------------------------------
  // STEP 7: FIND THE LOCAL PAYMENT ATTEMPT
  // --------------------------------------------------

  // Retrieve the payment attempt previously created
  // during payment initialization.
  //
  // We use our local database record as the trusted
  // source for the expected customer and payment amount.

  const paymentAttempt = await getPaymentAttemptByReference({
    reference: normalizedReference
  });


  // Confirm that the payment reference exists locally.

  if (!paymentAttempt) {

    throw createPaymentServiceError(
      'No payment attempt was found for this reference.',
      404,
      'PAYMENT_ATTEMPT_NOT_FOUND'
    );

  }


  // --------------------------------------------------
  // STEP 8: CONFIRM PAYMENT OWNERSHIP
  // --------------------------------------------------

  // A customer must not be allowed to verify another
  // customer's payment reference.

  if (
    String(paymentAttempt.user_id) !== normalizedUserId
  ) {

    throw createPaymentServiceError(
      'This payment attempt does not belong to this customer.',
      403,
      'PAYMENT_OWNERSHIP_MISMATCH'
    );

  }

    // --------------------------------------------------
  // STEP 9: HANDLE AN ALREADY-SUCCESSFUL PAYMENT
  // --------------------------------------------------

  // If this payment was already completed, return its
  // existing status without funding the wallet again.

  if (paymentAttempt.status === 'success') {

    return {
      success: true,
      alreadyCompleted: true,
      message: 'This payment has already been verified.',
      payment: {
        reference: paymentAttempt.reference,
        status: paymentAttempt.status
      }
    };

  }

    // --------------------------------------------------
  // STEP 10: CONFIRM THAT THE PAYMENT IS PENDING
  // --------------------------------------------------

  // Only pending payment attempts are eligible for
  // Paystack verification.

  if (paymentAttempt.status !== 'pending') {

    throw createPaymentServiceError(
      'This payment cannot be verified because it is not pending.',
      409,
      'PAYMENT_NOT_PENDING'
    );

  }

  // --------------------------------------------------
  // STEP 11: RETRIEVE THE CUSTOMER
  // --------------------------------------------------

  // Load the customer associated with this payment.
  //
  // We retrieve only the fields needed for verification.
  // lean() returns a plain JavaScript object.

  const user = await User.findById(normalizedUserId)
    .select('email role isActive isEmailVerified')
    .lean();


  // Confirm that the customer account still exists.

  if (!user) {

    throw createPaymentServiceError(
      'The customer account associated with this payment was not found.',
      404,
      'PAYMENT_CUSTOMER_NOT_FOUND'
    );

  }
    // --------------------------------------------------
  // STEP 12: VALIDATE THE CUSTOMER ACCOUNT
  // --------------------------------------------------

  // Only active customers with verified email addresses
  // are allowed to complete wallet funding.

  if (
    user.role !== 'customer' ||
    user.isActive !== true ||
    user.isEmailVerified !== true ||
    typeof user.email !== 'string' ||
    !user.email.trim()
  ) {

    throw createPaymentServiceError(
      'This customer account is not eligible for payment verification.',
      403,
      'PAYMENT_CUSTOMER_NOT_ELIGIBLE'
    );

  }


  // Normalize the customer's registered email address.
  // This will be compared with Paystack's customer email.

  const normalizedUserEmail = user.email.trim().toLowerCase();

    // --------------------------------------------------
  // STEP 13: VERIFY THE TRANSACTION WITH PAYSTACK
  // --------------------------------------------------

  // Ask Paystack to retrieve the actual transaction
  // associated with our locally stored reference.
  //
  // We do not trust payment information supplied
  // directly by the frontend.

  const verifiedPayment = await verifyPaystackTransaction({
    reference: normalizedReference
  });

    // --------------------------------------------------
  // STEP 14: VALIDATE PAYSTACK'S TRANSACTION RESPONSE
  // --------------------------------------------------

  // Confirm that Paystack returned a valid transaction object.

  if (
    !verifiedPayment ||
    typeof verifiedPayment !== 'object'
  ) {

    throw createPaymentServiceError(
      'Paystack returned an invalid transaction response.',
      502,
      'INVALID_PAYSTACK_TRANSACTION'
    );

  }


  // Confirm that the transaction reference matches
  // the reference stored in our local database.

  if (
    verifiedPayment.reference !== paymentAttempt.reference
  ) {

    throw createPaymentServiceError(
      'The Paystack transaction reference does not match our payment record.',
      409,
      'PAYMENT_REFERENCE_MISMATCH'
    );

  }


  // Confirm that Paystack reports a successful payment.

  if (verifiedPayment.status !== 'success') {

    throw createPaymentServiceError(
      'Paystack has not confirmed this payment as successful.',
      409,
      'PAYMENT_NOT_SUCCESSFUL'
    );

  }
  // --------------------------------------------------
  // STEP 15: VALIDATE THE PAYMENT AMOUNT
  // --------------------------------------------------

  // Paystack returns transaction amounts in kobo.
  //
  // Require the provider amount to be a positive,
  // safe JavaScript integer before using it.
  //
  // This rejects:
  // - Strings
  // - Decimal amounts
  // - Negative amounts
  // - Zero
  // - NaN
  // - Infinity
  // - Unsafe integers

  if (
    typeof verifiedPayment.amount !== 'number' ||
    !Number.isSafeInteger(verifiedPayment.amount) ||
    verifiedPayment.amount <= 0
  ) {

    throw createPaymentServiceError(
      'Paystack returned an invalid payment amount.',
      502,
      'INVALID_PAYSTACK_PAYMENT_AMOUNT'
    );

  }


  // Convert both amounts to BigInt for exact comparison.
  //
  // PostgreSQL BIGINT values may be returned as strings.
  // BigInt avoids floating-point precision problems.

  let localAmount;
  let paystackAmount;

  try {

    localAmount = BigInt(paymentAttempt.amount);

    paystackAmount = BigInt(verifiedPayment.amount);

  } catch (error) {

    throw createPaymentServiceError(
      'The payment amount stored in our records is invalid.',
      500,
      'INVALID_LOCAL_PAYMENT_AMOUNT'
    );

  }


  // Confirm that our locally recorded amount is positive
  // and Paystack received exactly the expected amount.

  if (
    localAmount <= 0n ||
    paystackAmount !== localAmount
  ) {

    throw createPaymentServiceError(
      'The amount paid does not match the expected payment amount.',
      409,
      'PAYMENT_AMOUNT_MISMATCH'
    );

  }

    // --------------------------------------------------
  // VALIDATE THE LOCAL PAYMENT CURRENCY
  // --------------------------------------------------

  // Confirm that our PostgreSQL payment record
  // was originally created using Nigerian Naira.
  //
  // This protects the wallet from processing a local
  // payment attempt with an unexpected currency.

  if (paymentAttempt.currency !== 'NGN') {

    throw createPaymentServiceError(
      'The locally recorded payment currency is not supported. NGN is required.',
      500,
      'INVALID_LOCAL_PAYMENT_CURRENCY'
    );

  }

  // --------------------------------------------------
  // STEP 16: VALIDATE THE PAYMENT CURRENCY
  // --------------------------------------------------

  // KoboMarket currently accepts Nigerian Naira only.

  if (verifiedPayment.currency !== 'NGN') {

    throw createPaymentServiceError(
      'The payment currency is not supported. NGN is required.',
      409,
      'PAYMENT_CURRENCY_MISMATCH'
    );

  }

  // --------------------------------------------------
  // STEP 17: VALIDATE THE PAYSTACK CUSTOMER EMAIL
  // --------------------------------------------------

  // Confirm that Paystack returned customer information
  // containing a valid email address.

  if (
    !verifiedPayment.customer ||
    typeof verifiedPayment.customer.email !== 'string' ||
    !verifiedPayment.customer.email.trim()
  ) {

    throw createPaymentServiceError(
      'Paystack did not return a valid customer email address.',
      502,
      'INVALID_PAYSTACK_CUSTOMER_EMAIL'
    );

  }


  // Normalize Paystack's email before comparison.

  const normalizedPaystackEmail = verifiedPayment.customer.email
    .trim()
    .toLowerCase();


  // Confirm that the Paystack email matches the
  // email address registered to the KoboMarket customer.

  if (normalizedPaystackEmail !== normalizedUserEmail) {

    throw createPaymentServiceError(
      'The Paystack customer email does not match the registered customer email.',
      409,
      'PAYMENT_CUSTOMER_EMAIL_MISMATCH'
    );

  }

    // --------------------------------------------------
  // STEP 18: FUND THE CUSTOMER'S WALLET
  // --------------------------------------------------

  // At this point, Paystack has confirmed the transaction
  // and all our payment validation checks have passed.
  //
  // We now pass the trusted local payment details to
  // the existing wallet funding service.

  const walletFundingResult = await fundWallet({

    // MongoDB ID of the authenticated customer.
    userId: normalizedUserId,

    // Use the locally stored amount and reference.
    // Never use an amount supplied by the frontend.

    verifiedPayment: {
      status: 'success',
      amount: paymentAttempt.amount,
      reference: paymentAttempt.reference,
      currency: 'NGN'
    },

    // This deterministic key prevents duplicate wallet
    // credits if the same payment is processed again.

    idempotencyKey: `PAYSTACK:${paymentAttempt.reference}`

  });
  // --------------------------------------------------
  // STEP 19: MARK THE PAYMENT ATTEMPT AS SUCCESSFUL
  // --------------------------------------------------

  // Wallet funding has completed successfully.
  //
  // We can now update the local PostgreSQL payment
  // attempt from pending to success.

  const updatedPaymentAttempt =
    await markPaymentAttemptSuccessful({
      id: paymentAttempt.id
    });

  // --------------------------------------------------
  // STEP 20: HANDLE CONCURRENT VERIFICATION REQUESTS
  // --------------------------------------------------

  // If the payment update returned null, another request
  // may have already changed the payment status.

  if (!updatedPaymentAttempt) {

    // Retrieve the latest payment attempt from PostgreSQL.

    const latestPaymentAttempt =
      await getPaymentAttemptByReference({
        reference: normalizedReference
      });


    // Accept the concurrent update only if the other
    // request has successfully marked this payment.

    if (
      !latestPaymentAttempt ||
      latestPaymentAttempt.status !== 'success'
    ) {

      throw createPaymentServiceError(
        'Wallet funding completed, but the payment status could not be confirmed. Please retry verification.',
        409,
        'PAYMENT_STATUS_UPDATE_CONFLICT'
      );

    }

  }

  // --------------------------------------------------
  // STEP 21: RETURN THE SUCCESSFUL PAYMENT RESULT
  // --------------------------------------------------

  // At this point:
  // 1. Paystack confirmed the transaction.
  // 2. All payment details passed validation.
  // 3. The customer's wallet was funded.
  // 4. The payment attempt is confirmed as successful.

  return {

    success: true,

    alreadyCompleted: false,

    message: 'Payment verified and wallet funded successfully.',

    payment: {
      reference: paymentAttempt.reference,
      status: 'success',
      amount: paymentAttempt.amount,
      currency: 'NGN'
    },

    // Return the trusted wallet service result.
    walletFunding: walletFundingResult

  };

}

// --------------------------------------------------
// STEP 22: EXPORT PAYMENT VERIFICATION SERVICE
// --------------------------------------------------

// Make verifyPayment available to other modules,
// including payment controllers and automated tests.

module.exports = {
  verifyPayment
};