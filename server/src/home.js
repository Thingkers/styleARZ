const fs = require("fs");
const path = require("path");

const AUDIENCES = ["Men", "Women", "Children", "Unisex"];
const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_URL_PREFIX = "/uploads/home/";

const DEFAULT_COLLECTIONS = [
  {
    id: "men",
    audience: "Men",
    kicker: "Men",
    title: "Polos, shirts, chinos",
    image: "/images/look-weekend.jpg",
  },
  {
    id: "women",
    audience: "Women",
    kicker: "Women",
    title: "Blouses, easy dresses, knits",
    image: "/images/look-women-day.jpg",
  },
  {
    id: "children",
    audience: "Children",
    kicker: "Children",
    title: "Same Grade A, ages 2–12",
    image: "/images/look-children.jpg",
  },
];

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function text(value, max) {
  return String(value === undefined || value === null ? "" : value).trim().slice(0, max);
}

function defaultCollections() {
  return DEFAULT_COLLECTIONS.map((entry) => ({ ...entry }));
}

function ensureHomeCollections(db) {
  if (!Array.isArray(db.homeCollections) || !db.homeCollections.length) {
    db.homeCollections = defaultCollections();
    return true;
  }
  let changed = false;
  db.homeCollections = db.homeCollections.map((entry, index) => {
    const fallback = DEFAULT_COLLECTIONS[index] || DEFAULT_COLLECTIONS[0];
    const next = {
      id: text(entry.id, 40) || fallback.id,
      audience: AUDIENCES.includes(entry.audience) ? entry.audience : fallback.audience,
      kicker: text(entry.kicker, 40) || fallback.kicker,
      title: text(entry.title, 80) || fallback.title,
      image: text(entry.image, 300) || fallback.image,
    };
    if (
      next.id !== entry.id ||
      next.audience !== entry.audience ||
      next.kicker !== entry.kicker ||
      next.title !== entry.title ||
      next.image !== entry.image
    ) {
      changed = true;
    }
    return next;
  });
  return changed;
}

function listCollections(db) {
  ensureHomeCollections(db);
  return db.homeCollections.map((entry) => ({ ...entry }));
}

function sniffImage(buffer) {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return "png";
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  if (buffer.length > 6 && /^GIF8[79]a$/.test(buffer.toString("ascii", 0, 6))) return "gif";
  return null;
}

function imageFilePath(uploadsDir, imagePath) {
  if (!String(imagePath || "").startsWith(IMAGE_URL_PREFIX)) return null;
  const name = path.basename(imagePath);
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return null;
  return path.join(uploadsDir, "home", name);
}

function removeImageFile(uploadsDir, imagePath) {
  const file = imageFilePath(uploadsDir, imagePath);
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore missing */
  }
}

function saveImageFromBase64(uploadsDir, collectionId, dataUrl) {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ""));
  if (!match) throw httpError(400, "Send the image as a base64 data URL.");
  if (!IMAGE_TYPES[match[1].toLowerCase()]) throw httpError(400, "Use a PNG, JPEG, WebP or GIF image.");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw httpError(400, "The image is empty.");
  if (buffer.length > MAX_IMAGE_BYTES) throw httpError(413, "Image is larger than 2 MB.");
  const ext = sniffImage(buffer);
  if (!ext) throw httpError(400, "That file is not a valid PNG, JPEG, WebP or GIF image.");

  const safeId = String(collectionId).replace(/[^a-zA-Z0-9_-]/g, "") || "home";
  const dir = path.join(uploadsDir, "home");
  fs.mkdirSync(dir, { recursive: true });
  const name = `${safeId}-${Date.now().toString(36)}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return `${IMAGE_URL_PREFIX}${name}`;
}

function updateCollection(db, id, patch, uploadsDir) {
  ensureHomeCollections(db);
  const entry = db.homeCollections.find((item) => item.id === id);
  if (!entry) throw httpError(404, "Collection not found.");

  if (patch.kicker !== undefined) {
    const kicker = text(patch.kicker, 40);
    if (kicker.length < 1) throw httpError(400, "Enter a label.");
    entry.kicker = kicker;
  }
  if (patch.title !== undefined) {
    const title = text(patch.title, 80);
    if (title.length < 2) throw httpError(400, "Enter a short line under the label.");
    entry.title = title;
  }
  if (patch.audience !== undefined) {
    if (!AUDIENCES.includes(patch.audience)) throw httpError(400, "Pick Men, Women, Children, or Unisex.");
    entry.audience = patch.audience;
  }
  if (patch.image !== undefined) {
    const previous = entry.image;
    if (typeof patch.image === "string" && patch.image.startsWith("data:")) {
      entry.image = saveImageFromBase64(uploadsDir, entry.id, patch.image);
      removeImageFile(uploadsDir, previous);
    } else {
      const image = text(patch.image, 300);
      if (!image.startsWith("/images/") && !image.startsWith(IMAGE_URL_PREFIX)) {
        throw httpError(400, "Image path is not allowed.");
      }
      entry.image = image;
    }
  }
  return { ...entry };
}

module.exports = {
  AUDIENCES,
  defaultCollections,
  ensureHomeCollections,
  listCollections,
  updateCollection,
};
