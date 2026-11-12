// PAYSTACK PAYMENT GATEWAY SERVICE
//
// This service communicates directly with Paystack.
// It does not create payment records or modify wallet balances.
//
// IMPORTANT:
// PAYSTACK_SECRET_KEY must remain on the backend.
// Never return this secret to the frontend.

// Maximum time allowed for a Paystack API request.
const REQUEST_TIMEOUT_MS = 15000;

// Create a consistent Paystack service error.
function createPaystackError(
  message,
  code,
  statusCode = 502,
  definitive = false
) {
  const error = new Error(message);

  error.code = code;
  error.statusCode = statusCode;

  // True means Paystack definitively rejected the request.
  // False means the outcome may be uncertain.
  error.definitive = definitive;

  return error;
}

// Retrieve and validate Paystack configuration.
function getPaystackConfiguration() {

  // Read the secret key from backend environment variables.
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  // Read the API base URL.
  const baseUrl = (
    process.env.PAYSTACK_BASE_URL ||
    'https://api.paystack.co'
  ).replace(/\/+$/, '');

  // Ensure that a secret key has been configured.
  if (
    typeof secretKey !== 'string' ||
    secretKey.trim().length === 0 ||
    secretKey.includes('replace_me')
  ) {
    throw createPaystackError(
      'Paystack secret key has not been configured.',
      'PAYSTACK_NOT_CONFIGURED',
      503,
      true
    );
  }

  // Only permit HTTPS API endpoints.
  if (!baseUrl.startsWith('https://')) {
    throw createPaystackError(
      'Paystack API base URL must use HTTPS.',
      'INVALID_PAYSTACK_BASE_URL',
      500,
      true
    );
  }

  return {
    secretKey: secretKey.trim(),
    baseUrl
  };
}

// Initialize a transaction with Paystack.
async function initializePaystackTransaction({
  email,
  amount,
  reference
}) {

  // STEP 1: Validate the customer email.
  if (
    typeof email !== 'string' ||
    email.trim().length === 0
  ) {
    throw createPaystackError(
      'A valid customer email is required.',
      'INVALID_CUSTOMER_EMAIL',
      400,
      true
    );
  }

  // STEP 2: Validate the payment amount in kobo.
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    throw createPaystackError(
      'Payment amount must be a positive safe integer in kobo.',
      'INVALID_PAYMENT_AMOUNT',
      400,
      true
    );
  }

  // STEP 3: Validate the backend-generated payment reference.
  if (
    typeof reference !== 'string' ||
    reference.trim().length === 0 ||
    reference.trim().length > 150
  ) {
    throw createPaystackError(
      'A valid payment reference is required.',
      'INVALID_PAYMENT_REFERENCE',
      400,
      true
    );
  }

  // STEP 4: Retrieve the Paystack configuration.
  const {
    secretKey,
    baseUrl
  } = getPaystackConfiguration();

  // STEP 5: Send the initialization request.
  let response;

  try {

    response = await fetch(
      `${baseUrl}/transaction/initialize`,
      {
        method: 'POST',

        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          email: email.trim(),
          amount,
          currency: 'NGN',
          reference: reference.trim()
        }),

        // Abort the request if Paystack does not respond
        // within the configured timeout.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      }
    );

  } catch (error) {

    // A timeout or network interruption does not prove
    // that Paystack failed to create the transaction.
    throw createPaystackError(
      'Paystack could not be reached. The payment initialization outcome is uncertain.',
      'PAYSTACK_NETWORK_ERROR',
      503,
      false
    );

  }

  // STEP 6: Read the response body.
  let result;

  try {

    result = await response.json();

  } catch (error) {

    // An unreadable response does not establish whether
    // Paystack created the transaction.
    throw createPaystackError(
      'Paystack returned an unreadable response.',
      'PAYSTACK_INVALID_RESPONSE',
      502,
      false
    );

  }

  // STEP 7: Handle HTTP errors.
  if (!response.ok) {

    // HTTP 4xx responses are treated as definitive rejection.
    // HTTP 5xx responses are treated as ambiguous.
    const definitive = (
      response.status >= 400 &&
      response.status < 500
    );

    throw createPaystackError(
      'Paystack rejected or could not process the initialization request.',
      'PAYSTACK_HTTP_ERROR',
      502,
      definitive
    );

  }

  // STEP 8: Confirm that Paystack accepted the request.
  if (
    !result ||
    result.status !== true ||
    !result.data
  ) {
    throw createPaystackError(
      'Paystack did not confirm successful transaction initialization.',
      'PAYSTACK_INITIALIZATION_REJECTED',
      502,
      true
    );
  }

  // STEP 9: Extract the checkout details.
  const {
    authorization_url,
    access_code,
    reference: returnedReference
  } = result.data;

  // STEP 10: Validate the returned checkout information.
  if (
    typeof authorization_url !== 'string' ||
    authorization_url.trim().length === 0 ||
    typeof access_code !== 'string' ||
    access_code.trim().length === 0 ||
    returnedReference !== reference.trim()
  ) {
    // Paystack may have created the transaction even though
    // the returned checkout information is incomplete.
    throw createPaystackError(
      'Paystack returned incomplete or inconsistent checkout information.',
      'PAYSTACK_INVALID_CHECKOUT_DETAILS',
      502,
      false
    );
  }

  // STEP 11: Return only the information required by
  // the payment initialization service.
  return {
    authorizationUrl: authorization_url,
    accessCode: access_code,
    reference: returnedReference
  };

}


