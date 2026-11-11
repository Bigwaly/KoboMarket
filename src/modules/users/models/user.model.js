// Load Mongoose to define the MongoDB User model.
const mongoose = require('mongoose');

// Create the schema that defines the structure of a user.
const userSchema = new mongoose.Schema(

  {
    // --------------------------------------------------
    // STEP 1: USER PERSONAL INFORMATION
    // --------------------------------------------------

    // Store the user's full name.
    name: {
      type: String,
      required: [true, 'Full name is required.'],
      trim: true,
      minlength: 2,
      maxlength: 100
    },

    // Store the user's email address.
    email: {
      type: String,
      required: [true, 'Email address is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 150
    },

    // Store only the hashed password.
    // Never store a user's plain-text password.
    password: {
      type: String,
      required: [true, 'Password is required.'],
      select: false
    },

    // --------------------------------------------------
    // STEP 2: USER ROLE
    // --------------------------------------------------

    // Define the permissions category assigned to the user.
    role: {
      type: String,
      enum: ['customer', 'vendor', 'admin', 'superadmin'],
      default: 'customer',
      required: true
    },

    // --------------------------------------------------
    // STEP 3: ACCOUNT STATUS
    // --------------------------------------------------

    // Administrators can deactivate an account.
    isActive: {
      type: Boolean,
      default: true
    },

    // Track whether the user has verified their email.
    isEmailVerified: {
      type: Boolean,
      default: false
    }
  },

  {
    // Automatically maintain createdAt and updatedAt.
    timestamps: true
  }

);

// --------------------------------------------------
// STEP 5: EXPORT THE MODEL
// --------------------------------------------------

// Reuse the existing model if Mongoose has already
// registered it. This avoids model recompilation errors.
const User =
  mongoose.models.User ||
  mongoose.model('User', userSchema);

// Export the User model for other application modules.
module.exports = User;
