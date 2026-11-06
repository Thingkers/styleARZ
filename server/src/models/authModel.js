
const store = require("../store");

// Find a user by email
function findUserByEmail(email) {
  const db = store.get();
  return db.users.find((user) => user.email === email) || null;
}

// Find a user by ID
function findUserById(userId) {
  const db = store.get();
  return db.users.find((user) => user.id === userId) || null;
}

// Get all users
function getAllUsers() {
  const db = store.get();
  return db.users;
}

// Save database changes
function save() {
  store.save();
}

// Add a new user
function createUser(user) {
  const db = store.get();
  db.users.push(user);
  store.save();
  return user;
}

module.exports = {
  findUserByEmail,
  findUserById,
  getAllUsers,
  createUser,
  save,
};
