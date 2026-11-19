/**
 * SQL repository helpers for StyleARZ MySQL tables.
 * Domain modules still mutate the in-memory store hydrated from these tables;
 * `store.save()` persists back through `persist.js`. Use these helpers when you
 * need a direct indexed lookup without scanning memory.
 */
const { query } = require("./pool");
const { parseDoc } = require("./persist");

async function findUserByEmail(email) {
  const rows = await query("SELECT doc FROM users WHERE email = :email LIMIT 1", {
    email: String(email || "").toLowerCase(),
  });
  return parseDoc(rows[0]);
}

async function findUserById(id) {
  const rows = await query("SELECT doc FROM users WHERE id = :id LIMIT 1", { id });
  return parseDoc(rows[0]);
}

async function findInventoryByBarcode(barcode) {
  const rows = await query("SELECT doc FROM inventory_items WHERE barcode = :barcode LIMIT 1", {
    barcode: String(barcode || "").trim(),
  });
  return parseDoc(rows[0]);
}

async function findInventoryById(id) {
  const rows = await query("SELECT doc FROM inventory_items WHERE id = :id LIMIT 1", { id });
  return parseDoc(rows[0]);
}

async function listLabelDrafts({ status, q, date } = {}) {
  let sql = "SELECT doc FROM label_drafts WHERE 1=1";
  const params = {};
  if (status === "draft" || status === "converted") {
    sql += " AND status = :status";
    params.status = status;
  }
  if (date) {
    sql += " AND created_at LIKE :day";
    params.day = `${date}%`;
  }
  sql += " ORDER BY created_at DESC";
  const rows = await query(sql, params);
  let items = rows.map(parseDoc).filter(Boolean);
  if (q) {
    const term = String(q).toLowerCase();
    items = items.filter((draft) =>
      [draft.name, draft.barcode, draft.size, draft.note, String(draft.price)].join(" ").toLowerCase().includes(term)
    );
  }
  return items;
}

async function findOpenPosSessionByCode(code) {
  const rows = await query(
    "SELECT doc FROM pos_sessions WHERE code = :code AND status = 'open' LIMIT 1",
    { code: String(code || "").trim().toUpperCase() }
  );
  return parseDoc(rows[0]);
}

async function listProducts() {
  const rows = await query("SELECT doc FROM products ORDER BY sort_order ASC, id ASC");
  return rows.map(parseDoc).filter(Boolean);
}

async function listOrders() {
  const rows = await query("SELECT doc FROM orders ORDER BY created_at DESC");
  return rows.map(parseDoc).filter(Boolean);
}

async function listHomeCollections() {
  const rows = await query("SELECT doc FROM home_collections ORDER BY sort_order ASC");
  return rows.map(parseDoc).filter(Boolean);
}

module.exports = {
  findUserByEmail,
  findUserById,
  findInventoryByBarcode,
  findInventoryById,
  listLabelDrafts,
  findOpenPosSessionByCode,
  listProducts,
  listOrders,
  listHomeCollections,
};