// Verify an existing transaction directly with Paystack.
async function verifyPaystackTransaction({ reference }) {

  // STEP 1: Validate the payment reference.
  if (
    typeof reference !== 'string' ||
    reference.trim().length === 0 ||
    reference.trim().length > 150
  ) {
    throw createPaystackError(
      'A valid payment reference is required.',
      'INVALID_PAYMENT_REFERENCE',
      400,
      true
    );
  }

  const cleanReference = reference.trim();

  // STEP 2: Retrieve the existing Paystack configuration.
  const {
    secretKey,
    baseUrl
  } = getPaystackConfiguration();

  // STEP 3: Request transaction verification from Paystack.
  let response;

  try {

    response = await fetch(
      `${baseUrl}/transaction/verify/${encodeURIComponent(cleanReference)}`,
      {
        method: 'GET',

        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        },

        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      }
    );

  } catch (error) {

    // A network error does not establish the transaction status.
    throw createPaystackError(
      'Paystack could not be reached. Transaction verification is uncertain.',
      'PAYSTACK_NETWORK_ERROR',
      503,
      false
    );

  }

  // STEP 4: Read the response body.
  let result;

  try {

    result = await response.json();

  } catch (error) {

    throw createPaystackError(
      'Paystack returned an unreadable verification response.',
      'PAYSTACK_INVALID_RESPONSE',
      502,
      false
    );

  }

  // STEP 5: Handle unsuccessful HTTP responses.
  if (!response.ok) {

    const definitive = (
      response.status >= 400 &&
      response.status < 500
    );

    throw createPaystackError(
      'Paystack could not verify the transaction.',
      'PAYSTACK_VERIFICATION_HTTP_ERROR',
      502,
      definitive
    );

  }

  // STEP 6: Confirm that Paystack supplied valid transaction data.
  if (
    !result ||
    result.status !== true ||
    !result.data ||
    typeof result.data !== 'object' ||
    Array.isArray(result.data)
  ) {
    throw createPaystackError(
      'Paystack did not return valid transaction verification data.',
      'PAYSTACK_VERIFICATION_REJECTED',
      502,
      false
    );
  }

  // STEP 7: Ensure the returned transaction belongs to
  // the exact reference requested by our backend.
  if (result.data.reference !== cleanReference) {

    throw createPaystackError(
      'Paystack returned a different transaction reference.',
      'PAYSTACK_REFERENCE_MISMATCH',
      502,
      false
    );

  }

  // STEP 8: Return the provider's transaction details.
  // The payment service will independently validate the
  // status, amount, currency and customer before funding.
  return result.data;

}

// Export the Paystack integration function.
module.exports = {
  initializePaystackTransaction,
  verifyPaystackTransaction
};
