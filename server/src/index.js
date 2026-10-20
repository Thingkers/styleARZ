const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const store = require("./store");
const { hashPassword, verifyPassword, signToken, verifyToken, publicUser } = require("./auth");
const { suggestSize, quizResult, budgetOutfit, priceItems } = require("./logic");

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

const db = store.load();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
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
  const categories = [...new Set(db.products.map((product) => product.category))];
  const occasions = [...new Set(db.products.flatMap((product) => product.occasions))];
  const colors = [];
  db.products.forEach((product) => {
    product.colors.forEach((color) => {
      if (!colors.some((entry) => entry.name === color.name)) colors.push(color);
    });
  });
  res.json({ categories, occasions, colors, audiences: ["Men", "Women", "Children"] });
});

app.get("/api/products", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const category = String(req.query.category || "");
  const occasion = String(req.query.occasion || "");
  let products = db.products.slice();
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
  res.json({ products });
});

app.get("/api/products/:id", (req, res) => {
  const product = db.products.find((entry) => entry.id === req.params.id);
  if (!product) return fail(res, 404, "Piece not found.");
  const related = db.products
    .filter((entry) => entry.id !== product.id && (entry.category === product.category || entry.slot === product.slot))
    .slice(0, 4);
  res.json({ product, related });
});

app.post("/api/fit", (req, res) => {
  const result = suggestSize(req.body || {});
  if (result.error) return fail(res, 400, result.error);
  res.json(result);
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

app.post("/api/auth/forgot", (req, res) => {
  const email = cleanEmail(req.body.email);
  const user = db.users.find((entry) => entry.email === email);
  if (!user) {
    return res.json({
      ok: true,
      message: "If that email is registered, a reset code is ready.",
    });
  }
  user.resetCode = String(Math.floor(100000 + Math.random() * 900000));
  user.resetExpires = Date.now() + 30 * 60 * 1000;
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
  if (!user || !user.resetCode || user.resetCode !== code || user.resetExpires < Date.now()) {
    return fail(res, 400, "The reset code is invalid or has expired.");
  }
  if (password.length < 6) return fail(res, 400, "Use at least 6 characters.");
  const next = hashPassword(password);
  user.salt = next.salt;
  user.hash = next.hash;
  user.resetCode = null;
  user.resetExpires = null;
  store.save();
  res.json({ ok: true, message: "Password updated. You can sign in." });
});

app.get("/api/wishlist", requireUser, (req, res) => {
  res.json({ productIds: req.user.wishlist || [] });
});

app.put("/api/wishlist", requireUser, (req, res) => {
  const ids = Array.isArray(req.body.productIds) ? req.body.productIds : [];
  req.user.wishlist = ids.filter((productId) => db.products.some((product) => product.id === productId));
  store.save();
  res.json({ productIds: req.user.wishlist });
});

app.post("/api/orders", (req, res) => {
  const priced = priceItems(db.products, req.body.items);
  if (priced.error) return fail(res, 400, priced.error);
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
    const product = db.products.find((entry) => entry.id === item.productId);
    product.stock -= item.qty;
  });
  const order = {
    id: `SA-${10000 + Math.floor(Math.random() * 90000)}`,
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
  if (req.user && req.user.role !== "admin" && order.userId && order.userId !== req.user.id && order.email !== req.user.email) {
    return fail(res, 403, "This order belongs to another account.");
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

app.patch("/api/admin/products/:id", requireAdmin, (req, res) => {
  const product = db.products.find((entry) => entry.id === req.params.id);
  if (!product) return fail(res, 404, "Piece not found.");
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
  store.save();
  res.json({ product });
});

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
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`StyleARZ API listening on http://${host}:${port}`);
});

module.exports = app;
