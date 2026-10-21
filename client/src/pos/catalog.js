import { api } from "../api";

const barcodeCache = new Map();
let persistentCatalog = null;

function normalizeBarcode(value) {
  return String(value || "").trim().toUpperCase();
}

export function rememberCatalogItems(items = []) {
  items.forEach((item) => {
    if (item?.barcode) barcodeCache.set(normalizeBarcode(item.barcode), item);
  });
}

// TODO(offline-sync): provide an IndexedDB-backed adapter with getByBarcode/put.
export function setCatalogPersistence(adapter) {
  persistentCatalog = adapter;
}

export async function resolveBarcode(barcode) {
  const code = normalizeBarcode(barcode);
  if (!code) throw new Error("Enter or scan a barcode.");

  const cached = barcodeCache.get(code);
  if (cached) return cached;

  const persisted = await persistentCatalog?.getByBarcode?.(code);
  if (persisted) {
    rememberCatalogItems([persisted]);
    return persisted;
  }

  const { item } = await api(`/api/inventory/by-barcode/${encodeURIComponent(code)}`);
  rememberCatalogItems([item]);
  await persistentCatalog?.put?.(item);
  return item;
}

export async function refreshCatalog(since = "") {
  const suffix = since ? `?since=${encodeURIComponent(since)}` : "";
  const result = await api(`/api/pos/catalog${suffix}`);
  rememberCatalogItems(result.items);
  await persistentCatalog?.putMany?.(result.items, result.deleted);
  return result;
}
