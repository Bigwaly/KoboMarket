# KoboMarket System Architecture

## 1. Introduction

KoboMarket is a multi-vendor marketplace backend developed with Node.js and Express.

The application uses a modular backend architecture and two database systems:

- MongoDB for application and catalogue data.
- PostgreSQL for wallets, payments and financial accounting records.

The separation allows the application to use a document database for flexible application data while relying on a relational database for financial records that require strong transactional integrity.

**Implementation status:** This document describes the current implementation. Marketplace features that have not yet been developed are identified as planned functionality rather than existing functionality.

## 2. High-Level Architecture

The current application follows this general request flow:

```text
                 CLIENT
                   |
                   |
             HTTP Request
                   |
                   v
             EXPRESS API
                   |
          -------------------
          |        |        |
          v        v        v
       ROUTES  MIDDLEWARE  VALIDATION
          |        |        |
          ---------|--------
                   |
                   v
              CONTROLLERS
                   |
                   v
               SERVICES
                   |
             -------------
             |           |
             v           v
          MONGODB    POSTGRESQL
          (Mongoose)  (Knex.js)
             |           |
             v           v
       Application    Financial
          Data          Data
```

The diagram represents the general architecture. Individual modules use the database appropriate to their responsibilities.

## 3. Technology Responsibilities

| Technology | Responsibility |
|---|---|
| Node.js | JavaScript runtime |
| Express.js | HTTP server and routing |
| Mongoose | MongoDB models and document operations |
| PostgreSQL | Relational financial data storage |
| Knex.js | SQL queries and database migrations |
| JSON Web Tokens | Authentication tokens |
| bcryptjs | Password hashing |
| Zod | Request validation |
| Paystack | Payment provider integration |
| Resend | Email delivery |
| Jest | Automated testing |
| Supertest | HTTP endpoint testing |

## 4. Database Architecture

### 4.1 MongoDB: Application Data

MongoDB stores application information and catalogue records.

Current MongoDB models include:

- User
- EmailVerificationToken
- RefreshToken
- Product

The user model stores account information such as:

- Name
- Email address
- Hashed password
- Role
- Account status
- Email verification status

The product model stores information such as:

- Vendor reference
- Product name
- Description
- Category
- Price in kobo
- Currency
- Available stock quantity
- Product status
- Image URLs

MongoDB is suitable for this part of the application because application documents can evolve as marketplace functionality grows.

### 4.2 PostgreSQL: Financial Data

PostgreSQL is used for financial records that require relational integrity and database transactions.

The current financial schema includes:

- Wallets
- Ledger accounts
- Ledger transactions
- Ledger entries
- Wallet transactions
- Payment attempts

The PostgreSQL database is the financial source of truth.

Wallet and ledger records are connected using relational keys and database constraints.

### 4.3 Why Two Databases?

The two databases serve different responsibilities.

| Requirement | Database | Reason |
|---|---|---|
| User profiles | MongoDB | Flexible application documents |
| Product catalogue | MongoDB | Flexible catalogue records |
| Email verification records | MongoDB | Associated with user authentication |
| Refresh-token records | MongoDB | Associated with user sessions |
| Wallet balances | PostgreSQL | Financial consistency |
| Ledger transactions | PostgreSQL | Relational integrity |
| Ledger entries | PostgreSQL | Double-entry accounting |
| Payment attempts | PostgreSQL | Financial transaction tracking |

The separation prevents the application from treating a general application document as the authoritative financial record.

## 5. Authentication Architecture

Authentication is implemented in the authentication module.

The current authentication flow is:

1. A user submits registration details.
2. The request is validated.
3. The password is hashed using bcryptjs.
4. The user record is created in MongoDB.
5. A PostgreSQL wallet is created for the user.
6. An email verification token is generated and its hash is stored.
7. The user receives an email verification message.
8. The user verifies the email address.
9. A verified user can log in.
10. The login service issues an access token and creates a refresh-token session.

### 5.1 Access Tokens

JWT access tokens are used to authenticate protected requests.

The current default access-token lifetime is 15 minutes.

The authentication middleware:

- Reads the supplied bearer token.
- Verifies the JWT.
- Checks its expected signing algorithm, issuer and audience.
- Loads the corresponding user.
- Rejects invalid or inactive accounts.
- Attaches the authenticated user information to the request.

