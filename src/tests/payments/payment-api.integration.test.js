
/*
==========================================================
KOBOMARKET PAYMENT API INTEGRATION TEST
==========================================================

Purpose:
Test the complete payment lifecycle through the real
Express HTTP API.

Databases:
- MongoDB: kobomarket_payment_test
- PostgreSQL: kobomarket_payment_test

Paystack:
- Simulated using global.fetch.
- No real payment request is sent.

Financial integrity:
- Successful ledger records are preserved.
- No posted ledger entries are deleted.
==========================================================
*/

// Load environment variables.
require('dotenv').config();

// Import Node.js utilities.
const { randomUUID } = require('node:crypto');

// Import bcryptjs for creating a valid customer password hash.
const bcrypt = require('bcryptjs');

// Import JWT for generating a valid customer access token.
const jwt = require('jsonwebtoken');

// Import Supertest for real HTTP endpoint testing.
const request = require('supertest');

// Import Mongoose.
const mongoose = require('mongoose');

// Import the Express application.
const app = require('../../app');

// Import the MongoDB connection function.
const connectMongoDB =
  require('../../database/mongodb/connection');

// Import the PostgreSQL pool and connection function.
const {
  postgresPool,
  connectPostgres
} = require('../../database/postgres/connection');

// Import the MongoDB User model.
const User = require('../../modules/users/models/user.model');

// Import the wallet service.
const {
  createWallet,
  getWalletByUserId
} = require('../../modules/wallet/services/wallet.service');


// ----------------------------------------------------------
// TEST CONFIGURATION
// ----------------------------------------------------------

// Test amount in Nigerian Naira.
const PAYMENT_AMOUNT_NAIRA = 500;

// Expected payment amount in kobo.
const PAYMENT_AMOUNT_KOBO = 50000;

// Generate unique customer details for every test run.
const uniqueId = randomUUID();

const CUSTOMER_EMAIL =
  `payment-integration-${uniqueId}@example.com`;

const CUSTOMER_NAME = 'Payment Integration Customer';

// Generate a unique idempotency key.
const IDEMPOTENCY_KEY =
  `payment-integration-${uniqueId}`;

// Keep a reference to the original fetch implementation.
const originalFetch = global.fetch;

// These variables are populated during test setup.
let customer;
let customerId;
let accessToken;
let wallet;

// Store the payment reference returned by initialization.
let paymentReference;

// Control the amount returned by simulated Paystack verification.
let simulatedPaystackAmount = PAYMENT_AMOUNT_KOBO;


// ----------------------------------------------------------
// HELPER: CREATE A SIMULATED PAYSTACK RESPONSE
// ----------------------------------------------------------

function createPaystackResponse(data) {

  return {
    ok: true,
    status: 200,

    json: async () => data
  };

}


// ----------------------------------------------------------
// HELPER: CREATE THE CUSTOMER ACCESS TOKEN
// ----------------------------------------------------------

function createCustomerAccessToken(userId) {

  return jwt.sign(

    {
      sub: userId,
      role: 'customer'
    },

    process.env.JWT_ACCESS_SECRET,

    {
      algorithm: 'HS256',
      expiresIn: '15m',
      issuer: 'kobomarket-api',
      audience: 'kobomarket-client'
    }

  );

}


// ----------------------------------------------------------
// TEST DATABASE SETUP
// ----------------------------------------------------------

beforeAll(async () => {

  // Confirm that the dedicated payment integration
  // environment is active.
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.PAYMENT_INTEGRATION_TEST !== 'true'
  ) {

    throw new Error(
      'Payment integration test environment is not active.'
    );

  }


  // Connect to the dedicated MongoDB database.
  await connectMongoDB();


  // Connect to the dedicated PostgreSQL database.
  await connectPostgres();


  // Create a properly hashed customer password.
  const hashedPassword = await bcrypt.hash(
    'PaymentIntegrationPassword2026!',
    12
  );


  // Create a real MongoDB customer.
  customer = await User.create({

    name: CUSTOMER_NAME,

    email: CUSTOMER_EMAIL,

    password: hashedPassword,

    role: 'customer',

    isActive: true,

    isEmailVerified: true

  });


  // Save the MongoDB customer ID.
  customerId = customer._id.toString();


  // Create the customer's real PostgreSQL wallet
  // and linked ledger liability account.
  const walletResult = await createWallet({

    userId: customerId

  });


  // Retrieve the newly created wallet.
  const walletResultAfterCreation =
    await getWalletByUserId({

      userId: customerId

    });


  wallet = walletResultAfterCreation.wallet;


  // Confirm that wallet creation succeeded.
  if (
    !walletResult.success ||
    !wallet ||
    wallet.status !== 'active'
  ) {

    throw new Error(
      'The payment integration customer wallet could not be created.'
    );

  }


  // Generate the customer access token.
  accessToken = createCustomerAccessToken(customerId);

});


