// Generate unique UUIDs for wallet transaction records.
const { randomUUID } = require('node:crypto');

// Import the shared PostgreSQL connection pool.
const {
  postgresPool
} = require('../../../database/postgres/connection');

// Maximum value supported by PostgreSQL BIGINT.
const MAX_BIGINT = 9223372036854775807n;

// Import the ledger service function that supports
// an externally managed PostgreSQL transaction.
const {
  createLedgerTransactionWithClient
} = require('../../ledger/services/ledger.service');

// Create a consistent application error.
function createServiceError(
  message,
  statusCode = 400,
  code = 'WALLET_ERROR'
) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

// Validate and normalize a MongoDB user ID.
function validateUserId(userId) {
  if (
    typeof userId !== 'string' ||
    userId.trim().length === 0 ||
    userId.trim().length > 50
  ) {
    throw createServiceError(
      'A valid MongoDB user ID is required.',
      400,
      'INVALID_USER_ID'
    );
  }

  return userId.trim();
}


 // Validate a positive monetary amount expressed in kobo.
function validatePositiveKoboAmount(amount) {

  // Accept safe JavaScript integers or digit-only strings.
  if (
    !(
      (typeof amount === 'number' && Number.isSafeInteger(amount)) ||
      (typeof amount === 'string' && /^\d+$/.test(amount))
    )
  ) {
    throw createServiceError(
      'Amount must be a valid integer in kobo.',
      400,
      'INVALID_AMOUNT'
    );
  }

  // Convert the amount to BigInt to avoid precision loss.
  const normalizedAmount = BigInt(amount);

  // Reject zero and negative amounts.
  if (normalizedAmount <= 0n) {
    throw createServiceError(
      'Amount must be greater than zero.',
      400,
      'INVALID_AMOUNT'
    );
  }

  // Prevent values larger than PostgreSQL BIGINT.
  if (normalizedAmount > MAX_BIGINT) {
    throw createServiceError(
      'Amount exceeds the maximum supported value.',
      400,
      'AMOUNT_TOO_LARGE'
    );
  }

  // Return a string safe for PostgreSQL BIGINT parameters.
  return normalizedAmount.toString();
}

// Validate and normalize a required transaction identifier.
function validateRequiredIdentifier(value, fieldName) {

  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > 150
  ) {
    throw createServiceError(
      `${fieldName} must be a non-empty string of at most 150 characters.`,
      400,
      'INVALID_TRANSACTION_IDENTIFIER'
    );
  }

  return value.trim();
}


// Create a wallet and its corresponding ledger liability account.
async function createWallet({ userId }) {

  // STEP 1: Validate the MongoDB user ID.
  const normalizedUserId = validateUserId(userId);

  // STEP 2: Obtain a PostgreSQL connection.
  const client = await postgresPool.connect();

  try {

    // STEP 3: Begin an atomic database transaction.
    await client.query('BEGIN');

    // STEP 4: Create the user's wallet.
    const walletResult = await client.query(
      `
        INSERT INTO wallets (
          user_id,
          available_balance,
          escrow_balance,
          currency,
          status
        )
        VALUES ($1, 0, 0, 'NGN', 'active')
        RETURNING
          id,
          user_id,
          available_balance,
          escrow_balance,
          currency,
          status,
          created_at,
          updated_at
      `,
      [normalizedUserId]
    );

    // Retrieve the newly created wallet.
    const wallet = walletResult.rows[0];

    // STEP 5: Generate a unique ledger account code.
    // Example: wallet ID 25 becomes WAL-25.
    const accountCode = `WAL-${wallet.id}`;

    // STEP 6: Create the wallet's liability ledger account.
    const accountResult = await client.query(
      `
        INSERT INTO ledger_accounts (
          account_code,
          account_name,
          account_type,
          description,
          status,
          wallet_id
        )
        VALUES ($1, $2, 'liability', $3, 'active', $4)
        RETURNING
          id,
          account_code,
          account_name,
          account_type,
          description,
          status,
          wallet_id,
          created_at,
          updated_at
      `,
      [
        accountCode,
        `Wallet ${wallet.id} Liability`,
        `Liability account backing wallet ${wallet.id} for user ${normalizedUserId}.`,
        wallet.id
      ]
    );

    // Retrieve the newly created ledger account.
    const ledgerAccount = accountResult.rows[0];

    // STEP 7: Commit both records together.
    await client.query('COMMIT');

    // STEP 8: Return the created wallet and its ledger account.
    return {
      success: true,
      message: 'Wallet and ledger account created successfully.',
      wallet,
      ledgerAccount
    };

  } catch (error) {

    // STEP 9: Roll back both records if anything fails.
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(
        'Wallet creation rollback failed:',
        rollbackError
      );
    }

    // Handle an existing wallet for this user.
    if (
      error.code === '23505' &&
      error.constraint === 'wallets_user_id_unique'
    ) {
      throw createServiceError(
        'This user already has a wallet.',
        409,
        'WALLET_ALREADY_EXISTS'
      );
    }

    // Pass other errors to the calling application.
    throw error;

  } finally {

    // Always release the PostgreSQL connection.
    client.release();
  }
}

