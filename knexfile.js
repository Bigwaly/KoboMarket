// Load environment variables from .env.
require('dotenv').config();

// Knex configuration for KoboMarket.
module.exports = {
  development: {
    // PostgreSQL database client.
    client: 'pg',

    // PostgreSQL connection settings.
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
};
