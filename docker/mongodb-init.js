// MongoDB initialization script
// This script runs automatically when the MongoDB container starts for the first time

// Switch to the kadai database (creates it if it doesn't exist)
db = db.getSiblingDB('kadai');

// Create a dedicated application user for the kadai database
db.createUser({
  user: 'kadai',
  pwd: 'kadai123',
  roles: [
    { role: 'readWrite', db: 'kadai' },
    { role: 'dbAdmin', db: 'kadai' },
  ],
});

print(
  '✅ Created kadai app user with readWrite and dbAdmin roles for kadai database'
);
print('✅ MongoDB initialization completed successfully');
