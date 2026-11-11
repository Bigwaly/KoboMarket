
// Load Zod for request validation.
const { z } = require('zod');

// Define the resend verification email request schema.
const resendVerificationSchema = z.object({

  // Accept a valid email address and normalize it to lowercase.
  email: z
    .string()
    .trim()
    .email('Please provide a valid email address.')
    .max(150, 'Email address cannot exceed 150 characters.')
    .transform((value) => value.toLowerCase())

});

// Export the validation schema.
module.exports = { resendVerificationSchema };
