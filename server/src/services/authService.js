
const crypto = require("crypto");

const authModel = require("../models/authModel");
const {
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
} = require("../auth");

// Generate ID using the existing project format
function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

// Normalize email
function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

// Register a new user
function signup(body) {
  const name = String(body.name || "").trim();
  const email = cleanEmail(body.email);
  const password = String(body.password || "");

  if (name.length < 2) {
    throw { status: 400, message: "Enter your name." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw { status: 400, message: "Enter a valid email." };
  }

  if (password.length < 6) {
    throw { status: 400, message: "Use at least 6 characters." };
  }

  if (authModel.findUserByEmail(email)) {
    throw {
      status: 409,
      message: "An account with this email already exists.",
    };
  }

  const user = {
    id: generateId("u"),
    name,
    email,
    role: "customer",
    ...hashPassword(password),
    wishlist: [],
    preferences: null,
    createdAt: new Date().toISOString(),
  };

  authModel.createUser(user);

  // Preserve existing welcome notification behavior
  const db = require("../store").get();

  db.notifications.unshift({
    id: generateId("n"),
    userId: user.id,
    title: "Welcome to StyleARZ",
    body: "Your account is ready. Take the style quiz or go straight to the edit.",
    read: false,
    createdAt: new Date().toISOString(),
  });

  authModel.save();

  return {
    token: signToken(user),
    user: publicUser(user),
  };
}

// Login
function login(body) {
  const email = cleanEmail(body.email);
  const password = String(body.password || "");

  const user = authModel.findUserByEmail(email);

  if (!user || !verifyPassword(password, user)) {
    throw {
      status: 401,
      message: "Email or password is incorrect.",
    };
  }

  return {
    token: signToken(user),
    user: publicUser(user),
  };
}

// Get current user
function getCurrentUser(user) {
  return publicUser(user);
}

// Logout
function logout() {
  return {
    ok: true,
    message: "Signed out.",
  };
}





// Update user profile
function updateProfile(user, body) {
  const nextName =
    body.name !== undefined ? String(body.name || "").trim() : null;

  const nextEmail =
    body.email !== undefined ? cleanEmail(body.email) : null;

  const nextPassword =
    body.password !== undefined ? String(body.password || "") : "";

  const currentPassword = String(body.currentPassword || "");

  const changingEmail = nextEmail !== null && nextEmail !== user.email;
  const changingPassword = Boolean(nextPassword);

  if (changingEmail || changingPassword) {
    if (!currentPassword || !verifyPassword(currentPassword, user)) {
      throw {
        status: 401,
        message: "Enter your current password to change email or password.",
      };
    }
  }

  if (nextName !== null) {
    if (nextName.length < 2) {
      throw {
        status: 400,
        message: "Enter your name (at least 2 characters).",
      };
    }

    user.name = nextName.slice(0, 80);
  }

  if (changingEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      throw { status: 400, message: "Enter a valid email." };
    }

    const existingUser = authModel.findUserByEmail(nextEmail);

    if (existingUser && existingUser.id !== user.id) {
      throw { status: 409, message: "That email is already in use." };
    }

    user.email = nextEmail;
  }

  if (changingPassword) {
    if (nextPassword.length < 6) {
      throw {
        status: 400,
        message: "Use at least 6 characters for the new password.",
      };
    }

    const next = hashPassword(nextPassword);

    user.salt = next.salt;
    user.hash = next.hash;
    user.resetCode = null;
    user.resetExpires = null;
    user.resetAttempts = 0;
  }

  authModel.save();

  return {
    user: publicUser(user),
    token: signToken(user),
    message: "Account updated.",
  };
}

// Request password reset
function forgotPassword(body) {
  if (process.env.NODE_ENV === "production") {
    throw {
      status: 503,
      message: "Password reset is unavailable until email delivery is configured.",
    };
  }

  const email = cleanEmail(body.email);
  const user = authModel.findUserByEmail(email);

  if (!user) {
    return {
      ok: true,
      message: "If that email is registered, a reset code is ready.",
    };
  }

  user.resetCode = String(crypto.randomInt(100000, 1000000));
  user.resetExpires = Date.now() + 30 * 60 * 1000;
  user.resetAttempts = 0;

  authModel.save();

  return {
    ok: true,
    resetCode: user.resetCode,
    message:
      "Email delivery is not connected yet, so the reset code is shown here. It expires in 30 minutes.",
  };
}

// Reset password
function resetPassword(body) {
  const email = cleanEmail(body.email);
  const code = String(body.code || "").trim();
  const password = String(body.password || "");

  const user = authModel.findUserByEmail(email);

  if (
    !user ||
    !user.resetCode ||
    !Number.isFinite(user.resetExpires) ||
    user.resetExpires < Date.now() ||
    (user.resetAttempts || 0) >= 5
  ) {
    throw {
      status: 400,
      message: "The reset code is invalid or has expired.",
    };
  }

  if (!/^\d{6}$/.test(code) || user.resetCode !== code) {
    user.resetAttempts = (user.resetAttempts || 0) + 1;

    if (user.resetAttempts >= 5) {
      user.resetCode = null;
      user.resetExpires = null;
      user.resetAttempts = 0;
    }

    authModel.save();

    throw {
      status: 400,
      message: "The reset code is invalid or has expired.",
    };
  }

  if (password.length < 6) {
    throw { status: 400, message: "Use at least 6 characters." };
  }

  const next = hashPassword(password);

  user.salt = next.salt;
  user.hash = next.hash;
  user.resetCode = null;
  user.resetExpires = null;
  user.resetAttempts = 0;

  authModel.save();

  return {
    ok: true,
    message: "Password updated. You can sign in.",
  };
}


module.exports = {
  cleanEmail,
  signup,
  login,
  getCurrentUser,
  logout,
  updateProfile,
  forgotPassword,
  resetPassword,
};


