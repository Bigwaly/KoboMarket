// Enforce double-entry accounting and append-only ledger rules.

// Apply the migration.
exports.up = async function (knex) {

  // RULE 1:
  // Validate every transaction before it changes from pending to posted.
  //
  // A posted transaction must:
  // 1. Have at least two ledger entries.
  // 2. Have total debits equal to total credits.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION validate_ledger_transaction_balance()
    RETURNS TRIGGER AS $$
    DECLARE
      entry_count BIGINT;
      total_debits NUMERIC;
      total_credits NUMERIC;
    BEGIN

      -- Validate only when a transaction is being posted.
      IF OLD.status = 'pending' AND NEW.status = 'posted' THEN

        -- Count all entries belonging to this transaction.
        SELECT COUNT(*)
        INTO entry_count
        FROM ledger_entries
        WHERE transaction_id = NEW.id;

        -- A valid double-entry transaction needs at least two entries.
        IF entry_count < 2 THEN
          RAISE EXCEPTION
            'Cannot post transaction %: at least two ledger entries are required.',
            NEW.id;
        END IF;

        -- Calculate the total debit and credit amounts.
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE entry_type = 'debit'), 0),
          COALESCE(SUM(amount) FILTER (WHERE entry_type = 'credit'), 0)
        INTO total_debits, total_credits
        FROM ledger_entries
        WHERE transaction_id = NEW.id;

        -- Reject transactions where the debit and credit totals differ.
        IF total_debits <> total_credits THEN
          RAISE EXCEPTION
            'Cannot post transaction %: debits (%) do not equal credits (%).',
            NEW.id, total_debits, total_credits;
        END IF;

      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Attach the balance validation function to ledger_transactions.
  await knex.raw(`
    CREATE TRIGGER ledger_transaction_balance_trigger
    BEFORE UPDATE OF status ON ledger_transactions
    FOR EACH ROW
    EXECUTE FUNCTION validate_ledger_transaction_balance();
  `);

  // RULE 2:
  // Prevent ledger entries from being updated or deleted.
  //
  // Corrections must be recorded using new reversing transactions.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION prevent_ledger_entry_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION
        'Ledger entries are append-only. Updates and deletions are not allowed.';
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Attach the append-only protection to ledger_entries.
  await knex.raw(`
    CREATE TRIGGER ledger_entries_immutable_trigger
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_entry_mutation();
  `);

  // RULE 3:
  // Prevent new entries from being added to posted or reversed transactions.
  //
  // Locking the parent transaction row also coordinates entry creation
  // with transaction posting to prevent concurrent operations bypassing
  // the status check.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION prevent_entries_after_posting()
    RETURNS TRIGGER AS $$
    DECLARE
      parent_status VARCHAR(20);
    BEGIN

      -- Lock the parent transaction while checking its status.
      SELECT status
      INTO parent_status
      FROM ledger_transactions
      WHERE id = NEW.transaction_id
      FOR UPDATE;

      -- Only pending transactions can receive new entries.
      IF parent_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION
          'Cannot add ledger entry: parent transaction % is not pending.',
          NEW.transaction_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Attach the parent transaction status check to ledger_entries.
  await knex.raw(`
    CREATE TRIGGER ledger_entries_parent_status_trigger
    BEFORE INSERT ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_entries_after_posting();
  `);
};

// Reverse the migration.
exports.down = async function (knex) {

  // Remove triggers before removing their functions.
  await knex.raw(`
    DROP TRIGGER IF EXISTS ledger_entries_parent_status_trigger
    ON ledger_entries;
  `);

  await knex.raw(`
    DROP TRIGGER IF EXISTS ledger_entries_immutable_trigger
    ON ledger_entries;
  `);

  await knex.raw(`
    DROP TRIGGER IF EXISTS ledger_transaction_balance_trigger
    ON ledger_transactions;
  `);

  // Remove the trigger functions.
  await knex.raw(`
    DROP FUNCTION IF EXISTS prevent_entries_after_posting();
  `);

  await knex.raw(`
    DROP FUNCTION IF EXISTS prevent_ledger_entry_mutation();
  `);

  await knex.raw(`
    DROP FUNCTION IF EXISTS validate_ledger_transaction_balance();
  `);
};
