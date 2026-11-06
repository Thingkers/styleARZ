const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq < 1) return;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    });
}

loadEnv();

const store = require("./store");
const { hashPassword, verifyPassword, signToken, verifyToken, publicUser } = require("./auth");
const { suggestSize, quizResult, budgetOutfit, priceItems } = require("./logic");
const inventory = require("./inventory");
const home = require("./home");
const pos = require("./pos");
const barcode = require("./barcode");
const db = store.load();
const app = express();

const jsonBody = express.json({ limit: "1mb" });
// Inventory image uploads carry base64 images and use their own larger parser after auth.
app.use((req, res, next) => {
  if (req.method === "POST" && /^\/api\/inventory\/[^/]+\/image\/?$/.test(req.path)) return next();
  if (req.method === "POST" && req.path === "/api/inventory/batch") return next();
  if (req.method === "PATCH" && /^\/api\/admin\/home-collections\/[^/]+\/?$/.test(req.path)) return next();
  return jsonBody(req, res, next);
});

app.use((req, res, next) => {
  req.body = req.body || {};
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = verifyToken(token);
  req.user = payload ? db.users.find((user) => user.id === payload.id) || null : null;
  next();
});

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

function fail(res, status, error) {
  return res.status(status).json({ error });
}

function requireUser(req, res, next) {
  if (!req.user) return fail(res, 401, "Sign in to continue.");
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return fail(res, 403, "Atelier access only.");
  next();
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function notify(userId, title, body) {
  db.notifications.unshift({
    id: id("n"),
    userId,
    title,
    body,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "stylearz" });
});

app.get("/api/meta", (req, res) => {
  const catalog = inventory.shopCatalog(db);
  const categories = [...new Set(catalog.map((product) => product.category))];
  const occasions = [...new Set(catalog.flatMap((product) => product.occasions))];
  const colors = [];
  catalog.forEach((product) => {
    product.colors.forEach((color) => {
      if (!colors.some((entry) => entry.name === color.name)) colors.push(color);
    });
  });
  res.json({ categories, occasions, colors, audiences: ["Men", "Women", "Children", "Unisex"] });
});

