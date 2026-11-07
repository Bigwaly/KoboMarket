// Import Pool from the pg package.
// Pool manages multiple PostgreSQL connections efficiently.
const { Pool } = require('pg');

// Create a connection pool for PostgreSQL.
const postgresPool = new Pool({
  // PostgreSQL server address.
  host: process.env.PG_HOST,

  // PostgreSQL server port.
  port: Number(process.env.PG_PORT),

  // Database name.
  database: process.env.PG_DATABASE,

  // Database username.
  user: process.env.PG_USER,

  // Database password.
  password: process.env.PG_PASSWORD,

  // Maximum number of connections in the pool.
  max: 10,

  // Close idle connections after 30 seconds.
  idleTimeoutMillis: 30000,

  // Wait up to 5 seconds when establishing a connection.
  connectionTimeoutMillis: 5000,
});

// Test the PostgreSQL connection.
const connectPostgres = async () => {
  // Check out a connection from the pool.
  const client = await postgresPool.connect();

  try {
    // Run a simple query to confirm the connection.
    await client.query('SELECT 1');

    console.log('PostgreSQL connected successfully.');
  } finally {
    // Return the connection to the pool.
    client.release();
  }
};

// Export the pool and connection test function.
module.exports = {
  postgresPool,
  connectPostgres,
};
