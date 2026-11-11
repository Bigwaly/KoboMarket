
// Load the email verification validation schema.
const {
  verifyEmailSchema
} = require('../validators/verify-email.validator');

// Load the email verification business logic.
const {
  verifyEmail
} = require('../services/email-verification.service');

// Handle email verification requests.
async function verifyEmailController(req, res) {
  try {
    // STEP 1: VALIDATE THE REQUEST BODY.

    const validationResult = verifyEmailSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Email verification validation failed.',
        errors: validationResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    // STEP 2: VERIFY THE CUSTOMER'S EMAIL.

    const verifiedUser = await verifyEmail(validationResult.data);

    // STEP 3: RETURN THE SUCCESS RESPONSE.

    return res.status(200).json({
      success: true,
      message: 'Your email address has been verified successfully.',
      data: {
        user: verifiedUser
      }
    });

  } catch (error) {
    // STEP 4: HANDLE KNOWN VERIFICATION ERRORS.

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }

    // Log unexpected errors for investigation.
    console.error('Email verification controller error:', error);

    // Return a generic server error.
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred during email verification.'
    });
  }
}

// Export the controller.
module.exports = { verifyEmailController };
