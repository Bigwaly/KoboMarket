// Import Express Router.
const express = require('express');

// Create the payment router.
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
// STEP 4: IMPORT PAYMENT VALIDATION SCHEMA
// --------------------------------------------------

const {
  initializePaymentSchema
} = require('../validators/initialize-payment.validator');


// --------------------------------------------------
// STEP 5: IMPORT PAYMENT CONTROLLER
// --------------------------------------------------

const {
  initializePaymentController
} = require('../controllers/initialize-payment.controller');

// --------------------------------------------------
// STEP 6: IMPORT PAYMENT VERIFICATION VALIDATOR
// --------------------------------------------------

const {
  verifyPaymentSchema
} = require('../validators/verify-payment.validator');


// --------------------------------------------------
// STEP 7: IMPORT PAYMENT VERIFICATION CONTROLLER
// --------------------------------------------------

const {
  verifyPaymentController
} = require('../controllers/verify-payment.controller');

// --------------------------------------------------
// STEP 8: CUSTOMER PAYMENT INITIALIZATION
// --------------------------------------------------
//
// POST /api/payments/initialize
//
// Middleware execution order:
//
// 1. Authenticate the access token.
// 2. Confirm that the user has the customer role.
// 3. Validate the payment request.
// 4. Initialize the Paystack checkout.

router.post(
  '/initialize',
  authenticate,
  authorizeRoles('customer'),
  validateRequest(initializePaymentSchema),
  initializePaymentController
);

// --------------------------------------------------
// STEP 9: CUSTOMER PAYMENT VERIFICATION
// --------------------------------------------------
//
// POST /api/payments/verify
//
// Middleware execution order:
//
// 1. Authenticate the customer's access token.
// 2. Confirm that the user has the customer role.
// 3. Validate the Paystack payment reference.
// 4. Verify the transaction and fund the wallet.

router.post(
  '/verify',
  authenticate,
  authorizeRoles('customer'),
  validateRequest(verifyPaymentSchema),
  verifyPaymentController
);

// Export the payment router.
module.exports = router;
