
// Import Mongoose to manage the MongoDB connection.
const mongoose = require('mongoose');

// Establish a connection to MongoDB.
const connectMongoDB = async () => {

  // Read the original MongoDB connection string.
  const mongoUri = process.env.MONGODB_URI;

  // Stop if the connection string is missing.
  if (!mongoUri) {
    throw new Error(
      'MONGODB_URI is not defined in environment variables.'
    );
  }

  // Determine whether the application is running Jest tests.
  const isTestEnvironment = process.env.NODE_ENV === 'test';

  // Determine whether this is the dedicated payment integration test.
  const isPaymentIntegrationTest =
    process.env.PAYMENT_INTEGRATION_TEST === 'true';

  // Payment integration tests must run under NODE_ENV=test.
  if (isPaymentIntegrationTest && !isTestEnvironment) {
    throw new Error(
      'Payment integration tests must run with NODE_ENV=test.'
    );
  }

  // Parse the original MongoDB connection string.
  const mongoUrl = new URL(mongoUri);

  // Select the appropriate database for test environments.
  if (isTestEnvironment) {

    // Choose the payment database only for payment integration tests.
    const testDatabase = isPaymentIntegrationTest
      ? process.env.MONGODB_PAYMENT_TEST_DATABASE
      : process.env.MONGODB_TEST_DATABASE;

    // Identify the development database.
    const developmentDatabase =
      mongoUrl.pathname.replace(/^\/+/, '');

    // Require the appropriate dedicated test database.
    if (!testDatabase) {
      throw new Error(
        isPaymentIntegrationTest
          ? 'MONGODB_PAYMENT_TEST_DATABASE must be configured before running payment integration tests.'
          : 'MONGODB_TEST_DATABASE must be configured before running database tests.'
      );
    }

    // Never allow tests to use the development database.
    if (testDatabase === developmentDatabase) {
      throw new Error(
        'MongoDB test database must be different from the development database.'
      );
    }

    // Payment integration tests must not use the ordinary test database.
    if (
      isPaymentIntegrationTest &&
      testDatabase === process.env.MONGODB_TEST_DATABASE
    ) {
      throw new Error(
        'Payment integration database must be different from the regular test database.'
      );
    }

    // Direct test connections to the selected test database.
    mongoUrl.pathname = `/${testDatabase}`;
  }
  // Connect to the selected MongoDB database.
  //
  // Jest does not always provide the dynamic-import callback
  // required by MongoDB driver 7.6+ to load its OS adapter.
  //
  // Supplying the adapter explicitly fixes the Jest connection
  // metadata error without changing production connection behavior.
  const connectionOptions = isTestEnvironment
    ? {
        runtimeAdapters: {
          os: require('node:os')
        }
      }
    : {};

  // Establish the MongoDB connection.
  await mongoose.connect(
    mongoUrl.toString(),
    connectionOptions
  );

  // Confirm which database was connected.
  console.log(
    `MongoDB connected: ${mongoose.connection.name}`
  );
};

// Export the connection function.
module.exports = connectMongoDB;