### 5.2 Refresh Tokens

Refresh-token session creation is implemented.

The refresh-token service:

- Generates a refresh token.
- Stores a SHA-256 hash rather than the raw token.
- Associates the session with a user.
- Assigns a token family identifier.
- Records an expiry time.

Refresh-token rotation, reuse detection, logout and revocation endpoints remain planned work.

### 5.3 Role-Based Authorization

The application currently recognises these roles:

- `customer`
- `vendor`
- `admin`
- `superadmin`

Authorization middleware checks whether the authenticated user has the role required by a protected route.

The current product creation endpoint requires the vendor role.

Vendor application approval and administrative vendor-management workflows are not yet implemented.

## 6. Product Module Architecture

The product module uses a layered structure.

```text
products/
├── controllers/
│   └── create-product.controller.js
├── models/
│   └── product.model.js
├── repositories/
│   └── product.repository.js
├── routes/
│   └── product.routes.js
├── services/
│   └── product.service.js
└── validators/
    └── create-product.validator.js
```

### Request Flow

1. The client sends a product creation request.
2. Authentication middleware identifies the user.
3. Role authorization checks for the vendor role.
4. Zod validates the request body.
5. The controller passes the request to the product service.
6. The service applies product creation rules.
7. The repository stores the product through Mongoose.
8. The controller returns the HTTP response.

The current API exposes product creation. The repository also contains selected product-retrieval operations, but corresponding read endpoints are not yet exposed.

Advanced search, cursor pagination, product variants and vendor approval checks remain planned work.

## 7. Wallet and Double-Entry Ledger Architecture

The wallet and ledger modules are responsible for financial operations.

All monetary values are represented in integer Nigerian kobo.

For example:

- ₦1.00 = 100 kobo
- ₦100.00 = 10,000 kobo
- ₦1,000.00 = 100,000 kobo

Floating-point arithmetic is avoided for financial amounts.

### 7.1 Wallets

Each user has a PostgreSQL wallet associated with the user's MongoDB identifier.

The wallet schema includes:

- Wallet ID
- User ID
- Available balance
- Escrow balance
- Currency
- Wallet status
- Creation and update timestamps

Wallet status currently supports active and frozen states.

### 7.2 Ledger Accounts

Ledger accounts identify the accounting destinations used by financial transactions.

The current system-account seed defines:

| Code | Account | Type |
|---|---|---|
| SYS-001 | Paystack Clearing | Asset |
| SYS-002 | Escrow Liability | Liability |
| SYS-003 | Platform Commission Revenue | Revenue |
| SYS-004 | Payment Processing Fees | Expense |

These are the four accounts currently defined by the seed.

### 7.3 Ledger Transactions

A ledger transaction represents a financial accounting event.

A transaction contains:

- A UUID identifier
- Transaction type
- Transaction status
- Optional reference
- Optional idempotency key
- Description
- Creation timestamp
- Posting timestamp

Supported transaction types include:

- Wallet funding
- Purchase
- Commission
- Refund
- Payout
- Adjustment
- Reversal

The transaction status can be:

- `pending`
- `posted`
- `reversed`

### 7.4 Ledger Entries

Each ledger transaction contains debit and credit entries.

The accounting rule is:

**Total Debits = Total Credits**

A transaction cannot be posted unless:

- It contains at least two ledger entries.
- Its debit and credit totals are equal.
- Its entries satisfy the database constraints.

PostgreSQL triggers enforce important integrity rules when transactions are posted.

### 7.5 Append-Only Ledger

Posted ledger entries cannot be updated or deleted.

This protects the accounting history from direct modification.

When a posted transaction needs correction, the system creates a reversal transaction.

A reversal:

1. Locks the original transaction.
2. Checks that the original transaction exists and is posted.
3. Prevents reversing a reversal transaction.
4. Checks whether a reversal already exists.
5. Creates new entries with the original debit and credit directions swapped.
6. Links the reversal transaction to the original transaction.
7. Preserves the original ledger entries.

This approach maintains an auditable financial history.

### 7.6 Idempotency

Idempotency prevents repeated requests from creating duplicate financial operations.

The ledger uses unique idempotency keys.

