
// PostgreSQL integration tests for the payment repository.

// Import the PostgreSQL connection pool.
const {
  postgresPool
} = require('../../database/postgres/connection');

// Import UUID generation.
const {
  randomUUID
} = require('crypto');

// Import the payment repository functions.
const {
  createOrGetPaymentAttempt,
  saveCheckoutDetails,
  markPaymentAttemptFailed,
  getPaymentAttemptByReference,
  markPaymentAttemptSuccessful,
} = require('../../modules/payments/repositories/payment.repository');

// Group all payment repository integration tests.
describe('Payment Repository PostgreSQL Integration', () => {

  // Close the PostgreSQL connection pool after all tests.
  afterAll(async () => {

    await postgresPool.end();

  });

  // --------------------------------------------------
  // TEST 1: VERIFY THE TEST DATABASE CONNECTION
  // --------------------------------------------------

  test('should connect to kobomarket_test', async () => {

    const result = await postgresPool.query(
      'SELECT current_database() AS database_name'
    );

    expect(result.rows[0].database_name).toBe(
      'kobomarket_test'
    );

  });

  // --------------------------------------------------
  // TEST 2: CREATE A PAYMENT ATTEMPT
  // --------------------------------------------------

test('should create a new initializing payment attempt', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Generate unique payment identifiers.
      const paymentId = randomUUID();

      const paymentReference = `TEST-PAY-${randomUUID()}`;

      const idempotencyKey = `TEST-PAY-${randomUUID()}`;

      // Create a payment attempt using the real repository.
      const result = await createOrGetPaymentAttempt({

        // Unique payment attempt ID.
        id: paymentId,

        // Dedicated test customer ID.
        userId: 'TEST-PAYMENT-USER-001',

        // Unique backend-generated payment reference.
        reference: paymentReference,

        // Unique idempotency key.
        idempotencyKey,

        // NGN 1,500.00 expressed in kobo.
        amount: '150000',

        // Use the connection controlled by this test.
        client

      });

      // Confirm that a new record was created.
      expect(result.created).toBe(true);

      // Confirm that PostgreSQL returned the record.
      expect(result.paymentAttempt).toBeDefined();

      // Confirm the payment ID.
      expect(result.paymentAttempt.id).toBe(paymentId);

      // Confirm the customer ID.
      expect(result.paymentAttempt.user_id).toBe(
        'TEST-PAYMENT-USER-001'
      );

      // Confirm the payment provider.
      expect(result.paymentAttempt.provider).toBe('paystack');

      // Confirm the payment reference.
      expect(result.paymentAttempt.reference).toBe(
        paymentReference
      );

      // Confirm the idempotency key.
      expect(result.paymentAttempt.idempotency_key).toBe(
        idempotencyKey
      );

      // Confirm the amount in kobo.
      expect(String(result.paymentAttempt.amount)).toBe(
        '150000'
      );

      // Confirm the currency.
      expect(result.paymentAttempt.currency).toBe('NGN');

// Confirm that the payment starts in the initializing state.
expect(result.paymentAttempt.status).toBe('initializing');

      // Confirm checkout details are initially empty.
      expect(result.paymentAttempt.authorization_url).toBeNull();

      expect(result.paymentAttempt.access_code).toBeNull();

    } finally {

      // Roll back all changes made by this test.
      try {

        if (transactionStarted) {

          await client.query('ROLLBACK');

        }

      } finally {

        // Always return the connection to the pool.
        client.release();

      }

    }

  });
  // --------------------------------------------------
  // TEST 3: PREVENT DUPLICATE PAYMENT ATTEMPTS
  // --------------------------------------------------

  test('should return the original payment attempt when an idempotency key is reused', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Generate identifiers for the original payment attempt.
      const originalPaymentId = randomUUID();

      const originalReference = `TEST-PAY-${randomUUID()}`;

      const idempotencyKey = `TEST-PAY-${randomUUID()}`;

      // Create the original payment attempt.
      const firstResult = await createOrGetPaymentAttempt({

        id: originalPaymentId,

        userId: 'TEST-PAYMENT-USER-001',

        reference: originalReference,

        idempotencyKey,

        amount: '150000',

        client

      });

      // Generate different identifiers for the second attempt.
      const secondPaymentId = randomUUID();

      const secondReference = `TEST-PAY-${randomUUID()}`;

      // Submit the same idempotency key again.
      const secondResult = await createOrGetPaymentAttempt({

        id: secondPaymentId,

        userId: 'TEST-PAYMENT-USER-001',

        reference: secondReference,

        idempotencyKey,

        amount: '150000',

        client

      });

      // Confirm that the first call created a record.
      expect(firstResult.created).toBe(true);

      // Confirm that the second call did not create a record.
      expect(secondResult.created).toBe(false);

      // Confirm that the original payment ID was returned.
      expect(secondResult.paymentAttempt.id).toBe(
        originalPaymentId
      );

      // Confirm that the original reference was retained.
      expect(secondResult.paymentAttempt.reference).toBe(
        originalReference
      );

      // Confirm that the original amount was retained.
      expect(String(secondResult.paymentAttempt.amount)).toBe(
        '150000'
      );

      // Confirm that the same idempotency key was retained.
      expect(secondResult.paymentAttempt.idempotency_key).toBe(
        idempotencyKey
      );

    } finally {

      // Roll back all changes made by this test.
      try {

        if (transactionStarted) {

          await client.query('ROLLBACK');

        }

      } finally {

        // Always return the connection to the pool.
        client.release();

      }

    }

  });
  // --------------------------------------------------
  // TEST 4: SAVE PAYSTACK CHECKOUT DETAILS
  // --------------------------------------------------

  test('should save Paystack authorization URL and access code', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Generate unique payment identifiers.
      const paymentId = randomUUID();

      const paymentReference = `TEST-PAY-${randomUUID()}`;

      const idempotencyKey = `TEST-PAY-${randomUUID()}`;

 // Create an initializing payment attempt.
      const createResult = await createOrGetPaymentAttempt({

        id: paymentId,

        userId: 'TEST-PAYMENT-USER-001',

        reference: paymentReference,

        idempotencyKey,

        amount: '150000',

        client

      });

      // Confirm that the payment attempt was created.
      expect(createResult.created).toBe(true);

      // Prepare simulated Paystack checkout details.
      const authorizationUrl =
        'https://checkout.paystack.com/test-checkout';

      const accessCode = 'TEST-ACCESS-CODE-001';

      // Save the checkout details against the payment attempt.
      const updatedPayment = await saveCheckoutDetails({

        id: paymentId,

        authorizationUrl,

        accessCode,

        client

      });

      // Confirm that the payment record was updated.
      expect(updatedPayment).toBeDefined();

      // Confirm the payment ID.
      expect(updatedPayment.id).toBe(paymentId);

      // Confirm the authorization URL.
      expect(updatedPayment.authorization_url).toBe(
        authorizationUrl
      );

      // Confirm the Paystack access code.
      expect(updatedPayment.access_code).toBe(accessCode);

      // Confirm that saving checkout details did not change
      // the payment status from pending.
      expect(updatedPayment.status).toBe('pending');

    } finally {

      // Roll back all changes made by this test.
      try {

        if (transactionStarted) {

          await client.query('ROLLBACK');

        }

      } finally {

        // Always return the connection to the pool.
        client.release();

      }

    }

  });

    // --------------------------------------------------
  // TEST 5: MARK A PAYMENT ATTEMPT AS FAILED
  // --------------------------------------------------

