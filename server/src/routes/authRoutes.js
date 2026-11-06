
const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
// const { requireUser } = require("../middleware/authMiddleware");

// Public routes
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.post("/forgot", authController.forgotPassword);
router.post("/reset", authController.resetPassword);

// Protected routes
router.get("/me", authController.getCurrentUser);
// router.patch(
//   "/profile",
//   requireUser,
//   authController.updateProfile
// );
router.patch("/profile", authController.updateProfile);

module.exports = router;
