// Connect every ledger entry to its parent financial transaction.

// Apply the migration.
exports.up = async function (knex) {

  // Step 1: Check for existing ledger entries without a parent transaction.
  // We must not create a foreign key if orphaned entries exist.
  const orphanedEntries = await knex.raw(`
    SELECT COUNT(*) AS total
    FROM ledger_entries AS entries
    LEFT JOIN ledger_transactions AS transactions
      ON entries.transaction_id = transactions.id
    WHERE transactions.id IS NULL
  `);

  const orphanedCount = Number(orphanedEntries.rows[0].total);

  if (orphanedCount > 0) {
    throw new Error(
      'Migration stopped: ' + orphanedCount +
      ' ledger entries have no matching ledger transaction.'
    );
  }

  // Step 2: Add the foreign key.
  // Every ledger entry must belong to an existing transaction.
  await knex.schema.alterTable('ledger_entries', (table) => {
    table.foreign(
      'transaction_id',
      'ledger_entries_transaction_id_foreign'
    )
      .references('id')
      .inTable('ledger_transactions')
      .onDelete('RESTRICT');
  });
};

// Reverse the migration.
exports.down = async function (knex) {

  // Remove the foreign key while preserving the transaction IDs.
  await knex.schema.alterTable('ledger_entries', (table) => {
    table.dropForeign(
      ['transaction_id'],
      'ledger_entries_transaction_id_foreign'
    );
  });
};
