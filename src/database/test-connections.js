// Load environment variables from the .env file.
require('dotenv').config();

// Import the MongoDB connection function.
const connectMongoDB = require('./mongodb/connection');

// Import the PostgreSQL connection function and pool.
const {
  connectPostgres,
  postgresPool,
} = require('./postgres/connection');

// Test both database connections.
const testConnections = async () => {
  try {
    // Connect to MongoDB.
    await connectMongoDB();

    // Connect to PostgreSQL.
    await connectPostgres();

    console.log('All database connections are working.');
  } catch (error) {
    // Display the connection error.
    console.error('Database connection test failed:', error.message);

    // Set a failure exit code.
    process.exitCode = 1;
  } finally {
    // Close the MongoDB connection.
    const mongoose = require('mongoose');
    await mongoose.disconnect();

    // Close the PostgreSQL connection pool.
    await postgresPool.end();
  }
};

// Execute the test.
testConnections();
