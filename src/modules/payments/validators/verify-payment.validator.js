// --------------------------------------------------
// PAYSTACK PAYMENT VERIFICATION VALIDATOR
// --------------------------------------------------

// Load Zod for request validation.
const { z } = require('zod');


// --------------------------------------------------
// DEFINE PAYMENT VERIFICATION REQUEST SCHEMA
// --------------------------------------------------

// The customer only supplies the Paystack reference.
// The authenticated customer ID comes from the JWT.

const verifyPaymentSchema = z.object({

  // Require a valid Paystack transaction reference.
  reference: z
    .string()
    .trim()
    .min(1, 'Payment reference is required.')
    .max(150, 'Payment reference is too long.')

})
// Reject unexpected request fields.
.strict();


// --------------------------------------------------
// EXPORT PAYMENT VERIFICATION SCHEMA
// --------------------------------------------------

module.exports = {
  verifyPaymentSchema
};