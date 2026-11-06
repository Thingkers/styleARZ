const orderService = require("../services/orderService");
const { notify } = require("../utils/notification");


function createOrder(req, res, next) {
  try {
    const order = orderService.createOrder(
      req.body,
      req.user,
      notify,
    );

    return res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
}

function getUserOrders(req, res, next) {
  try {
    const orders = orderService.getUserOrders(req.user);

    return res.json({ orders });
  } catch (error) {
    next(error);
  }
}

function getOrderDetails(req, res, next) {
  try {
    const order = orderService.getOrderDetails(
      req.params.id,
      req.user,
    );

    return res.json({ order });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOrder,
  getUserOrders,
  getOrderDetails,
};