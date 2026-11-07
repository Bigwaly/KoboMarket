// Import Node.js crypto to generate unique transaction UUIDs.
const { randomUUID } = require('node:crypto');

// Import the existing PostgreSQL connection pool.
const { postgresPool } = require('../../../database/postgres/connection');

// Define the transaction types permitted by our database.
const ALLOWED_TRANSACTION_TYPES = [
  'wallet_funding',
  'purchase',
  'commission',
  'refund',
  'payout',
  'adjustment'
];

// PostgreSQL BIGINT maximum value.
// All financial amounts must fit within this limit.
const MAX_BIGINT = 9223372036854775807n;

// Create a standard application error.
function createServiceError(message, statusCode = 400, code = 'VALIDATION_ERROR') {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

// Validate and normalise a financial amount.
// We accept safe JavaScript integers or digit-only strings.
// Strings allow us to support large PostgreSQL BIGINT amounts safely.
function validateAmount(amount) {

  // Reject unsafe JavaScript numbers.
  if (typeof amount === 'number' && !Number.isSafeInteger(amount)) {
    throw createServiceError(
      'Amount must be a safe integer or an integer string.'
    );
  }

  // Reject unsupported input types and invalid formats.
  if (
    typeof amount !== 'number' &&
    (typeof amount !== 'string' || !/^[0-9]+$/.test(amount))
  ) {
    throw createServiceError(
      'Amount must be a positive integer expressed in kobo.'
    );
  }

  // Convert the amount to BigInt for accurate arithmetic.
  const amountInBigInt = BigInt(amount);

  // Amounts must be greater than zero.
  if (amountInBigInt <= 0n) {
    throw createServiceError('Amount must be greater than zero.');
  }

  // Ensure the amount fits PostgreSQL BIGINT.
  if (amountInBigInt > MAX_BIGINT) {
    throw createServiceError('Amount exceeds the PostgreSQL BIGINT limit.');
  }

  // Return a string because node-postgres handles BIGINT values safely
  // when they are passed as strings.
  return amountInBigInt.toString();
}

// Validate a ledger account ID.
function validateAccountId(accountId) {

  // Accept positive safe integers or digit-only strings.
  if (
    (typeof accountId !== 'number' || !Number.isSafeInteger(accountId)) &&
    (typeof accountId !== 'string' || !/^[0-9]+$/.test(accountId))
  ) {
    throw createServiceError('Every ledger entry must have a valid account ID.');
  }

  // Convert to BigInt to validate the ID safely.
  const id = BigInt(accountId);

  if (id <= 0n || id > MAX_BIGINT) {
    throw createServiceError('Ledger account ID must be a positive integer.');
  }

  return id.toString();
}

// Validate optional unique transaction identifiers.
function validateOptionalIdentifier(value, fieldName) {

  // Allow an omitted identifier.
  if (value === undefined || value === null) {
    return null;
  }

  // Identifiers must be strings.
  if (typeof value !== 'string') {
    throw createServiceError(`${fieldName} must be a string.`);
  }

  // Remove unnecessary spaces.
  const cleanedValue = value.trim();

  // Reject empty identifiers.
  if (!cleanedValue) {
    throw createServiceError(`${fieldName} cannot be empty.`);
  }

  // Match the database column limit.
  if (cleanedValue.length > 150) {
    throw createServiceError(`${fieldName} cannot exceed 150 characters.`);
  }

  return cleanedValue;
}

// Create and post a balanced ledger transaction.
//
// Expected input:
// {
//   transactionType: 'wallet_funding',
//   description: 'Customer wallet funding',
//   reference: 'PAYSTACK-REF-001',
//   idempotencyKey: 'FUNDING-REQUEST-001',
//   entries: [
//     {
//       accountId: 10,
//       entryType: 'debit',
//       amount: 1000000,
//       description: 'Paystack funds received'
//     },
//     {
//       accountId: 15,
//       entryType: 'credit',
//       amount: 1000000,
//       description: 'Customer wallet credited'
//     }
//   ]
// }
//
// IMPORTANT:
// All amounts are expressed in kobo, never naira.
async function createLedgerTransaction({
  transactionType,
  description,
  reference = null,
  idempotencyKey = null,
  entries
}) {

  // --------------------------------------------------
  // STEP 1: VALIDATE THE TRANSACTION HEADER
  // --------------------------------------------------

  // Check that the transaction type is supported.
  if (!ALLOWED_TRANSACTION_TYPES.includes(transactionType)) {
    throw createServiceError(
      `Unsupported transaction type: ${transactionType}`
    );
  }

  // Validate the transaction description.
  if (typeof description !== 'string' || !description.trim()) {
    throw createServiceError('Transaction description is required.');
  }

  const cleanDescription = description.trim();

  // Validate optional reference and idempotency key.
  const cleanReference = validateOptionalIdentifier(reference, 'Reference');

  const cleanIdempotencyKey = validateOptionalIdentifier(
    idempotencyKey,
    'Idempotency key'
  );

  // --------------------------------------------------
  // STEP 2: VALIDATE THE LEDGER ENTRIES
  // --------------------------------------------------

  // Every financial transaction needs at least two entries.
  if (!Array.isArray(entries) || entries.length < 2) {
    throw createServiceError(
      'A ledger transaction must contain at least two entries.'
    );
  }

  // Prepare the entries for database insertion.
  const validatedEntries = entries.map((entry) => {

    // Check that each entry is an object.
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw createServiceError('Every ledger entry must be an object.');
    }

    // Validate the account ID.
    const accountId = validateAccountId(entry.accountId);

    // Only debit and credit entries are allowed.
    if (!['debit', 'credit'].includes(entry.entryType)) {
      throw createServiceError(
        'Ledger entry type must be either debit or credit.'
      );
    }

    // Validate the amount.
    const amount = validateAmount(entry.amount);

    // Use the entry description when provided.
    // Otherwise, inherit the transaction description.
    const entryDescription =
      typeof entry.description === 'string' && entry.description.trim()
        ? entry.description.trim()
        : cleanDescription;

    return {
      accountId,
      entryType: entry.entryType,
      amount,
      description: entryDescription
    };
  });

  // Calculate debit and credit totals using BigInt.
  // This prevents JavaScript floating-point arithmetic errors.
  let totalDebits = 0n;
  let totalCredits = 0n;

  for (const entry of validatedEntries) {

    if (entry.entryType === 'debit') {
      totalDebits += BigInt(entry.amount);
    } else {
      totalCredits += BigInt(entry.amount);
    }
  }

  // Reject unbalanced transactions before contacting PostgreSQL.
  if (totalDebits !== totalCredits) {
    throw createServiceError(
      `Unbalanced ledger transaction. Debits: ${totalDebits}, Credits: ${totalCredits}.`
    );
  }

  // --------------------------------------------------
  // STEP 3: PREPARE THE DATABASE TRANSACTION
  // --------------------------------------------------

  // Generate a unique UUID for this financial transaction.
  const transactionId = randomUUID();

  // Collect unique account IDs referenced by the entries.
  const accountIds = [...new Set(
    validatedEntries.map((entry) => entry.accountId)
  )];

  // Obtain a dedicated PostgreSQL connection.
  const client = await postgresPool.connect();

  try {

    // Begin an atomic PostgreSQL database transaction.
    await client.query('BEGIN');

    // --------------------------------------------------
    // STEP 4: VERIFY THAT ALL ACCOUNTS EXIST AND ARE ACTIVE
    // --------------------------------------------------

    const accountResult = await client.query(
      `
        SELECT id, account_code, account_name, status
        FROM ledger_accounts
        WHERE id = ANY($1::bigint[])
        FOR SHARE
      `,
      [accountIds]
    );

    // Create a set of account IDs that were found.
    const existingAccountIds = new Set(
      accountResult.rows.map((account) => String(account.id))
    );

    // Identify any accounts that are missing.
    const missingAccounts = accountIds.filter(
      (id) => !existingAccountIds.has(id)
    );

    if (missingAccounts.length > 0) {
      throw createServiceError(
        `The following ledger accounts do not exist: ${missingAccounts.join(', ')}.`
      );
    }

    // Reject accounts that have been deactivated.
    const inactiveAccounts = accountResult.rows.filter(
      (account) => account.status !== 'active'
    );

    if (inactiveAccounts.length > 0) {
      throw createServiceError(
        `Inactive ledger accounts cannot be used: ${
          inactiveAccounts.map((account) => account.account_code).join(', ')
        }.`
      );
    }


    // --------------------------------------------------
    // STEP 5: CREATE THE PENDING TRANSACTION HEADER
    // --------------------------------------------------

    // Attempt to create a new pending transaction.
    // If the idempotency key already exists, PostgreSQL
    // will not create a duplicate transaction.
    const transactionResult = await client.query(
      `
        INSERT INTO ledger_transactions (
          id,
          transaction_type,
          status,
          reference,
          idempotency_key,
          description
        )
        VALUES ($1, $2, 'pending', $3, $4, $5)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id, transaction_type, status, reference, description, created_at
      `,
      [
        transactionId,
        transactionType,
        cleanReference,
        cleanIdempotencyKey,
        cleanDescription
      ]
    );

    // If no row was inserted, this idempotency key already exists.
    if (transactionResult.rows.length === 0) {

      // Retrieve the original transaction.
      const existingTransactionResult = await client.query(
        `
          SELECT
            id,
            transaction_type,
            status,
            reference,
            description,
            created_at,
            posted_at
          FROM ledger_transactions
          WHERE idempotency_key = $1
          FOR SHARE
        `,
        [cleanIdempotencyKey]
      );

      const existingTransaction = existingTransactionResult.rows[0];

      // Only a successfully posted transaction can be replayed.
      if (!existingTransaction || existingTransaction.status !== 'posted') {
        throw createServiceError(
          'The existing idempotency request is not in a valid posted state.',
          409,
          'IDEMPOTENCY_TRANSACTION_NOT_POSTED'
        );
      }

      // Retrieve the original transaction's ledger entries.
      const existingEntriesResult = await client.query(
        `
          SELECT account_id, entry_type, amount, description
          FROM ledger_entries
          WHERE transaction_id = $1
          ORDER BY id ASC
        `,
        [existingTransaction.id]
      );

      // Normalise the original entries for comparison.
      const existingEntries = existingEntriesResult.rows.map((entry) => ({
        accountId: String(entry.account_id),
        entryType: entry.entry_type,
        amount: String(entry.amount),
        description: entry.description
      }));

      // Compare the transaction header.
      const sameTransactionDetails =
        existingTransaction.transaction_type === transactionType &&
        existingTransaction.reference === cleanReference &&
        existingTransaction.description === cleanDescription;

      // Compare every ledger entry.
      const sameLedgerEntries =
        JSON.stringify(existingEntries) === JSON.stringify(validatedEntries);

      // Reject reuse of the key for a different transaction.
      if (!sameTransactionDetails || !sameLedgerEntries) {
        throw createServiceError(
          'This idempotency key has already been used for a different transaction.',
          409,
          'IDEMPOTENCY_KEY_REUSED'
        );
      }

      // This is an identical retry. No new entries are created.
      await client.query('COMMIT');

      // Return the original transaction.
      return {
        success: true,
        message: 'This transaction was already processed. The original result has been returned.',
        transaction: existingTransaction,
        entryCount: existingEntries.length,
        totalDebits: totalDebits.toString(),
        totalCredits: totalCredits.toString(),
        idempotentReplay: true
      };
    }

    // A new transaction header was created successfully.
    // Continue to STEP 6 to insert its ledger entries.


    // --------------------------------------------------
    // STEP 6: INSERT THE DEBIT AND CREDIT ENTRIES
    // --------------------------------------------------

    // Insert each ledger entry under the new transaction.
    for (const entry of validatedEntries) {

      await client.query(
        `
          INSERT INTO ledger_entries (
            transaction_id,
            account_id,
            entry_type,
            amount,
            description
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          transactionId,
          entry.accountId,
          entry.entryType,
          entry.amount,
          entry.description
        ]
      );
    }

    // --------------------------------------------------
    // STEP 7: POST THE TRANSACTION
    // --------------------------------------------------

    // Change the transaction status from pending to posted.
    // The PostgreSQL triggers will now verify:
    // 1. At least two ledger entries exist.
    // 2. Total debits equal total credits.
    // 3. The status transition is permitted.
    // 4. The posted transaction header is protected.
    const postedResult = await client.query(
      `
        UPDATE ledger_transactions
        SET
          status = 'posted',
          posted_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, transaction_type, status, created_at, posted_at
      `,
      [transactionId]
    );

    // --------------------------------------------------
    // STEP 8: COMMIT THE DATABASE TRANSACTION
    // --------------------------------------------------

    // All operations succeeded.
    // Permanently save the transaction header and entries together.
    await client.query('COMMIT');

    // Return a useful result to the application.
    return {
      success: true,
      message: 'Ledger transaction created and posted successfully.',
      transaction: postedResult.rows[0],
      entryCount: validatedEntries.length,
      totalDebits: totalDebits.toString(),
      totalCredits: totalCredits.toString()
    };

  } catch (error) {

    // --------------------------------------------------
    // STEP 9: ROLL BACK IF ANY OPERATION FAILS
    // --------------------------------------------------

    // Undo every database change made since BEGIN.
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Preserve the original error if rollback also fails.
      console.error('Ledger transaction rollback failed:', rollbackError);
    }

    // PostgreSQL error code 23505 means a unique constraint was violated.
    if (error.code === '23505') {



      // A duplicate reference means the reference already exists.
      if (error.constraint === 'ledger_transactions_reference_unique') {
        throw createServiceError(
          'This transaction reference already exists.',
          409,
          'DUPLICATE_TRANSACTION_REFERENCE'
        );
      }
    }

    // Pass all other errors to the calling application.
    throw error;

  } finally {

    // Always return the connection to the PostgreSQL pool.
    client.release();
  }
}

// Export the ledger transaction service.
module.exports = {
  createLedgerTransaction
};
