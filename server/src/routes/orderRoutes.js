const express = require("express");
const router = express.Router();

const orderController = require("../controllers/orderController");
const { requireUser } = require("../middleware/authMiddleware");

// Create order (Guest checkout allowed)
router.post("/", orderController.createOrder);

// Get logged-in user's orders
router.get("/", requireUser, orderController.getUserOrders);

// Get order details (Guest and authenticated orders)
router.get("/:id", orderController.getOrderDetails);

module.exports = router;