
// Import Node.js cryptographic functions.
const crypto = require('node:crypto');

// Import the MongoDB User model.
const User = require('../../users/models/user.model');

// Import the email verification token model.
const EmailVerificationToken = require('../models/email-verification-token.model');

// Import the reusable email service.
const { sendEmail } = require('../../../services/email.service');

// Read the verification-token lifetime from environment variables.
const TOKEN_EXPIRY_MINUTES = Number(
  process.env.EMAIL_VERIFICATION_EXPIRES_MINUTES || 15
);

// Validate the configured token lifetime.
if (
  !Number.isInteger(TOKEN_EXPIRY_MINUTES) ||
  TOKEN_EXPIRY_MINUTES < 1 ||
  TOKEN_EXPIRY_MINUTES > 1440
) {
  throw new Error('Email verification expiry must be between 1 and 1440 minutes.');
}

// Create a consistent service error.
function createServiceError(message, statusCode, code) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

// Convert the original token into a SHA-256 hash.
function hashVerificationToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

// Escape special HTML characters in customer-provided text.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return replacements[character];
  });
}

// Validate and prepare the frontend verification URL.
function getVerificationBaseUrl() {
  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    throw createServiceError(
      'Frontend verification URL is not configured.',
      503,
      'EMAIL_CONFIGURATION_ERROR'
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(frontendUrl);
  } catch (error) {
    throw createServiceError(
      'Frontend verification URL is invalid.',
      503,
      'EMAIL_CONFIGURATION_ERROR'
    );
  }

  // Only allow HTTP and HTTPS URLs.
  if (
    !['http:', 'https:'].includes(parsedUrl.protocol) ||
    !parsedUrl.hostname ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw createServiceError(
      'Frontend verification URL must be a valid HTTP or HTTPS URL.',
      503,
      'EMAIL_CONFIGURATION_ERROR'
    );
  }

  return parsedUrl;
}

// Generate and send an email verification link.
async function sendVerificationEmail({ userId }) {
  // Validate the frontend URL before creating a token.
  const frontendUrl = getVerificationBaseUrl();

  // Find the customer who needs email verification.
  const user = await User.findById(userId);

  if (!user) {
    throw createServiceError(
      'Customer account was not found.',
      404,
      'USER_NOT_FOUND'
    );
  }

  // There is no need to verify an already verified account.
  if (user.isEmailVerified) {
    return {
      alreadyVerified: true
    };
  }

  // Invalidate any previous unused verification tokens.
  await EmailVerificationToken.deleteMany({
    userId: user._id
  });

  // Generate a cryptographically secure 32-byte random token.
  const verificationToken = crypto.randomBytes(32).toString('hex');

  // Store only the SHA-256 hash in MongoDB.
  const tokenHash = hashVerificationToken(verificationToken);

  // Calculate the token expiration time.
  const expiresAt = new Date(
    Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000
  );

  // Save the hashed token in MongoDB.
  await EmailVerificationToken.create({
    userId: user._id,
    tokenHash,
    expiresAt
  });

  // Build the verification link.
  const verificationUrl = new URL('/verify-email', frontendUrl);

  verificationUrl.searchParams.set('token', verificationToken);

  // Escape the customer name before inserting it into HTML.
  const safeName = escapeHtml(user.name);

  // Send the verification email.
  try {
    await sendEmail({
      to: user.email,
      subject: 'Verify your KoboMarket email address',

      // HTML version of the email.
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Welcome to KoboMarket, ${safeName}!</h2>

          <p>Please verify your email address to activate your account.</p>

          <p>
            <a
              href="${verificationUrl.toString()}"
              style="background: #1769aa; color: white; padding: 12px 20px;
              text-decoration: none; border-radius: 5px;"
            >
              Verify My Email
            </a>
          </p>

          <p>This verification link expires in ${TOKEN_EXPIRY_MINUTES} minutes.</p>

          <p>If you did not create this account, you can ignore this email.</p>
        </div>
      `,

      // Plain-text version for email clients that do not support HTML.
      text: `
Welcome to KoboMarket, ${user.name}!

Verify your email address using this link:

${verificationUrl.toString()}

This link expires in ${TOKEN_EXPIRY_MINUTES} minutes.
      `
    });
  } catch (error) {
    // Remove the token if the email could not be sent.
    await EmailVerificationToken.deleteMany({
      tokenHash
    });

    throw createServiceError(
      'Verification email could not be sent. Please try again.',
      503,
      'VERIFICATION_EMAIL_FAILED'
    );
  }

  return {
    emailSent: true,
    expiresAt
  };
}

// Request another verification email using the customer's email address.
async function resendVerificationEmail({ email }) {
  // Normalize the email address.
  const normalizedEmail = String(email || '').trim().toLowerCase();

  // Find the customer account.
  const user = await User.findOne({
    email: normalizedEmail
  });

  // Do not reveal whether the account exists.
  if (!user) {
    return {
      emailSent: false
    };
  }

  // Do not send another verification email to an already verified account.
  if (user.isEmailVerified) {
    return {
      emailSent: false,
      alreadyVerified: true
    };
  }

  // Generate a new token and send another verification email.
  return sendVerificationEmail({
    userId: user._id.toString()
  });
}

// Verify a customer's email using the original token.
async function verifyEmail({ token }) {
  // Validate the supplied token.
  if (
    typeof token !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(token)
  ) {
    throw createServiceError(
      'Invalid or expired verification link.',
      400,
      'INVALID_VERIFICATION_TOKEN'
    );
  }

  // Hash the supplied token before searching MongoDB.
  const tokenHash = hashVerificationToken(token);

  // Atomically consume a matching token that has not expired.
  const verificationRecord = await EmailVerificationToken.findOneAndDelete({
    tokenHash,
    expiresAt: { $gt: new Date() }
  });

  if (!verificationRecord) {
    throw createServiceError(
      'Invalid or expired verification link.',
      400,
      'INVALID_VERIFICATION_TOKEN'
    );
  }

  // Mark the customer as verified.
  const user = await User.findOneAndUpdate(
    {
      _id: verificationRecord.userId,
      isEmailVerified: false
    },
    {
      $set: {
        isEmailVerified: true
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  // Delete any remaining tokens belonging to this customer.
  await EmailVerificationToken.deleteMany({
    userId: verificationRecord.userId
  });

  if (!user) {
    throw createServiceError(
      'Account could not be verified. Please request a new link.',
      400,
      'EMAIL_VERIFICATION_FAILED'
    );
  }

  // Return safe customer information.
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    isEmailVerified: user.isEmailVerified
  };
}

// Export the service functions.
module.exports = {
  sendVerificationEmail,
  resendVerificationEmail,
  verifyEmail
};
