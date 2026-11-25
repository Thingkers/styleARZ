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

const AUDIENCES = ["Men", "Women", "Children", "Unisex"];

/** Hard rules — never allow meaningless pairings (e.g. Saree+Men, Panjabi+Women). */
const CATEGORY_AUDIENCE_RULES = {
  Saree: ["Women"],
  Sharee: ["Women"],
  Panjabi: ["Men", "Children"],
  Punjabi: ["Men", "Children"],
  Dress: ["Women", "Children"],
  Dresses: ["Women", "Children"],
  Jeans: ["Men", "Women", "Children", "Unisex"],
  Shirt: ["Men", "Women", "Children", "Unisex"],
  Shirts: ["Men", "Women", "Children", "Unisex"],
  "T-Shirt": ["Men", "Women", "Children", "Unisex"],
  "T-Shirts": ["Men", "Women", "Children", "Unisex"],
  Knitwear: ["Men", "Women", "Children", "Unisex"],
  Trousers: ["Men", "Women", "Children", "Unisex"],
  Outerwear: ["Men", "Women", "Children", "Unisex"],
  Sets: ["Children", "Unisex"],
  Accessories: ["Men", "Women", "Children", "Unisex"],
};

const DEFAULT_CATEGORY_AUDIENCES = CATEGORY_AUDIENCE_RULES;

const DEFAULT_CATEGORIES = Object.keys(DEFAULT_CATEGORY_AUDIENCES).map((name) => ({
  name,
  audiences: DEFAULT_CATEGORY_AUDIENCES[name].slice(),
}));

function allowedAudiencesForCategory(name) {
  const clean = text(name, 60);
  const direct = CATEGORY_AUDIENCE_RULES[clean];
  if (direct) return direct.slice();
  const lower = clean.toLowerCase();
  const match = Object.keys(CATEGORY_AUDIENCE_RULES).find((key) => key.toLowerCase() === lower);
  return match ? CATEGORY_AUDIENCE_RULES[match].slice() : AUDIENCES.slice();
}

function normalizeAudiences(value, categoryNameHint) {
  const list = Array.isArray(value) ? value : [];
  const cleaned = [...new Set(list.map((entry) => text(entry, 20)).filter((entry) => AUDIENCES.includes(entry)))];
  const allowed = allowedAudiencesForCategory(categoryNameHint || "");
  const clipped = cleaned.filter((entry) => allowed.includes(entry));
  if (clipped.length) return clipped;
  return allowed.slice();
}

function normalizeCategoryRecord(entry) {
  if (entry && typeof entry === "object" && entry.name) {
    const name = text(entry.name, 60);
    return {
      name,
      audiences: normalizeAudiences(entry.audiences, name),
    };
  }
  const name = text(entry, 60);
  return {
    name,
    audiences: allowedAudiencesForCategory(name),
  };
}

function categoryName(entry) {
  if (entry && typeof entry === "object") return String(entry.name || "").trim();
  return String(entry || "").trim();
}

function httpError(status, message, extra) {
  return Object.assign(new Error(message), { status, ...(extra || {}) });
}

