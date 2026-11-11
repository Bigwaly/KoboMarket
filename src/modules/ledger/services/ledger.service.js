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
  'adjustment',
  'reversal'
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

// Validate the UUID of an existing ledger transaction.
function validateTransactionId(transactionId) {

  // Transaction IDs must be supplied as strings.
  if (typeof transactionId !== 'string') {
    throw createServiceError(
      'Transaction ID must be a valid UUID.'
    );
  }

  // Remove unnecessary surrounding spaces.
  const cleanedId = transactionId.trim();

  // Validate the canonical UUID format.
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(cleanedId)) {
    throw createServiceError(
      'Transaction ID must be a valid UUID.'
    );
  }

  // Return the normalised UUID.
  return cleanedId.toLowerCase();
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
  reversesTransactionId = null,

  // Internal exception used only when reversing historical transactions.
  // Ordinary transactions must continue using active ledger accounts.
  allowInactiveAccounts = false,

  entries,
  // Optional existing PostgreSQL connection.
  // When supplied, the caller controls the transaction.
  client: suppliedClient = null
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

// Validate the original transaction ID for reversal transactions.
const cleanReversesTransactionId =
  reversesTransactionId === null
    ? null
    : validateTransactionId(reversesTransactionId);

// A reversal must reference its original transaction.
// Ordinary transactions must not contain a reversal link.
if (
  (transactionType === 'reversal' && !cleanReversesTransactionId) ||
  (transactionType !== 'reversal' && cleanReversesTransactionId)
) {
  throw createServiceError(
    'Only reversal transactions may reference an original transaction, and every reversal must provide that reference.'
  );
}

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
// Determine whether this function owns the database connection.
const ownsConnection = suppliedClient === null;

// Use the supplied connection when available.
// Otherwise, obtain a dedicated connection from the pool.
const client = suppliedClient || await postgresPool.connect();

// Reject an invalid externally supplied connection.
if (typeof client.query !== 'function') {
  throw createServiceError(
    'A valid PostgreSQL client connection is required.'
  );
}

