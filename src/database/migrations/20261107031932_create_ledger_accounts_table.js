// Create the ledger_accounts table.
exports.up = async function (knex) {
  await knex.schema.createTable('ledger_accounts', (table) => {
    // Unique, auto-incrementing account ID.
    table.bigIncrements('id');

    // Unique code used to identify each account.
    // Example: 1001 for Paystack Clearing.
    table.string('account_code', 20).notNullable().unique();

    // Human-readable account name.
    // Example: Customer Wallet Liabilities.
    table.string('account_name', 100).notNullable();

    // Accounting classification.
    table.string('account_type', 20).notNullable();

    // Explanation of what this account is used for.
    table.text('description').notNullable();

    // Indicates whether the account can be used.
    table.string('status', 20).notNullable().defaultTo('active');

    // Date and time the account was created.
    table.timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Date and time the account was last updated.
    table.timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Restrict account types to valid accounting classifications.
    table.check(
      "account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')",
      [],
      'ledger_accounts_type_valid'
    );

    // Only allow active or inactive accounts.
    table.check(
      "status IN ('active', 'inactive')",
      [],
      'ledger_accounts_status_valid'
    );
  });
};

// Reverse the migration if necessary.
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('ledger_accounts');
};
