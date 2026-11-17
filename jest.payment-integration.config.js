
// Dedicated Jest configuration for payment API integration tests.
module.exports = {

  // Run tests in Node.js.
  testEnvironment: 'node',

  // Run only the payment API integration test.
  testMatch: [
    '<rootDir>/src/tests/payments/payment-api.integration.test.js',
  ],

  // Load the dedicated integration test environment first.
  setupFiles: [
    '<rootDir>/src/tests/setup/payment-integration.env.js',
  ],

  // Run tests sequentially.
  maxWorkers: 1,

  // Allow real database setup and cleanup to take up to 60 seconds.
  testTimeout: 60000,

};
