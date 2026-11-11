// Load Mongoose to define the verification-token model.
const mongoose = require('mongoose');

// Create a schema for email verification tokens.
const emailVerificationTokenSchema = new mongoose.Schema(
  {
    // Link the verification token to the customer.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Store only the SHA-256 hash of the original token.
    // The original token is sent to the customer by email.
    tokenHash: {
      type: String,
      required: true,
      unique: true
    },

    // Automatically expire the token after its expiry date.
    expiresAt: {
      type: Date,
      required: true,
      index: {
        expires: 0
      }
    }
  },

  {
    // Automatically maintain createdAt and updatedAt.
    timestamps: true
  }
);

// Reuse the model if Mongoose has already registered it.
const EmailVerificationToken =
  mongoose.models.EmailVerificationToken ||
  mongoose.model(
    'EmailVerificationToken',
    emailVerificationTokenSchema
  );

// Export the model.
module.exports = EmailVerificationToken;
