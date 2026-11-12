// --------------------------------------------------
// IMPORT PAYMENT VERIFICATION BUSINESS LOGIC
// --------------------------------------------------

const {
  verifyPayment
} = require('../services/verify-payment.service');


// --------------------------------------------------
// CUSTOMER PAYMENT VERIFICATION CONTROLLER
// --------------------------------------------------
//
// POST /api/payments/verify
//
// This controller:
// 1. Receives the validated Paystack reference.
// 2. Gets the authenticated customer's ID.
// 3. Calls the payment verification service.
// 4. Returns the verification result to the customer.

async function verifyPaymentController(req, res) {

  try {

    // STEP 1:
    // Verify the payment using the authenticated
    // customer's ID and the supplied payment reference.

    const paymentResult = await verifyPayment({

      userId: req.user.id,

      reference: req.body.reference

    });


    // STEP 2:
    // Return the payment verification result.
    //
    // HTTP 200 is appropriate for both a newly
    // verified payment and an already completed payment.

    return res.status(200).json({

      success: true,

      message: paymentResult.message,

      data: paymentResult

    });

  } catch (error) {

    // STEP 3:
    // Return known payment and validation errors.

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
      'Payment verification controller error:',
      error
    );


    // Do not expose internal database, provider,
    // or server implementation details.

    return res.status(500).json({

      success: false,

      message: 'An unexpected error occurred while verifying the payment.'

    });

  }

}


// --------------------------------------------------
// EXPORT PAYMENT VERIFICATION CONTROLLER
// --------------------------------------------------

module.exports = {
  verifyPaymentController
};