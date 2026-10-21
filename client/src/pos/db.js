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
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
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
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

async function run(storeNames, mode, work) {
  const db = await openDb();
  const tx = db.transaction(storeNames, mode);
  const done = finish(tx);
  const result = await work(tx);
  await done;
  return result;
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
  const list = items.filter((item) => item?.id);
  if (!list.length) return;
  await run("catalog", "readwrite", (tx) => {
    const store = tx.objectStore("catalog");
    list.forEach((item) => store.put({ ...item, _barcode: normalizeBarcode(item.barcode) }));
  });
}

export async function removeCatalogIds(ids = []) {
  const list = ids.filter(Boolean);
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
  await run("cart", "readwrite", (tx) => {
    const store = tx.objectStore("cart");
    if (cart?.length) store.put(cart, CART_KEY);
    else store.delete(CART_KEY);
  });
}

export async function loadCart() {
  const cart = await run("cart", "readonly", (tx) => wrap(tx.objectStore("cart").get(CART_KEY)));
  return Array.isArray(cart) ? cart : [];
}