// ----------------------------------------------------------
// TEST CLEANUP
// ----------------------------------------------------------

afterAll(async () => {

  // Restore the original fetch implementation.
  global.fetch = originalFetch;


  // IMPORTANT:
  // Do not delete the customer, wallet, posted ledger
  // transactions, ledger entries or wallet transactions.
  //
  // They form the audit trail of the integration test.


  // Close the MongoDB connection.
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }


  // Close the PostgreSQL connection pool.
  await postgresPool.end();

});


// ----------------------------------------------------------
// PAYMENT API INTEGRATION TEST
// ----------------------------------------------------------

describe('Payment API Integration', () => {

  test(
    'should initialize, verify and fund a wallet exactly once',
    async () => {

      // --------------------------------------------------
      // STEP 1: CHECK THE INITIAL WALLET BALANCE
      // --------------------------------------------------

      const initialWalletResult =
        await getWalletByUserId({

          userId: customerId

        });


      expect(
        String(initialWalletResult.wallet.availableBalance)
      ).toBe('0');


      // --------------------------------------------------
      // STEP 2: SIMULATE PAYSTACK HTTP RESPONSES
      // --------------------------------------------------

      // This mock prevents real external Paystack requests.
      global.fetch = jest.fn(
        async (url, options = {}) => {

          const requestUrl = String(url);


          // Simulate Paystack transaction initialization.
          if (
            requestUrl.includes('/transaction/initialize')
          ) {

            const requestBody = JSON.parse(options.body);


            return createPaystackResponse({

              status: true,

              message: 'Authorization URL created',

              data: {

                authorization_url:
                  'https://checkout.paystack.test/authorize',

                access_code:
                  'integration-test-access-code',

                reference: requestBody.reference

              }

            });

          }


          // Simulate Paystack transaction verification.
          if (
            requestUrl.includes('/transaction/verify/')
          ) {

            const reference =
              decodeURIComponent(
                requestUrl.split('/').pop()
              );


            return createPaystackResponse({

              status: true,

              message: 'Verification successful',

              data: {

                reference,

                status: 'success',

                amount: simulatedPaystackAmount,

                currency: 'NGN',

                customer: {

                  email: CUSTOMER_EMAIL

                }

              }

            });

          }


          // Reject unexpected external requests.
          throw new Error(
            `Unexpected Paystack request: ${requestUrl}`
          );

        }
      );


      // --------------------------------------------------
      // STEP 3: REJECT AN UNAUTHENTICATED REQUEST
      // --------------------------------------------------

      const unauthorizedResponse =
        await request(app)

          .post('/api/payments/initialize')

          .send({

            amount: PAYMENT_AMOUNT_NAIRA,

            idempotencyKey: IDEMPOTENCY_KEY

          });


      expect(
        unauthorizedResponse.status
      ).toBe(401);


      // --------------------------------------------------
      // STEP 4: INITIALIZE A PAYMENT
      // --------------------------------------------------

      const initializationResponse =
        await request(app)

          .post('/api/payments/initialize')

          .set(
            'Authorization',
            `Bearer ${accessToken}`
          )

          .send({

            amount: PAYMENT_AMOUNT_NAIRA,

            idempotencyKey: IDEMPOTENCY_KEY

          });


      // A new payment must return HTTP 201.
      expect(
        initializationResponse.status
      ).toBe(201);


      expect(
        initializationResponse.body.success
      ).toBe(true);


      // Extract the payment details.
      const initializedPayment =
        initializationResponse.body.data;


      expect(
        initializedPayment.paymentAttemptId
      ).toBeDefined();


      expect(
        initializedPayment.reference
      ).toMatch(/^KM-PAY-/);


      expect(
        initializedPayment.amount
      ).toBe(PAYMENT_AMOUNT_KOBO);


      expect(
        initializedPayment.currency
      ).toBe('NGN');


      expect(
        initializedPayment.status
      ).toBe('pending');


      expect(
        initializedPayment.authorizationUrl
      ).toBe(
        'https://checkout.paystack.test/authorize'
      );


      expect(
        initializedPayment.accessCode
      ).toBe('integration-test-access-code');


      expect(
        initializedPayment.reused
      ).toBe(false);


      // Preserve the payment reference for verification.
      paymentReference = initializedPayment.reference;


      // Only one Paystack initialization request
      // should have occurred.
      expect(
        global.fetch
      ).toHaveBeenCalledTimes(1);


      // --------------------------------------------------
      // STEP 5: TEST IDEMPOTENT INITIALIZATION
      // --------------------------------------------------

      const repeatedInitializationResponse =
        await request(app)

          .post('/api/payments/initialize')

          .set(
            'Authorization',
            `Bearer ${accessToken}`
          )

          .send({

            amount: PAYMENT_AMOUNT_NAIRA,

            idempotencyKey: IDEMPOTENCY_KEY

          });


      // Existing checkout should return HTTP 200.
      expect(
        repeatedInitializationResponse.status
      ).toBe(200);


      expect(
        repeatedInitializationResponse.body.data.reused
      ).toBe(true);


      // It must return the original payment reference.
      expect(
        repeatedInitializationResponse.body.data.reference
      ).toBe(paymentReference);


      // Paystack must not be initialized again.
      expect(
        global.fetch
      ).toHaveBeenCalledTimes(1);


      // --------------------------------------------------
      // STEP 6: REJECT IDEMPOTENCY KEY AMOUNT CONFLICT
      // --------------------------------------------------

      const amountConflictResponse =
        await request(app)

          .post('/api/payments/initialize')

          .set(
            'Authorization',
            `Bearer ${accessToken}`
          )

          .send({

            amount: 700,

            idempotencyKey: IDEMPOTENCY_KEY

          });


      expect(
        amountConflictResponse.status
      ).toBe(409);


      expect(
        amountConflictResponse.body.code
      ).toBe('PAYMENT_AMOUNT_CONFLICT');


      // No additional Paystack request should occur.
      expect(
        global.fetch
      ).toHaveBeenCalledTimes(1);


      // --------------------------------------------------
      // STEP 7: VERIFY AN INCORRECT PAYMENT AMOUNT
      // --------------------------------------------------

      // Simulate Paystack returning an amount that
      // does not match the locally stored amount.
      simulatedPaystackAmount =
        PAYMENT_AMOUNT_KOBO - 1;


      const incorrectAmountResponse =
        await request(app)

          .post('/api/payments/verify')

          .set(
            'Authorization',
            `Bearer ${accessToken}`
          )

          .send({

            reference: paymentReference

          });


      expect(
        incorrectAmountResponse.status
      ).toBe(409);


      expect(
        incorrectAmountResponse.body.code
      ).toBe('PAYMENT_AMOUNT_MISMATCH');


      // The wallet must remain unfunded.
      const walletAfterRejectedVerification =
        await getWalletByUserId({

          userId: customerId

        });


      expect(
        String(
          walletAfterRejectedVerification.wallet.availableBalance
        )
      ).toBe('0');


      // --------------------------------------------------
      // STEP 8: VERIFY THE CORRECT PAYMENT
      // --------------------------------------------------

      // Now simulate the correct amount returned by Paystack.
      simulatedPaystackAmount =
        PAYMENT_AMOUNT_KOBO;


      const verificationResponse =
        await request(app)

          .post('/api/payments/verify')

          .set(
            'Authorization',
            `Bearer ${accessToken}`
          )

          .send({

            reference: paymentReference

          });


      expect(
        verificationResponse.status
      ).toBe(200);


      expect(
        verificationResponse.body.success
      ).toBe(true);


      expect(
        verificationResponse.body.data.alreadyCompleted
      ).toBe(false);


      expect(
        verificationResponse.body.data.payment.reference
      ).toBe(paymentReference);


      expect(
        verificationResponse.body.data.payment.status
      ).toBe('success');


      expect(
        String(
          verificationResponse.body.data.payment.amount
        )
      ).toBe(String(PAYMENT_AMOUNT_KOBO));


      // --------------------------------------------------
      // STEP 9: CONFIRM THE WALLET WAS CREDITED
      // --------------------------------------------------

      const fundedWalletResult =
        await getWalletByUserId({

          userId: customerId

        });


      expect(
        String(fundedWalletResult.wallet.availableBalance)
      ).toBe(String(PAYMENT_AMOUNT_KOBO));


      expect(
        fundedWalletResult.wallet.currency
      ).toBe('NGN');


      // --------------------------------------------------
      // STEP 10: VERIFY THE WALLET TRANSACTION
      // --------------------------------------------------

      const walletTransactionResult =
        await postgresPool.query(

          `
            SELECT
              id,
              wallet_id,
              transaction_type,
              amount,
              reference,
              status

            FROM wallet_transactions

            WHERE wallet_id = $1
              AND reference = $2
              AND transaction_type = 'funding'
          `,

          [
            wallet.id,
            paymentReference
          ]

        );


      expect(
        walletTransactionResult.rows
      ).toHaveLength(1);


      expect(
        walletTransactionResult.rows[0].status
      ).toBe('completed');


      expect(
        String(
          walletTransactionResult.rows[0].amount
        )
      ).toBe(String(PAYMENT_AMOUNT_KOBO));


      // --------------------------------------------------
      // STEP 11: VERIFY THE DOUBLE-ENTRY LEDGER
      // --------------------------------------------------

      const ledgerResult =
        await postgresPool.query(

          `
            SELECT
              lt.status,

              COUNT(le.id)::integer AS entry_count,

              COALESCE(
                SUM(le.amount)
                  FILTER (WHERE le.entry_type = 'debit'),
                0
              )::text AS total_debits,

              COALESCE(
                SUM(le.amount)
                  FILTER (WHERE le.entry_type = 'credit'),
                0
              )::text AS total_credits

            FROM ledger_transactions lt

            INNER JOIN ledger_entries le
              ON le.transaction_id = lt.id

            WHERE lt.reference = $1

            GROUP BY lt.id, lt.status
          `,

          [paymentReference]

        );


      expect(
        ledgerResult.rows
      ).toHaveLength(1);


      const ledger = ledgerResult.rows[0];


      expect(
        ledger.status
      ).toBe('posted');


      expect(
        ledger.entry_count
      ).toBe(2);


      // Both sides of the ledger must balance.
      expect(
        ledger.total_debits
      ).toBe(String(PAYMENT_AMOUNT_KOBO));


      expect(
        ledger.total_credits
      ).toBe(String(PAYMENT_AMOUNT_KOBO));


      // --------------------------------------------------
      // STEP 12: CONFIRM THE PAYMENT ATTEMPT STATUS
      // --------------------------------------------------

      const paymentAttemptResult =
        await postgresPool.query(

          `
            SELECT
              reference,
              amount,
              currency,
              status

            FROM payment_attempts

            WHERE reference = $1
          `,

          [paymentReference]

        );


      expect(
        paymentAttemptResult.rows
      ).toHaveLength(1);


      expect(
        paymentAttemptResult.rows[0].status
      ).toBe('success');


      expect(
        paymentAttemptResult.rows[0].currency
      ).toBe('NGN');


      // --------------------------------------------------
      // STEP 13: VERIFY THE SAME PAYMENT AGAIN
      // --------------------------------------------------

      // Count Paystack calls before the replay.
      const fetchCallsBeforeReplay =
        global.fetch.mock.calls.length;


      const repeatedVerificationResponse =
        await request(app)

          .post('/api/payments/verify')

          .set(
            'Authorization',
            `Bearer ${accessToken}`
          )

          .send({

            reference: paymentReference

          });


      expect(
        repeatedVerificationResponse.status
      ).toBe(200);


      expect(
        repeatedVerificationResponse.body.success
      ).toBe(true);


      expect(
        repeatedVerificationResponse.body.data.alreadyCompleted
      ).toBe(true);


      // A completed payment must not call Paystack again.
      expect(
        global.fetch
      ).toHaveBeenCalledTimes(
        fetchCallsBeforeReplay
      );


      // --------------------------------------------------
      // STEP 14: CONFIRM NO DUPLICATE WALLET CREDIT
      // --------------------------------------------------

      const finalWalletResult =
        await getWalletByUserId({

          userId: customerId

        });


      expect(
        String(finalWalletResult.wallet.availableBalance)
      ).toBe(String(PAYMENT_AMOUNT_KOBO));


      // Confirm there is still only one funding transaction.
      const finalWalletTransactionResult =
        await postgresPool.query(

          `
            SELECT COUNT(*)::integer AS transaction_count

            FROM wallet_transactions

            WHERE wallet_id = $1
              AND reference = $2
              AND transaction_type = 'funding'
          `,

          [
            wallet.id,
            paymentReference
          ]

        );


      expect(
        finalWalletTransactionResult.rows[0].transaction_count
      ).toBe(1);


    },
    60000
  );

});