When a request is repeated with an existing key:

- The existing transaction is checked.
- Matching transaction details can return the existing result.
- Reusing the key with different transaction details is rejected.

This is particularly important when a client retries a request after a network timeout.

## 8. Payment Architecture

The payment module integrates with Paystack.

The current payment flow supports initialization and verification.

### 8.1 Payment Initialization

1. An authenticated customer submits a payment initialization request.
2. The request passes authentication and role checks.
3. Request data is validated.
4. The payment service validates the requested amount and customer eligibility.
5. A payment attempt is created or reconciled using idempotency rules.
6. The Paystack service initializes the payment.
7. The API returns the payment initialization result.

### 8.2 Payment Verification

1. The authenticated customer submits a payment reference.
2. The verification service retrieves the payment attempt.
3. The payment provider is queried to verify the transaction.
4. The verified payment details are checked.
5. A successful payment is processed through the wallet and ledger services.
6. Repeated verification does not create duplicate wallet credits.

The payment API integration tests simulate the external payment-provider response.

**Current limitation:** A Paystack webhook endpoint and webhook-signature verification workflow are not yet implemented.

## 9. Cross-Database Consistency

KoboMarket uses MongoDB and PostgreSQL, which cannot participate in one ordinary shared database transaction.

For example, user registration involves:

- Creating a user in MongoDB.
- Creating a wallet in PostgreSQL.

If the PostgreSQL wallet creation fails after the MongoDB user has been created, the registration service includes reconciliation and compensation logic.

This reduces the risk of leaving an incomplete registration.

The current implementation does not represent a complete distributed transaction or a general-purpose transactional outbox.

Future cross-database marketplace operations will require carefully designed compensation, reconciliation and idempotency mechanisms.

## 10. Database Migrations and Seeds

Knex manages PostgreSQL schema changes.

Migration files are stored in:

```text
src/database/migrations/
```

System ledger-account seeds are stored in:

```text
src/database/seeds/
```

The current system-account seed can be executed with:

```bash
npx knex seed:run
```

The migration history includes wallet, ledger, integrity-protection, reversal and payment-attempt schema changes.

## 11. Testing Architecture

Jest is used for automated tests.

Supertest is used for HTTP API testing.

The test suite includes tests for:

- Registration
- Login
- Email verification
- Refresh-token session creation
- Authentication middleware
- Role authorization
- Wallet and ledger behaviour
- Payment initialization
- Payment verification
- Payment repository operations
- Product repository operations
- Product service operations
- Product API behaviour

The payment API integration test uses a separate Jest configuration and dedicated test database settings.

Development and test database configurations are kept separate to reduce the risk of test operations affecting development data.

## 12. Security and Integrity Controls

Current controls include:

- Password hashing with bcryptjs
- JWT authentication
- Role-based authorization
- Zod request validation
- Helmet middleware
- Rate limiting on selected authentication routes
- PostgreSQL foreign keys and check constraints
- Transaction-level database locking where required
- Idempotency protection
- Append-only ledger entries
- Ledger reversal transactions
- Separate test database configuration

The application requires further security review and hardening before production deployment.

## 13. Planned Architecture Extensions

The following features are part of the intended marketplace architecture but are not yet complete:

- Refresh-token rotation and reuse detection
- Password recovery
- Vendor application approval
- Shopping carts
- Checkout and order management
- Vendor sub-orders
- Escrow funding and release
- Shipment and delivery workflows
- Automatic order completion
- Disputes and refunds
- Vendor payouts
- Paystack webhook processing
- Notifications
- Administrative reporting
- Swagger/OpenAPI documentation
- Transactional outbox and reconciliation improvements
- Full marketplace end-to-end tests

These extensions will build on the existing authentication, product, wallet, payment and ledger modules.

## 14. Conclusion

KoboMarket currently provides a modular backend foundation for a multi-vendor marketplace.

Its most important architectural decision is the separation of application data from financial data.

MongoDB manages user and catalogue documents, while PostgreSQL provides relational integrity for wallets, payment records and double-entry accounting.

The financial subsystem prioritises integer monetary values, balanced ledger transactions, idempotency, append-only records and reversal-based corrections.

The remaining marketplace features will extend this foundation toward the complete project specification.
