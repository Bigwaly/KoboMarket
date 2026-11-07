// Import Mongoose to manage the MongoDB connection.
const mongoose = require('mongoose');

// Establish a connection to MongoDB.
const connectMongoDB = async () => {
  // Read the MongoDB connection string from the .env file.
  const mongoUri = process.env.MONGODB_URI;

  // Stop if the connection string is missing.
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  // Connect to the MongoDB database.
  await mongoose.connect(mongoUri);

  // Confirm that the connection was successful.
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
};

// Export the function so other files can use it.
module.exports = connectMongoDB;
