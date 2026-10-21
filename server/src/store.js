const fs = require("fs");
const path = require("path");
const { buildSeed } = require("./seed");
const { ensureCollections, ensureSortOrders } = require("./inventory");
const { ensureHomeCollections } = require("./home");

const file = path.join(__dirname, "..", "data", "db.json");
let db;

function load() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    db = buildSeed();
    ensureSortOrders(db);
    ensureHomeCollections(db);
    save();
    return db;
  }
  db = JSON.parse(fs.readFileSync(file, "utf8"));
  let dirty = ensureCollections(db);
  if (ensureSortOrders(db)) dirty = true;
  if (ensureHomeCollections(db)) dirty = true;
  if (dirty) save();
  return db;
}

function save() {
  fs.writeFileSync(file, JSON.stringify(db, null, 2));
}

function get() {
  return db;
}

module.exports = { load, save, get };
