/**
 * PRODUCT API TESTS
 *
 * These tests verify the complete Product creation
 * HTTP request path through Express.
 *
 * The Product service and authentication middleware
 * are mocked. No real database or JWT is required.
 */

// --------------------------------------------------
// STEP 1: MOCK EMAIL VERIFICATION DEPENDENCIES
// --------------------------------------------------

// Prevent unrelated email services from initializing.
jest.mock(
  '../../modules/auth/services/email-verification.service',
  () => ({
    verifyEmail: jest.fn(),
    resendVerificationEmail: jest.fn(),
    sendVerificationEmail: jest.fn()
  })
);


// --------------------------------------------------
// STEP 2: MOCK AUTHENTICATION MIDDLEWARE
// --------------------------------------------------

// Simulate an authenticated vendor.
// Individual tests can override the user's role.

jest.mock(
  '../../middleware/authenticate.middleware',
  () => ({
    authenticate: jest.fn((req, res, next) => {

      req.user = {
        id: '507f1f77bcf86cd799439011',
        role: 'vendor'
      };

      next();

    })
  })
);


// --------------------------------------------------
// STEP 3: MOCK THE PRODUCT SERVICE
// --------------------------------------------------

jest.mock(
  '../../modules/products/services/product.service',
  () => ({
    createProduct: jest.fn()
  })
);


// --------------------------------------------------
// STEP 4: IMPORT TEST DEPENDENCIES
// --------------------------------------------------

// Import Supertest for HTTP requests.
const request = require('supertest');

// Import the mocked authentication middleware.
const {
  authenticate
} = require('../../middleware/authenticate.middleware');

// Import the mocked Product service.
const {
  createProduct
} = require('../../modules/products/services/product.service');

// Import the Express application.
const app = require('../../app');


// --------------------------------------------------
// STEP 5: DEFINE REUSABLE TEST DATA
// --------------------------------------------------

// Authenticated vendor ID.
const testVendorId = '507f1f77bcf86cd799439011';

// Valid product information.
const validProductData = {

  name: 'Wireless Bluetooth Headphones',

  description:
    'High-quality wireless headphones with clear sound and long battery life.',

  category: 'Electronics',

  priceKobo: 2500000,

  stockQuantity: 20,

  imageUrls: [
    'https://example.com/headphones.jpg'
  ]

};

// Simulated product returned by the service.
const fakeProduct = {

  _id: 'product-test-001',

  ...validProductData,

  vendor: testVendorId,

  currency: 'NGN',

  status: 'draft'

};


// --------------------------------------------------
// STEP 6: RESET MOCKS BEFORE EVERY TEST
// --------------------------------------------------

beforeEach(() => {

  jest.clearAllMocks();

  // Restore the default authenticated vendor.
  authenticate.mockImplementation((req, res, next) => {

    req.user = {
      id: testVendorId,
      role: 'vendor'
    };

    next();

  });

  // Simulate successful Product creation.
  createProduct.mockResolvedValue(fakeProduct);

});


// --------------------------------------------------
// TEST 1: SUCCESSFUL VENDOR PRODUCT CREATION
// --------------------------------------------------

test('returns HTTP 201 when a vendor creates a product', async () => {

  const response = await request(app)
    .post('/api/products')
    .send(validProductData);

  expect(response.status).toBe(201);

  expect(response.body.success).toBe(true);

  expect(response.body.message).toBe(
    'Product created successfully.'
  );

  expect(response.body.data).toEqual(fakeProduct);

  // Confirm the authenticated vendor ID was used.
  expect(createProduct).toHaveBeenCalledWith({

    vendorId: testVendorId,

    productData: validProductData

  });

});


// --------------------------------------------------
// TEST 2: CUSTOMER CANNOT CREATE PRODUCTS
// --------------------------------------------------

test('returns HTTP 403 when a customer attempts product creation', async () => {

  // Simulate an authenticated customer.
  authenticate.mockImplementationOnce((req, res, next) => {

    req.user = {
      id: testVendorId,
      role: 'customer'
    };

    next();

  });

  const response = await request(app)
    .post('/api/products')
    .send(validProductData);

  expect(response.status).toBe(403);

  expect(response.body.success).toBe(false);

  // Authorization must stop the request before the service.
  expect(createProduct).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 3: INVALID PRODUCT NAME
// --------------------------------------------------

test('returns HTTP 400 when the product name is too short', async () => {

  const response = await request(app)
    .post('/api/products')
    .send({

      ...validProductData,

      name: 'AB'

    });

  expect(response.status).toBe(400);

  expect(response.body.success).toBe(false);

  expect(createProduct).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 4: INVALID PRODUCT PRICE
// --------------------------------------------------

test('returns HTTP 400 when the product price is invalid', async () => {

  const response = await request(app)
    .post('/api/products')
    .send({

      ...validProductData,

      priceKobo: -5000

    });

  expect(response.status).toBe(400);

  expect(response.body.success).toBe(false);

  expect(createProduct).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 5: REJECT SERVER-CONTROLLED FIELDS
// --------------------------------------------------

test('rejects vendor-supplied ownership and publication fields', async () => {

  const response = await request(app)
    .post('/api/products')
    .send({

      ...validProductData,

      vendor: '507f1f77bcf86cd799439099',

      status: 'active',

      currency: 'USD'

    });

  expect(response.status).toBe(400);

  expect(response.body.success).toBe(false);

  expect(createProduct).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 6: PRODUCT SERVICE ERROR
// --------------------------------------------------

test('returns the service error when product creation fails', async () => {

  createProduct.mockRejectedValue(

    Object.assign(
      new Error('Product database operation failed.'),
      {
        statusCode: 500,
        code: 'PRODUCT_CREATION_FAILED'
      }
    )

  );

  const response = await request(app)
    .post('/api/products')
    .send(validProductData);

  expect(response.status).toBe(500);

  expect(response.body.success).toBe(false);

  expect(response.body.code).toBe(
    'PRODUCT_CREATION_FAILED'
  );

});


// --------------------------------------------------
// TEST 7: UNEXPECTED INTERNAL ERROR
// --------------------------------------------------

test('does not expose unexpected internal errors', async () => {

  createProduct.mockRejectedValue(

    new Error('Sensitive internal database information.')

  );

  // Suppress the expected controller error log.
  const consoleErrorSpy = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  try {

    const response = await request(app)
      .post('/api/products')
      .send(validProductData);

    expect(response.status).toBe(500);

    expect(response.body.success).toBe(false);

    expect(response.body.message).toBe(
      'An unexpected error occurred while creating the product.'
    );

    expect(response.body.message).not.toContain(
      'Sensitive internal database information.'
    );

  } finally {

    consoleErrorSpy.mockRestore();

  }

});


// --------------------------------------------------
// TEST 8: UNKNOWN PRODUCT ENDPOINT
// --------------------------------------------------

test('returns HTTP 404 for an unknown Product endpoint', async () => {

  const response = await request(app)
    .post('/api/products/unknown-endpoint')
    .send({});

  expect(response.status).toBe(404);

  expect(response.body.success).toBe(false);

});