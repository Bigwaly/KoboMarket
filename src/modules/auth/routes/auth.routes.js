
// Import Express Router.
const express = require('express');

// Create an Express router.
const router = express.Router();

// Import authentication controllers.
const {
  registerController
} = require('../controllers/register.controller');

const {
  loginController
} = require('../controllers/login.controller');

const {
  verifyEmailController
} = require('../controllers/verify-email.controller');

const {
  resendVerificationController
} = require('../controllers/resend-verification.controller');

// Import authentication rate-limit middleware.
const {
  loginRateLimit,
  verifyEmailRateLimit,
  resendVerificationRateLimit
} = require('../../../middleware/auth-rate-limit.middleware');

// =====================================================
// USER REGISTRATION
// =====================================================
//
// POST /api/auth/register
//
// Public endpoint. New users can create accounts.

router.post('/register', registerController);

// =====================================================
// USER LOGIN
// =====================================================
//
// POST /api/auth/login
//
// Public endpoint protected by login rate limiting.
//
// Successful login returns an access token and
// a refresh token.

router.post(
  '/login',
  loginRateLimit,
  loginController
);

// =====================================================
// EMAIL VERIFICATION
// =====================================================
//
// POST /api/auth/verify-email
//
// Public endpoint protected by verification rate limiting.

router.post(
  '/verify-email',
  verifyEmailRateLimit,
  verifyEmailController
);

// =====================================================
// RESEND EMAIL VERIFICATION
// =====================================================
//
// POST /api/auth/resend-verification
//
// Public endpoint protected by resend rate limiting.

router.post(
  '/resend-verification',
  resendVerificationRateLimit,
  resendVerificationController
);

// Export the authentication router.
module.exports = router;
