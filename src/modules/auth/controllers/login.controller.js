// Load the login validation schema.
const {
  loginSchema
} = require('../validators/login.validator');

// Load the login business logic.
const {
  loginUser
} = require('../services/login.service');

// Handle user login requests.
async function loginController(req, res) {
  try {
    // STEP 1: VALIDATE THE REQUEST BODY.

    const validationResult = loginSchema.safeParse(req.body);

    // Stop if the submitted information is invalid.
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Login validation failed.',
        errors: validationResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    // STEP 2: AUTHENTICATE THE USER.

    const loginResult = await loginUser(
      validationResult.data
    );

    // STEP 3: RETURN THE SUCCESS RESPONSE.

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: loginResult.user,
        accessToken: loginResult.accessToken,
        refreshToken: loginResult.refreshToken
      }
    });

  } catch (error) {
    // STEP 4: HANDLE LOGIN ERRORS.

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }

    // Log unexpected errors for server-side investigation.
    console.error('Login controller error:', error);

    // Do not expose internal database or server details.
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred during login.'
    });
  }
}

// Export the login controller.
module.exports = { loginController };