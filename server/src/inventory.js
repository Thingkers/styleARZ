const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { allocateBarcode } = require("./barcode");

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const IMAGE_URL_PREFIX = "/uploads/inventory/";

const DEFAULT_CATEGORIES = [
  "Shirts",
  "Knitwear",
  "Trousers",
  "Outerwear",
  "Dresses",
  "Sets",
  "Accessories",
];

function httpError(status, message, extra) {
  return Object.assign(new Error(message), { status, ...(extra || {}) });
}

// Adds retail/POS collections to older databases. Returns true when something changed.
function ensureCollections(db) {
  let changed = false;
  ["inventoryItems", "posSessions", "posScanEvents", "posSales", "inventoryDeleted"].forEach((key) => {
    if (!Array.isArray(db[key])) {
      db[key] = [];
      changed = true;
    }
  });
  if (!Number.isFinite(db.inventorySeq)) {
    db.inventorySeq = 1000;
    changed = true;
  }
  if (!Array.isArray(db.inventoryCategories) || !db.inventoryCategories.length) {
    db.inventoryCategories = DEFAULT_CATEGORIES.slice();
    changed = true;
  }
  return changed;
}

function newId() {
  return `inv_${crypto.randomBytes(4).toString("hex")}`;
}

function text(value, max) {
  return String(value === undefined || value === null ? "" : value).trim().slice(0, max);
}

function money(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw httpError(400, `Enter a valid ${label}.`);
  return Math.round(number * 100) / 100;
}

function wholeNumber(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw httpError(400, `${label} must be a whole number, zero or more.`);
  return number;
}

function cleanBarcode(value) {
  const code = text(value, 40);
  if (!/^[\x21-\x7e]{3,40}$/.test(code)) throw httpError(400, "Barcode must be 3-40 printable characters without spaces.");
  return code;
}

function findByBarcode(db, code) {
  const wanted = String(code || "").trim().toUpperCase();
  if (!wanted) return null;
  return (db.inventoryItems || []).find((item) => String(item.barcode).toUpperCase() === wanted) || null;
}

function findById(db, id) {
  return (db.inventoryItems || []).find((item) => item.id === id) || null;
}

function assertUnique(db, field, value, selfId) {
  if (!value) return;
  const wanted = String(value).toUpperCase();
  const clash = db.inventoryItems.find(
    (item) => item.id !== selfId && String(item[field] || "").toUpperCase() === wanted
  );
  if (clash) throw httpError(409, `Another item already uses that ${field}.`);
}