test('should mark an initializing payment attempt as failed', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Generate unique payment identifiers.
      const paymentId = randomUUID();

      const paymentReference = `TEST-PAY-${randomUUID()}`;

      const idempotencyKey = `TEST-PAY-${randomUUID()}`;

    // Create an initializing payment attempt.
      const createResult = await createOrGetPaymentAttempt({

        id: paymentId,

        userId: 'TEST-PAYMENT-USER-001',

        reference: paymentReference,

        idempotencyKey,

        amount: '150000',

        client

      });

      // Confirm that the payment attempt was created.
      expect(createResult.created).toBe(true);

      // Mark the payment attempt as failed.
      const failedPayment = await markPaymentAttemptFailed({

        id: paymentId,

        client

      });

      // Confirm that PostgreSQL returned the updated record.
      expect(failedPayment).toBeDefined();

      // Confirm the payment ID.
      expect(failedPayment.id).toBe(paymentId);

      // Confirm the payment reference.
      expect(failedPayment.reference).toBe(paymentReference);

      // Confirm that the payment status is now failed.
      expect(failedPayment.status).toBe('failed');

    } finally {

      // Roll back all changes made by this test.
      try {

        if (transactionStarted) {

          await client.query('ROLLBACK');

        }

      } finally {

        // Always return the connection to the pool.
        client.release();

      }

    }

  });
  // --------------------------------------------------
  // TEST 6: PREVENT UPDATES TO A FAILED PAYMENT
  // --------------------------------------------------

  test('should reject checkout updates and repeated failure updates after a payment has failed', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Generate unique payment identifiers.
      const paymentId = randomUUID();

      const paymentReference = `TEST-PAY-${randomUUID()}`;

      const idempotencyKey = `TEST-PAY-${randomUUID()}`;

      // Create an initializing payment attempt.
      const createResult = await createOrGetPaymentAttempt({

        id: paymentId,

        userId: 'TEST-PAYMENT-USER-001',

        reference: paymentReference,

        idempotencyKey,

        amount: '150000',

        client

      });

      // Confirm that the payment attempt was created.
      expect(createResult.created).toBe(true);

      // Mark the payment attempt as failed.
      const failedPayment = await markPaymentAttemptFailed({

        id: paymentId,

        client

      });

      // Confirm that the payment was marked as failed.
      expect(failedPayment.status).toBe('failed');

      // Attempt to save checkout details after failure.
      const checkoutUpdate = await saveCheckoutDetails({

        id: paymentId,

        authorizationUrl:
          'https://checkout.paystack.com/test-checkout',

        accessCode: 'TEST-ACCESS-CODE-002',

        client

      });

      // The repository must reject this update.
      expect(checkoutUpdate).toBeNull();

      // Attempt to mark the already failed payment as failed again.
      const repeatedFailure = await markPaymentAttemptFailed({

        id: paymentId,

        client

      });

      // The repository must reject this repeated update.
      expect(repeatedFailure).toBeNull();

      // Read the payment directly from PostgreSQL.
      const finalResult = await client.query(
        `
          SELECT status, authorization_url, access_code
          FROM payment_attempts
          WHERE id = $1
        `,
        [paymentId]
      );

      // Confirm that the payment remains failed.
      expect(finalResult.rows[0].status).toBe('failed');

      // Confirm that no checkout URL was saved.
      expect(finalResult.rows[0].authorization_url).toBeNull();

      // Confirm that no access code was saved.
      expect(finalResult.rows[0].access_code).toBeNull();

    } finally {

      // Roll back all changes made by this test.
      try {

        if (transactionStarted) {

          await client.query('ROLLBACK');

        }

      } finally {

        // Always return the connection to the pool.
        client.release();

      }

    }

  });


  // --------------------------------------------------
  // TEST 7: RETRIEVE A PAYMENT ATTEMPT BY REFERENCE
  // --------------------------------------------------

  test('should retrieve a payment attempt using its Paystack reference', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Generate unique payment identifiers.
      const paymentId = randomUUID();
      const paymentReference = `TEST-PAY-${randomUUID()}`;
      const idempotencyKey = `TEST-PAY-${randomUUID()}`;

      // Create an initializing payment attempt.
      const createResult = await createOrGetPaymentAttempt({

        id: paymentId,
        userId: 'TEST-PAYMENT-USER-001',
        reference: paymentReference,
        idempotencyKey,
        amount: '150000',
        client

      });

      // Confirm that the payment attempt was created.
      expect(createResult.created).toBe(true);

      // Retrieve the payment attempt using its reference.
      const paymentAttempt = await getPaymentAttemptByReference({

        reference: paymentReference,
        client

      });

      // Confirm that the correct payment attempt was returned.
      expect(paymentAttempt).toBeDefined();
      expect(paymentAttempt.id).toBe(paymentId);
      expect(paymentAttempt.reference).toBe(paymentReference);
      expect(paymentAttempt.user_id).toBe('TEST-PAYMENT-USER-001');
      expect(String(paymentAttempt.amount)).toBe('150000');
      expect(paymentAttempt.currency).toBe('NGN');
      expect(paymentAttempt.status).toBe('initializing');

    } finally {

      // Roll back all changes made by this test.
      try {

        if (transactionStarted) {
          await client.query('ROLLBACK');
        }

      } finally {

        // Always return the connection to the pool.
        client.release();

      }

    }

  });



  // --------------------------------------------------
  // TEST 8: HANDLE A NONEXISTENT PAYMENT REFERENCE
  // --------------------------------------------------

  test('should return null when a payment reference does not exist', async () => {

    // Retrieve a payment using a reference that was never created.
    const paymentAttempt = await getPaymentAttemptByReference({

      reference: `NONEXISTENT-${randomUUID()}`

    });

    // Confirm that no payment attempt was found.
    expect(paymentAttempt).toBeNull();

  });


  // --------------------------------------------------
  // TEST 9: MARK A PENDING PAYMENT AS SUCCESSFUL
  // --------------------------------------------------

  test('should mark a pending payment as successful and record verification time', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Generate unique payment identifiers.
      const paymentId = randomUUID();
      const paymentReference = `TEST-PAY-${randomUUID()}`;
      const idempotencyKey = `TEST-PAY-${randomUUID()}`;

      // Create an initializing payment attempt.
      const createResult = await createOrGetPaymentAttempt({

        id: paymentId,
        userId: 'TEST-PAYMENT-USER-001',
        reference: paymentReference,
        idempotencyKey,
        amount: '150000',
        client

      });

      // Confirm that the payment attempt was created.
      expect(createResult.created).toBe(true);

      // Save checkout details to move the attempt to pending.
      const pendingPayment = await saveCheckoutDetails({

        id: paymentId,
        authorizationUrl: 'https://checkout.paystack.com/test-checkout',
        accessCode: 'TEST-ACCESS-CODE-001',
        client

      });

      // Confirm that the payment is pending before verification.
      expect(pendingPayment.status).toBe('pending');

      // Mark the verified and funded payment as successful.
      const successfulPayment = await markPaymentAttemptSuccessful({

        id: paymentId,
        client

      });

      // Confirm that the payment was updated.
      expect(successfulPayment).toBeDefined();
      expect(successfulPayment.id).toBe(paymentId);

      // Confirm that the payment status is now successful.
      expect(successfulPayment.status).toBe('success');

      // Confirm that PostgreSQL recorded the verification time.
      expect(successfulPayment.verified_at).not.toBeNull();

      // Confirm that the update timestamp was recorded.
      expect(successfulPayment.updated_at).not.toBeNull();

    } finally {

      // Roll back all changes made by this test.
      try {

        if (transactionStarted) {
          await client.query('ROLLBACK');
        }

      } finally {

        // Always return the connection to the pool.
        client.release();

      }

    }

  });



  // --------------------------------------------------
  // TEST 10: REJECT SUCCESS TRANSITION FROM INITIALIZING
  // --------------------------------------------------

  test('should reject a success transition when a payment is still initializing', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Generate unique payment identifiers.
      const paymentId = randomUUID();
      const paymentReference = `TEST-PAY-${randomUUID()}`;
      const idempotencyKey = `TEST-PAY-${randomUUID()}`;

      // Create an initializing payment attempt.
      const createResult = await createOrGetPaymentAttempt({

        id: paymentId,
        userId: 'TEST-PAYMENT-USER-001',
        reference: paymentReference,
        idempotencyKey,
        amount: '150000',
        client

      });

      // Confirm that the payment attempt was created.
      expect(createResult.created).toBe(true);
      expect(createResult.paymentAttempt.status).toBe('initializing');

      // Attempt to mark an initializing payment as successful.
      const successfulPayment = await markPaymentAttemptSuccessful({

        id: paymentId,
        client

      });

      // Confirm that the repository rejected the transition.
      expect(successfulPayment).toBeNull();

      // Retrieve the payment to confirm its status was unchanged.
      const unchangedPayment = await getPaymentAttemptByReference({

        reference: paymentReference,
        client

      });

      expect(unchangedPayment.status).toBe('initializing');
      expect(unchangedPayment.verified_at).toBeNull();

    } finally {

      // Roll back all changes made by this test.
      try {

        if (transactionStarted) {
          await client.query('ROLLBACK');
        }

      } finally {

        // Always return the connection to the pool.
        client.release();

      }

    }

  });



  // --------------------------------------------------
  // TEST 11: REJECT SUCCESS TRANSITION FROM FAILED
  // --------------------------------------------------

  test('should reject a success transition when a payment has already failed', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Generate unique payment identifiers.
      const paymentId = randomUUID();
      const paymentReference = `TEST-PAY-${randomUUID()}`;
      const idempotencyKey = `TEST-PAY-${randomUUID()}`;

      // Create an initializing payment attempt.
      const createResult = await createOrGetPaymentAttempt({

        id: paymentId,
        userId: 'TEST-PAYMENT-USER-001',
        reference: paymentReference,
        idempotencyKey,
        amount: '150000',
        client

      });

      // Confirm that the payment attempt was created.
      expect(createResult.created).toBe(true);

      // Mark the initializing payment as failed.
      const failedPayment = await markPaymentAttemptFailed({

        id: paymentId,
        client

      });

      // Confirm that the payment is now failed.
      expect(failedPayment.status).toBe('failed');

      // Attempt to change the failed payment to successful.
      const successfulPayment = await markPaymentAttemptSuccessful({

        id: paymentId,
        client

      });

      // Confirm that the repository rejected the transition.
      expect(successfulPayment).toBeNull();

      // Retrieve the payment to confirm its status is unchanged.
      const unchangedPayment = await getPaymentAttemptByReference({

        reference: paymentReference,
        client

      });

      expect(unchangedPayment.status).toBe('failed');
      expect(unchangedPayment.verified_at).toBeNull();

    } finally {

      // Roll back all changes made by this test.
      try {

        if (transactionStarted) {
          await client.query('ROLLBACK');
        }

      } finally {

        // Always return the connection to the pool.
        client.release();

      }

    }

  });



});
