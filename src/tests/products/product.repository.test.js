
/**
 * PRODUCT REPOSITORY TESTS
 *
 * These tests verify that the Product repository
 * communicates correctly with the MongoDB model.
 *
 * MongoDB is mocked, so these tests do not modify
 * the actual database.
 */

// --------------------------------------------------
// STEP 1: MOCK THE PRODUCT MODEL
// --------------------------------------------------

jest.mock(
  '../../modules/products/models/product.model',
  () => ({

    // Mock the MongoDB create operation.
    create: jest.fn(),

    // Mock the MongoDB findById operation.
    findById: jest.fn(),

    // Mock the MongoDB find operation.
    find: jest.fn()

  })
);


// --------------------------------------------------
// STEP 2: IMPORT THE MOCK AND REPOSITORY
// --------------------------------------------------

// Import the mocked Product model.
const Product = require(
  '../../modules/products/models/product.model'
);

// Import the repository functions.
const {
  createProduct,
  findProductById,
  findProductsByVendor,
  findActiveProducts
} = require(
  '../../modules/products/repositories/product.repository'
);


// --------------------------------------------------
// STEP 3: DEFINE REUSABLE TEST DATA
// --------------------------------------------------

const testVendorId = '507f1f77bcf86cd799439011';

const testProductId = '507f1f77bcf86cd799439022';

const fakeProduct = {

  _id: testProductId,

  name: 'Wireless Bluetooth Headphones',

  category: 'Electronics',

  priceKobo: 2500000,

  status: 'active',

  vendor: testVendorId

};


// --------------------------------------------------
// STEP 4: RESET MOCKS BEFORE EVERY TEST
// --------------------------------------------------

beforeEach(() => {

  jest.clearAllMocks();

});


// --------------------------------------------------
// TEST 1: CREATE A PRODUCT
// --------------------------------------------------

test('creates a product using the Product model', async () => {

  Product.create.mockResolvedValue(fakeProduct);

  const result = await createProduct(fakeProduct);

  expect(Product.create).toHaveBeenCalledWith(fakeProduct);

  expect(result).toEqual(fakeProduct);

});


// --------------------------------------------------
// TEST 2: FIND A PRODUCT BY ID
// --------------------------------------------------

test('finds a product using its MongoDB ID', async () => {

  Product.findById.mockResolvedValue(fakeProduct);

  const result = await findProductById(testProductId);

  expect(Product.findById).toHaveBeenCalledWith(
    testProductId
  );

  expect(result).toEqual(fakeProduct);

});


// --------------------------------------------------
// TEST 3: FIND PRODUCTS BELONGING TO A VENDOR
// --------------------------------------------------

test('retrieves products belonging to a specific vendor', async () => {

  const vendorProducts = [fakeProduct];

  const sortMock = jest.fn().mockResolvedValue(
    vendorProducts
  );

  Product.find.mockReturnValue({
    sort: sortMock
  });

  const result = await findProductsByVendor(
    testVendorId
  );

  expect(Product.find).toHaveBeenCalledWith({

    vendor: testVendorId

  });

  expect(sortMock).toHaveBeenCalledWith({

    createdAt: -1

  });

  expect(result).toEqual(vendorProducts);

});


// --------------------------------------------------
// TEST 4: RETRIEVE ACTIVE MARKETPLACE PRODUCTS
// --------------------------------------------------

test('retrieves only active products for the marketplace', async () => {

  const activeProducts = [fakeProduct];

  const sortMock = jest.fn().mockResolvedValue(
    activeProducts
  );

  Product.find.mockReturnValue({
    sort: sortMock
  });

  const result = await findActiveProducts();

  // Public listings must exclude drafts and archived products.
  expect(Product.find).toHaveBeenCalledWith({

    status: 'active'

  });

  // Newest products should appear first.
  expect(sortMock).toHaveBeenCalledWith({

    createdAt: -1

  });

  expect(result).toEqual(activeProducts);

});


// --------------------------------------------------
// TEST 5: FILTER ACTIVE PRODUCTS BY CATEGORY
// --------------------------------------------------

test('filters active marketplace products by category', async () => {

  const electronicsProducts = [fakeProduct];

  const sortMock = jest.fn().mockResolvedValue(
    electronicsProducts
  );

  Product.find.mockReturnValue({
    sort: sortMock
  });

  const result = await findActiveProducts({

    category: 'Electronics'

  });

  // Both conditions must be applied.
  expect(Product.find).toHaveBeenCalledWith({

    status: 'active',

    category: 'Electronics'

  });

  expect(result).toEqual(electronicsProducts);

});
