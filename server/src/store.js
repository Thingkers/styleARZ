const { getPool } = require("./db/pool");
const { migrate } = require("./db/migrate");
const { loadAll, saveAll } = require("./db/persist");
const { buildSeed, ensureIconCategoryProducts, ensureFakeCatalogMovedToHome } = require("./seed");
const { ensureCollections, ensureSortOrders } = require("./inventory");
const { ensureLabelDrafts } = require("./labels");
const { ensureHomeCollections } = require("./home");
const { ensureGrandOpeningCampaign } = require("./offers");

let db;
let saving = Promise.resolve();

async function countUsers(connection) {
  const [rows] = await connection.query("SELECT COUNT(*) AS c FROM users");
  return Number(rows[0]?.c || 0);
}

function prepareSeed() {
  const next = buildSeed();
  ensureCollections(next);
  ensureSortOrders(next);
  ensureHomeCollections(next);
  ensureIconCategoryProducts(next);
  ensureFakeCatalogMovedToHome(next);
  ensureLabelDrafts(next);
  ensureGrandOpeningCampaign(next);
  return next;
}

async function load() {
  await migrate();
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    const userCount = await countUsers(connection);
    if (userCount === 0) {
      db = prepareSeed();
    } else {
      db = await loadAll(connection);
      let dirty = ensureCollections(db);
      if (ensureSortOrders(db)) dirty = true;
      if (ensureHomeCollections(db)) dirty = true;
      if (ensureIconCategoryProducts(db)) dirty = true;
      if (ensureFakeCatalogMovedToHome(db)) dirty = true;
      if (ensureLabelDrafts(db)) dirty = true;
      if (ensureGrandOpeningCampaign(db)) dirty = true;
      if (!dirty) return db;
    }
  } finally {
    connection.release();
  }
  await save();
  return db;
}

function get() {
  if (!db) throw new Error("Database has not been loaded yet.");
  return db;
}

async function save() {
  if (!db) throw new Error("Database has not been loaded yet.");
  const snapshot = db;
  saving = saving
    .catch(() => {})
    .then(() => saveAll(snapshot));
  return saving;
}

async function resetWithSeed() {
  db = prepareSeed();
  await save();
  return db;
}

module.exports = { load, save, get, resetWithSeed };
