const crypto = require("crypto");
const { ensureCollections, findByBarcode, findById, httpError } = require("./inventory");

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MODES = ["dual", "solo"];
const PAYMENT_METHODS = ["cash", "card", "mobile", "other"];
const MAX_SYNC_BATCH = 200;

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

function randomCode() {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function cleanMode(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const mode = String(value).toLowerCase();
  if (!MODES.includes(mode)) throw httpError(400, "Mode must be dual or solo.");
  return mode;
}

function expireSessions(db) {
  const now = Date.now();
  db.posSessions.forEach((session) => {
    if (session.status === "open" && new Date(session.expiresAt).getTime() <= now) {
      session.status = "closed";
      session.closedAt = nowIso();
      session.closeReason = "expired";
    }
  });
}

function pruneEvents(db) {
  const cutoff = Date.now() - EVENT_TTL_MS;
  db.posScanEvents = db.posScanEvents.filter((event) => new Date(event.createdAt).getTime() > cutoff);
}

function lineFromItem(item, qty) {
  return {
    itemId: item.id,
    sku: item.sku,
    barcode: item.barcode,
    name: item.name,
    color: item.color,
    size: item.size,
    price: item.price,
    cost: item.cost,
    qty,
    lineTotal: round2(item.price * qty),
  };
}

// Turns client cart/item rows ({ itemId | barcode, qty }) into trusted cart lines using live inventory.
function normalizeCart(db, rows) {
  if (!Array.isArray(rows)) throw httpError(400, "Cart must be a list of items.");
  if (rows.length > 100) throw httpError(400, "Cart is too large.");
  const merged = new Map();
  rows.forEach((row) => {
    if (!row || typeof row !== "object") throw httpError(400, "Each cart row needs an item and quantity.");
    const qty = Number(row.qty === undefined ? 1 : row.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw httpError(400, "Quantity must be a whole number from 1 to 999.");
    const item = (row.itemId && findById(db, row.itemId)) || (row.barcode && findByBarcode(db, row.barcode));
    if (!item) throw httpError(404, `Item not found: ${row.barcode || row.itemId || "unknown"}.`);
    merged.set(item.id, (merged.get(item.id) || 0) + qty);
  });
  return Array.from(merged, ([itemId, qty]) => lineFromItem(findById(db, itemId), qty));
}

function createSession(db, input = {}, user) {
  ensureCollections(db);
  expireSessions(db);
  let code;
  do {
    code = randomCode();
  } while (db.posSessions.some((session) => session.status === "open" && session.code === code));
  const now = Date.now();
  const session = {
    id: randomId("ps"),
    code,
    mode: cleanMode(input.mode, "dual"),
    cart: [],
    status: "open",
    createdBy: user ? user.id : null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    closedAt: null,
  };
  if (input.cart !== undefined) session.cart = normalizeCart(db, input.cart);
  db.posSessions.unshift(session);
  if (db.posSessions.length > 300) db.posSessions = db.posSessions.slice(0, 300);
  return session;
}

function findSessionById(db, id) {
  expireSessions(db);
  return db.posSessions.find((session) => session.id === id) || null;
}

function findOpenSessionByCode(db, code) {
  expireSessions(db);
  const wanted = String(code || "").trim().toUpperCase();
  return db.posSessions.find((session) => session.status === "open" && session.code === wanted) || null;
}

function requireOpenSession(db, id) {
  const session = findSessionById(db, id);
  if (!session) throw httpError(404, "Session not found.");
  if (session.status !== "open") throw httpError(409, "This session is closed.");
  return session;
}

function updateSession(db, id, patch = {}) {
  const session = requireOpenSession(db, id);
  if (patch.mode !== undefined) session.mode = cleanMode(patch.mode, session.mode);
  if (patch.cart !== undefined) session.cart = normalizeCart(db, patch.cart);
  session.updatedAt = nowIso();
  return session;
}

function closeSession(db, id, reason) {
  const session = findSessionById(db, id);
  if (!session) throw httpError(404, "Session not found.");
  if (session.status === "open") {
    session.status = "closed";
    session.closedAt = nowIso();
    session.closeReason = reason || "closed";
    session.updatedAt = session.closedAt;
  }
  return session;
}

// Records a scan from the handheld so the register can pull it. Unknown barcodes are recorded too.
function pushScanEvent(db, sessionId, barcode) {
  ensureCollections(db);
  const session = requireOpenSession(db, sessionId);
  const code = String(barcode || "").trim();
  if (!code) throw httpError(400, "Scan a barcode first.");
  pruneEvents(db);
  const item = findByBarcode(db, code);
  const seq = db.posScanEvents.reduce((max, event) => Math.max(max, event.seq || 0), 0) + 1;
  const event = {
    id: randomId("pe"),
    seq,
    sessionId: session.id,
    type: "scan",
    barcode: code,
    found: Boolean(item),
    itemId: item ? item.id : null,
    item: item ? { ...item } : null,
    createdAt: nowIso(),
  };
  db.posScanEvents.push(event);
  session.updatedAt = event.createdAt;
  return event;
}

// `since` is either a numeric event seq or an ISO timestamp.
function pullEvents(db, sessionId, since) {
  ensureCollections(db);
  const session = findSessionById(db, sessionId);
  if (!session) throw httpError(404, "Session not found.");
  let events = db.posScanEvents.filter((event) => event.sessionId === session.id);
  const raw = String(since === undefined ? "" : since).trim();
  if (raw) {
    if (/^\d+$/.test(raw)) {
      events = events.filter((event) => event.seq > Number(raw));
    } else {
      const time = Date.parse(raw);
      if (Number.isNaN(time)) throw httpError(400, "since must be an event number or ISO date.");
      events = events.filter((event) => new Date(event.createdAt).getTime() > time);
    }
  }
  events.sort((a, b) => a.seq - b.seq);
  const cursor = events.length ? events[events.length - 1].seq : raw && /^\d+$/.test(raw) ? Number(raw) : 0;
  return { events, cursor, status: session.status, serverTime: nowIso() };
}

function nextReceiptNo(db) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const today = db.posSales.filter((sale) => String(sale.receiptNo || "").includes(stamp)).length;
  return `POS-${stamp}-${String(today + 1).padStart(4, "0")}`;
}

function pricing(lines, discountInput) {
  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const discount = discountInput === undefined || discountInput === "" ? 0 : Number(discountInput);
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) throw httpError(400, "Discount must be between zero and the subtotal.");
  return { subtotal, discount: round2(discount), total: round2(subtotal - discount) };
}

