// Import the product creation business logic.
const {
  createProduct
} = require('../services/product.service');


// --------------------------------------------------
// CREATE VENDOR PRODUCT CONTROLLER
// --------------------------------------------------
//
// POST /api/products
//
// This controller receives an authenticated vendor's
// product information and delegates product creation
// to the Product service.

async function createProductController(req, res) {

  try {

    // STEP 1:
    // Create the product using the authenticated
    // vendor's ID and validated request information.
    //
    // Never accept the vendor ID from req.body.
    // The authenticated user is the trusted source.

    const product = await createProduct({

      vendorId: req.user.id,

      productData: req.body

    });


    // STEP 2:
    // Return HTTP 201 because a new product
    // resource has been successfully created.

    return res.status(201).json({

      success: true,

      message: 'Product created successfully.',

      data: product

    });

  } catch (error) {

    // STEP 3:
    // Return known service and validation errors.

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
      'Product creation controller error:',
      error
    );


    // Do not expose internal database or server details.

    return res.status(500).json({

      success: false,

      message: 'An unexpected error occurred while creating the product.'

    });

  }

}


// Export the Product controller.
module.exports = {
  createProductController
};