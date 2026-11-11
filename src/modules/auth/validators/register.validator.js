// Load Zod for request validation.
const { z } = require('zod');

// Define the validation rules for customer registration.
const registerSchema = z
  .object({

    // The customer's full name.
    name: z
      .string()
      .trim()
      .min(2, 'Full name must contain at least 2 characters.')
      .max(100, 'Full name cannot exceed 100 characters.'),

    // The customer's email address.
    // Convert it to lowercase for consistent storage.
    email: z
      .string()
      .trim()
      .email('Please provide a valid email address.')
      .max(150, 'Email address cannot exceed 150 characters.')
      .transform((value) => value.toLowerCase()),

    // The customer's password.
    password: z
      .string()
      .min(8, 'Password must contain at least 8 characters.')
      .max(128, 'Password cannot exceed 128 characters.')

      // bcrypt only processes the first 72 bytes.
      // Enforce this limit to prevent different long
      // passwords from being treated as equivalent.
      .refine(
        (value) => Buffer.byteLength(value, 'utf8') <= 72,
        'Password cannot exceed 72 bytes.'
      ),

    // Require the customer to enter the password again.
    confirmPassword: z
      .string()
      .min(1, 'Please confirm your password.')
  })

  // Ensure both password fields contain the same value.
  .refine(
    (data) => data.password === data.confirmPassword,
    {
      message: 'Passwords do not match.',
      path: ['confirmPassword']
    }
  );

// Export the registration validation schema.
module.exports = { registerSchema };
