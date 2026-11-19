// Load Mongoose to define the Product model.
const mongoose = require('mongoose');

// --------------------------------------------------
// STEP 1: DEFINE THE PRODUCT SCHEMA
// --------------------------------------------------

const productSchema = new mongoose.Schema(

  {

    // --------------------------------------------------
    // STEP 1A: PRODUCT OWNERSHIP
    // --------------------------------------------------

    // Every product must belong to an existing vendor.
    // The reference points to the MongoDB User collection.
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Product vendor is required.'],
      index: true
    },

    // --------------------------------------------------
    // STEP 1B: PRODUCT INFORMATION
    // --------------------------------------------------

    // Store the product name.
    name: {
      type: String,
      required: [true, 'Product name is required.'],
      trim: true,
      minlength: 3,
      maxlength: 150
    },

    // Store the product description.
    description: {
      type: String,
      required: [true, 'Product description is required.'],
      trim: true,
      minlength: 20,
      maxlength: 5000
    },

    // Store the product category.
    category: {
      type: String,
      required: [true, 'Product category is required.'],
      trim: true,
      minlength: 2,
      maxlength: 80
    },

    // --------------------------------------------------
    // STEP 1C: PRODUCT PRICING
    // --------------------------------------------------

    // Store the product price in kobo.
    //
    // Example:
    // ₦5,000 = 500000 kobo.
    //
    // Integer kobo prevents floating-point rounding
    // errors in financial calculations.
    priceKobo: {
      type: Number,
      required: [true, 'Product price is required.'],
      min: [1, 'Product price must be greater than zero.'],
      validate: {
        validator: Number.isSafeInteger,
        message: 'Product price must be a safe integer in kobo.'
      }
    },

    // KoboMarket initially supports Nigerian naira.
    currency: {
      type: String,
      enum: ['NGN'],
      default: 'NGN',
      required: true
    },

    // --------------------------------------------------
    // STEP 1D: INVENTORY
    // --------------------------------------------------

    // Track the quantity available for purchase.
    stockQuantity: {
      type: Number,
      required: [true, 'Product stock quantity is required.'],
      min: [0, 'Stock quantity cannot be negative.'],
      validate: {
        validator: Number.isSafeInteger,
        message: 'Stock quantity must be a whole number.'
      },
      default: 0
    },

    // --------------------------------------------------
    // STEP 1E: PRODUCT PUBLICATION STATUS
    // --------------------------------------------------

    // Products start as drafts.
    //
    // Only active products should be available
    // for customer marketplace browsing.
    status: {
      type: String,
      enum: ['draft', 'active', 'archived'],
      default: 'draft',
      required: true,
      index: true
    },

    // --------------------------------------------------
    // STEP 1F: PRODUCT IMAGES
    // --------------------------------------------------

    // Store image URLs for the product.
    // Image uploads will be implemented separately.
    imageUrls: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 2048
        }
      ],
      default: [],
      validate: {
        validator: (images) => images.length <= 8,
        message: 'A product cannot have more than 8 images.'
      }
    }

  },

  {

    // Automatically maintain createdAt and updatedAt.
    timestamps: true

  }

);

// --------------------------------------------------
// STEP 2: DEFINE DATABASE INDEXES
// --------------------------------------------------

// Improve vendor product-management queries.
productSchema.index({
  vendor: 1,
  createdAt: -1
});

// Improve public marketplace category filtering.
productSchema.index({
  status: 1,
  category: 1,
  createdAt: -1
});

// Support product name and description searches.
productSchema.index({
  name: 'text',
  description: 'text'
});

// --------------------------------------------------
// STEP 3: EXPORT THE PRODUCT MODEL
// --------------------------------------------------

// Reuse the existing model if Mongoose has already
// registered it.
const Product =
  mongoose.models.Product ||
  mongoose.model('Product', productSchema);

// Export the Product model.
module.exports = Product;