function paymentMethod(value) {
  const method = String(value || "cash").toLowerCase();
  if (!PAYMENT_METHODS.includes(method)) throw httpError(400, "Unknown payment method.");
  return method;
}

function applyStock(db, lines, now, clamp) {
  lines.forEach((line) => {
    const item = findById(db, line.itemId);
    if (!item) return;
    item.stock = clamp ? Math.max(0, item.stock - line.qty) : item.stock - line.qty;
    item.updatedAt = now;
    item.version += 1;
  });
}

function stockProblems(db, lines) {
  const need = new Map();
  lines.forEach((line) => need.set(line.itemId, (need.get(line.itemId) || 0) + line.qty));
  const problems = [];
  need.forEach((qty, itemId) => {
    const item = findById(db, itemId);
    if (!item) problems.push({ itemId, reason: "item_not_found" });
    else if (item.stock < qty) {
      problems.push({ itemId, name: item.name, reason: "insufficient_stock", requested: qty, available: item.stock });
    }
  });
  return problems;
}

// Sells from a session cart (input.sessionId) or from input.items. Decrements stock and closes the session.
function finalizeSale(db, input = {}, user) {
  ensureCollections(db);
  const clientId = input.clientId ? String(input.clientId).slice(0, 64) : null;
  if (clientId) {
    const existing = db.posSales.find((sale) => sale.clientId === clientId);
    if (existing) return { sale: existing, duplicate: true };
  }

  let session = null;
  let lines;
  if (input.sessionId) {
    session = requireOpenSession(db, input.sessionId);
    lines = Array.isArray(input.items) && input.items.length ? normalizeCart(db, input.items) : session.cart.map((line) => {
      const item = findById(db, line.itemId);
      if (!item) throw httpError(409, `${line.name} is no longer in inventory.`);
      return lineFromItem(item, line.qty);
    });
  } else {
    lines = normalizeCart(db, input.items);
  }
  if (!lines.length) throw httpError(400, "Add at least one item to the sale.");

  const problems = stockProblems(db, lines);
  if (problems.length) throw httpError(409, "Not enough stock for this sale.", { problems });

  const totals = pricing(lines, input.discount);
  const now = nowIso();
  applyStock(db, lines, now, false);
  const sale = {
    id: randomId("sale"),
    receiptNo: nextReceiptNo(db),
    clientId,
    sessionId: session ? session.id : null,
    items: lines,
    ...totals,
    paymentMethod: paymentMethod(input.paymentMethod),
    note: String(input.note || "").trim().slice(0, 300),
    cashierId: user ? user.id : null,
    source: "online",
    createdAt: now,
    syncedAt: now,
  };
  db.posSales.unshift(sale);
  if (session) closeSession(db, session.id, "sold");
  return { sale, duplicate: false };
}

function listSales(db, options = {}) {
  ensureCollections(db);
  let sales = db.posSales.slice();
  if (options.since) {
    const time = Date.parse(options.since);
    if (Number.isNaN(time)) throw httpError(400, "since must be an ISO date.");
    sales = sales.filter((sale) => new Date(sale.createdAt).getTime() > time);
  }
  if (options.sessionId) sales = sales.filter((sale) => sale.sessionId === options.sessionId);
  const limit = Math.min(500, Math.max(1, Number(options.limit) || 100));
  return sales.slice(0, limit);
}

