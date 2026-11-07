// Protect financial transactions from invalid status changes.

// Apply the migration.
exports.up = async function (knex) {

  // Create a function that validates transaction status transitions.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION protect_ledger_transaction_status()
    RETURNS TRIGGER AS $$
    BEGIN

      -- Reject any attempt to change an existing transaction's status
      -- to an invalid value or reopen a completed transaction.
      IF OLD.status = NEW.status THEN
        RETURN NEW;
      END IF;

      -- A pending transaction may only become posted or reversed.
      IF OLD.status = 'pending'
         AND NEW.status IN ('posted', 'reversed') THEN
        RETURN NEW;
      END IF;

      -- Once posted or reversed, a transaction cannot change status.
      RAISE EXCEPTION
        'Invalid transaction status change: % to % for transaction %.',
        OLD.status, NEW.status, OLD.id;

    END;
    $$ LANGUAGE plpgsql;
  `);

  // Attach the function to every status update.
  await knex.raw(`
    CREATE TRIGGER ledger_transaction_status_protection_trigger
    BEFORE UPDATE OF status ON ledger_transactions
    FOR EACH ROW
    EXECUTE FUNCTION protect_ledger_transaction_status();
  `);
};

// Reverse the migration.
exports.down = async function (knex) {

  // Remove the trigger.
  await knex.raw(`
    DROP TRIGGER IF EXISTS ledger_transaction_status_protection_trigger
    ON ledger_transactions;
  `);

  // Remove the function.
  await knex.raw(`
    DROP FUNCTION IF EXISTS protect_ledger_transaction_status();
  `);
};
