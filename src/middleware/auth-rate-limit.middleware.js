
// Import the rateLimit function from express-rate-limit.
const {
  rateLimit
} = require('express-rate-limit');

// =====================================================
// LOGIN RATE LIMITER
// =====================================================
//
// Allows a maximum of 5 login attempts from the same IP
// address within 15 minutes.
//
// This helps protect customer and administrator accounts
// against automated password-guessing attacks.

const loginRateLimit = rateLimit({
  // Time window: 15 minutes.
  windowMs: 15 * 60 * 1000,

  // Maximum login requests allowed during the window.
  limit: 5,

  // Return modern rate-limit headers.
  standardHeaders: 'draft-8',

  // Disable older rate-limit headers.
  legacyHeaders: false,

  // Return a consistent JSON response.
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.'
  }
});

// =====================================================
// EMAIL VERIFICATION RATE LIMITER
// =====================================================
//
// Allows a maximum of 10 verification attempts
// from the same IP address within 15 minutes.
//
// This helps reduce automated token-guessing attempts.

const verifyEmailRateLimit = rateLimit({
  // Time window: 15 minutes.
  windowMs: 15 * 60 * 1000,

  // Maximum requests allowed during the window.
  limit: 10,

  // Return modern rate-limit headers.
  standardHeaders: 'draft-8',

  // Disable older rate-limit headers.
  legacyHeaders: false,

  // Return a consistent JSON response.
  message: {
    success: false,
    message: 'Too many email verification attempts. Please try again later.'
  }
});

// =====================================================
// RESEND VERIFICATION RATE LIMITER
// =====================================================
//
// Allows a maximum of 3 resend requests
// from the same IP address within 15 minutes.
//
// This protects our Resend email quota.

const resendVerificationRateLimit = rateLimit({
  // Time window: 15 minutes.
  windowMs: 15 * 60 * 1000,

  // Maximum requests allowed during the window.
  limit: 3,

  // Return modern rate-limit headers.
  standardHeaders: 'draft-8',

  // Disable older rate-limit headers.
  legacyHeaders: false,

  // Return a consistent JSON response.
  message: {
    success: false,
    message: 'Too many verification email requests. Please try again after 15 minutes.'
  }
});

// Export all three middleware functions.
module.exports = {
  loginRateLimit,
  verifyEmailRateLimit,
  resendVerificationRateLimit
};
