
/**
 * PostgreSQL Integration Tests
 *
 * These tests use the dedicated kobomarket_test database.
 * They exercise real PostgreSQL queries and database triggers.
 *
 * Every financial test runs inside a transaction that is
 * rolled back, preserving the existing test database records.
 */

// Import the PostgreSQL connection pool.
const {
  postgresPool
} = require('../../database/postgres/connection');

// Import the real ledger service.
const {
  createLedgerTransactionWithClient
} = require('../../modules/ledger/services/ledger.service');

// Import randomUUID to generate unique test identifiers.
const {
  randomUUID
} = require('crypto');

// Run the database integration tests.
describe('PostgreSQL Database Integration', () => {

  // Close the connection pool after all tests.
  afterAll(async () => {
    await postgresPool.end();
  });

  // --------------------------------------------------
  // TEST 1: VERIFY THE TEST DATABASE CONNECTION
  // --------------------------------------------------

  test('should connect to kobomarket_test', async () => {

    // Query the name of the currently connected database.
    const result = await postgresPool.query(
      'SELECT current_database() AS database_name'
    );

    // Confirm that Jest is using the dedicated test database.
    expect(result.rows[0].database_name).toBe(
      'kobomarket_test'
    );
  });

  // --------------------------------------------------
  // TEST 2: CREATE AND POST A BALANCED LEDGER TRANSACTION
  // --------------------------------------------------

  test('should create and post a balanced ledger transaction', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the database transaction has started.
    let transactionStarted = false;

    try {

      // Start a database transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Retrieve two existing active platform accounts.
      const accountResult = await client.query(
        `
          SELECT id, account_code
          FROM ledger_accounts
          WHERE account_code IN ($1, $2)
          AND status = 'active'
        `,
        ['SYS-001', 'SYS-002']
      );

      // Find the asset account.
      const assetAccount = accountResult.rows.find(
        (account) => account.account_code === 'SYS-001'
      );

      // Find the liability account.
      const liabilityAccount = accountResult.rows.find(
        (account) => account.account_code === 'SYS-002'
      );

      // Confirm that both accounts exist and are active.
      expect(assetAccount).toBeDefined();
      expect(liabilityAccount).toBeDefined();

      // Generate unique identifiers for this test.
      const reference = `TEST-INTEGRATION-${randomUUID()}`;

      const idempotencyKey = `TEST-INTEGRATION-${randomUUID()}`;

      // Call the real ledger service using our connection.
      const result = await createLedgerTransactionWithClient({

        // Supply the connection controlled by this test.
        client,

        // Use a supported general adjustment transaction.
        transactionType: 'adjustment',

        // Describe the purpose of this test transaction.
        description: 'PostgreSQL balanced transaction integration test',

        // Use unique transaction identifiers.
        reference,
        idempotencyKey,

        // Supply equal debit and credit entries.
        entries: [
          {
            accountId: String(assetAccount.id),
            entryType: 'debit',
            amount: '2500'
          },
          {
            accountId: String(liabilityAccount.id),
            entryType: 'credit',
            amount: '2500'
          }
        ]
      });

      // Confirm that the ledger service succeeded.
      expect(result.success).toBe(true);

      // Confirm that the transaction was posted.
      expect(result.transaction.status).toBe('posted');

      // Confirm that two entries were created.
      expect(result.entryCount).toBe(2);

      // Confirm that the debit total is correct.
      expect(result.totalDebits).toBe('2500');

      // Confirm that the credit total is correct.
      expect(result.totalCredits).toBe('2500');

      // Retrieve the actual transaction entries from PostgreSQL.
      const entryResult = await client.query(
        `
          SELECT entry_type, amount
          FROM ledger_entries
          WHERE transaction_id = $1
          ORDER BY entry_type
        `,
        [result.transaction.id]
      );

      // Confirm that PostgreSQL stored both entries.
      expect(entryResult.rows).toHaveLength(2);

      // Confirm that the debit and credit amounts match.
      expect(
        entryResult.rows.map((entry) => ({
          entryType: entry.entry_type,
          amount: String(entry.amount)
        }))
      ).toEqual(
        expect.arrayContaining([
          {
            entryType: 'debit',
            amount: '2500'
          },
          {
            entryType: 'credit',
            amount: '2500'
          }
        ])
      );

    } finally {

      // Roll back the test transaction.
      // This removes the test transaction and its entries.
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
  // TEST 3: REJECT AN UNBALANCED LEDGER TRANSACTION
  // --------------------------------------------------

  test('should reject an unbalanced ledger transaction', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the database transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Retrieve two existing active platform accounts.
      const accountResult = await client.query(
        `
          SELECT id, account_code
          FROM ledger_accounts
          WHERE account_code IN ($1, $2)
          AND status = 'active'
        `,
        ['SYS-001', 'SYS-002']
      );

      // Find the asset account.
      const assetAccount = accountResult.rows.find(
        (account) => account.account_code === 'SYS-001'
      );

      // Find the liability account.
      const liabilityAccount = accountResult.rows.find(
        (account) => account.account_code === 'SYS-002'
      );

      // Confirm that both accounts exist.
      expect(assetAccount).toBeDefined();
      expect(liabilityAccount).toBeDefined();

      // Generate unique transaction identifiers.
      const reference = `TEST-UNBALANCED-${randomUUID()}`;

      const idempotencyKey = `TEST-UNBALANCED-${randomUUID()}`;

      // Attempt to create an unbalanced transaction.
      await expect(
        createLedgerTransactionWithClient({

          // Supply the connection controlled by this test.
          client,

          // Use a supported transaction type.
          transactionType: 'adjustment',

          // Describe the test.
          description: 'Unbalanced ledger integration test',

          // Supply unique identifiers.
          reference,
          idempotencyKey,

          // Deliberately provide unequal debit and credit totals.
          entries: [
            {
              accountId: String(assetAccount.id),
              entryType: 'debit',
              amount: '2500'
            },
            {
              accountId: String(liabilityAccount.id),
              entryType: 'credit',
              amount: '2000'
            }
          ]
        })
      ).rejects.toThrow(/balance|equal/i);

    } finally {

      // Roll back any database changes made during the test.
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
  // TEST 4: VERIFY LEDGER IDEMPOTENCY
  // --------------------------------------------------

  test('should return the original transaction for an identical retry', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the database transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Retrieve two existing active platform accounts.
      const accountResult = await client.query(
        `
          SELECT id, account_code
          FROM ledger_accounts
          WHERE account_code IN ($1, $2)
          AND status = 'active'
        `,
        ['SYS-001', 'SYS-002']
      );

      // Find the asset account.
      const assetAccount = accountResult.rows.find(
        (account) => account.account_code === 'SYS-001'
      );

      // Find the liability account.
      const liabilityAccount = accountResult.rows.find(
        (account) => account.account_code === 'SYS-002'
      );

      // Confirm that both accounts exist.
      expect(assetAccount).toBeDefined();
      expect(liabilityAccount).toBeDefined();

      // Generate unique identifiers for this test.
      const reference = `TEST-IDEMPOTENCY-${randomUUID()}`;

      const idempotencyKey = `TEST-IDEMPOTENCY-${randomUUID()}`;

      // Prepare the original transaction details.
      const transactionData = {
        client,

        transactionType: 'adjustment',

        description: 'Ledger idempotency integration test',

        reference,

        idempotencyKey,

        entries: [
          {
            accountId: String(assetAccount.id),
            entryType: 'debit',
            amount: '2500'
          },
          {
            accountId: String(liabilityAccount.id),
            entryType: 'credit',
            amount: '2500'
          }
        ]
      };

      // Submit the original transaction.
      const firstResult = await createLedgerTransactionWithClient(
        transactionData
      );

      // Confirm that the original transaction was created.
      expect(firstResult.success).toBe(true);

      expect(firstResult.transaction.status).toBe('posted');

      // The original request must not be marked as a replay.
      expect(firstResult.idempotentReplay).toBeUndefined();

      // Submit exactly the same request again.
      const secondResult = await createLedgerTransactionWithClient(
        transactionData
      );

      // Confirm that the retry succeeded.
      expect(secondResult.success).toBe(true);

      // Confirm that the original transaction was returned.
      expect(secondResult.transaction.id).toBe(
        firstResult.transaction.id
      );

      // Confirm that the second request was identified as a replay.
      expect(secondResult.idempotentReplay).toBe(true);

      // Confirm that the original two entries were returned.
      expect(secondResult.entryCount).toBe(2);

      // Count transactions using this idempotency key.
      const transactionCountResult = await client.query(
        `
          SELECT COUNT(*) AS total
          FROM ledger_transactions
          WHERE idempotency_key = $1
        `,
        [idempotencyKey]
      );

      // Confirm that only one transaction exists.
      expect(transactionCountResult.rows[0].total).toBe('1');

      // Count the ledger entries for the original transaction.
      const entryCountResult = await client.query(
        `
          SELECT COUNT(*) AS total
          FROM ledger_entries
          WHERE transaction_id = $1
        `,
        [firstResult.transaction.id]
      );

      // Confirm that the retry did not create duplicate entries.
      expect(entryCountResult.rows[0].total).toBe('2');

      // Now try reusing the same key for different transaction entries.
      // The debit and credit still balance, but the amounts differ
      // from the original request.
      const conflictingTransactionData = {
        ...transactionData,

        entries: [
          {
            accountId: String(assetAccount.id),
            entryType: 'debit',
            amount: '3000'
          },
          {
            accountId: String(liabilityAccount.id),
            entryType: 'credit',
            amount: '3000'
          }
        ]
      };

      // The service must reject reuse of the key for different details.
      await expect(
        createLedgerTransactionWithClient(
          conflictingTransactionData
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'IDEMPOTENCY_KEY_REUSED'
      });

      // Confirm that the conflicting request created no new transaction.
      const finalCountResult = await client.query(
        `
          SELECT COUNT(*) AS total
          FROM ledger_transactions
          WHERE idempotency_key = $1
        `,
        [idempotencyKey]
      );

      expect(finalCountResult.rows[0].total).toBe('1');

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
  // TEST 5: PROTECT POSTED LEDGER ENTRIES
  // --------------------------------------------------

  test('should prevent updates, deletions and new entries on posted transactions', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the database transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Retrieve two existing active platform accounts.
      const accountResult = await client.query(
        `
          SELECT id, account_code
          FROM ledger_accounts
          WHERE account_code IN ($1, $2)
          AND status = 'active'
        `,
        ['SYS-001', 'SYS-002']
      );

      // Find the asset account.
      const assetAccount = accountResult.rows.find(
        (account) => account.account_code === 'SYS-001'
      );

      // Find the liability account.
      const liabilityAccount = accountResult.rows.find(
        (account) => account.account_code === 'SYS-002'
      );

      // Confirm that both accounts exist.
      expect(assetAccount).toBeDefined();
      expect(liabilityAccount).toBeDefined();

      // Generate unique identifiers.
      const reference = `TEST-IMMUTABLE-${randomUUID()}`;

      const idempotencyKey = `TEST-IMMUTABLE-${randomUUID()}`;

      // Create a real balanced transaction using the ledger service.
      const result = await createLedgerTransactionWithClient({

        // Supply the connection controlled by this test.
        client,

        // Use a supported transaction type.
        transactionType: 'adjustment',

        // Describe the test transaction.
        description: 'Posted ledger immutability integration test',

        // Supply unique identifiers.
        reference,
        idempotencyKey,

        // Create equal debit and credit entries.
        entries: [
          {
            accountId: String(assetAccount.id),
            entryType: 'debit',
            amount: '2500'
          },
          {
            accountId: String(liabilityAccount.id),
            entryType: 'credit',
            amount: '2500'
          }
        ]
      });

      // Confirm that the transaction was successfully posted.
      expect(result.success).toBe(true);
      expect(result.transaction.status).toBe('posted');

      // Retrieve the ID of one of the posted ledger entries.
      const entryResult = await client.query(
        `
          SELECT id
          FROM ledger_entries
          WHERE transaction_id = $1
          ORDER BY id ASC
          LIMIT 1
        `,
        [result.transaction.id]
      );

      // Confirm that the entry exists.
      expect(entryResult.rows).toHaveLength(1);

      const entryId = entryResult.rows[0].id;

      // --------------------------------------------------
      // PROTECTION 1: PREVENT UPDATING A POSTED ENTRY
      // --------------------------------------------------

      // Create a savepoint so the expected database error
      // does not prevent the remaining tests from running.
      await client.query('SAVEPOINT protect_ledger_update');

      // Attempt to change the posted entry amount.
      await expect(
        client.query(
          `
            UPDATE ledger_entries
            SET amount = 3000
            WHERE id = $1
          `,
          [entryId]
        )
      ).rejects.toThrow(/append-only/i);

      // Recover the transaction after the expected error.
      await client.query(
        'ROLLBACK TO SAVEPOINT protect_ledger_update'
      );

      // --------------------------------------------------
      // PROTECTION 2: PREVENT DELETING A POSTED ENTRY
      // --------------------------------------------------

      await client.query('SAVEPOINT protect_ledger_delete');

      // Attempt to delete the posted entry.
      await expect(
        client.query(
          `
            DELETE FROM ledger_entries
            WHERE id = $1
          `,
          [entryId]
        )
      ).rejects.toThrow(/append-only/i);

      // Recover after the expected database error.
      await client.query(
        'ROLLBACK TO SAVEPOINT protect_ledger_delete'
      );

      // --------------------------------------------------
      // PROTECTION 3: PREVENT INSERTING INTO A POSTED TRANSACTION
      // --------------------------------------------------

      await client.query('SAVEPOINT protect_ledger_insert');

      // Attempt to add another entry to the posted transaction.
      await expect(
        client.query(
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
            result.transaction.id,
            String(assetAccount.id),
            'debit',
            '100',
            'Attempted entry after posting'
          ]
        )
      ).rejects.toThrow(/not pending/i);

      // Recover after the expected database error.
      await client.query(
        'ROLLBACK TO SAVEPOINT protect_ledger_insert'
      );

      // --------------------------------------------------
      // VERIFY THE ORIGINAL ENTRIES ARE STILL INTACT
      // --------------------------------------------------

      const finalEntryResult = await client.query(
        `
          SELECT COUNT(*) AS total
          FROM ledger_entries
          WHERE transaction_id = $1
        `,
        [result.transaction.id]
      );

      // Confirm that the original two entries still exist.
      expect(finalEntryResult.rows[0].total).toBe('2');

    } finally {

      // Roll back the entire test transaction.
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
  // TEST 6: PROTECT POSTED TRANSACTION HEADERS
  // --------------------------------------------------

  test('should prevent changes to posted transaction header fields', async () => {

    // Obtain a dedicated PostgreSQL connection.
    const client = await postgresPool.connect();

    // Track whether the database transaction has started.
    let transactionStarted = false;

    try {

      // Start a transaction controlled by this test.
      await client.query('BEGIN');

      transactionStarted = true;

      // Retrieve two existing active platform accounts.
      const accountResult = await client.query(
        `
          SELECT id, account_code
          FROM ledger_accounts
          WHERE account_code IN ($1, $2)
          AND status = 'active'
        `,
        ['SYS-001', 'SYS-002']
      );

      // Find the asset account.
      const assetAccount = accountResult.rows.find(
        (account) => account.account_code === 'SYS-001'
      );

      // Find the liability account.
      const liabilityAccount = accountResult.rows.find(
        (account) => account.account_code === 'SYS-002'
      );

      // Confirm that both accounts exist.
      expect(assetAccount).toBeDefined();
      expect(liabilityAccount).toBeDefined();

      // Generate unique transaction identifiers.
      const reference = `TEST-HEADER-${randomUUID()}`;

      const idempotencyKey = `TEST-HEADER-${randomUUID()}`;

      // Create a real balanced transaction.
      const result = await createLedgerTransactionWithClient({

        // Supply the connection controlled by this test.
        client,

        transactionType: 'adjustment',

        description: 'Posted transaction header protection test',

        reference,

        idempotencyKey,

        entries: [
          {
            accountId: String(assetAccount.id),
            entryType: 'debit',
            amount: '2500'
          },
          {
            accountId: String(liabilityAccount.id),
            entryType: 'credit',
            amount: '2500'
          }
        ]
      });

      // Confirm that the transaction was posted.
      expect(result.success).toBe(true);
      expect(result.transaction.status).toBe('posted');

      // Store the original transaction ID.
      const transactionId = result.transaction.id;

      // --------------------------------------------------
      // TEST EACH PROTECTED HEADER FIELD
      // --------------------------------------------------

      // Define attempts to modify each protected field.
      const protectedFieldUpdates = [
        {
          field: 'transaction_type',
          value: 'purchase'
        },
        {
          field: 'reference',
          value: `CHANGED-${randomUUID()}`
        },
        {
          field: 'idempotency_key',
          value: `CHANGED-${randomUUID()}`
        },
        {
          field: 'description',
          value: 'Attempted modification'
        },
        {
          field: 'created_at',
          value: '2020-01-01T00:00:00.000Z'
        },
        {
          field: 'posted_at',
          value: '2020-01-01T00:00:00.000Z'
        }
      ];

      // Test each protected field independently.
      for (const update of protectedFieldUpdates) {

        // Create a savepoint before the attempted update.
        await client.query('SAVEPOINT protect_header_field');

        // Attempt to modify the selected field.
        await expect(
          client.query(
            `
              UPDATE ledger_transactions
              SET ${update.field} = $1
              WHERE id = $2
            `,
            [
              update.value,
              transactionId
            ]
          )
        ).rejects.toThrow(/header of posted or reversed transaction/i);

        // Recover after the expected database error.
        await client.query(
          'ROLLBACK TO SAVEPOINT protect_header_field'
        );
      }

      // --------------------------------------------------
      // VERIFY ORIGINAL HEADER VALUES REMAIN UNCHANGED
      // --------------------------------------------------

      const finalResult = await client.query(
        `
          SELECT
            transaction_type,
            reference,
            idempotency_key,
            description,
            created_at,
            posted_at,
            status
          FROM ledger_transactions
          WHERE id = $1
        `,
        [transactionId]
      );

      // Confirm that the transaction still exists.
      expect(finalResult.rows).toHaveLength(1);

      const originalTransaction = finalResult.rows[0];

      // Confirm that all original header fields remain unchanged.
      expect(originalTransaction.transaction_type).toBe('adjustment');

      expect(originalTransaction.reference).toBe(reference);

      expect(originalTransaction.idempotency_key).toBe(idempotencyKey);

      expect(originalTransaction.description).toBe(
        'Posted transaction header protection test'
      );

      expect(originalTransaction.status).toBe('posted');

      expect(originalTransaction.created_at).toEqual(
        result.transaction.created_at
      );

      expect(originalTransaction.posted_at).toEqual(
        result.transaction.posted_at
      );

    } finally {

      // Roll back the entire test transaction.
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
