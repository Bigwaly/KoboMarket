// Load Zod for payment request validation.
const { z } = require('zod');

// Define the payment initialization request schema.
const initializePaymentSchema = z.object({

  // Require the payment amount in Naira.
  amount: z
    .number({
      error: 'Payment amount must be a number.'
    })
    .positive('Payment amount must be greater than zero.')
    .refine(
      (value) => Number.isFinite(value * 100),
      'Payment amount is too large.'
    )
    .refine(
      (value) => Number.isSafeInteger(Math.round(value * 100)),
      'Payment amount exceeds the supported limit.'
    )
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
      'Payment amount must not have more than two decimal places.'
    ),

  // Require a unique idempotency key for this request.
  idempotencyKey: z
    .string()
    .trim()
    .min(16, 'Idempotency key must contain at least 16 characters.')
    .max(150, 'Idempotency key is too long.')

})
// Reject additional request fields.
.strict();

// Export the payment initialization schema.
module.exports = {
  initializePaymentSchema
};
