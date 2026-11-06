
const authService = require("../services/authService");

// POST /api/auth/signup
function signup(req, res, next) {
  try {
    const result = authService.signup(req.body || {});
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// POST /api/auth/login
function login(req, res, next) {
  try {
    const result = authService.login(req.body || {});
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/auth/me
function getCurrentUser(req, res, next) {
  try {
    const user = authService.getCurrentUser(req.user);
    return res.json({ user });
  } catch (error) {
    next(error);
  }
}

// POST /api/auth/logout
function logout(req, res, next) {
  try {
    const result = authService.logout();
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/auth/profile
function updateProfile(req, res, next) {
  try {
    const result = authService.updateProfile(
      req.user,
      req.body || {}
    );

    return res.json(result);
  } catch (error) {
    next(error);
  }
}

// POST /api/auth/forgot
function forgotPassword(req, res, next) {
  try {
    const result = authService.forgotPassword(req.body || {});
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

// POST /api/auth/reset
function resetPassword(req, res, next) {
  try {
    const result = authService.resetPassword(req.body || {});
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  signup,
  login,
  getCurrentUser,
  logout,
  updateProfile,
  forgotPassword,
  resetPassword,
};
