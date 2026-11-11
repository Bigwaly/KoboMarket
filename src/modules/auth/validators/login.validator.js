
// Load Zod to validate incoming login data.
const { z } = require('zod');

// Define the rules for a customer login request.
const loginSchema = z.object({

  // Require a valid email address.
  // Trim spaces and convert the email to lowercase.
  email: z
    .string()
    .trim()
    .email('Please provide a valid email address.')
    .max(150, 'Email address is too long.')
    .transform((value) => value.toLowerCase()),

  // Require a password.
  // Do not trim or transform passwords because spaces
  // may legitimately be part of a user's password.
  password: z
    .string()
    .min(1, 'Password is required.')
    .max(128, 'Password is too long.')

})
// Reject additional fields not defined in this schema.
.strict();

// Export the login schema for the controller.
module.exports = {
  loginSchema
};
