# KoboMarket

KoboMarket is a multi-vendor marketplace backend built with Node.js, Express, MongoDB and PostgreSQL.

The project uses MongoDB for user and product-related data and PostgreSQL for financial records, wallets and double-entry ledger transactions. Financial amounts are represented in integer Nigerian kobo rather than floating-point values.

> **Development status:** KoboMarket is under active development. Authentication, email verification, product creation, wallet management, payment initialization and verification, and core ledger functionality have been implemented. Several marketplace and escrow features from the original project specification are still pending.

## 1. Technology Stack

- Node.js
- Express.js
- MongoDB with Mongoose
- PostgreSQL
- Knex.js for SQL queries and database migrations
- JSON Web Tokens (JWT)
- bcryptjs for password hashing
- Zod for request validation
- Paystack integration
- Resend for email delivery
- Jest and Supertest for testing
- Docker Compose for database services

## 2. Architecture Overview

KoboMarket uses two databases for different responsibilities.

### MongoDB

MongoDB currently stores application and catalogue information, including:

- User accounts
- Email verification tokens
- Refresh-token session records
- Product records

### PostgreSQL

PostgreSQL stores financial and accounting information, including:

- Wallet records
- Ledger accounts
- Ledger transactions
- Ledger entries
- Wallet transactions
- Payment attempts

### Financial Integrity

The financial subsystem is designed around double-entry accounting.

Important rules include:

- All monetary amounts are stored in integer kobo.
- Every posted ledger transaction must balance.
- Total debit entries must equal total credit entries.
- Ledger entries cannot be updated or deleted after insertion.
- Corrections are recorded through reversal transactions.
- Idempotency keys help prevent duplicate financial operations.
- PostgreSQL transactions are used to protect related financial database operations.

## 3. Implemented Features

### Authentication and User Management

- User registration
- Password hashing
- User login
- JWT access tokens
- Refresh-token session creation
- Email verification
- Resending email verification
- Authentication middleware
- Role-based authorization
- Login and email-verification rate limiting
- PostgreSQL wallet creation during registration

Current application roles include:

- `customer`
- `vendor`
- `admin`
- `superadmin`

The `customer` role corresponds to the buyer role described in the project specification.

**Development note:** Refresh-token rotation, reuse detection, logout/revocation endpoints and password-reset workflows are not yet fully implemented.

### Product Management

The current product module supports:

- Vendor-associated product creation
- Product request validation
- Product persistence in MongoDB
- Product retrieval through repository functions
- Filtering active products by category
- Text indexing on product name and description

Product creation currently uses the vendor role.

Advanced marketplace search, cursor pagination, product variants, vendor approval workflows and additional catalogue features remain pending.

### Wallet and Ledger

The financial subsystem currently supports:

- Wallet creation
- Wallet lookup
- Active-wallet validation
- Wallet funding
- Ledger transaction creation
- Debit and credit entries
- Ledger transaction posting
- Idempotent transaction handling
- Ledger transaction reversal
- Database-level ledger integrity protections

### Payment Processing

The payment module currently supports:

- Paystack payment initialization
- Payment verification
- Payment attempt records
- Idempotency and replay protection
- Wallet crediting after successful verification

The payment integration tests use a simulated payment-provider response.

**Development note:** A complete Paystack webhook endpoint and signature-verification workflow have not yet been confirmed as implemented.

### System Ledger Accounts

The current system-account seed defines the following accounts:

| Account Code | Account Name | Account Type |
|---|---|---|
| SYS-001 | Paystack Clearing | Asset |
| SYS-002 | Escrow Liability | Liability |
| SYS-003 | Platform Commission Revenue | Revenue |
| SYS-004 | Payment Processing Fees | Expense |

The seed ignores existing account codes to avoid inserting duplicate system accounts.

## 4. Project Structure

The main application source code is organised into modules.

```text
KoboMarket/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── database/
│   │   ├── migrations/
│   │   ├── mongodb/
│   │   ├── postgres/
│   │   ├── seeds/
│   │   └── test-connections.js
│   ├── middleware/
│   ├── modules/
│   │   ├── auth/
│   │   ├── ledger/
│   │   ├── payments/
│   │   ├── products/
│   │   └── users/
│   ├── services/
│   └── tests/
├── docs/
├── tests/
├── docker-compose.yml
├── knexfile.js
├── jest.payment-integration.config.js
├── package.json
└── README.md
```

## 5. Requirements

Install the following before running the application:

- Node.js
- npm
- Docker Desktop with Docker Compose
- Git

MongoDB and PostgreSQL are started using Docker Compose.

## 6. Environment Configuration

Clone the repository:

