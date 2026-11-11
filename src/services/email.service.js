// Import the official Resend SDK.
const { Resend } = require('resend');

// Read the Resend API key from the environment.
const apiKey = process.env.RESEND_API_KEY;

// Stop the application from silently attempting to send emails without credentials.
if (!apiKey || apiKey === 're_replace_with_your_resend_api_key') {
  throw new Error('RESEND_API_KEY is missing or has not been configured.');
}

// Create one reusable Resend client for the application.
const resend = new Resend(apiKey);

// Read the sender address from the environment.
const emailFrom = process.env.EMAIL_FROM;

// Validate the sender configuration.
if (!emailFrom) {
  throw new Error('EMAIL_FROM is missing from the environment configuration.');
}

/**
 * Send an email through Resend.
 *
 * @param {Object} options - Email delivery options.
 * @param {string} options.to - Recipient email address.
 * @param {string} options.subject - Email subject.
 * @param {string} options.html - HTML email content.
 * @param {string} [options.text] - Plain-text email content.
 *
 * @returns {Promise<Object>} Resend delivery response.
 */
async function sendEmail({ to, subject, html, text }) {
  // Validate the required email fields before contacting Resend.
  if (!to || !subject || !html) {
    throw new Error('Recipient, subject, and HTML email content are required.');
  }

  try {
    // Send the email through the Resend API.
    const result = await resend.emails.send({
      from: emailFrom,
      to,
      subject,
      html,
      text
    });

    // Resend can return an error without throwing an exception.
    if (result.error) {
      throw new Error(result.error.message || 'Resend email delivery failed.');
    }

    // Return the provider response to the calling service.
    return result.data;
  } catch (error) {
    // Log the delivery failure without logging credentials or email content.
    console.error('Email delivery failed:', error.message);

    // Let the calling service decide how to handle the failure.
    throw error;
  }
}

// Export the reusable email function.
module.exports = { sendEmail };