function createItem(db, input = {}) {
  ensureCollections(db);
  const name = text(input.name, 120);
  if (name.length < 2) throw httpError(400, "Enter an item name.");
  const price = money(input.price, "price");
  const cost = input.cost === undefined || input.cost === "" ? 0 : money(input.cost, "cost");
  const stock = input.stock === undefined || input.stock === "" ? 0 : wholeNumber(input.stock, "Stock");

  let barcode = "";
  if (input.barcode) {
    barcode = cleanBarcode(input.barcode);
    assertUnique(db, "barcode", barcode);
  } else {
    barcode = allocateBarcode(db);
  }

  const sku = text(input.sku, 40) || `SKU-${barcode.replace(/^SA/i, "")}`;
  assertUnique(db, "sku", sku);

  const now = new Date().toISOString();
  const item = {
    id: newId(),
    sku,
    barcode,
    name,
    color: text(input.color, 40),
    colorHex: text(input.colorHex, 20) || "",
    size: text(input.size, 20),
    category: text(input.category, 60),
    price,
    cost,
    stock,
    image: typeof input.image === "string" ? text(input.image, 200) : "",
    notes: text(input.notes, 400),
    listed: input.listed === false ? false : true,
    featured: Boolean(input.featured),
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : nextSortOrder(db),
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  db.inventoryItems.unshift(item);
  return item;
}

function addSizes(db, id, sizesInput, options = {}) {
  ensureCollections(db);
  const parent = findById(db, id);
  if (!parent) throw httpError(404, "Item not found.");
  const sizes = [...new Set((Array.isArray(sizesInput) ? sizesInput : []).map((size) => text(size, 20)).filter(Boolean))];
  if (!sizes.length) throw httpError(400, "Select at least one size.");
  const stock =
    options.stock === undefined || options.stock === ""
      ? parent.stock
      : wholeNumber(options.stock, "Stock");
  const created = [];
  const skipped = [];
  for (const size of sizes) {
    const exists = db.inventoryItems.some(
      (item) =>
        item.name === parent.name &&
        item.color === parent.color &&
        item.size === size &&
        item.category === parent.category
    );
    if (exists || parent.size === size) {
      skipped.push(size);
      continue;
    }
    const item = createItem(db, {
      name: parent.name,
      color: parent.color,
      colorHex: parent.colorHex,
      size,
      category: parent.category,
      price: parent.price,
      cost: parent.cost,
      stock,
      notes: parent.notes,
      image: parent.image || "",
      listed: parent.listed !== false,
    });
    created.push(item);
  }
  if (!created.length) throw httpError(409, "Those sizes already exist for this item.");
  return { created, skipped };
}

function toShopProduct(item) {
  const colorName = item.color || "Default";
  const hex = item.colorHex && /^#[0-9a-fA-F]{3,8}$/.test(item.colorHex) ? item.colorHex : "#4e4e4e";
  return {
    id: item.id,
    name: item.name,
    audience: "Unisex",
    category: item.category || "Retail",
    slot: "other",
    price: item.price,
    stock: item.stock,
    featured: Boolean(item.featured),
    grade: "A",
    sizes: item.size ? [item.size] : ["One"],
    colors: [{ name: colorName, hex }],
    occasions: ["Everyday"],
    image: item.image || "/images/studio-table.jpg",
    description: item.notes || `${item.name} from the StyleARZ floor — also available in store.`,
    details: [
      item.barcode ? `Barcode ${item.barcode}` : null,
      item.size ? `Size ${item.size}` : null,
      item.color ? `Colour ${item.color}` : null,
    ].filter(Boolean),
    source: "inventory",
    sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : 9999,
  };
}

function nextSortOrder(db) {
  ensureCollections(db);
  let max = -1;
  (db.products || []).forEach((product) => {
    if (Number.isFinite(product.sortOrder) && product.sortOrder > max) max = product.sortOrder;
  });
  (db.inventoryItems || []).forEach((item) => {
    if (Number.isFinite(item.sortOrder) && item.sortOrder > max) max = item.sortOrder;
  });
  return max + 1;
}

function ensureSortOrders(db) {
  ensureCollections(db);
  let changed = false;
  let cursor = 0;
  const assign = (entry) => {
    if (!Number.isFinite(entry.sortOrder)) {
      entry.sortOrder = cursor;
      changed = true;
    }
    cursor = Math.max(cursor, entry.sortOrder) + 1;
  };
  (db.products || []).forEach(assign);
  (db.inventoryItems || []).forEach(assign);
  return changed;
}

function setCatalogOrder(db, ids, featuredById) {
  ensureCollections(db);
  if (!Array.isArray(ids) || !ids.length) throw httpError(400, "Send the catalog ids in order.");
  const featuredMap =
    featuredById && typeof featuredById === "object" && !Array.isArray(featuredById) ? featuredById : null;
  const seen = new Set();
  ids.forEach((id, index) => {
    const key = String(id || "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    const product = (db.products || []).find((entry) => entry.id === key);
    if (product) {
      product.sortOrder = index;
      if (featuredMap && Object.prototype.hasOwnProperty.call(featuredMap, key)) {
        product.featured = Boolean(featuredMap[key]);
      }
      return;
    }
    const item = findById(db, key);
    if (item) {
      item.sortOrder = index;
      if (featuredMap && Object.prototype.hasOwnProperty.call(featuredMap, key)) {
        item.featured = Boolean(featuredMap[key]);
        item.updatedAt = new Date().toISOString();
        item.version = (item.version || 1) + 1;
      }
    }
  });
  return shopCatalog(db);
}

function shopCatalog(db) {
  ensureCollections(db);
  ensureSortOrders(db);
  const retail = db.inventoryItems.filter((item) => item.listed !== false).map(toShopProduct);
  const catalog = [
    ...(db.products || []).map((product) => ({
      ...product,
      source: product.source || "shop",
      sortOrder: Number.isFinite(product.sortOrder) ? product.sortOrder : 9999,
    })),
    ...retail,
  ];
  catalog.sort((a, b) => {
    const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : 9999;
    const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : 9999;
    if (ao !== bo) return ao - bo;
    return String(a.name).localeCompare(String(b.name));
  });
  return catalog;
}

function findShopProduct(db, id) {
  const product = (db.products || []).find((entry) => entry.id === id);
  if (product) return { product, kind: "product" };
  const item = findById(db, id);
  if (item && item.listed !== false) return { product: toShopProduct(item), kind: "inventory", item };
  return null;
}

function listCategories(db) {
  ensureCollections(db);
  return db.inventoryCategories.slice().sort((a, b) => a.localeCompare(b));
}

function addCategory(db, name) {
  ensureCollections(db);
  const clean = text(name, 60);
  if (clean.length < 2) throw httpError(400, "Enter a category name.");
  if (db.inventoryCategories.some((entry) => entry.toLowerCase() === clean.toLowerCase())) {
    throw httpError(409, "That category already exists.");
  }
  db.inventoryCategories.push(clean);
  return clean;
}

function renameCategory(db, from, to) {
  ensureCollections(db);
  const current = text(from, 60);
  const next = text(to, 60);
  if (next.length < 2) throw httpError(400, "Enter a category name.");
  const index = db.inventoryCategories.findIndex((entry) => entry.toLowerCase() === current.toLowerCase());
  if (index < 0) throw httpError(404, "Category not found.");
  if (db.inventoryCategories.some((entry, i) => i !== index && entry.toLowerCase() === next.toLowerCase())) {
    throw httpError(409, "That category already exists.");
  }
  const previous = db.inventoryCategories[index];
  db.inventoryCategories[index] = next;
  db.inventoryItems.forEach((item) => {
    if (item.category === previous) item.category = next;
  });
  return next;
}

function removeCategory(db, name) {
  ensureCollections(db);
  const current = text(name, 60);
  const index = db.inventoryCategories.findIndex((entry) => entry.toLowerCase() === current.toLowerCase());
  if (index < 0) throw httpError(404, "Category not found.");
  const [removed] = db.inventoryCategories.splice(index, 1);
  return removed;
}

function updateItem(db, id, patch = {}) {
  ensureCollections(db);
  const item = findById(db, id);
  if (!item) throw httpError(404, "Item not found.");
  if (patch.baseVersion !== undefined && Number(patch.baseVersion) !== item.version) {
    throw httpError(409, "This item changed since you loaded it.", { item });
  }

  const next = {};
  if (patch.name !== undefined) {
    next.name = text(patch.name, 120);
    if (next.name.length < 2) throw httpError(400, "Enter an item name.");
  }
  if (patch.price !== undefined) next.price = money(patch.price, "price");
  if (patch.cost !== undefined) next.cost = money(patch.cost, "cost");
  if (patch.stock !== undefined) next.stock = wholeNumber(patch.stock, "Stock");
  if (patch.color !== undefined) next.color = text(patch.color, 40);
  if (patch.colorHex !== undefined) next.colorHex = text(patch.colorHex, 20);
  if (patch.size !== undefined) next.size = text(patch.size, 20);
  if (patch.category !== undefined) next.category = text(patch.category, 60);
  if (patch.notes !== undefined) next.notes = text(patch.notes, 400);
  if (patch.listed !== undefined) next.listed = Boolean(patch.listed);
  if (patch.featured !== undefined) next.featured = Boolean(patch.featured);
  if (patch.sortOrder !== undefined) next.sortOrder = wholeNumber(patch.sortOrder, "Sort order");
  if (patch.sku !== undefined) {
    next.sku = text(patch.sku, 40);
    if (!next.sku) throw httpError(400, "SKU cannot be empty.");
    assertUnique(db, "sku", next.sku, item.id);
  }
  if (patch.barcode !== undefined && String(patch.barcode).trim().toUpperCase() !== item.barcode.toUpperCase()) {
    next.barcode = cleanBarcode(patch.barcode);
    assertUnique(db, "barcode", next.barcode, item.id);
  }
  if (patch.image !== undefined && typeof patch.image === "string") {
    // Only allow clearing here; uploads go through saveImageFromBase64.
    if (patch.image === "") next.image = "";
  }

  Object.assign(item, next);
  item.updatedAt = new Date().toISOString();
  item.version += 1;
  return item;
}

function imageFilePath(uploadsDir, imagePath) {
  if (typeof imagePath !== "string" || !imagePath.startsWith(IMAGE_URL_PREFIX)) return null;
  const name = path.basename(imagePath);
  return path.join(uploadsDir, "inventory", name);
}

function removeImageFile(uploadsDir, imagePath) {
  const file = imageFilePath(uploadsDir, imagePath);
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch {
    // already gone
  }
}

function deleteItem(db, id, uploadsDir) {
  ensureCollections(db);
  const index = db.inventoryItems.findIndex((item) => item.id === id);
  if (index < 0) throw httpError(404, "Item not found.");
  const [item] = db.inventoryItems.splice(index, 1);
  db.inventoryDeleted.push({ id: item.id, barcode: item.barcode, deletedAt: new Date().toISOString() });
  if (db.inventoryDeleted.length > 500) db.inventoryDeleted = db.inventoryDeleted.slice(-500);
  if (uploadsDir) removeImageFile(uploadsDir, item.image);
  return item;
}

function sniffImage(buffer) {
  if (buffer.length > 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buffer.length > 6 && /^GIF8[79]a$/.test(buffer.toString("ascii", 0, 6))) return "gif";
  return null;
}

// Writes the image to <uploadsDir>/inventory and returns its public path.
function saveImageFromBase64(uploadsDir, itemId, dataUrl) {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ""));
  if (!match) throw httpError(400, "Send the image as a base64 data URL.");
  if (!IMAGE_TYPES[match[1].toLowerCase()]) throw httpError(400, "Use a PNG, JPEG, WebP or GIF image.");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw httpError(400, "The image is empty.");
  if (buffer.length > MAX_IMAGE_BYTES) throw httpError(413, "Image is larger than 2 MB.");
  const ext = sniffImage(buffer);
  if (!ext) throw httpError(400, "That file is not a valid PNG, JPEG, WebP or GIF image.");

  const safeId = String(itemId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) throw httpError(400, "Invalid item.");
  const dir = path.join(uploadsDir, "inventory");
  fs.mkdirSync(dir, { recursive: true });
  const name = `${safeId}-${Date.now().toString(36)}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return `${IMAGE_URL_PREFIX}${name}`;
}

function listItems(db, options = {}) {
  ensureCollections(db);
  const q = String(options.q || "").trim().toLowerCase();
  const category = String(options.category || "").trim().toLowerCase();
  let items = db.inventoryItems.slice();
  if (q) {
    items = items.filter((item) =>
      [item.name, item.sku, item.barcode, item.color, item.size, item.category, item.notes]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }
  if (category) items = items.filter((item) => String(item.category).toLowerCase() === category);
  if (options.lowStock) items = items.filter((item) => item.stock <= Number(options.lowStock));
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return items;
}

// Copies shop-catalog products into retail inventory (one barcode row per size).
// Skips products already imported. Keeps listed=false so the shop is not duplicated.
function importCatalogProducts(db) {
  ensureCollections(db);
  const products = Array.isArray(db.products) ? db.products : [];
  const created = [];
  const skipped = [];

  for (const product of products) {
    if (!product || !product.id) continue;
    const already = db.inventoryItems.some((item) => item.sourceProductId === product.id);
    if (already) {
      skipped.push(product.id);
      continue;
    }

    const sizes = [...new Set((Array.isArray(product.sizes) ? product.sizes : []).map((size) => text(size, 20)).filter(Boolean))];
    const sizeList = sizes.length ? sizes : ["One"];
    const primary = Array.isArray(product.colors) && product.colors[0] ? product.colors[0] : { name: "", hex: "" };
    const totalStock = Number.isFinite(Number(product.stock)) ? Math.max(0, Math.round(Number(product.stock))) : 0;
    const perSize = Math.floor(totalStock / sizeList.length);
    let remainder = totalStock - perSize * sizeList.length;
    const cost = Math.max(0, Math.round((Number(product.price) || 0) * 0.6));

    sizeList.forEach((size, index) => {
      const stock = perSize + (index === 0 ? remainder : 0);
      const item = createItem(db, {
        name: product.name,
        color: primary.name || "",
        colorHex: primary.hex || "",
        size,
        category: product.category || "Retail",
        price: product.price,
        cost,
        stock,
        image: typeof product.image === "string" && !product.image.startsWith("data:") ? product.image : "",
        notes: `Imported from shop catalog (${product.id}).`,
        listed: false,
        featured: false,
        sortOrder: Number.isFinite(product.sortOrder) ? product.sortOrder : nextSortOrder(db),
      });
      item.sourceProductId = product.id;
      created.push(item);
    });
  }

  return { created, skipped, createdCount: created.length, skippedCount: skipped.length };
}

module.exports = {
  MAX_IMAGE_BYTES,
  IMAGE_URL_PREFIX,
  DEFAULT_CATEGORIES,
  httpError,
  ensureCollections,
  createItem,
  updateItem,
  deleteItem,
  addSizes,
  toShopProduct,
  shopCatalog,
  ensureSortOrders,
  setCatalogOrder,
  nextSortOrder,
  findShopProduct,
  listCategories,
  addCategory,
  renameCategory,
  removeCategory,
  findByBarcode,
  findById,
  saveImageFromBase64,
  removeImageFile,
  listItems,
  importCatalogProducts,
};
