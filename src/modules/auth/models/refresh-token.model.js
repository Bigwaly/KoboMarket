
// Load Mongoose to define the refresh-token model.
const mongoose = require('mongoose');

// Create the schema for refresh-token sessions.
const refreshTokenSchema = new mongoose.Schema(

  {
    // --------------------------------------------------
    // STEP 1: CUSTOMER WHO OWNS THIS TOKEN
    // --------------------------------------------------

    // Link the refresh token to its customer account.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // --------------------------------------------------
    // STEP 2: HASHED REFRESH TOKEN
    // --------------------------------------------------

    // Store only the SHA-256 hash of the refresh token.
    // Never store the original refresh token.
    tokenHash: {
      type: String,
      required: true,
      unique: true
    },

    // --------------------------------------------------
    // STEP 3: TOKEN FAMILY
    // --------------------------------------------------

    // Tokens issued through rotation belong to the same
    // family. Reuse detection can revoke the whole family.
    familyId: {
      type: String,
      required: true,
      index: true
    },

    // --------------------------------------------------
    // STEP 4: TOKEN ROTATION TRACKING
    // --------------------------------------------------

    // Record when this token was revoked or consumed.
    // Null means the token has not been revoked.
    revokedAt: {
      type: Date,
      default: null
    },

    // Store the hash of the replacement token.
    // This helps identify a previously rotated token.
    replacedByTokenHash: {
      type: String,
      default: null
    },

    // --------------------------------------------------
    // STEP 5: EXPIRATION
    // --------------------------------------------------

    // Define when this refresh token expires.
    expiresAt: {
      type: Date,
      required: true
    }
  },

  {
    // Automatically maintain createdAt and updatedAt.
    timestamps: true
  }

);

// --------------------------------------------------
// STEP 6: DATABASE INDEXES
// --------------------------------------------------

// Quickly find tokens belonging to a particular session.
refreshTokenSchema.index({
  userId: 1,
  familyId: 1
});

// Automatically remove expired token records.
// This cleanup is asynchronous, so authentication
// services must still check expiresAt themselves.
refreshTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

// --------------------------------------------------
// STEP 7: EXPORT THE MODEL
// --------------------------------------------------

// Reuse the model if Mongoose has already registered it.
const RefreshToken =
  mongoose.models.RefreshToken ||
  mongoose.model('RefreshToken', refreshTokenSchema);

// Export the model for authentication services.
module.exports = RefreshToken;
