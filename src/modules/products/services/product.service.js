// Import the Product repository.
const {
  createProduct: saveProduct
} = require('../repositories/product.repository');

// --------------------------------------------------
// STEP 1: CREATE A STANDARD PRODUCT SERVICE ERROR
// --------------------------------------------------

function createProductError(message, statusCode, code) {

  // Create a normal JavaScript error.
  const error = new Error(message);

  // Attach the HTTP status code.
  error.statusCode = statusCode;

  // Attach a machine-readable error code.
  error.code = code;

  // Return the completed error.
  return error;

}

// --------------------------------------------------
// STEP 2: CREATE A NEW PRODUCT
// --------------------------------------------------

async function createProduct({ vendorId, productData }) {

  // STEP 2A: VERIFY THAT THE VENDOR ID WAS PROVIDED.

  if (!vendorId) {

    throw createProductError(
      'An authenticated vendor ID is required.',
      401,
      'VENDOR_AUTHENTICATION_REQUIRED'
    );

  }

  // STEP 2B: VERIFY THAT PRODUCT DATA WAS PROVIDED.

  if (
    !productData ||
    typeof productData !== 'object' ||
    Array.isArray(productData)
  ) {

    throw createProductError(
      'Valid product information is required.',
      400,
      'INVALID_PRODUCT_DATA'
    );

  }

  // STEP 2C: PREPARE TRUSTED PRODUCT INFORMATION.

  // Ownership, currency and publication status are
  // controlled by the server, not the vendor request.
  const productToSave = {

    ...productData,

    vendor: vendorId,

    currency: 'NGN',

    status: 'draft'

  };

  // STEP 2D: SAVE THE PRODUCT THROUGH THE REPOSITORY.

  try {

    const product = await saveProduct(productToSave);

    // Return the newly created product.
    return product;

  } catch (error) {

    // Handle unexpected product database failures.
    console.error(
      'Product creation failed:',
      error.message
    );

    throw createProductError(
      'We could not create your product. Please try again.',
      500,
      'PRODUCT_CREATION_FAILED'
    );

  }

}

// --------------------------------------------------
// STEP 3: EXPORT PRODUCT SERVICE OPERATIONS
// --------------------------------------------------

module.exports = {
  createProduct,
  createProductError
};
