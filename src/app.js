// Load the Express framework.
const express = require('express');

// Load Helmet to add HTTP security headers.
const helmet = require('helmet');

// Load CORS to control cross-origin requests.
const cors = require('cors');

// Load the authentication routes.
const authRoutes = require('./modules/auth/routes/auth.routes');

// Create the Express application.
const app = express();

// --------------------------------------------------
// STEP 1: SECURITY MIDDLEWARE
// --------------------------------------------------

// Add common security-related HTTP headers.
app.use(helmet());

// Enable Cross-Origin Resource Sharing.
// We will restrict allowed origins when frontend
// deployment details are available.
app.use(cors());

// --------------------------------------------------
// STEP 2: REQUEST BODY MIDDLEWARE
// --------------------------------------------------

// Parse incoming JSON request bodies.
// The size limit prevents excessively large JSON payloads.
app.use(express.json({ limit: '1mb' }));

// Parse URL-encoded request bodies.
app.use(express.urlencoded({
  extended: true,
  limit: '1mb'
}));

// --------------------------------------------------
// STEP 3: HEALTH CHECK
// --------------------------------------------------

// Confirm that the API process is running.
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'KoboMarket API is running.',
    timestamp: new Date().toISOString()
  });
});

// --------------------------------------------------
// STEP 4: AUTHENTICATION ROUTES
// --------------------------------------------------

// All authentication endpoints begin with /api/auth.
//
// Example:
// POST /api/auth/register
app.use('/api/auth', authRoutes);

// --------------------------------------------------
// STEP 5: NOT FOUND HANDLER
// --------------------------------------------------

// Handle requests to endpoints that do not exist.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'The requested API endpoint was not found.'
  });
});

// Export the configured Express application.
module.exports = app;
