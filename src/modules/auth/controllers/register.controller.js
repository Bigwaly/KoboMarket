
// Load the registration validation schema.
const {
  registerSchema
} = require('../validators/register.validator');

// Load the registration business logic.
const {
  registerUser
} = require('../services/register.service');

// Handle new customer registration.
async function registerController(req, res) {
  try {
    // STEP 1: VALIDATE THE REQUEST BODY.

    const validationResult = registerSchema.safeParse(req.body);

    // Stop if the submitted information is invalid.
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Registration validation failed.',
        errors: validationResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    // STEP 2: REGISTER THE CUSTOMER.

    const registrationResult = await registerUser(
      validationResult.data
    );

    // Extract the safe customer information.
    const {
      user,
      verificationEmailSent
    } = registrationResult;

    // STEP 3: PREPARE THE RESPONSE MESSAGE.

    const responseMessage = verificationEmailSent
      ? 'Your account has been created successfully. Please check your email to verify your account.'
      : 'Your account has been created successfully, but we could not send the verification email. Please request another verification email.';

    // STEP 4: RETURN THE SUCCESS RESPONSE.

    return res.status(201).json({
      success: true,
      message: responseMessage,
      data: {
        user,
        verificationEmailSent
      }
    });

  } catch (error) {
    // STEP 5: HANDLE REGISTRATION ERRORS.

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }

    // Log unexpected errors for server-side investigation.
    console.error('Registration controller error:', error);

    // Do not expose internal database or server details.
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred during registration.'
    });
  }
}

// Export the registration controller.
module.exports = { registerController };
