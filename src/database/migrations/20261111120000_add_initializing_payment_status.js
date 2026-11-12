
// Extend the supported payment statuses to include initialization.
exports.up = async function (knex) {

  // Remove the existing payment-status constraint.
  await knex.raw(`
    ALTER TABLE payment_attempts
    DROP CONSTRAINT payment_attempts_status_valid
  `);

  // Create the updated constraint.
  await knex.raw(`
    ALTER TABLE payment_attempts
    ADD CONSTRAINT payment_attempts_status_valid
    CHECK (
      status IN (
        'initializing',
        'pending',
        'success',
        'failed'
      )
    )
  `);

};

// Restore the original payment statuses if this migration is rolled back.
exports.down = async function (knex) {

  // Remove the expanded payment-status constraint.
  await knex.raw(`
    ALTER TABLE payment_attempts
    DROP CONSTRAINT payment_attempts_status_valid
  `);

  // Restore the original constraint.
  await knex.raw(`
    ALTER TABLE payment_attempts
    ADD CONSTRAINT payment_attempts_status_valid
    CHECK (
      status IN (
        'pending',
        'success',
        'failed'
      )
    )
  `);

};
