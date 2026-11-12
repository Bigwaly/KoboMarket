// Validate incoming request data using a Zod schema.

// Create reusable request validation middleware.
function validateRequest(schema, property = 'body') {

  // Return the Express middleware function.
  return function (req, res, next) {

    // Validate the selected request property.
    const validationResult = schema.safeParse(
      req[property]
    );

    // Stop processing when validation fails.
    if (!validationResult.success) {

      return res.status(400).json({

        success: false,

        message: 'Request validation failed.',

        errors: validationResult.error.issues.map((issue) => ({

          // Identify the invalid field.
          field: issue.path.join('.'),

          // Explain why the field is invalid.
          message: issue.message

        }))

      });

    }

    // Replace the original request data with
    // the validated and transformed data.
    req[property] = validationResult.data;

    // Continue to the next middleware or controller.
    next();

  };

}

// Export the reusable validation middleware.
module.exports = {
  validateRequest
};
