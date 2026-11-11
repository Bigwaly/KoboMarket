
// Create the wallet transactions table.
exports.up = async function (knex) {

  await knex.schema.createTable('wallet_transactions', (table) => {

    // Unique transaction ID.
    table.uuid('id').primary();

    // Wallet associated with this transaction.
    table.bigInteger('wallet_id')
      .notNullable()
      .references('id')
      .inTable('wallets')
      .onDelete('RESTRICT');

    // Type of wallet operation.
    table.string('transaction_type', 30).notNullable();

    // Amount involved, stored in kobo.
    table.bigInteger('amount').notNullable();

    // Payment reference supplied by the payment provider.
    table.string('reference', 150).notNullable().unique();

    // Prevent the same request from being processed twice.
    table.string('idempotency_key', 150).notNullable().unique();

    // Link to the corresponding ledger transaction.
    table.uuid('ledger_transaction_id')
      .notNullable()
      .references('id')
      .inTable('ledger_transactions')
      .onDelete('RESTRICT')
      .unique();

    // Current state of the wallet operation.
    table.string('status', 20).notNullable().defaultTo('completed');

    // Additional transaction information.
    table.text('description').notNullable();

    // Transaction creation time.
    table.timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Transaction update time.
    table.timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Only supported wallet transaction types.
    table.check(
      "transaction_type IN ('funding', 'purchase', 'refund', 'payout', 'adjustment')",
      [],
      'wallet_transactions_type_valid'
    );

    // Only positive transaction amounts.
    table.check(
      'amount > 0',
      [],
      'wallet_transactions_amount_positive'
    );

    // Only supported transaction statuses.
    table.check(
      "status IN ('pending', 'completed', 'failed', 'reversed')",
      [],
      'wallet_transactions_status_valid'
    );

  });

};

// Reverse the migration.
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('wallet_transactions');
};
