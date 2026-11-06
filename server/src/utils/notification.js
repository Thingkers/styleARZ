const store = require("../store");
const crypto = require("crypto");

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

function notify(userId, title, body) {
  const db = store.get();

  db.notifications.unshift({
    id: generateId("n"),
    userId,
    title,
    body,
    read: false,
    createdAt: new Date().toISOString(),
  });

  store.save();
}

module.exports = { notify };