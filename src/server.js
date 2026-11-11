// Load environment variables from the .env file.
require('dotenv').config();

// Load the configured Express application.
const app = require('./app');

// Load the MongoDB connection function.
const connectMongoDB = require('./database/mongodb/connection');

// Load the PostgreSQL connection function.
const { connectPostgres } = require('./database/postgres/connection');

// Read the server port from environment variables.
// Use port 4000 when PORT is not configured.
const PORT = process.env.PORT || 4000;

// --------------------------------------------------
// STEP 1: START THE APPLICATION
// --------------------------------------------------

async function startServer() {
  try {
    // Connect to MongoDB first.
    console.log('Connecting to MongoDB...');
    await connectMongoDB();

    // Connect to PostgreSQL.
    console.log('Connecting to PostgreSQL...');
    await connectPostgres();

    // Start Express only after both databases connect.
    app.listen(PORT, () => {
      console.log(`KoboMarket API running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });

  } catch (error) {
    // Display the startup error.
    console.error('Failed to start KoboMarket API:');
    console.error(error.message);

    // Exit because the application cannot operate
    // safely without its database connections.
    process.exit(1);
  }
}

// Start the application.
startServer();