// Retrieve a wallet and its linked ledger account using the MongoDB user ID.
async function getWalletByUserId({ userId }) {

  // STEP 1: Validate the MongoDB user ID.
  const normalizedUserId = validateUserId(userId);

  // STEP 2: Retrieve the wallet and linked ledger account.
  const result = await postgresPool.query(
    `
      SELECT
        w.id AS wallet_id,
        w.user_id,
        w.available_balance,
        w.escrow_balance,
        w.currency,
        w.status AS wallet_status,
        w.created_at AS wallet_created_at,
        w.updated_at AS wallet_updated_at,

        a.id AS ledger_account_id,
        a.account_code,
        a.account_name,
        a.account_type,
        a.status AS ledger_account_status,
        a.created_at AS account_created_at,
        a.updated_at AS account_updated_at

      FROM wallets w

      INNER JOIN ledger_accounts a
        ON a.wallet_id = w.id

      WHERE w.user_id = $1

      LIMIT 1
    `,
    [normalizedUserId]
  );

  // STEP 3: Check whether the wallet exists.
  if (result.rows.length === 0) {
    throw createServiceError(
      'Wallet not found for this user.',
      404,
      'WALLET_NOT_FOUND'
    );
  }

  // Retrieve the matching database record.
  const row = result.rows[0];

  // STEP 4: Return the wallet and its accounting account separately.
  return {
    success: true,

    wallet: {
      id: row.wallet_id,
      userId: row.user_id,
      availableBalance: row.available_balance,
      escrowBalance: row.escrow_balance,
      currency: row.currency,
      status: row.wallet_status,
      createdAt: row.wallet_created_at,
      updatedAt: row.wallet_updated_at
    },

    ledgerAccount: {
      id: row.ledger_account_id,
      accountCode: row.account_code,
      accountName: row.account_name,
      accountType: row.account_type,
      status: row.ledger_account_status,
      createdAt: row.account_created_at,
      updatedAt: row.account_updated_at
    }
  };
}

// Confirm that a wallet and its ledger account are both active.
async function requireActiveWallet({ userId }) {

  // STEP 1: Retrieve the user's wallet.
  const result = await getWalletByUserId({ userId });

  // STEP 2: Check the wallet status.
  if (result.wallet.status !== 'active') {
    throw createServiceError(
      'This wallet is frozen and cannot perform financial transactions.',
      403,
      'WALLET_NOT_ACTIVE'
    );
  }

  // STEP 3: Check the linked ledger account status.
  if (result.ledgerAccount.status !== 'active') {
    throw createServiceError(
      'The wallet ledger account is inactive.',
      403,
      'LEDGER_ACCOUNT_NOT_ACTIVE'
    );
  }

  // STEP 4: Return the verified wallet.
  return result;
}


