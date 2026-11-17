
/*
 * Payment Integration Test Environment
 *
 * This file runs before the payment integration test files
 * and application modules are loaded.
 */

// Mark the application as running in a test environment.
process.env.NODE_ENV = 'test';

// Select the dedicated payment integration test databases.
process.env.PAYMENT_INTEGRATION_TEST = 'true';

// Provide test-only JWT secrets.
// Both values are longer than the 32-character minimum.
// They are deliberately different from each other.
process.env.JWT_ACCESS_SECRET =
  'kobomarket_payment_integration_access_secret_2026';

process.env.JWT_REFRESH_SECRET =
  'kobomarket_payment_integration_refresh_secret_2026';