// Applies offline sales. Each sale is all-or-nothing; sales that clash with live inventory are returned
// as conflicts and left unapplied unless `force` is set (then stock is clamped at zero).
function syncSales(db, sales, user, options = {}) {
  ensureCollections(db);
  if (!Array.isArray(sales)) throw httpError(400, "sales must be a list.");
  if (sales.length > MAX_SYNC_BATCH) throw httpError(400, `Send at most ${MAX_SYNC_BATCH} sales at a time.`);
  const accepted = [];
  const conflicts = [];

  sales.forEach((incoming) => {
    const clientId = incoming && incoming.clientId ? String(incoming.clientId).slice(0, 64) : "";
    if (!clientId) {
      conflicts.push({ clientId: null, reason: "missing_client_id", details: [] });
      return;
    }
    const existing = db.posSales.find((sale) => sale.clientId === clientId);
    if (existing) {
      accepted.push({ clientId, saleId: existing.id, receiptNo: existing.receiptNo, duplicate: true, warnings: [] });
      return;
    }

    const details = [];
    const warnings = [];
    const lines = [];
    const rows = Array.isArray(incoming.items) ? incoming.items : [];
    if (!rows.length) details.push({ reason: "empty_sale" });
    rows.forEach((row) => {
      const qty = Number(row && row.qty);
      const item = row && ((row.itemId && findById(db, row.itemId)) || (row.barcode && findByBarcode(db, row.barcode)));
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
        details.push({ itemId: row && row.itemId, reason: "invalid_quantity" });
        return;
      }
      if (!item) {
        const deleted = db.inventoryDeleted.some((entry) => entry.id === (row && row.itemId));
        details.push({ itemId: row.itemId, barcode: row.barcode, reason: deleted ? "item_deleted" : "item_not_found" });
        return;
      }
      const soldPrice = row.price === undefined ? item.price : Number(row.price);
      if (!Number.isFinite(soldPrice) || soldPrice < 0) {
        details.push({ itemId: item.id, reason: "invalid_price" });
        return;
      }
      if (soldPrice !== item.price) {
        warnings.push({ itemId: item.id, reason: "price_changed", soldPrice, currentPrice: item.price });
      }
      const line = lineFromItem(item, qty);
      line.price = round2(soldPrice);
      line.lineTotal = round2(soldPrice * qty);
      lines.push(line);
    });

    if (!details.length) {
      stockProblems(db, lines).forEach((problem) => details.push(problem));
    }
    const blocking = details.filter((detail) => !(options.force && detail.reason === "insufficient_stock"));
    if (blocking.length) {
      conflicts.push({
        clientId,
        reason: blocking[0].reason,
        details,
        items: details.map((detail) => findById(db, detail.itemId)).filter(Boolean),
      });
      return;
    }

    let totals;
    try {
      totals = pricing(lines, incoming.discount);
    } catch (error) {
      conflicts.push({ clientId, reason: "invalid_discount", details: [{ reason: "invalid_discount" }] });
      return;
    }
    let method;
    try {
      method = paymentMethod(incoming.paymentMethod);
    } catch (error) {
      method = "other";
      warnings.push({ reason: "payment_method_unknown" });
    }

    const now = nowIso();
    const soldAt = Date.parse(incoming.createdAt);
    applyStock(db, lines, now, true);
    const sale = {
      id: randomId("sale"),
      receiptNo: nextReceiptNo(db),
      clientId,
      sessionId: incoming.sessionId ? String(incoming.sessionId).slice(0, 64) : null,
      items: lines,
      ...totals,
      paymentMethod: method,
      note: String(incoming.note || "").trim().slice(0, 300),
      cashierId: user ? user.id : null,
      source: "offline",
      createdAt: Number.isNaN(soldAt) || soldAt > Date.now() ? now : new Date(soldAt).toISOString(),
      syncedAt: now,
    };
    if (details.length) sale.forced = details;
    db.posSales.unshift(sale);
    accepted.push({ clientId, saleId: sale.id, receiptNo: sale.receiptNo, duplicate: false, warnings });
  });

  return { accepted, conflicts };
}

// Items changed after `since`, plus ids deleted since then, for offline catalog refresh.
function catalogSince(db, since) {
  ensureCollections(db);
  let time = 0;
  if (since) {
    time = Date.parse(since);
    if (Number.isNaN(time)) throw httpError(400, "since must be an ISO date.");
  }
  const items = db.inventoryItems.filter((item) => new Date(item.updatedAt).getTime() > time);
  const deleted = db.inventoryDeleted.filter((entry) => new Date(entry.deletedAt).getTime() > time);
  return { items, deleted, serverTime: nowIso() };
}

module.exports = {
  MODES,
  createSession,
  findSessionById,
  findOpenSessionByCode,
  updateSession,
  closeSession,
  pushScanEvent,
  pullEvents,
  finalizeSale,
  listSales,
  syncSales,
  catalogSince,
};
