// Link every ledger entry to a ledger account instead of directly to a wallet.

// Apply the migration.
exports.up = async function (knex) {

  // Step 1: Add account_id as nullable temporarily.
  // We need this temporary state to migrate any existing records.
  await knex.schema.alterTable('ledger_entries', (table) => {
    table.bigInteger('account_id').nullable();
  });

  // Step 2: Match existing ledger entries to ledger accounts.
  // Each existing wallet_id should match ledger_accounts.wallet_id.
  await knex.raw(`
    UPDATE ledger_entries AS entries
    SET account_id = accounts.id
    FROM ledger_accounts AS accounts
    WHERE entries.wallet_id = accounts.wallet_id
  `);

  // Step 3: Confirm that every existing entry was matched.
  // Stop the migration rather than lose or orphan financial records.
  const unmatchedEntries = await knex('ledger_entries')
    .whereNull('account_id')
    .count('* as total');

  const unmatchedCount = Number(unmatchedEntries[0].total);

  if (unmatchedCount > 0) {
    throw new Error(
      'Migration stopped: ' + unmatchedCount +
      ' ledger entries could not be matched to ledger accounts.'
    );
  }

  // Step 4: Make account_id mandatory and link it to ledger_accounts.
  await knex.schema.alterTable('ledger_entries', (table) => {
    table.bigInteger('account_id')
      .notNullable()
      .alter();

    table.foreign('account_id', 'ledger_entries_account_id_foreign')
      .references('id')
      .inTable('ledger_accounts')
      .onDelete('RESTRICT');

    table.index(
      ['account_id', 'created_at'],
      'ledger_entries_account_created_at_idx'
    );
  });

  // Step 5: Remove the old wallet-based index.
  await knex.schema.alterTable('ledger_entries', (table) => {
    table.dropIndex(
      ['wallet_id', 'created_at'],
      'ledger_entries_wallet_created_at_idx'
    );
  });

  // Step 6: Remove the old wallet foreign key and column.
  await knex.schema.alterTable('ledger_entries', (table) => {
    table.dropForeign(['wallet_id']);
    table.dropColumn('wallet_id');
  });
};

// Reverse the migration.
// Rollback is possible only if every entry belongs to a wallet-linked account.
exports.down = async function (knex) {

  // Step 1: Check whether any entry belongs to a platform account.
  // Platform accounts have no wallet_id, so they cannot be represented
  // by the old wallet-based ledger structure.
  const systemEntries = await knex('ledger_entries')
    .join(
      'ledger_accounts',
      'ledger_entries.account_id',
      'ledger_accounts.id'
    )
    .whereNull('ledger_accounts.wallet_id')
    .count('* as total');

  const systemEntryCount = Number(systemEntries[0].total);

  if (systemEntryCount > 0) {
    throw new Error(
      'Rollback stopped: ledger entries exist for accounts without wallets.'
    );
  }

  // Step 2: Restore the old wallet_id column.
  await knex.schema.alterTable('ledger_entries', (table) => {
    table.bigInteger('wallet_id').nullable();
  });

  // Step 3: Restore wallet IDs using their associated ledger accounts.
  await knex.raw(`
    UPDATE ledger_entries AS entries
    SET wallet_id = accounts.wallet_id
    FROM ledger_accounts AS accounts
    WHERE entries.account_id = accounts.id
  `);

  // Step 4: Make wallet_id mandatory and restore its foreign key.
  await knex.schema.alterTable('ledger_entries', (table) => {
    table.bigInteger('wallet_id')
      .notNullable()
      .alter();

    table.foreign('wallet_id', 'ledger_entries_wallet_id_foreign')
      .references('id')
      .inTable('wallets')
      .onDelete('RESTRICT');

    table.index(
      ['wallet_id', 'created_at'],
      'ledger_entries_wallet_created_at_idx'
    );
  });

  // Step 5: Remove the new account-based relationship.
  await knex.schema.alterTable('ledger_entries', (table) => {
    table.dropIndex(
      ['account_id', 'created_at'],
      'ledger_entries_account_created_at_idx'
    );

    table.dropForeign(
      ['account_id'],
      'ledger_entries_account_id_foreign'
    );

    table.dropColumn('account_id');
  });
};
