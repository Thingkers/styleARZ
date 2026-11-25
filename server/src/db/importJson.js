const fs = require("fs");
const path = require("path");
const { migrate } = require("./migrate");
const { saveAll } = require("./persist");
const { closePool } = require("./pool");
const { ensureCollections, ensureSortOrders } = require("../inventory");
const { ensureLabelDrafts } = require("../labels");
const { ensureHomeCollections } = require("../home");
const { ensureIconCategoryProducts, ensureFakeCatalogMovedToHome } = require("../seed");
const { ensureGrandOpeningCampaign } = require("../offers");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "..", "..", ".env");
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

async function importJson(filePath) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`JSON file not found: ${absolute}`);
  }
  const db = JSON.parse(fs.readFileSync(absolute, "utf8"));
  ensureCollections(db);
  ensureSortOrders(db);
  ensureHomeCollections(db);
  ensureIconCategoryProducts(db);
  ensureFakeCatalogMovedToHome(db);
  ensureGrandOpeningCampaign(db);
  ensureLabelDrafts(db);
  await migrate();
  await saveAll(db);
  return {
    users: (db.users || []).length,
    products: (db.products || []).length,
    inventoryItems: (db.inventoryItems || []).length,
    labelDrafts: (db.labelDrafts || []).length,
    orders: (db.orders || []).length,
  };
}

async function main() {
  loadEnv();
  const file = process.argv[2] || path.join(__dirname, "..", "..", "data", "db.json");
  const summary = await importJson(file);
  console.log("Imported db.json into MySQL:", summary);
  await closePool();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { importJson };
