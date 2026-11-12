
// Import the shared PostgreSQL connection pool.
const {
  postgresPool
} = require('../../../database/postgres/connection');

// Select either a transaction-controlled client or the shared pool.
function getDatabase(client) {

  return client || postgresPool;

}

// Create or retrieve a payment attempt using its idempotency key.
async function createOrGetPaymentAttempt({

  id,
  userId,
  reference,
  idempotencyKey,
  amount,
  client = null

}) {

  // Select the appropriate PostgreSQL connection.
  const db = getDatabase(client);

  // Create a payment attempt before contacting Paystack.
  // The initializing status means checkout creation is in progress.
  const insertResult = await db.query(
    `
      INSERT INTO payment_attempts (
        id,
        user_id,
        provider,
        reference,
        idempotency_key,
        amount,
        currency,
        status
      )

      VALUES (
        $1,
        $2,
        'paystack',
        $3,
        $4,
        $5,
        'NGN',
        'initializing'
      )

      ON CONFLICT (idempotency_key) DO NOTHING

      RETURNING *
    `,
    [
      id,
      userId,
      reference,
      idempotencyKey,
      amount
    ]
  );

  // Return the newly created payment attempt.
  if (insertResult.rows.length > 0) {

    return {
      created: true,
      paymentAttempt: insertResult.rows[0]
    };

  }

  // An attempt with this idempotency key already exists.
  // Retrieve the original record.
  const existingResult = await db.query(
    `
      SELECT *
      FROM payment_attempts
      WHERE idempotency_key = $1
      LIMIT 1
    `,
    [idempotencyKey]
  );

  // Protect against an unexpected database inconsistency.
  if (existingResult.rows.length === 0) {

    throw new Error(
      'Payment attempt could not be retrieved after an idempotency conflict.'
    );

  }

  return {
    created: false,
    paymentAttempt: existingResult.rows[0]
  };

}

// Save the Paystack checkout details.
async function saveCheckoutDetails({

  id,
  authorizationUrl,
  accessCode,
  client = null

}) {

  // Select the appropriate PostgreSQL connection.
  const db = getDatabase(client);

  // Save checkout details and transition the attempt to pending.
  // Only an initializing attempt can make this transition.
  const result = await db.query(
    `
      UPDATE payment_attempts

      SET
        authorization_url = $2,
        access_code = $3,
        status = 'pending',
        updated_at = NOW()

      WHERE
        id = $1
        AND status = 'initializing'

      RETURNING *
    `,
    [
      id,
      authorizationUrl,
      accessCode
    ]
  );

  // Return the updated record or null if no eligible record exists.
  return result.rows[0] || null;

}

// Mark a payment attempt as failed.
async function markPaymentAttemptFailed({

  id,
  client = null

}) {

  // Select the appropriate PostgreSQL connection.
  const db = getDatabase(client);

  // Only an initializing attempt can be marked as failed.
  const result = await db.query(
    `
      UPDATE payment_attempts

      SET
        status = 'failed',
        updated_at = NOW()

      WHERE
        id = $1
        AND status = 'initializing'

      RETURNING *
    `,
    [id]
  );

  return result.rows[0] || null;

}

// Retrieve a payment attempt using its unique Paystack reference.
async function getPaymentAttemptByReference({

  reference,
  client = null

}) {

  // Select the appropriate PostgreSQL connection.
  const db = getDatabase(client);

  // Retrieve the payment attempt associated with this reference.
  const result = await db.query(
    `
      SELECT *
      FROM payment_attempts
      WHERE reference = $1
      LIMIT 1
    `,
    [reference]
  );

  // Return the payment attempt or null when it does not exist.
  return result.rows[0] || null;

}

// Mark a verified and funded payment attempt as successful.
async function markPaymentAttemptSuccessful({

  id,
  client = null

}) {

  // Select the appropriate PostgreSQL connection.
  const db = getDatabase(client);

  // Only a pending payment can transition to success.
  // Record when the successful verification was completed.
  const result = await db.query(
    `
      UPDATE payment_attempts

      SET
        status = 'success',
        verified_at = NOW(),
        updated_at = NOW()

      WHERE
        id = $1
        AND status = 'pending'

      RETURNING *
    `,
    [id]
  );

  // Return the updated record or null if the transition was rejected.
  return result.rows[0] || null;

}

// Export payment repository operations.
module.exports = {
  createOrGetPaymentAttempt,
  saveCheckoutDetails,
  markPaymentAttemptFailed,
  getPaymentAttemptByReference,
  markPaymentAttemptSuccessful,
};
