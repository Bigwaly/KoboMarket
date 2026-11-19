
// Import the MongoDB Product model.
const Product = require('../models/product.model');

// --------------------------------------------------
// STEP 1: CREATE A NEW PRODUCT
// --------------------------------------------------

async function createProduct(productData) {

  // Create and save a new product document.
  const product = await Product.create(productData);

  // Return the saved product.
  return product;

}

// --------------------------------------------------
// STEP 2: FIND A PRODUCT BY ITS ID
// --------------------------------------------------

async function findProductById(productId) {

  // Search MongoDB using the product's unique ID.
  const product = await Product.findById(productId);

  // Return the matching product or null.
  return product;

}

// --------------------------------------------------
// STEP 3: FIND PRODUCTS BELONGING TO A VENDOR
// --------------------------------------------------

async function findProductsByVendor(vendorId) {

  // Retrieve only products owned by the specified vendor.
  // Newest products appear first.
  const products = await Product.find({
    vendor: vendorId
  }).sort({
    createdAt: -1
  });

  // Return the vendor's products.
  return products;

}

// --------------------------------------------------
// STEP 4: FIND ACTIVE PRODUCTS FOR THE MARKETPLACE
// --------------------------------------------------

async function findActiveProducts(filters = {}) {

  // Build the database filter.
  // Active status is mandatory for public listings.
  const query = {
    status: 'active'
  };

  // Filter by category when one is provided.
  if (filters.category) {

    query.category = filters.category;

  }

  // Retrieve active products from MongoDB.
  // Newest products appear first.
  const products = await Product.find(query)
    .sort({
      createdAt: -1
    });

  // Return the matching marketplace products.
  return products;

}

// --------------------------------------------------
// STEP 5: EXPORT REPOSITORY OPERATIONS
// --------------------------------------------------

module.exports = {
  createProduct,
  findProductById,
  findProductsByVendor,
  findActiveProducts
};