// Adds retail/POS collections to older databases. Returns true when something changed.
function ensureCollections(db) {
  let changed = false;
  ["inventoryItems", "posSessions", "posScanEvents", "posSales", "posSalesDeleted", "inventoryDeleted", "offerCampaigns", "offerCustomers"].forEach((key) => {
    if (!Array.isArray(db[key])) {
      db[key] = [];
      changed = true;
    }
  });
  if (!db.settings || typeof db.settings !== "object") {
    db.settings = { smsSenderPhone: "" };
    changed = true;
  } else if (db.settings.smsSenderPhone === undefined) {
    db.settings.smsSenderPhone = "";
    changed = true;
  }
  if (!Number.isFinite(db.inventorySeq)) {
    db.inventorySeq = 1000;
    changed = true;
  }
  if (!Array.isArray(db.inventoryCategories) || !db.inventoryCategories.length) {
    db.inventoryCategories = DEFAULT_CATEGORIES.map((entry) => ({
      name: entry.name,
      audiences: entry.audiences.slice(),
    }));
    changed = true;
  } else {
    const normalized = db.inventoryCategories.map(normalizeCategoryRecord).filter((entry) => entry.name.length >= 2);
    const before = JSON.stringify(db.inventoryCategories);
    db.inventoryCategories = normalized;
    if (JSON.stringify(db.inventoryCategories) !== before) changed = true;
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

function assertUnique(db, field, value, selfId, options = {}) {
  if (!value) return;
  const wanted = String(value).toUpperCase();
  const clash = db.inventoryItems.find(
    (item) => item.id !== selfId && String(item[field] || "").toUpperCase() === wanted
  );
  if (clash) throw httpError(409, `Another item already uses that ${field}.`);
  if (field === "barcode" && !options.allowLabelDraft) {
    const draftClash = (db.labelDrafts || []).find(
      (draft) =>
        draft &&
        draft.status !== "converted" &&
        String(draft.barcode || "").toUpperCase() === wanted
    );
    if (draftClash) {
      throw httpError(409, "That barcode belongs to a Quick Label draft. Convert the label instead.");
    }
  }
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
    assertUnique(db, "barcode", barcode, undefined, { allowLabelDraft: Boolean(input.fromLabelDraft) });
  } else {
    barcode = allocateBarcode(db);
  }

  const sku = text(input.sku, 40) || `SKU-${barcode.replace(/^SA/i, "")}`;
  assertUnique(db, "sku", sku);

  const now = new Date().toISOString();
  const category = text(input.category, 60);
  const audienceRaw = text(input.audience, 20);
  const audience = AUDIENCES.includes(audienceRaw) ? audienceRaw : "Unisex";
  if (category) assertAudienceAllowed(category, audience);
  const id = newId();
  const primaryImage = typeof input.image === "string" ? text(input.image, 200) : "";
  const images = normalizeImages(input.images, primaryImage);
  const item = {
    id,
    styleId: text(input.styleId, 40) || id,
    sku,
    barcode,
    name,
    color: text(input.color, 40),
    colorHex: text(input.colorHex, 20) || "",
    size: text(input.size, 20),
    category,
    audience,
    price,
    cost,
    stock,
    image: images[0] || "",
    images,
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

function normalizeImages(images, primary = "") {
  const list = Array.isArray(images)
    ? images.map((entry) => text(entry, 240)).filter(Boolean)
    : [];
  if (primary && !list.includes(primary)) list.unshift(text(primary, 240));
  return [...new Set(list)];
}

function itemImages(item) {
  if (!item) return [];
  return normalizeImages(item.images, item.image || "");
}

function syncItemImages(item, images) {
  const next = normalizeImages(images, "");
  item.images = next;
  item.image = next[0] || "";
  return item;
}

function styleKey(item) {
  if (item.styleId) return `style:${item.styleId}`;
  return `legacy:${item.name}|${item.color || ""}|${item.category || ""}`;
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
    if (!parent.styleId) parent.styleId = parent.id;
    const item = createItem(db, {
      name: parent.name,
      color: parent.color,
      colorHex: parent.colorHex,
      size,
      category: parent.category,
      audience: parent.audience || "Unisex",
      price: parent.price,
      cost: parent.cost,
      stock,
      notes: parent.notes,
      image: parent.image || "",
      images: itemImages(parent),
      styleId: parent.styleId || parent.id,
      listed: parent.listed !== false,
      featured: Boolean(parent.featured),
    });
    created.push(item);
  }
  if (!created.length) throw httpError(409, "Those sizes already exist for this item.");
  return { created, skipped };
}

function toShopProduct(item) {
  return toGroupedShopProduct([item]);
}

/** One shop card per style (name/colour), with all sizes aggregated. */
function toGroupedShopProduct(items) {
  const sorted = (items || []).slice().sort((a, b) => {
    const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : 9999;
    const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : 9999;
    if (ao !== bo) return ao - bo;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
  const primary = sorted[0];
  if (!primary) return null;
  const styleId = primary.styleId || primary.id;
  const sizeStock = {};
  const variantIds = {};
  const sizes = [];
  sorted.forEach((item) => {
    const size = item.size || "One";
    if (!variantIds[size]) {
      sizes.push(size);
      variantIds[size] = item.id;
      sizeStock[size] = 0;
    }
    sizeStock[size] += Number(item.stock) || 0;
  });
  const images = [];
  const seen = new Set();
  sorted.forEach((item) => {
    itemImages(item).forEach((src) => {
      if (!seen.has(src)) {
        seen.add(src);
        images.push(src);
      }
    });
  });
  const stock = Object.values(sizeStock).reduce((sum, value) => sum + value, 0);
  const colorName = primary.color || "Default";
  const hex = primary.colorHex && /^#[0-9a-fA-F]{3,8}$/.test(primary.colorHex) ? primary.colorHex : "#4e4e4e";
  return {
    id: styleId,
    name: primary.name,
    audience: AUDIENCES.includes(primary.audience) ? primary.audience : "Unisex",
    category: primary.category || "Retail",
    slot: "other",
    price: primary.price,
    stock,
    sizeStock,
    variantIds,
    featured: sorted.some((item) => item.featured),
    grade: "A",
    sizes: sizes.length ? sizes : ["One"],
    colors: [{ name: colorName, hex }],
    occasions: ["Everyday"],
    image: images[0] || "/images/studio-table.jpg",
    images: images.length ? images : ["/images/studio-table.jpg"],
    description: primary.notes || `${primary.name} from the StyleARZ floor — also available in store.`,
    details: [
      sizes.length > 1 ? `Sizes ${sizes.join(", ")}` : sizes[0] ? `Size ${sizes[0]}` : null,
      primary.color ? `Colour ${primary.color}` : null,
    ].filter(Boolean),
    source: "inventory",
    sortOrder: Number.isFinite(primary.sortOrder) ? primary.sortOrder : 9999,
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
  return shopCatalog(db, { kind: "all" });
}

function productKindOf(product) {
  return product && product.productKind === "display" ? "display" : "sellable";
}

function shopCatalog(db, options = {}) {
  ensureCollections(db);
  ensureSortOrders(db);
  const kind = options.kind; // "sellable" | "display" | "all" | undefined
  const listed = db.inventoryItems.filter((item) => item.listed !== false);
  const groups = new Map();
  listed.forEach((item) => {
    const key = styleKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const retail = [...groups.values()].map(toGroupedShopProduct).filter(Boolean);
  let catalog = [
    ...(db.products || []).map((product) => ({
      ...product,
      images: normalizeImages(product.images, product.image || ""),
      image: product.image || (Array.isArray(product.images) && product.images[0]) || "/images/studio-table.jpg",
      productKind: productKindOf(product),
      source: product.source || "shop",
      sortOrder: Number.isFinite(product.sortOrder) ? product.sortOrder : 9999,
    })),
    ...retail.map((product) => ({ ...product, productKind: "sellable" })),
  ];
  if (kind === "display") {
    catalog = catalog.filter((product) => productKindOf(product) === "display");
  } else if (kind === "sellable") {
    catalog = catalog.filter((product) => productKindOf(product) !== "display");
  } else if (kind !== "all") {
    // Default public shop catalog: sellable only. Featured home can request kind=all or featured=1 with display.
    catalog = catalog.filter((product) => productKindOf(product) !== "display");
  }
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
  if (product) {
    return {
      product: {
        ...product,
        images: normalizeImages(product.images, product.image || ""),
        image: product.image || (Array.isArray(product.images) && product.images[0]) || "/images/studio-table.jpg",
      },
      kind: "product",
    };
  }
  const listed = db.inventoryItems.filter((item) => item.listed !== false);
  const byStyle = listed.filter((item) => (item.styleId || item.id) === id);
  if (byStyle.length) {
    return { product: toGroupedShopProduct(byStyle), kind: "inventory", items: byStyle };
  }
  const item = findById(db, id);
  if (item && item.listed !== false) {
    const group = listed.filter((entry) => styleKey(entry) === styleKey(item));
    const items = group.length ? group : [item];
    return { product: toGroupedShopProduct(items), kind: "inventory", items, item };
  }
  return null;
}

/** Resolve the barcode-level inventory row for a shop style + size. */
function resolveInventoryVariant(db, productId, size) {
  const found = findShopProduct(db, productId);
  if (!found || found.kind === "product") return null;
  const want = String(size || "One");
  const mappedId = found.product.variantIds && found.product.variantIds[want];
  if (mappedId) return findById(db, mappedId);
  return (found.items || []).find((entry) => (entry.size || "One") === want) || found.items?.[0] || null;
}

function listCategories(db) {
  ensureCollections(db);
  return db.inventoryCategories
    .map(normalizeCategoryRecord)
    .filter((entry) => entry.name.length >= 2)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findCategoryIndex(db, name) {
  const current = text(name, 60).toLowerCase();
  return db.inventoryCategories.findIndex((entry) => categoryName(entry).toLowerCase() === current);
}

function assertAudienceAllowed(category, audience) {
  const allowed = allowedAudiencesForCategory(category);
  if (!allowed.includes(audience)) {
    throw httpError(
      400,
      `“${category}” cannot be assigned to ${audience}. Allowed: ${allowed.join(", ")}.`
    );
  }
}

function addCategory(db, name, audiences) {
  ensureCollections(db);
  const clean = text(name, 60);
  if (clean.length < 2) throw httpError(400, "Enter a category name.");
  if (findCategoryIndex(db, clean) >= 0) throw httpError(409, "That category already exists.");
  const category = {
    name: clean,
    audiences: normalizeAudiences(audiences || allowedAudiencesForCategory(clean), clean),
  };
  db.inventoryCategories.push(category);
  return category;
}

function renameCategory(db, from, to, audiences) {
  ensureCollections(db);
  const current = text(from, 60);
  const next = text(to || from, 60);
  if (next.length < 2) throw httpError(400, "Enter a category name.");
  const index = findCategoryIndex(db, current);
  if (index < 0) throw httpError(404, "Category not found.");
  if (
    db.inventoryCategories.some(
      (entry, i) => i !== index && categoryName(entry).toLowerCase() === next.toLowerCase()
    )
  ) {
    throw httpError(409, "That category already exists.");
  }
  const previous = categoryName(db.inventoryCategories[index]);
  const existing = normalizeCategoryRecord(db.inventoryCategories[index]);
  const category = {
    name: next,
    audiences:
      audiences !== undefined
        ? normalizeAudiences(audiences, next)
        : normalizeAudiences(existing.audiences, next),
  };
  db.inventoryCategories[index] = category;
  if (previous !== next) {
    db.inventoryItems.forEach((item) => {
      if (item.category === previous) item.category = next;
    });
    (db.products || []).forEach((product) => {
      if (product.category === previous) product.category = next;
    });
  }
  return category;
}

function removeCategory(db, name) {
  ensureCollections(db);
  const index = findCategoryIndex(db, name);
  if (index < 0) throw httpError(404, "Category not found.");
  const [removed] = db.inventoryCategories.splice(index, 1);
  return normalizeCategoryRecord(removed);
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
  if (patch.audience !== undefined) {
    const audience = text(patch.audience, 20);
    next.audience = AUDIENCES.includes(audience) ? audience : "Unisex";
  }
  const nextCategory = next.category !== undefined ? next.category : item.category;
  const nextAudience = next.audience !== undefined ? next.audience : item.audience || "Unisex";
  if (nextCategory && (patch.category !== undefined || patch.audience !== undefined)) {
    assertAudienceAllowed(nextCategory, nextAudience);
  }
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
  if (uploadsDir) itemImages(item).forEach((src) => removeImageFile(uploadsDir, src));
  return item;
}

function appendItemImage(db, id, uploadsDir, dataUrl) {
  const item = findById(db, id);
  if (!item) throw httpError(404, "Item not found.");
  const url = saveImageFromBase64(uploadsDir, item.id, dataUrl);
  const images = itemImages(item);
  if (images.length >= 8) throw httpError(400, "You can add up to 8 photos per item.");
  images.push(url);
  syncItemImages(item, images);
  item.updatedAt = new Date().toISOString();
  item.version = (item.version || 1) + 1;
  return item;
}

function removeItemImageAt(db, id, uploadsDir, index) {
  const item = findById(db, id);
  if (!item) throw httpError(404, "Item not found.");
  const images = itemImages(item);
  const at = Number(index);
  if (!Number.isInteger(at) || at < 0 || at >= images.length) throw httpError(400, "Photo not found.");
  const [removed] = images.splice(at, 1);
  syncItemImages(item, images);
  if (uploadsDir) removeImageFile(uploadsDir, removed);
  item.updatedAt = new Date().toISOString();
  item.version = (item.version || 1) + 1;
  return item;
}

function sniffImage(buffer) {
  if (buffer.length > 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buffer.length > 6 && /^GIF8[79]a$/.test(buffer.toString("ascii", 0, 6))) return "gif";
  return null;
}

// Writes the image to <uploadsDir>/<folder> and returns its public path.
function saveImageFromBase64(uploadsDir, itemId, dataUrl, folder = "inventory") {
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
  const safeFolder = folder === "home" ? "home" : folder === "offers" ? "offers" : "inventory";
  const dir = path.join(uploadsDir, safeFolder);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${safeId}-${Date.now().toString(36)}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return `/uploads/${safeFolder}/${name}`;
}

function createDisplayProduct(db, input = {}, uploadsDir) {
  ensureCollections(db);
  const name = text(input.name, 80);
  if (name.length < 2) throw httpError(400, "Enter a name for this home image.");
  const audience = AUDIENCES.includes(input.audience) ? input.audience : "Unisex";
  const id = `disp_${crypto.randomBytes(4).toString("hex")}`;
  let image = typeof input.image === "string" && !String(input.image).startsWith("data:") ? text(input.image, 240) : "";
  if (typeof input.image === "string" && input.image.startsWith("data:") && uploadsDir) {
    image = saveImageFromBase64(uploadsDir, id, input.image, "home");
  }
  if (!image) throw httpError(400, "Add a photo for this home product.");
  const product = {
    id,
    name,
    audience,
    category: text(input.category, 40) || "Look",
    slot: "other",
    price: 0,
    stock: 0,
    featured: input.featured !== false,
    grade: "A",
    sizes: ["One"],
    colors: [],
    occasions: ["Everyday"],
    image,
    description: text(input.description, 400) || "Homepage look — image only, not sold from inventory.",
    details: ["Homepage display", "Not imported to inventory"],
    productKind: "display",
    source: "shop",
    sortOrder: nextSortOrder(db),
  };
  db.products.unshift(product);
  return product;
}

function deleteDisplayProduct(db, id, uploadsDir) {
  ensureCollections(db);
  const index = db.products.findIndex((entry) => entry.id === id && productKindOf(entry) === "display");
  if (index < 0) throw httpError(404, "Home product not found.");
  const [product] = db.products.splice(index, 1);
  if (uploadsDir && product.image && String(product.image).startsWith("/uploads/")) {
    try {
      const file = path.join(uploadsDir, "..", product.image.replace(/^\//, "").replace(/^uploads\//, ""));
      // path: uploadsDir is .../uploads, image is /uploads/home/x.jpg
      const absolute = path.join(uploadsDir, product.image.replace(/^\/uploads\//, ""));
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
    } catch {
      /* ignore */
    }
  }
  return { product };
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
    // Home / image-only display products never become POS inventory.
    if (productKindOf(product) === "display") {
      skipped.push(product.id);
      continue;
    }
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
  AUDIENCES,
  CATEGORY_AUDIENCE_RULES,
  allowedAudiencesForCategory,
  ensureCollections,
  createItem,
  createItems,
  updateItem,
  deleteItem,
  addSizes,
  toShopProduct,
  toGroupedShopProduct,
  shopCatalog,
  ensureSortOrders,
  setCatalogOrder,
  nextSortOrder,
  findShopProduct,
  resolveInventoryVariant,
  itemImages,
  syncItemImages,
  appendItemImage,
  removeItemImageAt,
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
  productKindOf,
  createDisplayProduct,
  deleteDisplayProduct,
};