```bash
git clone https://github.com/Bigwaly/KoboMarket.git
cd KoboMarket
```

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env
```

Open `.env` and configure the required values.

Important environment variables include:

| Variable | Purpose |
|---|---|
| NODE_ENV | Application environment |
| PORT | API port |
| MONGODB_URI | MongoDB connection |
| PG_HOST | PostgreSQL host |
| PG_PORT | PostgreSQL port |
| PG_DATABASE | PostgreSQL database |
| PG_USER | PostgreSQL username |
| PG_PASSWORD | PostgreSQL password |
| JWT_ACCESS_SECRET | Access-token signing secret |
| JWT_REFRESH_SECRET | Refresh-token signing secret |
| RESEND_API_KEY | Resend API key |
| EMAIL_FROM | Sender email address |
| PAYSTACK_SECRET_KEY | Paystack secret key |
| PLATFORM_COMMISSION_RATE | Planned; not currently consumed by the application |
| ESCROW_TIMEOUT_HOURS | Planned; not currently consumed by the application |
| PAYOUT_MINIMUM_KOBO | Planned; not currently consumed by the application |

The email-verification workflow also requires a configured `FRONTEND_URL`.

Use valid credentials in your local `.env` file. Never commit `.env` or expose production secrets.

## 7. Starting the Databases

The Docker Compose configuration starts MongoDB and PostgreSQL.

Run:

```bash
docker compose up -d
```

The configured services are:

| Service | Container | Default Port |
|---|---|---|
| MongoDB | kobomarket-mongodb | 27017 |
| PostgreSQL | kobomarket-postgres | 5432 |

Docker Compose currently starts the database services only. The Node.js API runs separately on the host machine.

## 8. Database Migrations and Seeds

Run PostgreSQL migrations:

```bash
npm run migrate
```

Run the available system ledger-account seed:

```bash
npx knex seed:run
```

The current seed creates the four predefined system ledger accounts listed above. It is not a complete demonstration-data seed for buyers, vendors and products.

## 9. Running the API

Start the development server:

```bash
npm run dev
```

The default API port is `4000`.

The application connects to MongoDB and PostgreSQL before starting the HTTP server.

Check the health endpoint:

```http
GET http://localhost:4000/health
```

A successful response indicates that the application health endpoint is responding.

For a normal start:

```bash
npm start
```

## 10. Current API Endpoints

The following endpoints are currently registered in the application.

### Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login` | Authenticate a user |
| POST | `/api/auth/verify-email` | Verify an email address |
| POST | `/api/auth/resend-verification` | Resend email verification |

### Payments

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/payments/initialize` | Initialize a payment |
| POST | `/api/payments/verify` | Verify a payment |

### Products

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/products` | Create a product as an authenticated vendor |

### Health

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Check API availability |

Protected endpoints require the appropriate authentication token and role.

The actual route prefix currently registered in the application is `/api`. Check the application route configuration when integrating a client.

## 11. API Documentation

KoboMarket includes API documentation in two formats:

- **OpenAPI specification:** [`docs/openapi.yaml`](docs/openapi.yaml)
- **Postman collection:** [`postman/KoboMarket.postman_collection.json`](postman/KoboMarket.postman_collection.json)

### Using the OpenAPI Specification

The OpenAPI 3.0.3 specification describes the currently registered API endpoints, request schemas, authentication requirements and example responses.

You can open `docs/openapi.yaml` with an OpenAPI-compatible documentation tool to view the API reference.

The specification is currently provided as a file; a Swagger UI endpoint is not configured in the running application.

### Using the Postman Collection

1. Open Postman.
2. Select **Import**.
3. Choose `postman/KoboMarket.postman_collection.json`.
4. Select the **KoboMarket API** collection.
5. Set the `baseUrl` collection variable to `http://localhost:4000`.
6. Register and log in to obtain an access token.
7. Use the available requests to test the implemented endpoints.

The collection includes requests for health checks, authentication, payments and product creation. Some requests require real values, such as an email verification token or payment reference.

## 12. Testing

KoboMarket uses Jest and Supertest for automated testing.

### Standard Test Suite

Run:

```bash
npm test
```

**Latest verified result (19 November 2026):**

- Test suites passed: 16 of 16
- Tests passed: 191 of 191

The standard test script excludes the payment API integration test.

### Payment API Integration Test

Run:

```bash
npx jest --runInBand --config jest.payment-integration.config.js
```

**Latest verified result (19 November 2026):**

- Test suites passed: 1 of 1
- Tests passed: 1 of 1

The integration test uses dedicated MongoDB and PostgreSQL test databases and simulates Paystack responses. It verifies payment initialization, idempotency, amount-mismatch rejection, wallet funding, double-entry ledger integrity and duplicate-verification protection.

### Combined Test Results

| Test Category | Suites Passed | Tests Passed |
|---|---:|---:|
| Standard Jest suite | 16/16 | 191/191 |
| Payment API integration | 1/1 | 1/1 |
| **Total** | **17/17** | **192/192** |

Never point integration tests at production databases.

## 13. Features Still Under Development

The original project specification describes a complete multi-vendor marketplace with wallet funding, checkout, escrow, order fulfilment, disputes and payouts.

The following areas remain incomplete or require further implementation and testing:

- Refresh-token rotation and reuse detection
- Logout and token revocation endpoints
- Forgot-password and reset-password workflows
- Vendor application and approval management
- Advanced product search and cursor pagination
- Product variants and additional catalogue features
- Shopping carts and checkout
- Orders and vendor sub-orders
- Escrow funding and release
- Order shipment and delivery workflows
- Automatic order completion
- Dispute management and refunds
- Vendor payout processing
- Paystack webhook signature verification
- Notifications
- Administrative reporting
- Ledger audit command
- Complete demonstration-data seeds
- Automated end-to-end marketplace workflow tests
- Docker Compose service for the Node.js API

These features should not be considered complete until their implementation and tests are available.

## 14. Security and Development Practices

The project uses several security and integrity controls:

- Password hashing
- JWT-based authentication
- Role-based authorization
- Request validation
- Helmet security middleware
- Rate limiting on selected authentication endpoints
- Database constraints
- PostgreSQL transactions
- Idempotency checks
- Append-only ledger entries
- Ledger reversal transactions
- Separate development and test database configuration

Security configuration and deployment settings should be reviewed before production use.

## 15. Important Development Notes

- MongoDB stores application and catalogue data.
- PostgreSQL is the source of truth for financial records.
- Monetary values are represented in integer kobo.
- The current Docker Compose file starts MongoDB and PostgreSQL, not the API.
- The current seed file creates system ledger accounts only.
- The standard test command excludes the separate payment API integration test.
- The project is still being developed against the full assignment specification.

## 16. Repository

GitHub repository:

https://github.com/Bigwaly/KoboMarket

---

**KoboMarket — Building a secure, reliable multi-vendor marketplace backend.**