// Fund a customer's wallet after successful Paystack payment verification.
async function fundWallet({
  userId,
  verifiedPayment,
  idempotencyKey
}) {

  // STEP 1: Validate the MongoDB user ID.
  const normalizedUserId = validateUserId(userId);

  // STEP 2: Confirm that the payment was successfully verified.
  if (
    !verifiedPayment ||
    typeof verifiedPayment !== 'object' ||
    verifiedPayment.status !== 'success'
  ) {
    throw createServiceError(
      'A successfully verified payment is required.',
      400,
      'PAYMENT_NOT_VERIFIED'
    );
  }

  // STEP 3: Confirm that the payment currency is NGN.
  if (verifiedPayment.currency !== 'NGN') {
    throw createServiceError(
      'Only NGN payments can fund this wallet.',
      400,
      'INVALID_PAYMENT_CURRENCY'
    );
  }

  // STEP 4: Validate the verified payment amount in kobo.
  const amount = validatePositiveKoboAmount(
    verifiedPayment.amount
  );

  // STEP 5: Validate the Paystack payment reference.
  const paymentReference = validateRequiredIdentifier(
    verifiedPayment.reference,
    'Payment reference'
  );

  // STEP 6: Validate the request idempotency key.
  const normalizedIdempotencyKey = validateRequiredIdentifier(
    idempotencyKey,
    'Idempotency key'
  );

  // STEP 7: Define the wallet transaction description.
  const description = 'Wallet funding via Paystack.';

  // STEP 8: Obtain a dedicated PostgreSQL connection.
  const client = await postgresPool.connect();

  try {

    // STEP 9: Start the database transaction.
    await client.query('BEGIN');

    // STEP 10: Retrieve and lock the customer's wallet.
    // FOR UPDATE prevents simultaneous funding requests
    // from changing the same wallet balance concurrently.
    const walletResult = await client.query(
      `
        SELECT
          id,
          user_id,
          available_balance,
          escrow_balance,
          currency,
          status

        FROM wallets

        WHERE user_id = $1

        FOR UPDATE
      `,
      [normalizedUserId]
    );

    // STEP 11: Confirm that the wallet exists.
    if (walletResult.rows.length === 0) {
      throw createServiceError(
        'Wallet not found for this user.',
        404,
        'WALLET_NOT_FOUND'
      );
    }

    const wallet = walletResult.rows[0];

    // STEP 12: Look for an existing transaction using
    // either the payment reference or idempotency key.
    const existingResult = await client.query(
      `
        SELECT
          id,
          wallet_id,
          transaction_type,
          amount,
          reference,
          idempotency_key,
          ledger_transaction_id,
          status,
          description,
          created_at

        FROM wallet_transactions

        WHERE reference = $1
           OR idempotency_key = $2

        FOR UPDATE
      `,
      [
        paymentReference,
        normalizedIdempotencyKey
      ]
    );

    // STEP 13: Handle an existing transaction safely.
    if (existingResult.rows.length > 0) {

      const existing = existingResult.rows[0];

      // A retry is valid only when every important
      // transaction detail matches the original request.
      const isExactReplay =
        existing.wallet_id.toString() === wallet.id.toString() &&
        existing.transaction_type === 'funding' &&
        existing.amount.toString() === amount &&
        existing.reference === paymentReference &&
        existing.idempotency_key === normalizedIdempotencyKey &&
        existing.status === 'completed';

      // Reject a reused reference or key with different details.
      if (
        existingResult.rows.length !== 1 ||
        !isExactReplay
      ) {
        throw createServiceError(
          'This payment reference or idempotency key has already been used.',
          409,
          'WALLET_FUNDING_ALREADY_PROCESSED'
        );
      }

      // Retrieve the original ledger transaction.
      const ledgerReplayResult = await client.query(
        `
          SELECT
            id,
            transaction_type,
            status,
            reference,
            created_at,
            posted_at

          FROM ledger_transactions

          WHERE id = $1
        `,
        [existing.ledger_transaction_id]
      );

      // The original ledger transaction must still exist.
      if (ledgerReplayResult.rows.length === 0) {
        throw createServiceError(
          'The original ledger transaction could not be found.',
          500,
          'LEDGER_TRANSACTION_NOT_FOUND'
        );
      }

      // Commit the read-only retry transaction.
      await client.query('COMMIT');

      // Return the original result without crediting again.
      return {
        success: true,
        message: 'This wallet funding transaction was already processed.',
        idempotentReplay: true,

        wallet: {
          id: wallet.id,
          userId: wallet.user_id,
          availableBalance: wallet.available_balance,
          escrowBalance: wallet.escrow_balance,
          currency: wallet.currency,
          status: wallet.status
        },

        walletTransaction: existing,
        ledgerTransaction: ledgerReplayResult.rows[0]
      };
    }

    // STEP 14: Confirm that the wallet is active.
    if (wallet.status !== 'active') {
      throw createServiceError(
        'This wallet is frozen and cannot receive funds.',
        403,
        'WALLET_NOT_ACTIVE'
      );
    }

// STEP 14A: Check that the new balance will fit PostgreSQL BIGINT.
const currentBalance = BigInt(wallet.available_balance);
const incomingAmount = BigInt(amount);

const resultingBalance = currentBalance + incomingAmount;

if (resultingBalance > MAX_BIGINT) {
  throw createServiceError(
    'This funding would exceed the maximum wallet balance.',
    409,
    'WALLET_BALANCE_LIMIT_EXCEEDED'
  );
}

    // STEP 15: Retrieve and lock the wallet's ledger account.
    const walletAccountResult = await client.query(
      `
        SELECT
          id,
          account_code,
          account_type,
          status,
          wallet_id

        FROM ledger_accounts

        WHERE wallet_id = $1

        FOR UPDATE
      `,
      [wallet.id]
    );

    // A wallet must have its own ledger account.
    if (walletAccountResult.rows.length === 0) {
      throw createServiceError(
        'The wallet ledger account could not be found.',
        500,
        'WALLET_LEDGER_ACCOUNT_NOT_FOUND'
      );
    }

    const walletAccount = walletAccountResult.rows[0];

    // STEP 16: Confirm that the wallet ledger account is active.
    if (
      walletAccount.status !== 'active' ||
      walletAccount.account_type !== 'liability'
    ) {
      throw createServiceError(
        'The wallet ledger account is inactive or incorrectly configured.',
        403,
        'LEDGER_ACCOUNT_NOT_ACTIVE'
      );
    }

    // STEP 17: Retrieve the Paystack Clearing system account.
    // Do not hardcode its numeric ID because IDs may differ
    // between development, testing and production databases.
    const clearingAccountResult = await client.query(
      `
        SELECT
          id,
          account_code,
          account_type,
          status

        FROM ledger_accounts

        WHERE account_code = 'SYS-001'

        FOR SHARE
      `
    );

    if (clearingAccountResult.rows.length === 0) {
      throw createServiceError(
        'The Paystack Clearing ledger account does not exist.',
        500,
        'CLEARING_ACCOUNT_NOT_FOUND'
      );
    }

    const clearingAccount = clearingAccountResult.rows[0];

    // Confirm that the clearing account is configured correctly.
    if (
      clearingAccount.status !== 'active' ||
      clearingAccount.account_type !== 'asset'
    ) {
      throw createServiceError(
        'The Paystack Clearing ledger account is inactive or incorrectly configured.',
        500,
        'CLEARING_ACCOUNT_NOT_ACTIVE'
      );
    }

    // STEP 18: Create the double-entry ledger transaction.
    // Both entries use the same PostgreSQL client.
    // The ledger service will NOT commit this outer transaction.
    const ledgerResult = await createLedgerTransactionWithClient({

      client,

      transactionType: 'wallet_funding',

      description,

      reference: paymentReference,

      idempotencyKey: normalizedIdempotencyKey,

      entries: [

        {
          // Debit Paystack Clearing.
          accountId: clearingAccount.id,
          entryType: 'debit',
          amount,
          description: 'Paystack wallet funding received.'
        },

        {
          // Credit the customer's wallet liability.
          accountId: walletAccount.id,
          entryType: 'credit',
          amount,
          description: 'Customer wallet funded.'
        }

      ]

    });

    // STEP 19: Do not credit the wallet if the ledger service
    // unexpectedly returns an old transaction without a matching
    // wallet transaction record.
    if (ledgerResult.idempotentReplay) {
      throw createServiceError(
        'A matching ledger transaction already exists without  its wallet funding record.',
        409,
        'LEDGER_FUNDING_RECORD_MISMATCH'
      );
    }

    // STEP 20: Increase the customer's available wallet balance.
    // PostgreSQL performs the addition using BIGINT arithmetic.
    const balanceResult = await client.query(
      `
        UPDATE wallets

        SET
          available_balance = available_balance + $1::bigint,
          updated_at = CURRENT_TIMESTAMP

        WHERE id = $2

        RETURNING
          id,
          user_id,
          available_balance,
          escrow_balance,
          currency,
          status,
          updated_at
      `,
      [
        amount,
        wallet.id
      ]
    );

    const updatedWallet = balanceResult.rows[0];

    // STEP 21: Create the wallet transaction audit record.
    const walletTransactionId = randomUUID();

    const walletTransactionResult = await client.query(
      `
        INSERT INTO wallet_transactions (
          id,
          wallet_id,
          transaction_type,
          amount,
          reference,
          idempotency_key,
          ledger_transaction_id,
          status,
          description
        )

        VALUES (
          $1, $2, 'funding', $3, $4, $5, $6, 'completed', $7
        )

        RETURNING *
      `,
      [
        walletTransactionId,
        wallet.id,
        amount,
        paymentReference,
        normalizedIdempotencyKey,
        ledgerResult.transaction.id,
        description
      ]
    );

    // STEP 22: Commit all three financial changes together.
    await client.query('COMMIT');

    // STEP 23: Return the successful funding result.
    return {
      success: true,
      message: 'Wallet funded successfully.',
      idempotentReplay: false,

      wallet: {
        id: updatedWallet.id,
        userId: updatedWallet.user_id,
        availableBalance: updatedWallet.available_balance,
        escrowBalance: updatedWallet.escrow_balance,
        currency: updatedWallet.currency,
        status: updatedWallet.status,
        updatedAt: updatedWallet.updated_at
      },

      walletTransaction: walletTransactionResult.rows[0],

      ledgerTransaction: ledgerResult.transaction
    };

  } catch (error) {

    // STEP 24: Roll back every financial change if anything fails.
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(
        'Wallet funding rollback failed:',
        rollbackError
      );
    }

    // Translate unique constraint violations into a clear error.
    if (
      error.code === '23505' &&
      (
        error.constraint === 'wallet_transactions_reference_unique' ||
        error.constraint === 'wallet_transactions_idempotency_key_unique' ||
        error.constraint === 'wallet_transactions_ledger_transaction_id_unique'
      )
    ) {
      throw createServiceError(
        'This wallet funding transaction has already been recorded.',
        409,
        'WALLET_FUNDING_ALREADY_PROCESSED'
      );
    }

    // Pass other errors to the calling application.
    throw error;

  } finally {

    // STEP 25: Always release the PostgreSQL connection.
    client.release();
  }
}


// Export the wallet service functions.
module.exports = {
  createWallet,
  getWalletByUserId,
  requireActiveWallet,
  fundWallet
};
