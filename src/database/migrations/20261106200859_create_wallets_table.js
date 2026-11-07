// Create the wallets table.
exports.up = async function (knex) {
  await knex.schema.createTable('wallets', (table) => {
    // Unique, auto-incrementing wallet ID.
    table.bigIncrements('id');

    // MongoDB user ID, stored as a string.
    table.string('user_id', 50).notNullable().unique();

    // Available wallet balance, stored in kobo.
    table.bigInteger('available_balance')
      .notNullable()
      .defaultTo(0);

    // Money currently held in escrow, stored in kobo.
    table.bigInteger('escrow_balance')
      .notNullable()
      .defaultTo(0);

    // Wallet currency.
    table.string('currency', 3).notNullable().defaultTo('NGN');

    // Wallet status.
    table.string('status', 20).notNullable().defaultTo('active');

    // Date and time the wallet was created.
    table.timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Initially set when the wallet is created.
    // The application will update this field when the wallet changes.
    table.timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Prevent negative available balances.
    table.check(
      'available_balance >= 0',
      [],
      'wallets_available_balance_nonnegative'
    );

    // Prevent negative escrow balances.
    table.check(
      'escrow_balance >= 0',
      [],
      'wallets_escrow_balance_nonnegative'
    );

    // Only allow active or frozen wallets.
    table.check(
      "status IN ('active', 'frozen')",
      [],
      'wallets_status_valid'
    );
  });
};

// Reverse the migration if necessary.
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('wallets');
};
