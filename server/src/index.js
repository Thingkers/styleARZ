const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const store = require("./store");
const { hashPassword, verifyPassword, signToken, verifyToken, publicUser } = require("./auth");
const { suggestSize, quizResult, budgetOutfit, priceItems } = require("./logic");
const inventory = require("./inventory");
const labels = require("./labels");
const home = require("./home");
const pos = require("./pos");
const sms = require("./sms");
const broadcast = require("./broadcast");
const barcode = require("./barcode");
const offers = require("./offers");
const roles = require("./roles");
const { productMatchesCategory, categoriesMatch } = require("./categoryMatch");

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

let db;
const app = express();

app.use(cors({ origin: true }));
const jsonBody = express.json({ limit: "1mb" });
// Inventory image uploads carry base64 images and use their own larger parser after auth.
app.use(async (req, res, next) => {
  if (req.method === "POST" && /^\/api\/inventory\/[^/]+\/image\/?$/.test(req.path)) return next();
  if (req.method === "POST" && /^\/api\/labels\/?$/.test(req.path)) return next();
  if (req.method === "PATCH" && /^\/api\/labels\/[^/]+\/?$/.test(req.path)) return next();
  if (req.method === "PATCH" && /^\/api\/admin\/home-collections\/[^/]+\/?$/.test(req.path)) return next();
  return jsonBody(req, res, next);
});

