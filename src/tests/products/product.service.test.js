/**
 * PRODUCT SERVICE TESTS
 *
 * These tests verify:
 * 1. Vendor authentication.
 * 2. Product data validation at service level.
 * 3. Successful product creation.
 * 4. Server-controlled ownership, currency and status.
 *
 * The Product repository is mocked.
 * No real MongoDB operations occur.
 */

// --------------------------------------------------
// STEP 1: MOCK THE PRODUCT REPOSITORY
// --------------------------------------------------

jest.mock(
  '../../modules/products/repositories/product.repository',
  () => ({
    createProduct: jest.fn()
  })
);


// --------------------------------------------------
// STEP 2: IMPORT THE MOCKED REPOSITORY
// --------------------------------------------------

const {
  createProduct: saveProduct
} = require(
  '../../modules/products/repositories/product.repository'
);


// --------------------------------------------------
// STEP 3: IMPORT THE SERVICE UNDER TEST
// --------------------------------------------------

const {
  createProduct
} = require(
  '../../modules/products/services/product.service'
);


// --------------------------------------------------
// STEP 4: DEFINE REUSABLE TEST DATA
// --------------------------------------------------

// A sample authenticated vendor ID.
const testVendorId = '507f1f77bcf86cd799439011';

// A different vendor ID used to test ownership protection.
const anotherVendorId = '507f1f77bcf86cd799439099';

// Valid product information supplied by a vendor.
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

// Fake product returned by the repository.
const fakeSavedProduct = {

  _id: 'product-test-001',

  ...validProductData,

  vendor: testVendorId,

  currency: 'NGN',

  status: 'draft'

};


// --------------------------------------------------
// STEP 5: RESET MOCKS BEFORE EVERY TEST
// --------------------------------------------------

beforeEach(() => {

  // Clear previous mock calls and implementations.
  jest.clearAllMocks();

  // Simulate successful product creation.
  saveProduct.mockResolvedValue(fakeSavedProduct);

});


// --------------------------------------------------
// TEST 1: SUCCESSFUL PRODUCT CREATION
// --------------------------------------------------

test('creates a product successfully for an authenticated vendor', async () => {

  const result = await createProduct({

    vendorId: testVendorId,

    productData: validProductData

  });

  // Confirm the repository received the product information.
  expect(saveProduct).toHaveBeenCalledWith({

    ...validProductData,

    vendor: testVendorId,

    currency: 'NGN',

    status: 'draft'

  });

  // Confirm the saved product is returned.
  expect(result).toEqual(fakeSavedProduct);

});


// --------------------------------------------------
// TEST 2: MISSING VENDOR ID
// --------------------------------------------------

test('rejects product creation without a vendor ID', async () => {

  await expect(

    createProduct({

      vendorId: '',

      productData: validProductData

    })

  ).rejects.toMatchObject({

    statusCode: 401,

    code: 'VENDOR_AUTHENTICATION_REQUIRED'

  });

  // The repository must not be called.
  expect(saveProduct).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 3: MISSING PRODUCT DATA
// --------------------------------------------------

test('rejects product creation without product data', async () => {

  await expect(

    createProduct({

      vendorId: testVendorId,

      productData: null

    })

  ).rejects.toMatchObject({

    statusCode: 400,

    code: 'INVALID_PRODUCT_DATA'

  });

  expect(saveProduct).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 4: PRODUCT DATA MUST BE AN OBJECT
// --------------------------------------------------

test.each([

  undefined,

  null,

  'invalid product',

  123,

  []

])('rejects invalid product data: %s', async (invalidData) => {

  await expect(

    createProduct({

      vendorId: testVendorId,

      productData: invalidData

    })

  ).rejects.toMatchObject({

    statusCode: 400,

    code: 'INVALID_PRODUCT_DATA'

  });

  expect(saveProduct).not.toHaveBeenCalled();

});


// --------------------------------------------------
// TEST 5: SERVER CONTROLS PRODUCT OWNERSHIP
// --------------------------------------------------

test('overwrites a vendor ID supplied inside product data', async () => {

  const result = await createProduct({

    vendorId: testVendorId,

    productData: {

      ...validProductData,

      vendor: anotherVendorId

    }

  });

  // The authenticated vendor must own the product.
  expect(saveProduct).toHaveBeenCalledWith(

    expect.objectContaining({

      vendor: testVendorId

    })

  );

  expect(result.vendor).toBe(testVendorId);

});


// --------------------------------------------------
// TEST 6: SERVER CONTROLS PRODUCT CURRENCY
// --------------------------------------------------

test('always assigns NGN as the product currency', async () => {

  await createProduct({

    vendorId: testVendorId,

    productData: {

      ...validProductData,

      currency: 'USD'

    }

  });

  expect(saveProduct).toHaveBeenCalledWith(

    expect.objectContaining({

      currency: 'NGN'

    })

  );

});


// --------------------------------------------------
// TEST 7: NEW PRODUCTS MUST START AS DRAFTS
// --------------------------------------------------

test('always creates new products with draft status', async () => {

  await createProduct({

    vendorId: testVendorId,

    productData: {

      ...validProductData,

      status: 'active'

    }

  });

  expect(saveProduct).toHaveBeenCalledWith(

    expect.objectContaining({

      status: 'draft'

    })

  );

});


// --------------------------------------------------
// TEST 8: DATABASE FAILURE
// --------------------------------------------------

test('returns a controlled error when product creation fails', async () => {

  // Simulate a MongoDB failure.
  saveProduct.mockRejectedValue(

    new Error('Simulated database failure.')

  );

  // Temporarily suppress the expected console error.
  const consoleErrorSpy = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  try {

    await expect(

      createProduct({

        vendorId: testVendorId,

        productData: validProductData

      })

    ).rejects.toMatchObject({

      statusCode: 500,

      code: 'PRODUCT_CREATION_FAILED'

    });

  } finally {

    // Restore the original console.error function.
    consoleErrorSpy.mockRestore();

  }

});