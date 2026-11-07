// Add a wallet relationship to ledger_accounts.
exports.up = async function (knex) {
  await knex.schema.alterTable('ledger_accounts', (table) => {
    // Link a ledger account to a wallet when one exists.
    // Nullable allows platform accounts without wallets.
    table.bigInteger('wallet_id')
      .nullable()
      .unique()
      .references('id')
      .inTable('wallets')
      .onDelete('RESTRICT');
  });
};

// Remove the wallet relationship if rolling back.
exports.down = async function (knex) {
  await knex.schema.alterTable('ledger_accounts', (table) => {
    table.dropForeign(['wallet_id']);
    table.dropUnique(['wallet_id']);
    table.dropColumn('wallet_id');
  });
};
