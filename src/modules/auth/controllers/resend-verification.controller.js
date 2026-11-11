
// Load the validation schema for resend requests.
const {
  resendVerificationSchema
} = require('../validators/resend-verification.validator');

// Load the email verification service.
const {
  resendVerificationEmail
} = require('../services/email-verification.service');

// Handle requests to resend verification emails.
async function resendVerificationController(req, res) {
  try {
    // STEP 1: VALIDATE THE EMAIL ADDRESS.

    const validationResult = resendVerificationSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Email address validation failed.',
        errors: validationResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    // STEP 2: REQUEST ANOTHER VERIFICATION EMAIL.
    //
    // The service will handle missing accounts and already-verified
    // accounts without revealing their status to the caller.

    try {
      await resendVerificationEmail(validationResult.data);
    } catch (error) {
      // Log delivery or internal errors without exposing account details.
      console.error('Resend verification request error:', error);
    }

    // STEP 3: ALWAYS RETURN THE SAME RESPONSE.
    //
    // This prevents attackers from discovering registered email addresses.

    return res.status(202).json({
      success: true,
      message: 'If an unverified account exists for this email address, a verification link will be sent.'
    });

  } catch (error) {
    // Handle unexpected controller errors.
    console.error('Resend verification controller error:', error);

    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred. Please try again later.'
    });
  }
}

// Export the controller.
module.exports = { resendVerificationController };
