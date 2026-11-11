
// Insert the predefined system ledger accounts into the database.

// Export the seed function.
exports.seed = async function (knex) {

  // Define the system accounts used by KoboMarket's accounting engine.
  const systemAccounts = [
    {
      account_code: 'SYS-001',
      account_name: 'Paystack Clearing',
      account_type: 'asset',
      description: 'Records funds received from Paystack that are awaiting settlement.'
    },
    {
      account_code: 'SYS-002',
      account_name: 'Escrow Liability',
      account_type: 'liability',
      description: 'Records customer funds held in escrow for orders awaiting completion.'
    },
    {
      account_code: 'SYS-003',
      account_name: 'Platform Commission Revenue',
      account_type: 'revenue',
      description: 'Records commission revenue earned by the KoboMarket platform.'
    },
    {
      account_code: 'SYS-004',
      account_name: 'Payment Processing Fees',
      account_type: 'expense',
      description: 'Records fees charged by Paystack and other payment processors.'
    }
  ];

  // Insert the system accounts.
  // PostgreSQL ignores any account code that already exists.
  // This also prevents duplicate insertion if two seed processes run together.
  const insertedAccounts = await knex('ledger_accounts')
    .insert(systemAccounts)
    .onConflict('account_code')
    .ignore()
    .returning(['account_code', 'account_name']);

  // Log only accounts that were actually created.
  for (const account of insertedAccounts) {

    console.log(
      'Created system ledger account:',
      account.account_code,
      account.account_name
    );
  }

  // Report how many accounts were inserted.
  console.log(
    `System ledger account seed completed. ${insertedAccounts.length} account(s) created.`
  );
};
