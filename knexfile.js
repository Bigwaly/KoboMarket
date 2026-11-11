
// Load environment variables from .env.
require('dotenv').config();

// Knex configuration for KoboMarket.
module.exports = {

  // --------------------------------------------------
  // DEVELOPMENT DATABASE CONFIGURATION
  // --------------------------------------------------
  development: {

    // PostgreSQL database client.
    client: 'pg',

    // Development database connection settings.
    connection: {
      host: process.env.PG_HOST,
      port: Number(process.env.PG_PORT),
      database: process.env.PG_DATABASE,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
    },

    // Connection pool settings.
    pool: {
      min: 2,
      max: 10,
    },

    // Location of database migration files.
    migrations: {
      directory: './src/database/migrations',
      tableName: 'knex_migrations',
    },

    // Location of database seed files.
    seeds: {
      directory: './src/database/seeds',
    },
  },

  // --------------------------------------------------
  // TEST DATABASE CONFIGURATION
  // --------------------------------------------------
  test: {

    // PostgreSQL database client.
    client: 'pg',

    // Test database connection settings.
    connection: {
      host: process.env.PG_HOST,
      port: Number(process.env.PG_PORT),

      // Never fall back to the development database.
      // The fallback is the dedicated test database only.
      database: process.env.PG_TEST_DATABASE || 'kobomarket_test',

      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
    },

    // Connection pool settings.
    pool: {
      min: 1,
      max: 5,
    },

    // Use the same migration files as development.
    migrations: {
      directory: './src/database/migrations',
      tableName: 'knex_migrations',
    },

    // Use the same seed directory.
    seeds: {
      directory: './src/database/seeds',
    },
  },
};
