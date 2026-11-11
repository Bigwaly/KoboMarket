
// Add support for safe, auditable ledger transaction reversals.

// Apply the migration.
exports.up = async function (knex) {

  // 1. Allow reversal as a recognised ledger transaction type.
  await knex.raw(`
    ALTER TABLE ledger_transactions
    DROP CONSTRAINT ledger_transactions_type_valid;
  `);

  await knex.raw(`
    ALTER TABLE ledger_transactions
    ADD CONSTRAINT ledger_transactions_type_valid
    CHECK (
      transaction_type IN (
        'wallet_funding',
        'purchase',
        'commission',
        'refund',
        'payout',
        'adjustment',
        'reversal'
      )
    );
  `);

  // 2. Add a self-referencing link to the original transaction.
  await knex.schema.alterTable('ledger_transactions', (table) => {

    table.uuid('reverses_transaction_id')
      .nullable()
      .references('id')
      .inTable('ledger_transactions')
      .onDelete('RESTRICT');

  });

  // 3. Prevent a transaction from reversing itself.
  await knex.raw(`
    ALTER TABLE ledger_transactions
    ADD CONSTRAINT ledger_transactions_cannot_reverse_self
    CHECK (
      reverses_transaction_id IS NULL
      OR reverses_transaction_id <> id
    );
  `);

  // 4. Allow only one reversal for each original transaction.
  await knex.raw(`
    CREATE UNIQUE INDEX
    ledger_transactions_reverses_transaction_unique
    ON ledger_transactions (reverses_transaction_id)
    WHERE reverses_transaction_id IS NOT NULL;
  `);

  // 5. Ensure only reversal transactions have a reversal link.
  // Every reversal transaction must reference an original transaction.
  await knex.raw(`
    ALTER TABLE ledger_transactions
    ADD CONSTRAINT ledger_transactions_reversal_link_valid
    CHECK (
      (
        transaction_type = 'reversal'
        AND reverses_transaction_id IS NOT NULL
      )
      OR
      (
        transaction_type <> 'reversal'
        AND reverses_transaction_id IS NULL
      )
    );
  `);

  // 6. Extend protection for posted transaction headers.
  // The reversal link cannot be changed after posting.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION protect_ledger_transaction_header()
    RETURNS TRIGGER AS $$
    BEGIN

      -- Protect transactions that were already posted or reversed.
      IF OLD.status IN ('posted', 'reversed') THEN

        -- Reject changes to financial identity and audit fields.
        IF OLD.transaction_type IS DISTINCT FROM NEW.transaction_type
           OR OLD.reference IS DISTINCT FROM NEW.reference
           OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
           OR OLD.description IS DISTINCT FROM NEW.description
           OR OLD.created_at IS DISTINCT FROM NEW.created_at
           OR OLD.posted_at IS DISTINCT FROM NEW.posted_at
           OR OLD.reverses_transaction_id
              IS DISTINCT FROM NEW.reverses_transaction_id THEN

          RAISE EXCEPTION
            'Cannot modify the header of posted or reversed transaction %.',
            OLD.id;

        END IF;

      END IF;

      RETURN NEW;

    END;
    $$ LANGUAGE plpgsql;
  `);

};

// Roll back the migration.
exports.down = async function (knex) {

  // Refuse rollback if reversal transactions already exist.
  // This prevents destruction of financial audit information.
  const reversalRecords = await knex('ledger_transactions')
    .where('transaction_type', 'reversal')
    .count({ total: '*' })
    .first();

  if (Number(reversalRecords.total) > 0) {
    throw new Error(
      'Cannot roll back ledger reversal migration while reversal transactions exist.'
    );
  }

  // Restore the original header-protection function.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION protect_ledger_transaction_header()
    RETURNS TRIGGER AS $$
    BEGIN

      -- Protect transactions that were already posted or reversed.
      IF OLD.status IN ('posted', 'reversed') THEN

        -- Reject changes to the original protected header fields.
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

  // Remove the reversal relationship constraint.
  await knex.raw(`
    ALTER TABLE ledger_transactions
    DROP CONSTRAINT ledger_transactions_reversal_link_valid;
  `);

  // Remove the self-reversal protection constraint.
  await knex.raw(`
    ALTER TABLE ledger_transactions
    DROP CONSTRAINT ledger_transactions_cannot_reverse_self;
  `);

  // Remove the unique reversal index.
  await knex.raw(`
    DROP INDEX ledger_transactions_reverses_transaction_unique;
  `);

  // Remove the self-referencing foreign key and reversal column.
  await knex.schema.alterTable('ledger_transactions', (table) => {

    table.dropForeign(
      'reverses_transaction_id',
      'ledger_transactions_reverses_transaction_id_foreign'
    );

    table.dropColumn('reverses_transaction_id');

  });

  // Restore the original six permitted transaction types.
  await knex.raw(`
    ALTER TABLE ledger_transactions
    DROP CONSTRAINT ledger_transactions_type_valid;
  `);

  await knex.raw(`
    ALTER TABLE ledger_transactions
    ADD CONSTRAINT ledger_transactions_type_valid
    CHECK (
      transaction_type IN (
        'wallet_funding',
        'purchase',
        'commission',
        'refund',
        'payout',
        'adjustment'
      )
    );
  `);

};
