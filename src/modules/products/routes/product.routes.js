// Import Express Router.
const express = require('express');

// Create the Product router.
const router = express.Router();


// --------------------------------------------------
// STEP 1: IMPORT AUTHENTICATION MIDDLEWARE
// --------------------------------------------------

const {
  authenticate
} = require('../../../middleware/authenticate.middleware');


// --------------------------------------------------
// STEP 2: IMPORT ROLE AUTHORIZATION MIDDLEWARE
// --------------------------------------------------

const {
  authorizeRoles
} = require('../../../middleware/authorize-roles.middleware');


// --------------------------------------------------
// STEP 3: IMPORT REQUEST VALIDATION MIDDLEWARE
// --------------------------------------------------

const {
  validateRequest
} = require('../../../middleware/validate-request.middleware');


// --------------------------------------------------
// STEP 4: IMPORT PRODUCT VALIDATION SCHEMA
// --------------------------------------------------

const {
  createProductSchema
} = require('../validators/create-product.validator');


// --------------------------------------------------
// STEP 5: IMPORT PRODUCT CONTROLLER
// --------------------------------------------------

const {
  createProductController
} = require('../controllers/create-product.controller');


// --------------------------------------------------
// STEP 6: VENDOR PRODUCT CREATION
// --------------------------------------------------
//
// POST /api/products
//
// Middleware execution order:
//
// 1. Authenticate the user's access token.
// 2. Confirm that the user has the vendor role.
// 3. Validate the submitted product information.
// 4. Create the product.
//
// Product ownership, currency and publication status
// are assigned by the server, not the request body.

router.post(
  '/',
  authenticate,
  authorizeRoles('vendor'),
  validateRequest(createProductSchema),
  createProductController
);


// --------------------------------------------------
// STEP 7: EXPORT PRODUCT ROUTER
// --------------------------------------------------

module.exports = router;