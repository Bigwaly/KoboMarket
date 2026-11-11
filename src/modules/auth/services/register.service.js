
// Load bcryptjs to securely hash user passwords.
const bcrypt = require('bcryptjs');

// Load the MongoDB User model.
const User = require('../../users/models/user.model');

// Load the PostgreSQL wallet service.
const {
  createWallet,
  getWalletByUserId
} = require('../../wallet/services/wallet.service');

// Load the email verification service.
const {
  sendVerificationEmail
} = require('./email-verification.service');

// Define the password hashing strength.
const SALT_ROUNDS = 12;

// Create a safe registration error.
function createRegistrationError(message, statusCode, code) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

// Register a new customer.
async function registerUser({ name, email, password }) {
  try {
    // STEP 1: CHECK WHETHER THE EMAIL IS ALREADY REGISTERED.

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      throw createRegistrationError(
        'An account with this email address already exists.',
        409,
        'EMAIL_ALREADY_REGISTERED'
      );
    }

    // STEP 2: HASH THE PASSWORD.

    const hashedPassword = await bcrypt.hash(
      password,
      SALT_ROUNDS
    );

    // STEP 3: CREATE THE MONGODB CUSTOMER.

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'customer'
    });

    // STEP 4: CREATE THE POSTGRESQL WALLET.

    try {
      await createWallet({
        userId: user._id.toString()
      });

    } catch (walletError) {

      // STEP 5: CHECK THE ACTUAL POSTGRESQL STATE.

      let walletState;

      try {
        walletState = await getWalletByUserId({
          userId: user._id.toString()
        });

      } catch (verificationError) {

        // A 404 means no complete wallet and linked
        // ledger account were found.
        if (
          verificationError.code === 'WALLET_NOT_FOUND' ||
          verificationError.statusCode === 404
        ) {
          walletState = null;

        } else {

          // The database state is uncertain.
          // Preserve the MongoDB customer for reconciliation.
          console.error(
            'Registration wallet verification failed:',
            verificationError
          );

          throw createRegistrationError(
            'Your registration is being reviewed. Please contact support if the issue persists.',
            503,
            'REGISTRATION_REQUIRES_RECONCILIATION'
          );
        }
      }

      // STEP 6: HANDLE AN EXISTING COMPLETE WALLET.

      if (walletState) {

        // The wallet and linked ledger account exist.
        // The original error may have occurred after COMMIT.
        console.warn(
          'Wallet creation returned an error, but a complete wallet exists for user:',
          user._id.toString(),
          walletError.message
        );

      } else {

        // STEP 7: COMPENSATE ONLY WHEN NO WALLET EXISTS.

        try {
          const deletionResult = await User.deleteOne({
            _id: user._id
          });

          if (deletionResult.deletedCount !== 1) {
            console.error(
              'Registration compensation warning: MongoDB user was not deleted.',
              user._id.toString()
            );
          }

        } catch (compensationError) {

          console.error(
            'Registration compensation failed:',
            compensationError
          );
        }

        throw createRegistrationError(
          'We could not complete your registration. Please try again.',
          503,
          'REGISTRATION_INCOMPLETE'
        );
      }
    }

    // STEP 8: SEND THE EMAIL VERIFICATION LINK.

    let verificationEmailSent = false;

    try {
      const emailResult = await sendVerificationEmail({
        userId: user._id.toString()
      });

      verificationEmailSent = emailResult.emailSent === true;

    } catch (emailError) {

      // Email delivery failure must not undo a successful
      // MongoDB customer and PostgreSQL wallet creation.
      console.error(
        'Registration verification email could not be sent:',
        emailError.message
      );
    }

    // STEP 9: RETURN SAFE USER INFORMATION.

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt
      },
      verificationEmailSent
    };

  } catch (error) {

    // STEP 10: HANDLE MONGODB DUPLICATE-KEY ERRORS.

    if (error.code === 11000) {
      throw createRegistrationError(
        'An account with this email address already exists.',
        409,
        'EMAIL_ALREADY_REGISTERED'
      );
    }

    throw error;
  }
}

// Export the registration service.
module.exports = { registerUser };
