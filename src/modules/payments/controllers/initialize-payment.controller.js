// Import the payment initialization business logic.
const {
  initializePayment
} = require('../services/initialize-payment.service');


// --------------------------------------------------
// INITIALIZE CUSTOMER PAYMENT CONTROLLER
// --------------------------------------------------
//
// POST /api/payments/initialize
//
// This controller receives an authenticated customer's
// payment request and delegates the business logic
// to the payment initialization service.

async function initializePaymentController(req, res) {

  try {

    // STEP 1:
    // Initialize the payment using the authenticated
    // customer's ID and validated request information.

    const paymentResult = await initializePayment({

      userId: req.user.id,

      amount: req.body.amount,

      idempotencyKey: req.body.idempotencyKey

    });


    // STEP 2:
    // Return the checkout information.
    //
    // A newly created payment attempt returns HTTP 201.
    // A previously created checkout returns HTTP 200.

    return res
      .status(paymentResult.reused ? 200 : 201)
      .json({

        success: true,

        message: paymentResult.reused
          ? 'Existing payment checkout retrieved successfully.'
          : 'Payment initialized successfully.',

        data: paymentResult

      });

  } catch (error) {

    // STEP 3:
    // Return known payment or validation errors.

    if (error.statusCode) {

      return res.status(error.statusCode).json({

        success: false,

        code: error.code,

        message: error.message

      });

    }


    // STEP 4:
    // Log unexpected errors for server-side investigation.

    console.error(
      'Payment initialization controller error:',
      error
    );


    // Do not expose internal database, provider,
    // or server implementation details.

    return res.status(500).json({

      success: false,

      message: 'An unexpected error occurred while initializing the payment.'

    });

  }

}


// Export the payment initialization controller.
module.exports = {
  initializePaymentController
};