try {

  // Start a transaction only when this function owns the connection.
  // An external caller has already started its own transaction.
  if (ownsConnection) {
    await client.query('BEGIN');
  }

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
   // Identify accounts that are currently inactive.
const inactiveAccounts = accountResult.rows.filter(
  (account) => account.status !== 'active'
);

// Ordinary transactions cannot use inactive accounts.
// Reversals are exempt because historical postings must remain reversible.
if (
  inactiveAccounts.length > 0 &&
  !allowInactiveAccounts
) {
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
          description,
          reverses_transaction_id
        )
        VALUES ($1, $2, 'pending', $3, $4, $5, $6)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING
          id,
          transaction_type,
          status,
          reference,
          description,
          reverses_transaction_id,
          created_at
      `,
      [
        transactionId,
        transactionType,
        cleanReference,
        cleanIdempotencyKey,
        cleanDescription,
        cleanReversesTransactionId
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
	    reverses_transaction_id,
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

      // Compare the transaction header, including its reversal relationship.
const sameTransactionDetails =
  existingTransaction.transaction_type === transactionType &&
  existingTransaction.reference === cleanReference &&
  existingTransaction.description === cleanDescription &&
  existingTransaction.reverses_transaction_id === cleanReversesTransactionId;

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
// Commit only when this function owns the connection.
if (ownsConnection) {
  await client.query('COMMIT');
}
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

   // All ledger operations succeeded.
// Commit only when this function owns the connection.
// Otherwise, the calling service will commit everything.
if (ownsConnection) {
  await client.query('COMMIT');
}
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
// Roll back only when this function owns the connection.
// An external caller is responsible for rolling back its transaction.
if (ownsConnection) {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    // Preserve the original error if rollback also fails.
    console.error(
      'Ledger transaction rollback failed:',
      rollbackError
    );
  }
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

  // Release only connections obtained by this function.
  // Never release a connection owned by another service.
  if (ownsConnection) {
    client.release();
  }
}
}

// Create a ledger transaction using a connection owned by another service.
// The calling service controls BEGIN, COMMIT, ROLLBACK and release.
async function createLedgerTransactionWithClient({
  client,
  ...transactionData
}) {

  // A caller must supply an existing PostgreSQL client.
  if (!client || typeof client.query !== 'function') {
    throw createServiceError(
      'A valid PostgreSQL client connection must be supplied.'
    );
  }

  // Reuse the existing ledger engine.
  // Passing the client prevents it from managing the transaction itself.
  return createLedgerTransaction({
    ...transactionData,
    client
  });
}

// Reverse an existing posted ledger transaction.
//
// The original transaction and its entries are never modified.
// A new transaction is created with every debit and credit swapped.
//
// The caller must provide an idempotency key so that retries
// cannot accidentally create duplicate financial reversals.
async function reverseLedgerTransaction({
  transactionId,
  idempotencyKey
}) {

  // --------------------------------------------------
  // STEP 1: VALIDATE THE REVERSAL REQUEST
  // --------------------------------------------------

  // Validate and normalise the original transaction UUID.
  const cleanTransactionId =
    validateTransactionId(transactionId);

  // Validate the supplied idempotency key.
  const cleanIdempotencyKey =
    validateOptionalIdentifier(
      idempotencyKey,
      'Idempotency key'
    );

  // A reversal must always have an idempotency key.
  if (!cleanIdempotencyKey) {
    throw createServiceError(
      'An idempotency key is required to reverse a ledger transaction.'
    );
  }

  // Use a deterministic description.
  // This ensures retries generate exactly the same transaction details.
  const reversalDescription =
    `Reversal of transaction ${cleanTransactionId}`;

  // --------------------------------------------------
  // STEP 2: OBTAIN A POSTGRESQL CONNECTION
  // --------------------------------------------------

  const client = await postgresPool.connect();

  try {

    // Start one database transaction for the entire reversal.
    await client.query('BEGIN');

    // --------------------------------------------------
    // STEP 3: LOCK AND VALIDATE THE ORIGINAL TRANSACTION
    // --------------------------------------------------

    // Lock the original transaction.
    // Concurrent reversal requests must wait for this lock.
    const originalResult = await client.query(
      `
        SELECT
          id,
          transaction_type,
          status
        FROM ledger_transactions
        WHERE id = $1
        FOR UPDATE
      `,
      [cleanTransactionId]
    );

    const originalTransaction = originalResult.rows[0];

    // Reject transactions that do not exist.
    if (!originalTransaction) {
      throw createServiceError(
        'Ledger transaction was not found.',
        404,
        'TRANSACTION_NOT_FOUND'
      );
    }

    // A reversal must never reverse another reversal.
    if (originalTransaction.transaction_type === 'reversal') {
      throw createServiceError(
        'A reversal transaction cannot itself be reversed.',
        409,
        'REVERSAL_NOT_ALLOWED'
      );
    }

    // Only successfully posted transactions can be reversed.
    if (originalTransaction.status !== 'posted') {
      throw createServiceError(
        'Only posted ledger transactions can be reversed.',
        409,
        'TRANSACTION_NOT_POSTED'
      );
    }

    // --------------------------------------------------
    // STEP 4: CHECK FOR AN EXISTING REVERSAL
    // --------------------------------------------------

    // Check whether this original transaction already has a reversal.
    const existingReversalResult = await client.query(
      `
        SELECT
          id,
          idempotency_key,
          status
        FROM ledger_transactions
        WHERE reverses_transaction_id = $1
        FOR SHARE
      `,
      [originalTransaction.id]
    );

    const existingReversal =
      existingReversalResult.rows[0];

    // If another request already reversed this transaction,
    // only an identical idempotency key may retry the operation.
    if (existingReversal) {

      // Reject a different idempotency key.
      if (
        existingReversal.idempotency_key !==
        cleanIdempotencyKey
      ) {
        throw createServiceError(
          'This ledger transaction has already been reversed.',
          409,
          'TRANSACTION_ALREADY_REVERSED'
        );
      }

      // An existing reversal must already be posted.
      if (existingReversal.status !== 'posted') {
        throw createServiceError(
          'The existing reversal is not in a completed state.',
          409,
          'REVERSAL_NOT_POSTED'
        );
      }
    }

    // --------------------------------------------------
    // STEP 5: LOAD THE ORIGINAL LEDGER ENTRIES
    // --------------------------------------------------

    // Retrieve the original entries in a deterministic order.
    const originalEntriesResult = await client.query(
      `
        SELECT
          account_id,
          entry_type,
          amount,
          description
        FROM ledger_entries
        WHERE transaction_id = $1
        ORDER BY id ASC
      `,
      [originalTransaction.id]
    );

    // A posted transaction should already have valid entries.
    // Still, verify that entries exist before constructing a reversal.
    if (originalEntriesResult.rows.length < 2) {
      throw createServiceError(
        'The original transaction does not contain enough ledger entries to reverse.',
        409,
        'INVALID_ORIGINAL_LEDGER_ENTRIES'
      );
    }

    // --------------------------------------------------
    // STEP 6: SWAP THE ORIGINAL DEBITS AND CREDITS
    // --------------------------------------------------

    const reversalEntries = originalEntriesResult.rows.map(
      (entry) => ({

        // Reuse the exact original ledger account.
        accountId: String(entry.account_id),

        // Convert every debit into a credit,
        // and every credit into a debit.
        entryType:
          entry.entry_type === 'debit'
            ? 'credit'
            : 'debit',

        // Preserve the exact original amount in kobo.
        amount: String(entry.amount),

        // Give every reversing entry a clear explanation.
        description:
          `Reversal of: ${entry.description}`
      })
    );

    // --------------------------------------------------
    // STEP 7: CREATE AND POST THE REVERSAL
    // --------------------------------------------------

    // Reuse the existing ledger engine.
    // It will validate the entries, enforce double-entry
    // accounting, insert the new entries and post the transaction.
    const reversalResult =
      await createLedgerTransactionWithClient({

        // Reuse the connection and transaction opened above.
        client,

        // Identify this transaction as a reversal.
        transactionType: 'reversal',

        // Keep the header description deterministic.
        description: reversalDescription,

        // Reversals do not need an external reference.
        reference: null,

        // Reuse the mandatory idempotency key.
        idempotencyKey: cleanIdempotencyKey,

        // Link this reversal to its original transaction.
        reversesTransactionId: originalTransaction.id,

        // Use the swapped original entries.
        entries: reversalEntries,

        // Permit inactive accounts for historical reversals.
        // Account existence is still checked by the ledger engine.
        allowInactiveAccounts: true
      });

    // --------------------------------------------------
    // STEP 8: COMMIT THE REVERSAL
    // --------------------------------------------------

    // Commit the new header and entries together.
    await client.query('COMMIT');

    // Return the result from the existing ledger engine.
    return {
      ...reversalResult,
      message: 'Ledger transaction reversed successfully.'
    };

  } catch (error) {

    // --------------------------------------------------
    // STEP 9: ROLL BACK IF ANY OPERATION FAILS
    // --------------------------------------------------

    // Roll back the entire reversal.
    // This prevents partially completed financial operations.
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {

      // Preserve the original error if rollback also fails.
      console.error(
        'Ledger reversal rollback failed:',
        rollbackError
      );
    }

    // Handle a concurrent reversal protected by the unique index.
    if (
      error.code === '23505' &&
      error.constraint ===
        'ledger_transactions_reverses_transaction_unique'
    ) {
      throw createServiceError(
        'This ledger transaction has already been reversed.',
        409,
        'TRANSACTION_ALREADY_REVERSED'
      );
    }

    // Pass all other errors to the calling application.
    throw error;

  } finally {

    // Release the connection after success or failure.
    client.release();
  }
}

// Export all ledger transaction operations.
module.exports = {
  createLedgerTransaction,
  createLedgerTransactionWithClient,
  reverseLedgerTransaction
};