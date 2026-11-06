const store = require("../store");

function getAllOrders() {
  const db = store.get();
  return db.orders;
}

function getOrderById(orderId) {
  const db = store.get();

  return db.orders.find((order) => order.id === orderId) || null;
}

function createOrder(order) {
  const db = store.get();

  db.orders.unshift(order);
  store.save();

  return order;
}

function save() {
  store.save();
}

module.exports = {
  getAllOrders,
  getOrderById,
  createOrder,
  save,
};