app.get("/api/products", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const category = String(req.query.category || "");
  const occasion = String(req.query.occasion || "");
  let products = inventory.shopCatalog(db);
  if (q) {
    products = products.filter((product) =>
      `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(q)
    );
  }
  const audience = String(req.query.audience || "");
  if (category) products = products.filter((product) => product.category === category);
  if (occasion) products = products.filter((product) => product.occasions.includes(occasion));
  if (audience) products = products.filter((product) => product.audience === audience);
  if (req.query.featured === "1") products = products.filter((product) => product.featured);
  // Keep catalog sortOrder after filters so home featured matches admin drag order.
  products = products.slice().sort((a, b) => {
    const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : 9999;
    const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : 9999;
    if (ao !== bo) return ao - bo;
    return String(a.name).localeCompare(String(b.name));
  });
  res.json({ products });
});

app.get("/api/products/:id", (req, res) => {
  const found = inventory.findShopProduct(db, req.params.id);
  if (!found) return fail(res, 404, "Piece not found.");
  const catalog = inventory.shopCatalog(db);
  const related = catalog
    .filter(
      (entry) =>
        entry.id !== found.product.id &&
        (entry.category === found.product.category || entry.slot === found.product.slot)
    )
    .slice(0, 4);
  res.json({ product: found.product, related });
});

app.post("/api/fit", (req, res) => {
  const result = suggestSize(req.body || {});
  if (result.error) return fail(res, 400, result.error);
  res.json(result);
});

app.get("/api/home-collections", (req, res) => {
  res.json({ collections: home.listCollections(db) });
});

app.get("/api/looks", (req, res) => {
  res.json({ looks: db.looks });
});

app.get("/api/looks/:id", (req, res) => {
  const look = db.looks.find((entry) => entry.id === req.params.id);
  if (!look) return fail(res, 404, "Look not found.");
  const products = look.productIds
    .map((productId) => db.products.find((product) => product.id === productId))
    .filter(Boolean);
  res.json({ look, products });
});

app.post("/api/studio/budget", (req, res) => {
  const result = budgetOutfit(db.products, req.body.budget, req.body.occasion || "Everyday");
  if (result.error) return fail(res, 400, result.error);
  res.json(result);
});

app.post("/api/auth/signup", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || "");
  if (name.length < 2) return fail(res, 400, "Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, "Enter a valid email.");
  if (password.length < 6) return fail(res, 400, "Use at least 6 characters.");
  if (db.users.some((user) => user.email === email)) return fail(res, 409, "An account with this email already exists.");
  const user = {
    id: id("u"),
    name,
    email,
    role: "customer",
    ...hashPassword(password),
    wishlist: [],
    preferences: null,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  notify(user.id, "Welcome to StyleARZ", "Your account is ready. Take the style quiz or go straight to the edit.");
  store.save();
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || "");
  const user = db.users.find((entry) => entry.email === email);
  if (!user || !verifyPassword(password, user)) return fail(res, 401, "Email or password is incorrect.");
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post("/api/auth/logout", (req, res) => {
  res.json({ ok: true, message: "Signed out." });
});

app.patch("/api/auth/profile", requireUser, (req, res) => {
  const user = req.user;
  const body = req.body || {};
  const nextName = body.name !== undefined ? String(body.name || "").trim() : null;
  const nextEmail = body.email !== undefined ? cleanEmail(body.email) : null;
  const nextPassword = body.password !== undefined ? String(body.password || "") : "";
  const currentPassword = String(body.currentPassword || "");
  const changingEmail = nextEmail !== null && nextEmail !== user.email;
  const changingPassword = Boolean(nextPassword);

  if (changingEmail || changingPassword) {
    if (!currentPassword || !verifyPassword(currentPassword, user)) {
      return fail(res, 401, "Enter your current password to change email or password.");
    }
  }

  if (nextName !== null) {
    if (nextName.length < 2) return fail(res, 400, "Enter your name (at least 2 characters).");
    user.name = nextName.slice(0, 80);
  }

  if (changingEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) return fail(res, 400, "Enter a valid email.");
    if (db.users.some((entry) => entry.email === nextEmail && entry.id !== user.id)) {
      return fail(res, 409, "That email is already in use.");
    }
    user.email = nextEmail;
  }

  if (changingPassword) {
    if (nextPassword.length < 6) return fail(res, 400, "Use at least 6 characters for the new password.");
    const next = hashPassword(nextPassword);
    user.salt = next.salt;
    user.hash = next.hash;
    user.resetCode = null;
    user.resetExpires = null;
    user.resetAttempts = 0;
  }

  store.save();
  res.json({
    user: publicUser(user),
    token: signToken(user),
    message: "Account updated.",
  });
});

app.post("/api/auth/forgot", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return fail(res, 503, "Password reset is unavailable until email delivery is configured.");
  }
  const email = cleanEmail(req.body.email);
  const user = db.users.find((entry) => entry.email === email);
  if (!user) {
    return res.json({
      ok: true,
      message: "If that email is registered, a reset code is ready.",
    });
  }
  user.resetCode = String(crypto.randomInt(100000, 1000000));
  user.resetExpires = Date.now() + 30 * 60 * 1000;
  user.resetAttempts = 0;
  store.save();
  res.json({
    ok: true,
    resetCode: user.resetCode,
    message: "Email delivery is not connected yet, so the reset code is shown here. It expires in 30 minutes.",
  });
});

app.post("/api/auth/reset", (req, res) => {
  const email = cleanEmail(req.body.email);
  const code = String(req.body.code || "").trim();
  const password = String(req.body.password || "");
  const user = db.users.find((entry) => entry.email === email);
  if (
    !user ||
    !user.resetCode ||
    !Number.isFinite(user.resetExpires) ||
    user.resetExpires < Date.now() ||
    (user.resetAttempts || 0) >= 5
  ) {
    return fail(res, 400, "The reset code is invalid or has expired.");
  }
  if (!/^\d{6}$/.test(code) || user.resetCode !== code) {
    user.resetAttempts = (user.resetAttempts || 0) + 1;
    if (user.resetAttempts >= 5) {
      user.resetCode = null;
      user.resetExpires = null;
      user.resetAttempts = 0;
    }
    store.save();
    return fail(res, 400, "The reset code is invalid or has expired.");
  }
  if (password.length < 6) return fail(res, 400, "Use at least 6 characters.");
  const next = hashPassword(password);
  user.salt = next.salt;
  user.hash = next.hash;
  user.resetCode = null;
  user.resetExpires = null;
  user.resetAttempts = 0;
  store.save();
  res.json({ ok: true, message: "Password updated. You can sign in." });
});

app.get("/api/wishlist", requireUser, (req, res) => {
  res.json({ productIds: req.user.wishlist || [] });
});

app.put("/api/wishlist", requireUser, (req, res) => {
  const ids = Array.isArray(req.body.productIds) ? req.body.productIds : [];
  // Accept any shop-catalog id (classic products and listed inventory), not only db.products.
  const allowed = new Set(inventory.shopCatalog(db).map((product) => product.id));
  req.user.wishlist = [...new Set(ids.map(String).filter((productId) => allowed.has(productId)))];
  store.save();
  res.json({ productIds: req.user.wishlist });
});

app.post("/api/orders", (req, res) => {
  const catalog = inventory.shopCatalog(db);
  const priced = priceItems(catalog, req.body.items);
  if (priced.error) return fail(res, 400, priced.error);
  if (
    req.body.expectedSubtotal !== undefined &&
    (typeof req.body.expectedSubtotal !== "number" ||
      !Number.isFinite(req.body.expectedSubtotal) ||
      req.body.expectedSubtotal !== priced.subtotal)
  ) {
    return fail(res, 409, "Prices have changed. Review the updated total and place your order again.");
  }
  const quantities = new Map();
  for (const item of priced.items) {
    if (!Number.isInteger(item.qty)) return fail(res, 400, "Quantity must be a whole number.");
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.qty);
  }
  for (const [productId, qty] of quantities) {
    const product = catalog.find((entry) => entry.id === productId);
    if (!product || product.stock < qty) return fail(res, 400, "A piece in the bag does not have enough stock.");
  }
  const name = String(req.body.name || "").trim();
  const email = cleanEmail(req.body.email);
  const address = String(req.body.address || "").trim();
  const city = String(req.body.city || "").trim();
  const country = String(req.body.country || "").trim();
  const last4 = String(req.body.paymentLast4 || "");
  if (name.length < 2) return fail(res, 400, "Enter the recipient name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, "Enter a valid email.");
  if (!address || !city || !country) return fail(res, 400, "Enter a full delivery address.");
  if (!/^\d{4}$/.test(last4)) return fail(res, 400, "Enter a card so we can confirm the last four digits.");
  priced.items.forEach((item) => {
    const shop = db.products.find((entry) => entry.id === item.productId);
    if (shop) {
      shop.stock -= item.qty;
      return;
    }
    const retail = inventory.findById(db, item.productId);
    if (retail) retail.stock -= item.qty;
  });
  const order = {
    id: `SA-${crypto.randomBytes(16).toString("hex").toUpperCase()}`,
    userId: req.user ? req.user.id : null,
    email,
    name,
    phone: String(req.body.phone || "").trim(),
    address,
    city,
    country,
    notes: String(req.body.notes || "").slice(0, 400),
    items: priced.items,
    subtotal: priced.subtotal,
    shipping: priced.shipping,
    total: priced.total,
    paymentLast4: last4,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };
  db.orders.unshift(order);
  if (req.user) {
    notify(req.user.id, `Order ${order.id} confirmed`, `${priced.items.length} piece${priced.items.length === 1 ? "" : "s"} confirmed. The atelier will pack them next.`);
  }
  store.save();
  res.status(201).json({ order });
});

app.get("/api/orders", requireUser, (req, res) => {
  const orders = db.orders.filter((order) => order.userId === req.user.id || order.email === req.user.email);
  res.json({ orders });
});

app.get("/api/orders/:id", (req, res) => {
  const order = db.orders.find((entry) => entry.id === req.params.id);
  if (!order) return fail(res, 404, "Order not found.");
  if (order.userId) {
    if (!req.user || (req.user.role !== "admin" && order.userId !== req.user.id)) {
      return fail(res, 403, "This order belongs to another account.");
    }
  } else if (!/^SA-[0-9A-F]{32}$/.test(order.id)) {
    return fail(res, 404, "Order not found.");
  }
  res.json({ order });
});

app.get("/api/wardrobe", requireUser, (req, res) => {
  res.json({ items: db.wardrobe.filter((item) => item.userId === req.user.id) });
});

app.post("/api/wardrobe", requireUser, (req, res) => {
  const name = String(req.body.name || "").trim();
  const category = String(req.body.category || "").trim();
  const color = String(req.body.color || "").trim();
  if (name.length < 2 || !category || !color) return fail(res, 400, "Name, category, and colour are required.");
  const item = {
    id: id("w"),
    userId: req.user.id,
    name,
    category,
    color,
    hex: String(req.body.hex || "#4e4e4e"),
    notes: String(req.body.notes || "").slice(0, 240),
  };
  db.wardrobe.unshift(item);
  store.save();
  res.status(201).json({ item });
});

app.delete("/api/wardrobe/:id", requireUser, (req, res) => {
  const before = db.wardrobe.length;
  db.wardrobe = db.wardrobe.filter((item) => !(item.id === req.params.id && item.userId === req.user.id));
  if (db.wardrobe.length === before) return fail(res, 404, "Wardrobe piece not found.");
  store.save();
  res.json({ ok: true });
});

app.get("/api/outfits", requireUser, (req, res) => {
  res.json({ outfits: db.outfits.filter((outfit) => outfit.userId === req.user.id) });
});

app.post("/api/outfits", requireUser, (req, res) => {
  const name = String(req.body.name || "").trim() || "Untitled look";
  const slots = req.body.slots || {};
  const values = Object.values(slots).filter(Boolean);
  if (values.length < 2) return fail(res, 400, "Choose at least two pieces before saving.");
  const outfit = {
    id: id("o"),
    userId: req.user.id,
    name,
    slots,
    createdAt: new Date().toISOString(),
  };
  db.outfits.unshift(outfit);
  notify(req.user.id, "Look saved", `${name} is in your studio and can be planned for the week.`);
  store.save();
  res.status(201).json({ outfit });
});

app.delete("/api/outfits/:id", requireUser, (req, res) => {
  db.outfits = db.outfits.filter((outfit) => !(outfit.id === req.params.id && outfit.userId === req.user.id));
  store.save();
  res.json({ ok: true });
});

app.get("/api/planner", requireUser, (req, res) => {
  const entries = db.planner
    .filter((entry) => entry.userId === req.user.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  res.json({ entries });
});

app.post("/api/planner", requireUser, (req, res) => {
  const date = String(req.body.date || "");
  const title = String(req.body.title || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) return fail(res, 400, "Choose a date and a title.");
  const entry = {
    id: id("pl"),
    userId: req.user.id,
    date,
    title,
    outfitId: req.body.outfitId || null,
    notes: String(req.body.notes || "").slice(0, 240),
    wornCount: 0,
    lastWorn: null,
  };
  db.planner.push(entry);
  store.save();
  res.status(201).json({ entry });
});

app.post("/api/planner/:id/worn", requireUser, (req, res) => {
  const entry = db.planner.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!entry) return fail(res, 404, "Plan not found.");
  entry.wornCount += 1;
  entry.lastWorn = new Date().toISOString();
  store.save();
  res.json({ entry });
});

app.delete("/api/planner/:id", requireUser, (req, res) => {
  db.planner = db.planner.filter((entry) => !(entry.id === req.params.id && entry.userId === req.user.id));
  store.save();
  res.json({ ok: true });
});

app.get("/api/community", (req, res) => {
  const posts = db.posts.filter((post) => post.status === "published");
  res.json({ posts });
});

app.post("/api/community", requireUser, (req, res) => {
  const title = String(req.body.title || "").trim();
  const body = String(req.body.body || "").trim();
  if (title.length < 3 || body.length < 8) return fail(res, 400, "Add a title and a short note.");
  const post = {
    id: id("post"),
    userId: req.user.id,
    author: req.user.name,
    title: title.slice(0, 80),
    body: body.slice(0, 600),
    image: "/images/studio-table.jpg",
    likes: 0,
    likedBy: [],
    status: "published",
    createdAt: new Date().toISOString(),
  };
  db.posts.unshift(post);
  store.save();
  res.status(201).json({ post });
});

app.post("/api/community/:id/like", (req, res) => {
  const post = db.posts.find((entry) => entry.id === req.params.id && entry.status === "published");
  if (!post) return fail(res, 404, "Note not found.");
  const key = req.user ? req.user.id : req.ip;
  post.likedBy = post.likedBy || [];
  if (post.likedBy.includes(key)) {
    post.likedBy = post.likedBy.filter((entry) => entry !== key);
    post.likes = Math.max(0, post.likes - 1);
  } else {
    post.likedBy.push(key);
    post.likes += 1;
  }
  store.save();
  res.json({ likes: post.likes, liked: post.likedBy.includes(key) });
});

app.get("/api/notifications", requireUser, (req, res) => {
  const notifications = db.notifications.filter((item) => item.userId === req.user.id);
  res.json({
    notifications,
    unread: notifications.filter((item) => !item.read).length,
  });
});

app.post("/api/notifications/:id/read", requireUser, (req, res) => {
  const item = db.notifications.find((entry) => entry.id === req.params.id && entry.userId === req.user.id);
  if (!item) return fail(res, 404, "Notification not found.");
  item.read = true;
  store.save();
  res.json({ notification: item });
});

app.post("/api/notifications/read-all", requireUser, (req, res) => {
  db.notifications.forEach((item) => {
    if (item.userId === req.user.id) item.read = true;
  });
  store.save();
  res.json({ ok: true });
});

app.post("/api/quiz", (req, res) => {
  const answers = req.body.answers || {};
  if (!answers.life || !answers.palette) return fail(res, 400, "Answer the style questions to continue.");
  const result = quizResult(answers, db.products);
  result.createdAt = new Date().toISOString();
  if (req.user) {
    req.user.preferences = result;
    notify(req.user.id, "Your edit is ready", result.title);
    store.save();
  }
  const products = result.productIds
    .map((productId) => db.products.find((product) => product.id === productId))
    .filter(Boolean);
  res.json({ result, products });
});

app.get("/api/quiz", (req, res) => {
  if (!req.user || !req.user.preferences) return res.json({ result: null, products: [] });
  const products = req.user.preferences.productIds
    .map((productId) => db.products.find((product) => product.id === productId))
    .filter(Boolean);
  res.json({ result: req.user.preferences, products });
});

app.get("/api/admin/overview", requireAdmin, (req, res) => {
  const revenue = db.orders
    .filter((order) => order.status !== "cancelled")
    .reduce((sum, order) => sum + order.total, 0);
  res.json({
    revenue,
    orders: db.orders.length,
    clients: db.users.filter((user) => user.role === "customer").length,
    lowStock: db.products.filter((product) => product.stock < 3),
    posts: db.posts.length,
  });
});

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  res.json({ orders: db.orders });
});

app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const order = db.orders.find((entry) => entry.id === req.params.id);
  if (!order) return fail(res, 404, "Order not found.");
  const allowed = ["confirmed", "packing", "shipped", "delivered", "cancelled"];
  if (!allowed.includes(req.body.status)) return fail(res, 400, "Unknown status.");
  order.status = req.body.status;
  if (order.userId) notify(order.userId, `Order ${order.id}`, `Status is now ${order.status}.`);
  store.save();
  res.json({ order });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json({
    users: db.users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })),
  });
});

app.patch("/api/admin/users/:id", requireAdmin, (req, res) => {
  const user = db.users.find((entry) => entry.id === req.params.id);
  if (!user) return fail(res, 404, "User not found.");
  const body = req.body || {};

  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (name.length < 2) return fail(res, 400, "Enter a name (at least 2 characters).");
    user.name = name.slice(0, 80);
  }

  if (body.email !== undefined) {
    const email = cleanEmail(body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, "Enter a valid email.");
    if (db.users.some((entry) => entry.email === email && entry.id !== user.id)) {
      return fail(res, 409, "That email is already in use.");
    }
    user.email = email;
  }

  if (body.role !== undefined) {
    if (!["customer", "admin"].includes(body.role)) return fail(res, 400, "Role must be customer or admin.");
    if (user.role === "admin" && body.role !== "admin") {
      const admins = db.users.filter((entry) => entry.role === "admin");
      if (admins.length <= 1) return fail(res, 400, "Keep at least one admin account.");
    }
    user.role = body.role;
  }

  if (body.password !== undefined && body.password !== "") {
    const password = String(body.password);
    if (password.length < 6) return fail(res, 400, "Use at least 6 characters for the password.");
    const next = hashPassword(password);
    user.salt = next.salt;
    user.hash = next.hash;
    user.resetCode = null;
    user.resetExpires = null;
    user.resetAttempts = 0;
  }

  store.save();
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    message: "User updated.",
  });
});

app.patch("/api/admin/products/:id", requireAdmin, handle((req, res) => {
  const product = db.products.find((entry) => entry.id === req.params.id);
  if (product) {
    if (req.body.name) product.name = String(req.body.name).trim().slice(0, 80);
    if (req.body.price !== undefined) {
      const price = Number(req.body.price);
      if (!price || price < 1) return fail(res, 400, "Enter a valid price.");
      product.price = Math.round(price);
    }
    if (req.body.stock !== undefined) {
      const stock = Number(req.body.stock);
      if (stock < 0 || Number.isNaN(stock)) return fail(res, 400, "Stock cannot be negative.");
      product.stock = Math.round(stock);
    }
    if (req.body.featured !== undefined) product.featured = Boolean(req.body.featured);
    if (req.body.sortOrder !== undefined) {
      const order = Number(req.body.sortOrder);
      if (!Number.isInteger(order) || order < 0) return fail(res, 400, "Sort order must be a whole number.");
      product.sortOrder = order;
    }
    store.save();
    return res.json({ product });
  }
  const item = inventory.updateItem(db, req.params.id, {
    featured: req.body.featured,
    sortOrder: req.body.sortOrder,
    price: req.body.price,
    stock: req.body.stock,
    name: req.body.name,
  });
  store.save();
  res.json({ product: inventory.toShopProduct(item) });
}));

app.put("/api/admin/catalog-order", requireAdmin, handle((req, res) => {
  const products = inventory.setCatalogOrder(db, req.body && req.body.ids, req.body && req.body.featured);
  store.save();
  res.json({ products, ok: true });
}));

app.get("/api/admin/home-collections", requireAdmin, (req, res) => {
  res.json({ collections: home.listCollections(db) });
});

app.patch(
  "/api/admin/home-collections/:id",
  requireAdmin,
  express.json({ limit: "3mb" }),
  handle((req, res) => {
    const collection = home.updateCollection(db, req.params.id, req.body || {}, uploadsDir);
    store.save();
    res.json({ collection, collections: home.listCollections(db) });
  })
);

app.get("/api/admin/posts", requireAdmin, (req, res) => {
  res.json({ posts: db.posts });
});

app.patch("/api/admin/posts/:id", requireAdmin, (req, res) => {
  const post = db.posts.find((entry) => entry.id === req.params.id);
  if (!post) return fail(res, 404, "Note not found.");
  if (!["published", "hidden"].includes(req.body.status)) return fail(res, 400, "Unknown status.");
  post.status = req.body.status;
  store.save();
  res.json({ post });
});

const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(path.join(uploadsDir, "inventory"), { recursive: true });
fs.mkdirSync(path.join(uploadsDir, "home"), { recursive: true });
app.use(
  "/uploads",
  express.static(uploadsDir, {
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  })
);

// Wraps handlers so inventory/POS helpers can throw { status, message, ...extra } errors.
function handle(fn) {
  return (req, res, next) => {
    try {
      fn(req, res, next);
    } catch (error) {
      if (!error || !error.status) return next(error);
      const { status, message, ...extra } = error;
      delete extra.stack;
      return res.status(status).json({ error: message, ...extra });
    }
  };
}

app.get("/api/inventory", requireAdmin, (req, res) => {
  const items = inventory.listItems(db, {
    q: req.query.q,
    category: req.query.category,
    lowStock: req.query.lowStock,
  });
  res.json({ items });
});

app.post("/api/inventory", requireAdmin, handle((req, res) => {
  const item = inventory.createItem(db, req.body || {});
  store.save();
  res.status(201).json({ item });
}));

app.post("/api/inventory/batch", requireAdmin, express.json({ limit: "3mb" }), handle((req, res) => {
  const items = inventory.createItems(db, req.body && req.body.items, req.body && req.body.image, uploadsDir);
  store.save();
  res.status(201).json({ items });
}));

app.post("/api/inventory/import-catalog", requireAdmin, handle((req, res) => {
  const result = inventory.importCatalogProducts(db);
  store.save();
  res.json({
    ok: true,
    createdCount: result.createdCount,
    skippedCount: result.skippedCount,
    items: inventory.listItems(db),
  });
}));

app.get("/api/inventory/categories", requireAdmin, (req, res) => {
  res.json({ categories: inventory.listCategories(db) });
});

app.post("/api/inventory/categories", requireAdmin, handle((req, res) => {
  const category = inventory.addCategory(db, req.body && req.body.name);
  store.save();
  res.status(201).json({ category, categories: inventory.listCategories(db) });
}));

app.patch("/api/inventory/categories", requireAdmin, handle((req, res) => {
  const category = inventory.renameCategory(db, req.body && req.body.from, req.body && req.body.to);
  store.save();
  res.json({ category, categories: inventory.listCategories(db) });
}));

app.delete("/api/inventory/categories", requireAdmin, handle((req, res) => {
  const category = inventory.removeCategory(db, req.body && req.body.name);
  store.save();
  res.json({ category, categories: inventory.listCategories(db) });
}));

app.post("/api/inventory/:id/sizes", requireAdmin, handle((req, res) => {
  const result = inventory.addSizes(db, req.params.id, req.body && req.body.sizes, {
    stock: req.body && req.body.stock,
  });
  store.save();
  res.status(201).json(result);
}));

app.get("/api/inventory/by-barcode/:code", requireAdmin, (req, res) => {
  const item = inventory.findByBarcode(db, req.params.code);
  if (!item) return fail(res, 404, "No item has that barcode.");
  res.json({ item });
});

app.post("/api/inventory/barcodes/batch", requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 200) : [];
  if (!ids.length) return fail(res, 400, "Choose at least one item.");
  const items = [];
  const missing = [];
  ids.forEach((itemId) => {
    const item = inventory.findById(db, itemId);
    if (!item) return missing.push(itemId);
    items.push({
      id: item.id,
      sku: item.sku,
      name: item.name,
      color: item.color,
      size: item.size,
      price: item.price,
      barcode: item.barcode,
      svg: barcode.code128Svg(item.barcode),
    });
  });
  res.json({ items, missing });
});

app.get("/api/inventory/:id", requireAdmin, (req, res) => {
  const item = inventory.findById(db, req.params.id);
  if (!item) return fail(res, 404, "Item not found.");
  res.json({ item });
});

app.patch("/api/inventory/:id", requireAdmin, handle((req, res) => {
  const item = inventory.updateItem(db, req.params.id, req.body || {});
  store.save();
  res.json({ item });
}));

app.delete("/api/inventory/:id", requireAdmin, handle((req, res) => {
  inventory.deleteItem(db, req.params.id, uploadsDir);
  store.save();
  res.json({ ok: true });
}));

app.post("/api/inventory/:id/image", requireAdmin, express.json({ limit: "3mb" }), handle((req, res) => {
  const item = inventory.findById(db, req.params.id);
  if (!item) return fail(res, 404, "Item not found.");
  const previous = item.image;
  item.image = inventory.saveImageFromBase64(uploadsDir, item.id, req.body && req.body.image);
  item.updatedAt = new Date().toISOString();
  item.version += 1;
  inventory.removeImageFile(uploadsDir, previous);
  store.save();
  res.json({ item });
}));

app.get("/api/inventory/:id/barcode.svg", requireAdmin, (req, res) => {
  const item = inventory.findById(db, req.params.id);
  if (!item) return fail(res, 404, "Item not found.");
  try {
    const svg = barcode.code128Svg(item.barcode, {
      scale: req.query.scale,
      height: req.query.height,
      text: req.query.text !== "0",
    });
    res.type("image/svg+xml").send(svg);
  } catch (error) {
    fail(res, 400, error.message);
  }
});

app.get("/api/pos/catalog", requireAdmin, handle((req, res) => {
  res.json(pos.catalogSince(db, req.query.since));
}));

app.post("/api/pos/sessions", requireAdmin, handle((req, res) => {
  const session = pos.createSession(db, req.body || {}, req.user);
  store.save();
  res.status(201).json({ session });
}));

app.get("/api/pos/sessions/:code", requireAdmin, (req, res) => {
  const session = pos.findOpenSessionByCode(db, req.params.code);
  if (!session) return fail(res, 404, "No open session has that code.");
  res.json({ session });
});

app.patch("/api/pos/sessions/:id", requireAdmin, handle((req, res) => {
  const session = pos.updateSession(db, req.params.id, req.body || {});
  store.save();
  res.json({ session });
}));

app.post("/api/pos/sessions/:id/close", requireAdmin, handle((req, res) => {
  const session = pos.closeSession(db, req.params.id);
  store.save();
  res.json({ session });
}));

app.post("/api/pos/sessions/:id/scans", requireAdmin, handle((req, res) => {
  const event = pos.pushScanEvent(db, req.params.id, req.body && req.body.barcode);
  store.save();
  res.status(201).json({ event, item: event.item });
}));

app.get("/api/pos/sessions/:id/events", requireAdmin, handle((req, res) => {
  res.json(pos.pullEvents(db, req.params.id, req.query.since));
}));

app.post("/api/pos/sales", requireAdmin, handle((req, res) => {
  const { sale, duplicate } = pos.finalizeSale(db, req.body || {}, req.user);
  store.save();
  res.status(duplicate ? 200 : 201).json({ sale, duplicate });
}));

app.get("/api/pos/sales", requireAdmin, handle((req, res) => {
  const sales = pos.listSales(db, {
    since: req.query.since,
    sessionId: req.query.sessionId,
    limit: req.query.limit,
  });
  res.json({ sales });
}));

app.post("/api/pos/sales/sync", requireAdmin, handle((req, res) => {
  const result = pos.syncSales(db, req.body && req.body.sales, req.user, { force: req.body.force === true });
  store.save();
  res.json(result);
}));

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found." });
});

if (process.env.NODE_ENV === "production") {
  const pub = path.join(__dirname, "..", "public");
  app.use(express.static(pub));
  app.get("*", (req, res) => {
    res.sendFile(path.join(pub, "index.html"));
  });
}

app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") return fail(res, 413, "That upload is too large.");
  if (err && err.type === "entity.parse.failed") return fail(res, 400, "Request body is not valid JSON.");
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`StyleARZ API listening on http://${host}:${port}`);
});

module.exports = app;
