// Load Zod for product request validation.
const { z } = require('zod');

// --------------------------------------------------
// STEP 1: DEFINE THE PRODUCT CREATION SCHEMA
// --------------------------------------------------

const createProductSchema = z.object({

  // --------------------------------------------------
  // STEP 1A: PRODUCT NAME
  // --------------------------------------------------

  // Require a product name.
  name: z
    .string({
      error: 'Product name must be a string.'
    })
    .trim()
    .min(3, 'Product name must contain at least 3 characters.')
    .max(150, 'Product name cannot exceed 150 characters.'),

  // --------------------------------------------------
  // STEP 1B: PRODUCT DESCRIPTION
  // --------------------------------------------------

  // Require a meaningful product description.
  description: z
    .string({
      error: 'Product description must be a string.'
    })
    .trim()
    .min(20, 'Product description must contain at least 20 characters.')
    .max(5000, 'Product description cannot exceed 5000 characters.'),

  // --------------------------------------------------
  // STEP 1C: PRODUCT CATEGORY
  // --------------------------------------------------

  // Require the product category.
  category: z
    .string({
      error: 'Product category must be a string.'
    })
    .trim()
    .min(2, 'Product category must contain at least 2 characters.')
    .max(80, 'Product category cannot exceed 80 characters.'),

  // --------------------------------------------------
  // STEP 1D: PRODUCT PRICE
  // --------------------------------------------------

  // Accept the price directly in kobo.
  //
  // Example:
  // ₦5,000 = 500000 kobo.
  //
  // Using integer kobo avoids floating-point
  // rounding errors in financial calculations.
  priceKobo: z
    .number({
      error: 'Product price must be a number.'
    })
    .int('Product price must be a whole number in kobo.')
    .positive('Product price must be greater than zero.')
    .safe('Product price exceeds the supported limit.'),

  // --------------------------------------------------
  // STEP 1E: INITIAL STOCK QUANTITY
  // --------------------------------------------------

  // Require a whole-number stock quantity.
  stockQuantity: z
    .number({
      error: 'Stock quantity must be a number.'
    })
    .int('Stock quantity must be a whole number.')
    .nonnegative('Stock quantity cannot be negative.')
    .safe('Stock quantity exceeds the supported limit.'),

  // --------------------------------------------------
  // STEP 1F: PRODUCT IMAGE URLS
  // --------------------------------------------------

  // Allow vendors to provide up to eight image URLs.
  //
  // Image uploads will be implemented separately.
  // Each supplied URL must be valid.
  imageUrls: z
    .array(
      z
        .string()
        .url('Each product image must have a valid URL.')
        .max(2048, 'Product image URL is too long.')
    )
    .max(8, 'A product cannot have more than 8 images.')
    .optional()

})

// Reject fields that are not explicitly allowed.
.strict();

// --------------------------------------------------
// STEP 2: EXPORT THE PRODUCT CREATION SCHEMA
// --------------------------------------------------

module.exports = {
  createProductSchema
};
