const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { allocateBarcode, code128Svg } = require("./barcode");
const inventory = require("./inventory");

const IMAGE_URL_PREFIX = "/uploads/labels/";
const MAX_IMAGE_BYTES = inventory.MAX_IMAGE_BYTES;

function httpError(status, message, extra) {
  return Object.assign(new Error(message), { status, ...(extra || {}) });
}

function text(value, max) {
  return String(value === undefined || value === null ? "" : value).trim().slice(0, max);
}

function money(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw httpError(400, `Enter a valid ${label || "price"}.`);
  return Math.round(amount);
}

function newId() {
  return `lbl_${crypto.randomBytes(4).toString("hex")}`;
}

function ensureLabelDrafts(db) {
  let changed = false;
  if (!Array.isArray(db.labelDrafts)) {
    db.labelDrafts = [];
    changed = true;
  }
  return changed;
}

function findById(db, id) {
  ensureLabelDrafts(db);
  return db.labelDrafts.find((draft) => draft.id === id) || null;
}

function findByBarcode(db, code) {
  ensureLabelDrafts(db);
  const wanted = String(code || "").trim().toUpperCase();
  if (!wanted) return null;
  return db.labelDrafts.find((draft) => String(draft.barcode || "").toUpperCase() === wanted) || null;
}

function sniffImage(buffer) {
  if (buffer.length > 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buffer.length > 6 && /^GIF8[79]a$/.test(buffer.toString("ascii", 0, 6))) return "gif";
  return null;
}

function saveImageFromBase64(uploadsDir, draftId, dataUrl) {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ""));
  if (!match) throw httpError(400, "Send the image as a base64 data URL.");
  const mime = match[1].toLowerCase();
  if (!["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"].includes(mime)) {
    throw httpError(400, "Use a PNG, JPEG, WebP or GIF image.");
  }
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw httpError(400, "The image is empty.");
  if (buffer.length > MAX_IMAGE_BYTES) throw httpError(413, "Image is larger than 2 MB.");
  const ext = sniffImage(buffer);
  if (!ext) throw httpError(400, "That file is not a valid PNG, JPEG, WebP or GIF image.");

  const safeId = String(draftId).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) throw httpError(400, "Invalid draft.");
  const dir = path.join(uploadsDir, "labels");
  fs.mkdirSync(dir, { recursive: true });
  const name = `${safeId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return `${IMAGE_URL_PREFIX}${name}`;
}

function imageFilePath(uploadsDir, imagePath) {
  if (typeof imagePath !== "string" || !imagePath.startsWith(IMAGE_URL_PREFIX)) return null;
  return path.join(uploadsDir, "labels", path.basename(imagePath));
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

function copyImageToInventory(uploadsDir, imagePath, inventoryId) {
  const source = imageFilePath(uploadsDir, imagePath);
  if (!source || !fs.existsSync(source)) return typeof imagePath === "string" ? imagePath : "";
  const ext = path.extname(source).replace(".", "") || "jpg";
  const safeId = String(inventoryId).replace(/[^a-zA-Z0-9_-]/g, "") || "item";
  const dir = path.join(uploadsDir, "inventory");
  fs.mkdirSync(dir, { recursive: true });
  const name = `${safeId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
  fs.copyFileSync(source, path.join(dir, name));
  return `/uploads/inventory/${name}`;
}

function createDraft(db, uploadsDir, input = {}) {
  ensureLabelDrafts(db);
  inventory.ensureCollections(db);
  const price = money(input.price, "price");
  const size = text(input.size, 20);
  const note = text(input.note, 120);
  const name = text(input.name, 120);
  if (!input.image) throw httpError(400, "Take a photo of the garment first.");

  const id = newId();
  const image = saveImageFromBase64(uploadsDir, id, input.image);
  const barcode = allocateBarcode(db);
  const now = new Date().toISOString();
  const draft = {
    id,
    barcode,
    image,
    name,
    price,
    size,
    note,
    status: "draft",
    inventoryItemId: null,
    createdAt: now,
    updatedAt: now,
  };
  db.labelDrafts.unshift(draft);
  return draft;
}

function updateDraft(db, uploadsDir, id, patch = {}) {
  ensureLabelDrafts(db);
  const draft = findById(db, id);
  if (!draft) throw httpError(404, "Label draft not found.");
  if (draft.status === "converted") throw httpError(409, "That label was already converted to inventory.");

  if (patch.name !== undefined) draft.name = text(patch.name, 120);
  if (patch.price !== undefined && patch.price !== "") draft.price = money(patch.price, "price");
  if (patch.size !== undefined) draft.size = text(patch.size, 20);
  if (patch.note !== undefined) draft.note = text(patch.note, 120);
  if (patch.image) {
    const previous = draft.image;
    draft.image = saveImageFromBase64(uploadsDir, draft.id, patch.image);
    if (uploadsDir) removeImageFile(uploadsDir, previous);
  }
  draft.updatedAt = new Date().toISOString();
  return draft;
}

