// Load environment variables from .env file
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const config = {
  mongodb: {
    // Connection URL from environment variable (clean up inline comments)
    url: process.env.MONGODB_URL?.split('#')[0]?.trim() || `mongodb://${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || '27017'}`,

    // Database name from environment variable (clean up inline comments)
    databaseName: process.env.MONGODB_DATABASE?.split('#')[0]?.trim() || "kadai",

    options: {
      // Note: useNewUrlParser and useUnifiedTopology are deprecated in MongoDB driver v4+
    }
  },

  // The migrations dir where migration files reside (relative to project root)
  migrationsDir: "database/mongodb/migrations",

  // The MongoDB collection where the migration state is stored
  changelogCollectionName: "changelog",

  // The file extension to create migrations with
  migrationFileExtension: ".js",

  // Enable the algorithm to create a checksum of the file contents and use that in the comparison to determine
  // if the file should be run.  Requires that scripts are coded to be run multiple times.
  useFileHash: false,

  // Don't change this, unless you know what you're doing
  moduleSystem: 'commonjs',
};

module.exports = config;