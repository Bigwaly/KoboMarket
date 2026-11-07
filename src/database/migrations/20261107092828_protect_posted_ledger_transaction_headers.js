// Protect the header information of posted and reversed ledger transactions.

// Apply the migration.
exports.up = async function (knex) {

  // Create a PostgreSQL trigger function to protect transaction headers.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION protect_ledger_transaction_header()
    RETURNS TRIGGER AS $$
    BEGIN

      -- Only protect transactions that were already posted or reversed.
      IF OLD.status IN ('posted', 'reversed') THEN

        -- Reject changes to the transaction's financial identity and audit fields.
        IF OLD.transaction_type IS DISTINCT FROM NEW.transaction_type
           OR OLD.reference IS DISTINCT FROM NEW.reference
           OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
           OR OLD.description IS DISTINCT FROM NEW.description
           OR OLD.created_at IS DISTINCT FROM NEW.created_at
           OR OLD.posted_at IS DISTINCT FROM NEW.posted_at THEN

          RAISE EXCEPTION
            'Cannot modify the header of posted or reversed transaction %.',
            OLD.id;

        END IF;

      END IF;

      RETURN NEW;

    END;
    $$ LANGUAGE plpgsql;
  `);

  // Run the protection function before every transaction header update.
  await knex.raw(`
    CREATE TRIGGER ledger_transaction_header_protection_trigger
    BEFORE UPDATE ON ledger_transactions
    FOR EACH ROW
    EXECUTE FUNCTION protect_ledger_transaction_header();
  `);
};

// Roll back the migration.
exports.down = async function (knex) {

  // Remove the trigger first.
  await knex.raw(`
    DROP TRIGGER IF EXISTS ledger_transaction_header_protection_trigger
    ON ledger_transactions;
  `);

  // Remove its PostgreSQL function.
  await knex.raw(`
    DROP FUNCTION IF EXISTS protect_ledger_transaction_header();
  `);
};