function deleteDraft(db, id, uploadsDir) {
  ensureLabelDrafts(db);
  const index = db.labelDrafts.findIndex((draft) => draft.id === id);
  if (index < 0) throw httpError(404, "Label draft not found.");
  const [draft] = db.labelDrafts.splice(index, 1);
  if (uploadsDir && draft.status !== "converted") removeImageFile(uploadsDir, draft.image);
  return draft;
}

function listDrafts(db, options = {}) {
  ensureLabelDrafts(db);
  const q = String(options.q || "").trim().toLowerCase();
  const status = String(options.status || "").trim().toLowerCase();
  const day = String(options.date || "").trim(); // YYYY-MM-DD
  let items = db.labelDrafts.slice();

  if (status === "draft" || status === "converted") {
    items = items.filter((draft) => draft.status === status);
  }
  if (day) {
    items = items.filter((draft) => String(draft.createdAt || "").slice(0, 10) === day);
  }
  if (q) {
    items = items.filter((draft) =>
      [draft.name, draft.barcode, draft.size, draft.note, String(draft.price)]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }

  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items;
}

function barcodesBatch(db, ids) {
  ensureLabelDrafts(db);
  const wanted = Array.isArray(ids) ? ids.slice(0, 200) : [];
  if (!wanted.length) throw httpError(400, "Choose at least one label.");
  const items = [];
  const missing = [];
  wanted.forEach((id) => {
    const draft = findById(db, id);
    if (!draft) return missing.push(id);
    items.push({
      id: draft.id,
      barcode: draft.barcode,
      name: draft.name || "",
      price: draft.price,
      size: draft.size,
      note: draft.note,
      status: draft.status,
      image: draft.image,
      createdAt: draft.createdAt,
      svg: code128Svg(draft.barcode),
    });
  });
  return { items, missing };
}

function convertDrafts(db, uploadsDir, payload = {}) {
  ensureLabelDrafts(db);
  inventory.ensureCollections(db);
  const ids = Array.isArray(payload.ids) ? payload.ids : [];
  if (ids.length !== 1) {
    throw httpError(400, "Convert one label at a time so each piece keeps its own details.");
  }

  const draft = findById(db, ids[0]);
  if (!draft) throw httpError(404, "Label draft not found.");
  if (draft.status === "converted") {
    throw httpError(409, "That label was already converted to inventory.");
  }

  const name = text(payload.name, 120) || text(draft.name, 120);
  if (name.length < 2) throw httpError(400, "Enter a product name for this piece.");
  const category = text(payload.category, 60);
  if (!category) throw httpError(400, "Choose a category.");
  const audienceRaw = text(payload.audience, 20);
  const audience = inventory.AUDIENCES.includes(audienceRaw) ? audienceRaw : "";
  if (!audience) throw httpError(400, "Choose who it is for (Men, Women, Children, or Unisex).");
  const allowed = inventory.allowedAudiencesForCategory(category);
  if (!allowed.includes(audience)) {
    throw httpError(400, `“${category}” cannot be assigned to ${audience}. Allowed: ${allowed.join(", ")}.`);
  }

  const stock =
    payload.stock === undefined || payload.stock === ""
      ? 1
      : Math.max(0, Math.round(Number(payload.stock)) || 0);
  const color = text(payload.color, 40);
  const listed = payload.listed === true;

  const item = inventory.createItem(db, {
    name,
    barcode: draft.barcode,
    fromLabelDraft: true,
    price: draft.price,
    size: draft.size || text(payload.size, 20),
    category,
    audience,
    color,
    stock,
    notes: draft.note || text(payload.notes, 400),
    listed,
    image: "",
  });

  if (draft.image) {
    item.image = copyImageToInventory(uploadsDir, draft.image, item.id);
  }

  draft.name = name;
  draft.status = "converted";
  draft.inventoryItemId = item.id;
  draft.updatedAt = new Date().toISOString();

  return {
    created: [{ draft, item }],
    skipped: [],
    createdCount: 1,
    skippedCount: 0,
  };
}

module.exports = {
  IMAGE_URL_PREFIX,
  ensureLabelDrafts,
  findById,
  findByBarcode,
  createDraft,
  updateDraft,
  deleteDraft,
  listDrafts,
  barcodesBatch,
  convertDrafts,
  saveImageFromBase64,
  removeImageFile,
};
