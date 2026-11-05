// Minimal IndexedDB wrapper for POS offline data (no dependencies).
const DB_NAME = "stylearz-pos";
const DB_VERSION = 1;
const CART_KEY = "current";

let dbPromise = null;

function normalizeBarcode(value) {
  return String(value || "").trim().toUpperCase();
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finish(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
  });
}

export function openDb() {
  if (dbPromise) return dbPromise;
  const pending = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    let settled = false;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    const rejectOpen = (error) => {
      if (settled) return;
      settled = true;
      if (dbPromise === pending) dbPromise = null;
      reject(error);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("catalog")) {
        const catalog = db.createObjectStore("catalog", { keyPath: "id" });
        catalog.createIndex("barcode", "_barcode", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("cart")) db.createObjectStore("cart");
      if (!db.objectStoreNames.contains("outbox")) {
        const outbox = db.createObjectStore("outbox", { keyPath: "clientId" });
        outbox.createIndex("queuedAt", "queuedAt", { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      db.onversionchange = () => {
        db.close();
        if (dbPromise === pending) dbPromise = null;
      };
      resolve(db);
    };
    request.onblocked = () => rejectOpen(new Error("IndexedDB upgrade is blocked by another open tab. Close other StyleARZ tabs and try again."));
    request.onerror = () => rejectOpen(request.error || new Error("Could not open IndexedDB."));
  });
  dbPromise = pending;
  pending.catch(() => {
    if (dbPromise === pending) dbPromise = null;
  });
  return pending;
}

async function run(storeNames, mode, work) {
  const db = await openDb();
  const tx = db.transaction(storeNames, mode);
  const done = finish(tx);
  done.catch(() => {});
  try {
    const result = await work(tx);
    await done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // The transaction may already have completed or aborted.
    }
    try {
      await done;
    } catch {
      // Preserve the original operation error.
    }
    throw error;
  }
}

function stripIndexField(item) {
  if (!item) return item;
  const { _barcode, ...rest } = item;
  return rest;
}

export async function getCatalogByBarcode(code) {
  const key = normalizeBarcode(code);
  if (!key) return null;
  const row = await run("catalog", "readonly", (tx) => wrap(tx.objectStore("catalog").index("barcode").get(key)));
  return stripIndexField(row) || null;
}

export async function putCatalogItems(items = []) {
  if (!Array.isArray(items)) throw new Error("Catalog items must be a list.");
  if (items.some((item) =>
    !item ||
    typeof item.id !== "string" ||
    !item.id.trim() ||
    typeof item.barcode !== "string" ||
    !normalizeBarcode(item.barcode) ||
    typeof item.name !== "string" ||
    !item.name.trim() ||
    !Number.isFinite(item.price) ||
    item.price < 0 ||
    !Number.isInteger(item.stock) ||
    item.stock < 0
  )) {
    throw new Error("Catalog items must have a valid ID, barcode, name, price, and stock.");
  }
  if (!items.length) return;
  await run("catalog", "readwrite", (tx) => {
    const store = tx.objectStore("catalog");
    items.forEach((item) => store.put({ ...item, _barcode: normalizeBarcode(item.barcode) }));
  });
}

export async function removeCatalogIds(ids = []) {
  if (!Array.isArray(ids)) throw new Error("Catalog IDs must be a list.");
  if (ids.some((id) => typeof id !== "string" || !id.length)) {
    throw new Error("Catalog IDs must be non-empty strings.");
  }
  const list = ids;
  if (!list.length) return;
  await run("catalog", "readwrite", (tx) => {
    const store = tx.objectStore("catalog");
    list.forEach((id) => store.delete(id));
  });
}

export async function getMeta(key) {
  return run("meta", "readonly", (tx) => wrap(tx.objectStore("meta").get(key)));
}

export async function setMeta(key, value) {
  await run("meta", "readwrite", (tx) => {
    tx.objectStore("meta").put(value, key);
  });
}

export async function getOutbox() {
  const rows = await run("outbox", "readonly", (tx) => wrap(tx.objectStore("outbox").getAll()));
  return rows.sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)));
}

export async function addOutbox(sale) {
  await run("outbox", "readwrite", (tx) => {
    tx.objectStore("outbox").put(sale);
  });
}

export async function removeOutbox(clientId) {
  await run("outbox", "readwrite", (tx) => {
    tx.objectStore("outbox").delete(clientId);
  });
}

export async function saveCart(cart) {
  if (!Array.isArray(cart) || cart.some((line) =>
    !line ||
    typeof line.itemId !== "string" ||
    !line.itemId ||
    typeof line.name !== "string" ||
    !line.name ||
    !Number.isFinite(line.price) ||
    line.price < 0 ||
    !Number.isInteger(line.qty) ||
    line.qty < 1
  )) {
    throw new Error("The POS cart contains invalid items and could not be saved.");
  }
  await run("cart", "readwrite", (tx) => {
    const store = tx.objectStore("cart");
    if (cart?.length) store.put(cart, CART_KEY);
    else store.delete(CART_KEY);
  });
}

export async function loadCart() {
  const cart = await run("cart", "readonly", (tx) => wrap(tx.objectStore("cart").get(CART_KEY)));
  if (cart === undefined) return [];
  if (!Array.isArray(cart) || cart.some((line) =>
    !line ||
    typeof line.itemId !== "string" ||
    !line.itemId ||
    typeof line.name !== "string" ||
    !line.name ||
    !Number.isFinite(line.price) ||
    line.price < 0 ||
    !Number.isInteger(line.qty) ||
    line.qty < 1
  )) {
    throw new Error("Saved POS cart data is invalid. The saved cart was left untouched.");
  }
  return cart;
}
