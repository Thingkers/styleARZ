const express = require("express");
const router = express.Router();

const wishlistController = require("../controllers/wishlistController");
const { requireUser } = require("../middleware/authMiddleware");

router.get("/", requireUser, wishlistController.getWishlist);
router.put("/", requireUser, wishlistController.updateWishlist);

module.exports = router;