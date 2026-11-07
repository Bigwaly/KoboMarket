// Create the ledger_entries table.
exports.up = async function (knex) {
  await knex.schema.createTable('ledger_entries', (table) => {
    // Unique, auto-incrementing ledger entry ID.
    table.bigIncrements('id');

    // UUID identifying the financial transaction.
    // Multiple ledger entries can share the same transaction ID.
    table.uuid('transaction_id').notNullable();

    // Link this entry to an existing wallet.
    table.bigInteger('wallet_id')
      .notNullable()
      .references('id')
      .inTable('wallets')
      .onDelete('RESTRICT');

    // Accounting entry type.
    table.string('entry_type', 10).notNullable();

    // Amount recorded in integer kobo.
    table.bigInteger('amount').notNullable();

    // Explanation of the financial entry.
    table.text('description').notNullable();

    // Date and time the entry was recorded.
    table.timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Only allow debit or credit entries.
    table.check(
      "entry_type IN ('debit', 'credit')",
      [],
      'ledger_entries_type_valid'
    );

    // Every ledger entry must have a positive amount.
    table.check(
      'amount > 0',
      [],
      'ledger_entries_amount_positive'
    );

    // Index for retrieving all entries belonging to a transaction.
    table.index('transaction_id', 'ledger_entries_transaction_id_idx');

    // Index for retrieving a wallet's financial history.
    table.index(
      ['wallet_id', 'created_at'],
      'ledger_entries_wallet_created_at_idx'
    );
  });
};

// Reverse the migration if necessary.
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('ledger_entries');
};