app.use(async (req, res, next) => {
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
  if (!roles.isStaff(req.user)) return fail(res, 403, "Atelier access only.");
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!roles.isSuperAdmin(req.user)) return fail(res, 403, "Shop owner (superadmin) access only.");
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

app.get("/api/health", async (req, res) => {
  res.json({ ok: true, service: "stylearz" });
});

app.get("/api/meta", async (req, res) => {
  const catalog = inventory.shopCatalog(db);
  const featured = ["Saree", "Panjabi", "Dress", "Jeans", "Shirt", "T-Shirt"];
  const found = [...new Set(catalog.map((product) => product.category))];
  const categories = [];
  featured.forEach((name) => {
    if (catalog.some((product) => productMatchesCategory(product, name))) categories.push(name);
  });
  found.forEach((name) => {
    if (!categories.some((entry) => categoriesMatch(entry, name))) categories.push(name);
  });
  const occasions = [...new Set(catalog.flatMap((product) => product.occasions))];
  const colors = [];
  catalog.forEach((product) => {
    product.colors.forEach((color) => {
      if (!colors.some((entry) => entry.name === color.name)) colors.push(color);
    });
  });
  res.json({
    categories,
    occasions,
    colors,
    audiences: ["Men", "Women", "Children", "Unisex"],
    rules: inventory.CATEGORY_AUDIENCE_RULES,
  });
});

app.get("/api/products", async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const category = String(req.query.category || "");
  const occasion = String(req.query.occasion || "");
  const featuredOnly = req.query.featured === "1";
  // Home featured grid includes display (image-only) + sellable featured pieces.
  const catalogKind = featuredOnly ? "all" : req.query.kind === "display" ? "display" : "sellable";
  let products = inventory.shopCatalog(db, { kind: catalogKind });
  if (q) {
    products = products.filter((product) =>
      `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(q)
    );
  }
  let audience = String(req.query.audience || "");
  // Ignore meaningless pairs (Saree+Men, Panjabi+Women) instead of returning empty.
  if (category && audience) {
    const allowed = inventory.allowedAudiencesForCategory(category);
    if (!allowed.includes(audience)) audience = "";
  }
  if (category) products = products.filter((product) => productMatchesCategory(product, category));
  if (occasion) products = products.filter((product) => product.occasions.includes(occasion));
  if (audience) products = products.filter((product) => product.audience === audience);
  if (featuredOnly) products = products.filter((product) => product.featured);
  // Keep catalog sortOrder after filters so home featured matches admin drag order.
  products = products.slice().sort((a, b) => {
    const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : 9999;
    const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : 9999;
    if (ao !== bo) return ao - bo;
    return String(a.name).localeCompare(String(b.name));
  });
  res.json({ products });
});

app.get("/api/products/:id", async (req, res) => {
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

app.post("/api/fit", async (req, res) => {
  const result = suggestSize(req.body || {});
  if (result.error) return fail(res, 400, result.error);
  res.json(result);
});

app.get("/api/home-collections", async (req, res) => {
  res.json({ collections: home.listCollections(db) });
});

app.get("/api/looks", async (req, res) => {
  res.json({ looks: db.looks });
});

app.get("/api/looks/:id", async (req, res) => {
  const look = db.looks.find((entry) => entry.id === req.params.id);
  if (!look) return fail(res, 404, "Look not found.");
  const products = look.productIds
    .map((productId) => db.products.find((product) => product.id === productId))
    .filter(Boolean);
  res.json({ look, products });
});

app.post("/api/studio/budget", async (req, res) => {
  const result = budgetOutfit(db.products, req.body.budget, req.body.occasion || "Everyday");
  if (result.error) return fail(res, 400, result.error);
  res.json(result);
});

app.post("/api/auth/signup", async (req, res) => {
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
  await store.save();
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || "");
  const user = db.users.find((entry) => entry.email === email);
  if (!user || !verifyPassword(password, user)) return fail(res, 401, "Email or password is incorrect.");
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/auth/me", async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.patch("/api/auth/profile", requireUser, async (req, res) => {
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
  }

  await store.save();
  res.json({
    user: publicUser(user),
    token: signToken(user),
    message: "Account updated.",
  });
});

app.post("/api/auth/forgot", async (req, res) => {
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
  await store.save();
  res.json({
    ok: true,
    resetCode: user.resetCode,
    message: "Email delivery is not connected yet, so the reset code is shown here. It expires in 30 minutes.",
  });
});

app.post("/api/auth/reset", async (req, res) => {
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
  await store.save();
  res.json({ ok: true, message: "Password updated. You can sign in." });
});

app.get("/api/wishlist", requireUser, async (req, res) => {
  res.json({ productIds: req.user.wishlist || [] });
});

app.put("/api/wishlist", requireUser, async (req, res) => {
  const ids = Array.isArray(req.body.productIds) ? req.body.productIds : [];
  // Accept any shop-catalog id (classic products and listed inventory), not only db.products.
  const allowed = new Set(inventory.shopCatalog(db).map((product) => product.id));
  req.user.wishlist = [...new Set(ids.map(String).filter((productId) => allowed.has(productId)))];
  await store.save();
  res.json({ productIds: req.user.wishlist });
});

app.post("/api/orders", async (req, res) => {
  const catalog = inventory.shopCatalog(db);
  const priced = priceItems(catalog, req.body.items);
  if (priced.error) return fail(res, 400, priced.error);
  const name = String(req.body.name || "").trim();
  const email = cleanEmail(req.body.email);
  const address = String(req.body.address || "").trim();
  const city = String(req.body.city || "").trim();
  const country = String(req.body.country || "").trim();
  const paymentMethod = String(req.body.paymentMethod || "card").toLowerCase();
  if (!["card", "cod"].includes(paymentMethod)) {
    return fail(res, 400, "Choose card or cash on delivery.");
  }
  let last4 = "";
  if (paymentMethod === "card") {
    last4 = String(req.body.paymentLast4 || "");
    if (!/^\d{4}$/.test(last4)) return fail(res, 400, "Enter a card so we can confirm the last four digits.");
  }
  if (name.length < 2) return fail(res, 400, "Enter the recipient name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, "Enter a valid email.");
  if (!address || !city || !country) return fail(res, 400, "Enter a full delivery address.");
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
    paymentMethod,
    paymentLast4: paymentMethod === "card" ? last4 : null,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };
  db.orders.unshift(order);
  if (req.user) {
    const payNote = paymentMethod === "cod" ? " Cash on delivery." : "";
    notify(
      req.user.id,
      `Order ${order.id} confirmed`,
      `${priced.items.length} piece${priced.items.length === 1 ? "" : "s"} confirmed.${payNote} The atelier will pack them next.`
    );
  }
  await store.save();
  res.status(201).json({ order });
});

app.get("/api/orders", requireUser, async (req, res) => {
  const orders = db.orders.filter((order) => order.userId === req.user.id || order.email === req.user.email);
  res.json({ orders });
});

app.get("/api/orders/:id", async (req, res) => {
  const order = db.orders.find((entry) => entry.id === req.params.id);
  if (!order) return fail(res, 404, "Order not found.");
  if (req.user && req.user.role !== "admin" && order.userId && order.userId !== req.user.id && order.email !== req.user.email) {
    return fail(res, 403, "This order belongs to another account.");
  }
  res.json({ order });
});

app.get("/api/wardrobe", requireUser, async (req, res) => {
  res.json({ items: db.wardrobe.filter((item) => item.userId === req.user.id) });
});

app.post("/api/wardrobe", requireUser, async (req, res) => {
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
  await store.save();
  res.status(201).json({ item });
});

app.delete("/api/wardrobe/:id", requireUser, async (req, res) => {
  const before = db.wardrobe.length;
  db.wardrobe = db.wardrobe.filter((item) => !(item.id === req.params.id && item.userId === req.user.id));
  if (db.wardrobe.length === before) return fail(res, 404, "Wardrobe piece not found.");
  await store.save();
  res.json({ ok: true });
});

app.get("/api/outfits", requireUser, async (req, res) => {
  res.json({ outfits: db.outfits.filter((outfit) => outfit.userId === req.user.id) });
});

app.post("/api/outfits", requireUser, async (req, res) => {
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
  await store.save();
  res.status(201).json({ outfit });
});

app.delete("/api/outfits/:id", requireUser, async (req, res) => {
  db.outfits = db.outfits.filter((outfit) => !(outfit.id === req.params.id && outfit.userId === req.user.id));
  await store.save();
  res.json({ ok: true });
});

app.get("/api/planner", requireUser, async (req, res) => {
  const entries = db.planner
    .filter((entry) => entry.userId === req.user.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  res.json({ entries });
});

app.post("/api/planner", requireUser, async (req, res) => {
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
  await store.save();
  res.status(201).json({ entry });
});

app.post("/api/planner/:id/worn", requireUser, async (req, res) => {
  const entry = db.planner.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!entry) return fail(res, 404, "Plan not found.");
  entry.wornCount += 1;
  entry.lastWorn = new Date().toISOString();
  await store.save();
  res.json({ entry });
});

app.delete("/api/planner/:id", requireUser, async (req, res) => {
  db.planner = db.planner.filter((entry) => !(entry.id === req.params.id && entry.userId === req.user.id));
  await store.save();
  res.json({ ok: true });
});

app.get("/api/community", async (req, res) => {
  const posts = db.posts.filter((post) => post.status === "published");
  res.json({ posts });
});

app.post("/api/community", requireUser, async (req, res) => {
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
  await store.save();
  res.status(201).json({ post });
});

app.post("/api/community/:id/like", async (req, res) => {
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
  await store.save();
  res.json({ likes: post.likes, liked: post.likedBy.includes(key) });
});

app.get("/api/notifications", requireUser, async (req, res) => {
  const notifications = db.notifications.filter((item) => item.userId === req.user.id);
  res.json({
    notifications,
    unread: notifications.filter((item) => !item.read).length,
  });
});

app.post("/api/notifications/:id/read", requireUser, async (req, res) => {
  const item = db.notifications.find((entry) => entry.id === req.params.id && entry.userId === req.user.id);
  if (!item) return fail(res, 404, "Notification not found.");
  item.read = true;
  await store.save();
  res.json({ notification: item });
});

app.post("/api/notifications/read-all", requireUser, async (req, res) => {
  db.notifications.forEach((item) => {
    if (item.userId === req.user.id) item.read = true;
  });
  await store.save();
  res.json({ ok: true });
});

app.post("/api/quiz", async (req, res) => {
  const answers = req.body.answers || {};
  if (!answers.life || !answers.palette) return fail(res, 400, "Answer the style questions to continue.");
  const result = quizResult(answers, db.products);
  result.createdAt = new Date().toISOString();
  if (req.user) {
    req.user.preferences = result;
    notify(req.user.id, "Your edit is ready", result.title);
    await store.save();
  }
  const products = result.productIds
    .map((productId) => db.products.find((product) => product.id === productId))
    .filter(Boolean);
  res.json({ result, products });
});

app.get("/api/quiz", async (req, res) => {
  if (!req.user || !req.user.preferences) return res.json({ result: null, products: [] });
  const products = req.user.preferences.productIds
    .map((productId) => db.products.find((product) => product.id === productId))
    .filter(Boolean);
  res.json({ result: req.user.preferences, products });
});

app.get("/api/admin/settings", requireSuperAdmin, async (req, res) => {
  const settings = db.settings && typeof db.settings === "object" ? db.settings : {};
  res.json({
    settings: {
      smsSenderPhone: String(settings.smsSenderPhone || "").trim(),
    },
    sms: {
      provider: String(process.env.SMS_PROVIDER || "log"),
      configured: sms.smsConfigured(),
    },
  });
});

app.put("/api/admin/settings", requireSuperAdmin, handle(async (req, res) => {
  const body = req.body || {};
  const phoneRaw = body.smsSenderPhone !== undefined ? body.smsSenderPhone : db.settings?.smsSenderPhone;
  const normalized = phoneRaw ? sms.normalizeBdPhone(phoneRaw) : "";
  if (String(phoneRaw || "").trim() && !normalized) {
    const err = new Error("Enter a valid Bangladesh mobile number (01XXXXXXXXX) for SMS sender.");
    err.status = 400;
    throw err;
  }
  db.settings = {
    ...(db.settings && typeof db.settings === "object" ? db.settings : {}),
    smsSenderPhone: normalized,
  };
  await store.save();
  res.json({
    settings: db.settings,
    sms: {
      provider: String(process.env.SMS_PROVIDER || "log"),
      configured: sms.smsConfigured(),
    },
  });
}));

app.get("/api/admin/messages", requireSuperAdmin, handle(async (_req, res) => {
  broadcast.ensureBroadcastCollections(db);
  res.json({
    audiences: broadcast.AUDIENCES,
    counts: broadcast.audienceCounts(db),
    broadcasts: broadcast.listBroadcasts(db),
    sms: {
      provider: String(process.env.SMS_PROVIDER || "log"),
      configured: sms.smsConfigured(),
      senderPhone: String(db.settings?.smsSenderPhone || "").trim(),
    },
  });
}));

app.post("/api/admin/messages/preview", requireSuperAdmin, handle(async (req, res) => {
  const preview = await broadcast.sendBroadcast(db, { ...(req.body || {}), dryRun: true });
  res.json(preview);
}));

app.post("/api/admin/messages/send", requireSuperAdmin, handle(async (req, res) => {
  const result = await broadcast.sendBroadcast(db, { ...(req.body || {}), dryRun: false });
  await store.save();
  res.json(result);
}));

app.get("/api/offers", handle(async (_req, res) => {
  res.json({
    offers: offers.listPublicOffers(db),
    slides: offers.listHeroSlides(db),
    deck: offers.listHeroCards(db),
  });
}));

app.get("/api/pos/offers/preview", requireAdmin, handle(async (req, res) => {
  const preview = offers.previewOffer(db, {
    phone: req.query.phone,
    subtotal: req.query.subtotal,
  });
  res.json({ offer: preview });
}));

app.get("/api/admin/offers/templates", requireSuperAdmin, handle(async (_req, res) => {
  res.json({ templates: offers.listTemplates() });
}));

function offerAdminPayload(campaign) {
  return {
    campaign,
    campaigns: offers.listCampaigns(db),
    templates: offers.listTemplates(),
    activeNow: Boolean(offers.getActiveCampaign(db)),
    customers: offers.listOfferCustomers(db, campaign.id),
    customerSummary: offers.summarizeOfferCustomers(db, campaign.id),
  };
}

app.post("/api/admin/offers/templates/:id/apply", requireSuperAdmin, handle(async (req, res) => {
  const campaign = offers.applyTemplate(db, req.params.id, {
    resetClaims: Boolean(req.body && req.body.resetClaims),
    asNew: Boolean(req.body && req.body.asNew),
  });
  await store.save();
  res.json(offerAdminPayload(campaign));
}));

app.post("/api/admin/offers/campaign", requireSuperAdmin, handle(async (req, res) => {
  const campaign = offers.createCampaign(db, req.body || {});
  await store.save();
  res.status(201).json(offerAdminPayload(campaign));
}));

app.get("/api/admin/offers/campaign", requireSuperAdmin, handle(async (req, res) => {
  const id = String(req.query.id || offers.GRAND_OPENING_ID);
  const campaign = offers.getCampaign(db, id);
  if (!campaign) return res.status(404).json({ error: "Offer campaign not found." });
  res.json(offerAdminPayload(campaign));
}));

app.patch("/api/admin/offers/campaign", requireSuperAdmin, handle(async (req, res) => {
  const body = req.body || {};
  const id = String(body.id || req.query.id || offers.GRAND_OPENING_ID);
  const campaign = offers.updateCampaign(db, body, id);
  await store.save();
  res.json(offerAdminPayload(campaign));
}));

app.post("/api/admin/offers/campaign/:id/image", requireSuperAdmin, express.json({ limit: "3mb" }), handle(async (req, res) => {
  const offerUploads = path.join(__dirname, "..", "uploads");
  fs.mkdirSync(path.join(offerUploads, "offers"), { recursive: true });
  const campaign = offers.setCampaignImage(db, req.params.id, offerUploads, req.body && req.body.image);
  await store.save();
  res.json(offerAdminPayload(campaign));
}));

app.delete("/api/admin/offers/campaign/:id", requireSuperAdmin, handle(async (req, res) => {
  const offerUploads = path.join(__dirname, "..", "uploads");
  offers.deleteCampaign(db, req.params.id, offerUploads);
  const fallback = offers.getCampaign(db, offers.GRAND_OPENING_ID);
  await store.save();
  res.json({ ok: true, ...offerAdminPayload(fallback) });
}));

app.get("/api/admin/offers/customers", requireSuperAdmin, handle(async (req, res) => {
  const campaignId = String(req.query.campaignId || offers.GRAND_OPENING_ID);
  res.json({
    customers: offers.listOfferCustomers(db, campaignId),
    summary: offers.summarizeOfferCustomers(db, campaignId),
  });
}));

app.get("/api/admin/overview", requireAdmin, async (req, res) => {
  const liveOrders = db.orders.filter((order) => order.status !== "cancelled");
  const revenue = liveOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const posSales = db.posSales || [];
  const posRevenue = posSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);

  const dayCount = 14;
  const dayKeys = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  for (let i = dayCount - 1; i >= 0; i -= 1) {
    const day = new Date(cursor);
    day.setDate(cursor.getDate() - i);
    dayKeys.push(day.toISOString().slice(0, 10));
  }
  const onlineByDay = Object.fromEntries(dayKeys.map((key) => [key, 0]));
  const posByDay = Object.fromEntries(dayKeys.map((key) => [key, 0]));
  liveOrders.forEach((order) => {
    const key = String(order.createdAt || "").slice(0, 10);
    if (key in onlineByDay) onlineByDay[key] += Number(order.total || 0);
  });
  posSales.forEach((sale) => {
    const key = String(sale.createdAt || "").slice(0, 10);
    if (key in posByDay) posByDay[key] += Number(sale.total || 0);
  });

  const statusOrder = ["confirmed", "packing", "shipped", "delivered", "cancelled"];
  const statusCounts = Object.fromEntries(statusOrder.map((status) => [status, 0]));
  db.orders.forEach((order) => {
    const status = statusCounts[order.status] !== undefined ? order.status : "confirmed";
    statusCounts[status] += 1;
  });

  const paymentMix = { card: 0, cod: 0, other: 0 };
  liveOrders.forEach((order) => {
    const method = String(order.paymentMethod || (order.paymentLast4 ? "card" : "other")).toLowerCase();
    if (method === "cod") paymentMix.cod += 1;
    else if (method === "card") paymentMix.card += 1;
    else paymentMix.other += 1;
  });

  res.json({
    revenue,
    posRevenue,
    totalRevenue: revenue + posRevenue,
    orders: db.orders.length,
    clients: db.users.filter((user) => user.role === "customer").length,
    lowStock: db.products.filter((product) => product.stock < 3),
    posts: db.posts.length,
    charts: {
      revenueSeries: dayKeys.map((date) => ({
        date,
        online: onlineByDay[date],
        pos: posByDay[date],
        total: onlineByDay[date] + posByDay[date],
      })),
      orderStatus: statusOrder.map((status) => ({
        key: status,
        label: status,
        value: statusCounts[status],
      })),
      channelMix: {
        online: revenue,
        pos: posRevenue,
      },
      paymentMix,
    },
  });
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  res.json({ orders: db.orders });
});

app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
  const order = db.orders.find((entry) => entry.id === req.params.id);
  if (!order) return fail(res, 404, "Order not found.");
  const allowed = ["confirmed", "packing", "shipped", "delivered", "cancelled"];
  if (!allowed.includes(req.body.status)) return fail(res, 400, "Unknown status.");
  order.status = req.body.status;
  if (order.userId) notify(order.userId, `Order ${order.id}`, `Status is now ${order.status}.`);
  await store.save();
  res.json({ order });
});

app.get("/api/admin/users", requireSuperAdmin, async (req, res) => {
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

app.patch("/api/admin/users/:id", requireSuperAdmin, async (req, res) => {
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
    if (!["customer", "admin", "superadmin"].includes(body.role)) {
      return fail(res, 400, "Role must be customer, admin, or superadmin.");
    }
    if (!roles.isSuperAdmin(req.user) && body.role === "superadmin") {
      return fail(res, 403, "Only the shop owner can assign superadmin.");
    }
    if (roles.isSuperAdmin(user) && body.role !== "superadmin") {
      const owners = db.users.filter((entry) => entry.role === "superadmin");
      if (owners.length <= 1) return fail(res, 400, "Keep at least one shop owner (superadmin) account.");
    }
    if (user.role === "admin" && body.role === "customer") {
      const staff = db.users.filter((entry) => roles.isStaff(entry));
      if (staff.length <= 1) return fail(res, 400, "Keep at least one admin or shop owner account.");
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
  }

  await store.save();
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

app.get("/api/admin/home-products", requireAdmin, async (req, res) => {
  const products = inventory.shopCatalog(db, { kind: "display" });
  res.json({ products });
});

app.post("/api/admin/home-products", requireAdmin, handle(async (req, res) => {
  const product = inventory.createDisplayProduct(db, req.body || {}, uploadsDir);
  await store.save();
  res.status(201).json({ product });
}));

app.delete("/api/admin/home-products/:id", requireAdmin, handle(async (req, res) => {
  const result = inventory.deleteDisplayProduct(db, req.params.id, uploadsDir);
  await store.save();
  res.json({ ok: true, ...result });
}));

app.post("/api/admin/home-products/:id/image", requireAdmin, handle(async (req, res) => {
  const product = db.products.find((entry) => entry.id === req.params.id && inventory.productKindOf(entry) === "display");
  if (!product) return fail(res, 404, "Home product not found.");
  const previous = product.image;
  product.image = inventory.saveImageFromBase64(uploadsDir, product.id, req.body && req.body.image, "home");
  await store.save();
  if (previous && String(previous).startsWith("/uploads/home/")) {
    try {
      const absolute = path.join(uploadsDir, previous.replace(/^\/uploads\//, ""));
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
    } catch {
      /* ignore */
    }
  }
  res.json({ product });
}));

app.patch("/api/admin/products/:id", requireAdmin, handle(async (req, res) => {
  const product = db.products.find((entry) => entry.id === req.params.id);
  if (product) {
    if (req.body.name) product.name = String(req.body.name).trim().slice(0, 80);
    if (req.body.price !== undefined && inventory.productKindOf(product) !== "display") {
      const price = Number(req.body.price);
      if (!price || price < 1) return fail(res, 400, "Enter a valid price.");
      product.price = Math.round(price);
    }
    if (req.body.stock !== undefined && inventory.productKindOf(product) !== "display") {
      const stock = Number(req.body.stock);
      if (stock < 0 || Number.isNaN(stock)) return fail(res, 400, "Stock cannot be negative.");
      product.stock = Math.round(stock);
    }
    if (req.body.featured !== undefined) product.featured = Boolean(req.body.featured);
    if (req.body.audience !== undefined && inventory.AUDIENCES.includes(req.body.audience)) {
      product.audience = req.body.audience;
    }
    if (req.body.description !== undefined) {
      product.description = String(req.body.description || "").trim().slice(0, 400);
    }
    if (req.body.sortOrder !== undefined) {
      const order = Number(req.body.sortOrder);
      if (!Number.isInteger(order) || order < 0) return fail(res, 400, "Sort order must be a whole number.");
      product.sortOrder = order;
    }
    if (req.body.productKind !== undefined) {
      const kind = req.body.productKind === "display" ? "display" : "sellable";
      product.productKind = kind;
    }
    await store.save();
    return res.json({ product });
  }
  const item = inventory.updateItem(db, req.params.id, {
    featured: req.body.featured,
    sortOrder: req.body.sortOrder,
    price: req.body.price,
    stock: req.body.stock,
    name: req.body.name,
  });
  await store.save();
  res.json({ product: inventory.toShopProduct(item) });
}));

app.put("/api/admin/catalog-order", requireAdmin, handle(async (req, res) => {
  const products = inventory.setCatalogOrder(db, req.body && req.body.ids, req.body && req.body.featured);
  await store.save();
  res.json({ products, ok: true });
}));

app.get("/api/admin/home-collections", requireAdmin, async (req, res) => {
  res.json({ collections: home.listCollections(db) });
});

app.patch(
  "/api/admin/home-collections/:id",
  requireAdmin,
  express.json({ limit: "3mb" }),
  handle(async (req, res) => {
    const collection = home.updateCollection(db, req.params.id, req.body || {}, uploadsDir);
    await store.save();
    res.json({ collection, collections: home.listCollections(db) });
  })
);

app.get("/api/admin/posts", requireAdmin, async (req, res) => {
  res.json({ posts: db.posts });
});

app.patch("/api/admin/posts/:id", requireAdmin, async (req, res) => {
  const post = db.posts.find((entry) => entry.id === req.params.id);
  if (!post) return fail(res, 404, "Note not found.");
  if (!["published", "hidden"].includes(req.body.status)) return fail(res, 400, "Unknown status.");
  post.status = req.body.status;
  await store.save();
  res.json({ post });
});

const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(path.join(uploadsDir, "inventory"), { recursive: true });
fs.mkdirSync(path.join(uploadsDir, "labels"), { recursive: true });
fs.mkdirSync(path.join(uploadsDir, "home"), { recursive: true });
fs.mkdirSync(path.join(uploadsDir, "offers"), { recursive: true });
app.use(
  "/uploads",
  express.static(uploadsDir, {
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  })
);

// Wraps handlers so inventory/POS helpers can throw { status, message, ...extra } errors.
function handle(fn) {
  return async (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch((error) => {
        if (!error || !error.status) return next(error);
        const { status, message, ...extra } = error;
        delete extra.stack;
        return res.status(status).json({ error: message, ...extra });
      });
  };
}

app.get("/api/inventory", requireAdmin, async (req, res) => {
  const items = inventory.listItems(db, {
    q: req.query.q,
    category: req.query.category,
    lowStock: req.query.lowStock,
  });
  res.json({ items });
});

app.post("/api/inventory", requireAdmin, handle(async (req, res) => {
  const item = inventory.createItem(db, req.body || {});
  await store.save();
  res.status(201).json({ item });
}));

app.post("/api/inventory/import-catalog", requireAdmin, handle(async (req, res) => {
  const result = inventory.importCatalogProducts(db);
  await store.save();
  res.json({
    ok: true,
    createdCount: result.createdCount,
    skippedCount: result.skippedCount,
    items: inventory.listItems(db),
  });
}));

app.get("/api/inventory/categories", requireAdmin, async (req, res) => {
  res.json({
    categories: inventory.listCategories(db),
    audiences: inventory.AUDIENCES,
    rules: inventory.CATEGORY_AUDIENCE_RULES,
  });
});

app.post("/api/inventory/categories", requireSuperAdmin, handle(async (req, res) => {
  const category = inventory.addCategory(db, req.body && req.body.name, req.body && req.body.audiences);
  await store.save();
  res.status(201).json({
    category,
    categories: inventory.listCategories(db),
    audiences: inventory.AUDIENCES,
    rules: inventory.CATEGORY_AUDIENCE_RULES,
  });
}));

app.patch("/api/inventory/categories", requireSuperAdmin, handle(async (req, res) => {
  const category = inventory.renameCategory(
    db,
    req.body && req.body.from,
    req.body && (req.body.to || req.body.name),
    req.body && req.body.audiences
  );
  await store.save();
  res.json({
    category,
    categories: inventory.listCategories(db),
    audiences: inventory.AUDIENCES,
    rules: inventory.CATEGORY_AUDIENCE_RULES,
  });
}));

app.delete("/api/inventory/categories", requireSuperAdmin, handle(async (req, res) => {
  const category = inventory.removeCategory(db, req.body && req.body.name);
  await store.save();
  res.json({
    category,
    categories: inventory.listCategories(db),
    audiences: inventory.AUDIENCES,
    rules: inventory.CATEGORY_AUDIENCE_RULES,
  });
}));

app.post("/api/inventory/:id/sizes", requireAdmin, handle(async (req, res) => {
  const result = inventory.addSizes(db, req.params.id, req.body && req.body.sizes, {
    stock: req.body && req.body.stock,
  });
  await store.save();
  res.status(201).json(result);
}));

app.get("/api/labels", requireAdmin, handle(async (req, res) => {
  res.json({
    items: labels.listDrafts(db, {
      q: req.query.q,
      status: req.query.status,
      date: req.query.date,
    }),
  });
}));

app.post("/api/labels", requireAdmin, express.json({ limit: "3mb" }), handle(async (req, res) => {
  const draft = labels.createDraft(db, uploadsDir, req.body || {});
  await store.save();
  res.status(201).json({ item: draft });
}));

app.patch("/api/labels/:id", requireAdmin, express.json({ limit: "3mb" }), handle(async (req, res) => {
  const draft = labels.updateDraft(db, uploadsDir, req.params.id, req.body || {});
  await store.save();
  res.json({ item: draft });
}));

app.delete("/api/labels/:id", requireAdmin, handle(async (req, res) => {
  labels.deleteDraft(db, req.params.id, uploadsDir);
  await store.save();
  res.json({ ok: true });
}));

app.post("/api/labels/barcodes/batch", requireAdmin, handle(async (req, res) => {
  res.json(labels.barcodesBatch(db, req.body && req.body.ids));
}));

app.post("/api/labels/convert", requireAdmin, handle(async (req, res) => {
  const result = labels.convertDrafts(db, uploadsDir, req.body || {});
  await store.save();
  res.status(201).json(result);
}));

app.get("/api/inventory/by-barcode/:code", requireAdmin, async (req, res) => {
  const item = inventory.findByBarcode(db, req.params.code);
  if (!item) return fail(res, 404, "No item has that barcode.");
  res.json({ item });
});

app.post("/api/inventory/barcodes/batch", requireAdmin, async (req, res) => {
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

app.get("/api/inventory/:id", requireAdmin, async (req, res) => {
  const item = inventory.findById(db, req.params.id);
  if (!item) return fail(res, 404, "Item not found.");
  res.json({ item });
});

app.patch("/api/inventory/:id", requireAdmin, handle(async (req, res) => {
  const item = inventory.updateItem(db, req.params.id, req.body || {});
  await store.save();
  res.json({ item });
}));

app.delete("/api/inventory/:id", requireAdmin, handle(async (req, res) => {
  inventory.deleteItem(db, req.params.id, uploadsDir);
  await store.save();
  res.json({ ok: true });
}));

app.post("/api/inventory/:id/image", requireAdmin, express.json({ limit: "3mb" }), handle(async (req, res) => {
  const item = inventory.findById(db, req.params.id);
  if (!item) return fail(res, 404, "Item not found.");
  const previous = item.image;
  item.image = inventory.saveImageFromBase64(uploadsDir, item.id, req.body && req.body.image);
  item.updatedAt = new Date().toISOString();
  item.version += 1;
  inventory.removeImageFile(uploadsDir, previous);
  await store.save();
  res.json({ item });
}));

app.get("/api/inventory/:id/barcode.svg", requireAdmin, async (req, res) => {
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

app.get("/api/pos/catalog", requireAdmin, handle(async (req, res) => {
  res.json(pos.catalogSince(db, req.query.since));
}));

app.post("/api/pos/sessions", requireAdmin, handle(async (req, res) => {
  const session = pos.createSession(db, req.body || {}, req.user);
  await store.save();
  res.status(201).json({ session });
}));

app.get("/api/pos/sessions", requireAdmin, handle(async (_req, res) => {
  res.json({ sessions: pos.listOpenSessions(db) });
}));

/** Lookup barcode in inventory without adding to a cart. */
app.get("/api/pos/barcode/:code", requireAdmin, handle(async (req, res) => {
  res.json(pos.lookupBarcode(db, req.params.code));
}));

app.post("/api/pos/barcode/lookup", requireAdmin, handle(async (req, res) => {
  res.json(pos.lookupBarcode(db, req.body && req.body.barcode));
}));

app.get("/api/pos/sessions/:code", requireAdmin, async (req, res) => {
  const session = pos.findOpenSessionByCode(db, req.params.code);
  if (!session) return fail(res, 404, "No open session has that code.");
  res.json({ session });
});

app.patch("/api/pos/sessions/:id", requireAdmin, handle(async (req, res) => {
  const session = pos.updateSession(db, req.params.id, req.body || {});
  await store.save();
  res.json({ session });
}));

app.post("/api/pos/sessions/:id/close", requireAdmin, handle(async (req, res) => {
  const session = pos.closeSession(db, req.params.id);
  await store.save();
  res.json({ session });
}));

app.post("/api/pos/sessions/:id/scans", requireAdmin, handle(async (req, res) => {
  const event = pos.pushScanEvent(db, req.params.id, req.body && req.body.barcode);
  await store.save();
  res.status(201).json({
    barcode: event.barcode,
    found: event.found,
    item: event.item,
    message: event.found
      ? `${event.item.name} sent to the register cart.`
      : `Barcode ${event.barcode} is not in the database.`,
    event,
  });
}));

app.get("/api/pos/sessions/:id/events", requireAdmin, handle(async (req, res) => {
  res.json(pos.pullEvents(db, req.params.id, req.query.since));
}));

app.post("/api/pos/sales", requireAdmin, handle(async (req, res) => {
  const { sale, duplicate } = pos.finalizeSale(db, req.body || {}, req.user);
  await store.save();
  res.status(duplicate ? 200 : 201).json({ sale, duplicate });
}));

app.get("/api/pos/sales", requireAdmin, handle(async (req, res) => {
  const sales = pos.listSales(db, {
    since: req.query.since,
    sessionId: req.query.sessionId,
    limit: req.query.limit,
  });
  res.json({ sales });
}));

app.get("/api/pos/sales/:id", requireAdmin, handle(async (req, res) => {
  const sale = pos.findSaleById(db, req.params.id);
  if (!sale) return res.status(404).json({ error: "Sale not found." });
  res.json({ sale });
}));

app.delete("/api/pos/sales/:id", requireAdmin, handle(async (req, res) => {
  const restoreStock = req.query.restoreStock !== "0" && req.body?.restoreStock !== false;
  const { sale } = pos.deleteSale(db, req.params.id, { restoreStock });
  await store.save();
  res.json({ ok: true, sale });
}));

app.post("/api/pos/sales/:id/sms", requireAdmin, handle(async (req, res) => {
  const sale = pos.findSaleById(db, req.params.id);
  if (!sale) return res.status(404).json({ error: "Sale not found." });
  const phone = String((req.body && req.body.phone) || sale.customerPhone || "").trim();
  const message = sms.formatSaleSms(sale);
  const fromPhone = String(db.settings?.smsSenderPhone || "").trim();
  const result = await sms.sendSms({ phone, message, fromPhone });
  const normalized = result.phone || phone;
  if (normalized && sale.customerPhone !== normalized) {
    sale.customerPhone = normalized;
    sale.smsSentAt = new Date().toISOString();
    await store.save();
  } else if (normalized) {
    sale.smsSentAt = new Date().toISOString();
    await store.save();
  }
  res.json({ ...result, sale });
}));

app.get("/api/pos/search", requireAdmin, handle(async (req, res) => {
  const q = String(req.query.q || "").trim();
  const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 16));
  if (!q) return res.json({ items: [] });
  const items = inventory.listItems(db, { q }).slice(0, limit).map((item) => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    barcode: item.barcode,
    color: item.color,
    size: item.size,
    category: item.category,
    image: item.image || "",
    price: item.price,
    stock: item.stock,
    notes: item.notes,
  }));
  res.json({ items });
}));

app.post("/api/pos/sales/sync", requireAdmin, handle(async (req, res) => {
  const result = pos.syncSales(db, req.body && req.body.sales, req.user, { force: req.body.force === true });
  await store.save();
  res.json(result);
}));

app.use("/api", async (req, res) => {
  res.status(404).json({ error: "Not found." });
});

if (process.env.NODE_ENV === "production") {
  const pub = path.join(__dirname, "..", "public");
  app.use(express.static(pub));
  app.get("*", (req, res) => {
    const indexPath = path.join(pub, "index.html");
    if (!fs.existsSync(indexPath)) {
      return res
        .status(503)
        .type("html")
        .send("<!doctype html><title>StyleARZ</title><p>Frontend build missing. Redeploy <code>server/public</code>.</p>");
    }
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error(err);
        if (!res.headersSent) {
          res.status(500).type("html").send("<!doctype html><title>StyleARZ</title><p>Could not load the site shell.</p>");
        }
      }
    });
  });
}

app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") return fail(res, 413, "That upload is too large.");
  if (err && err.type === "entity.parse.failed") return fail(res, 400, "Request body is not valid JSON.");
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

async function start() {
  db = await store.load();
  if (roles.ensureSuperAdmin(db)) {
    await store.save();
    console.log("Promoted an admin account to superadmin (shop owner).");
  }
  const port = Number(process.env.PORT) || 4000;
  const host = process.env.HOST || "0.0.0.0";
  app.listen(port, host, () => {
    console.log(`StyleARZ API listening on http://${host}:${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Failed to start StyleARZ API:", error);
    process.exit(1);
  });
}

module.exports = app;
module.exports.start = start;
