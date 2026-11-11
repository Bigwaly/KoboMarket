
// Load Zod for request validation.
const { z } = require('zod');

// Define the email verification request schema.
const verifyEmailSchema = z.object({

  // The verification token must be a 64-character hexadecimal string.
  token: z
    .string()
    .length(64, 'Verification token must contain exactly 64 characters.')
    .regex(
      /^[a-f0-9]{64}$/i,
      'Verification token has an invalid format.'
    )

});

// Export the validation schema.
module.exports = { verifyEmailSchema };
