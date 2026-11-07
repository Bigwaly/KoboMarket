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

  // Process each system account separately.
  for (const account of systemAccounts) {

    // Check whether an account with this code already exists.
    const existingAccount = await knex('ledger_accounts')
      .where({ account_code: account.account_code })
      .first();

    // Insert the account only when it does not already exist.
    if (!existingAccount) {
      await knex('ledger_accounts').insert(account);

      // Log the account that was created.
      console.log(
        'Created system ledger account:',
        account.account_code,
        account.account_name
      );

    } else {

      // Preserve existing account information.
      console.log(
        'System ledger account already exists:',
        account.account_code,
        account.account_name
      );
    }
  }

  // Confirm that the seed has finished.
  console.log('System ledger account seed completed.');
};
