const crypto = require("crypto");
const store = require("../store");
const inventory = require("../inventory");
const orderModel = require("../models/orderModel");

const { priceItems } = require("../logic");

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function createOrder(body, user, notify) {
  const db = store.get();
  const catalog = inventory.shopCatalog(db);

  const priced = priceItems(catalog, body.items);

  if (priced.error) {
    throw { status: 400, message: priced.error };
  }

  if (
    body.expectedSubtotal !== undefined &&
    (typeof body.expectedSubtotal !== "number" ||
      !Number.isFinite(body.expectedSubtotal) ||
      body.expectedSubtotal !== priced.subtotal)
  ) {
    throw {
      status: 409,
      message:
        "Prices have changed. Review the updated total and place your order again.",
    };
  }

  const quantities = new Map();

  for (const item of priced.items) {
    if (!Number.isInteger(item.qty)) {
      throw {
        status: 400,
        message: "Quantity must be a whole number.",
      };
    }

    quantities.set(
      item.productId,
      (quantities.get(item.productId) || 0) + item.qty,
    );
  }

  for (const [productId, qty] of quantities) {
    const product = catalog.find((entry) => entry.id === productId);

    if (!product || product.stock < qty) {
      throw {
        status: 400,
        message: "A piece in the bag does not have enough stock.",
      };
    }
  }

  const name = String(body.name || "").trim();
  const email = cleanEmail(body.email);
  const address = String(body.address || "").trim();
  const city = String(body.city || "").trim();
  const country = String(body.country || "").trim();
  const last4 = String(body.paymentLast4 || "");

  if (name.length < 2) {
    throw { status: 400, message: "Enter the recipient name." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw { status: 400, message: "Enter a valid email." };
  }

  if (!address || !city || !country) {
    throw { status: 400, message: "Enter a full delivery address." };
  }

  if (!/^\d{4}$/.test(last4)) {
    throw {
      status: 400,
      message: "Enter a card so we can confirm the last four digits.",
    };
  }

  priced.items.forEach((item) => {
    const shop = db.products.find(
      (entry) => entry.id === item.productId,
    );

    if (shop) {
      shop.stock -= item.qty;
      return;
    }

    const retail = inventory.findById(db, item.productId);

    if (retail) {
      retail.stock -= item.qty;
    }
  });

  const order = {
    id: `SA-${crypto.randomBytes(16).toString("hex").toUpperCase()}`,
    userId: user ? user.id : null,
    email,
    name,
    phone: String(body.phone || "").trim(),
    address,
    city,
    country,
    notes: String(body.notes || "").slice(0, 400),
    items: priced.items,
    subtotal: priced.subtotal,
    shipping: priced.shipping,
    total: priced.total,
    paymentLast4: last4,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  orderModel.createOrder(order);

  if (user) {
    notify(
      user.id,
      `Order ${order.id} confirmed`,
      `${priced.items.length} piece${priced.items.length === 1 ? "" : "s"} confirmed. The atelier will pack them next.`,
    );
  }

  store.save();

  return order;
}

function getUserOrders(user) {
  return orderModel.getAllOrders().filter(
    (order) =>
      order.userId === user.id || order.email === user.email,
  );
}

function getOrderDetails(orderId, user) {
  const order = orderModel.getOrderById(orderId);

  if (!order) {
    throw { status: 404, message: "Order not found." };
  }

  if (order.userId) {
    if (
      !user ||
      (user.role !== "admin" && order.userId !== user.id)
    ) {
      throw {
        status: 403,
        message: "This order belongs to another account.",
      };
    }
  } else if (!/^SA-[0-9A-F]{32}$/.test(order.id)) {
    throw { status: 404, message: "Order not found." };
  }

  return order;
}

module.exports = {
  createOrder,
  getUserOrders,
  getOrderDetails,
};