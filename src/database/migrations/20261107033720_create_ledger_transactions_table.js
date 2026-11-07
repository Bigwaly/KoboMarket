// Create the parent table for all financial ledger transactions.

// Apply the migration.
exports.up = async function (knex) {
  await knex.schema.createTable('ledger_transactions', (table) => {

    // Unique transaction identifier.
    // This matches ledger_entries.transaction_id.
    table.uuid('id').primary();

    // Identifies the kind of financial operation.
    table.string('transaction_type', 50).notNullable();

    // Tracks the transaction lifecycle.
    // Pending transactions are not yet financially final.
    table.string('status', 20).notNullable().defaultTo('pending');

    // Optional reference from an external system.
    // Examples: Paystack reference, order ID, refund reference.
    table.string('reference', 150).nullable().unique();

    // Prevents the same financial operation from being processed twice.
    table.string('idempotency_key', 150).nullable().unique();

    // Explains the purpose of the transaction.
    table.text('description').notNullable();

    // Records when the transaction was created.
    table.timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Records when the transaction was posted to the ledger.
    // Remains NULL while the transaction is pending.
    table.timestamp('posted_at', { useTz: true }).nullable();

    // Restrict transaction types to recognised marketplace operations.
    table.check(
      "transaction_type IN ('wallet_funding', 'purchase', 'commission', 'refund', 'payout', 'adjustment')",
      [],
      'ledger_transactions_type_valid'
    );

    // Restrict transaction status to recognised lifecycle states.
    table.check(
      "status IN ('pending', 'posted', 'reversed')",
      [],
      'ledger_transactions_status_valid'
    );

    // A posted transaction must have a posting timestamp.
    table.check(
      "status <> 'posted' OR posted_at IS NOT NULL",
      [],
      'ledger_transactions_posted_at_required'
    );

    // Quickly retrieve transactions by status and creation date.
    table.index(
      ['status', 'created_at'],
      'ledger_transactions_status_created_at_idx'
    );
  });
};

// Reverse the migration.
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('ledger_transactions');
};
