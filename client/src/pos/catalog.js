import { api } from "../api";

const barcodeCache = new Map();
const barcodeRequests = new Map();
let persistentCatalog = null;

function normalizeBarcode(value) {
  return String(value || "").trim().toUpperCase();
}

export function rememberCatalogItems(items = []) {
  items.forEach((item) => {
    if (!item?.id || !item.barcode) return;
    for (const [code, cached] of barcodeCache) {
      if (cached.id === item.id) barcodeCache.delete(code);
    }
    barcodeCache.set(normalizeBarcode(item.barcode), item);
  });
}

function forgetCatalogItems(ids = []) {
  const removedIds = new Set(ids.filter((id) => typeof id === "string" && id.length > 0));
  if (!removedIds.size) return;
  for (const [code, item] of barcodeCache) {
    if (removedIds.has(item.id)) barcodeCache.delete(code);
  }
}

function isCatalogItem(item) {
  return Boolean(
    item &&
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.barcode === "string" &&
    normalizeBarcode(item.barcode).length > 0
  );
}

function deletedItemId(entry) {
  if (typeof entry === "string") return entry;
  return entry && typeof entry.id === "string" ? entry.id : "";
}

export function setCatalogPersistence(adapter) {
  persistentCatalog = adapter;
}

export async function resolveBarcode(barcode) {
  const code = normalizeBarcode(barcode);
  if (!code) throw new Error("Enter or scan a barcode.");

  const cached = barcodeCache.get(code);
  if (cached) return cached;

  const pending = barcodeRequests.get(code);
  if (pending) return pending;

  const request = (async () => {
    const persisted = await persistentCatalog?.getByBarcode?.(code);
    if (persisted) {
      if (!isCatalogItem(persisted) || normalizeBarcode(persisted.barcode) !== code) {
        throw new Error("The saved catalog item is invalid.");
      }
      rememberCatalogItems([persisted]);
      return persisted;
    }

    const data = await api(`/api/inventory/by-barcode/${encodeURIComponent(code)}`);
    if (!isCatalogItem(data?.item) || normalizeBarcode(data.item.barcode) !== code) {
      throw new Error("The server returned an invalid catalog item.");
    }
    rememberCatalogItems([data.item]);
    await persistentCatalog?.put?.(data.item);
    return data.item;
  })();
  barcodeRequests.set(code, request);
  try {
    return await request;
  } finally {
    if (barcodeRequests.get(code) === request) barcodeRequests.delete(code);
  }
}

export async function refreshCatalog(since = "") {
  const suffix = since ? `?since=${encodeURIComponent(since)}` : "";
  const result = await api(`/api/pos/catalog${suffix}`);
  if (
    !Array.isArray(result?.items) ||
    !result.items.every(isCatalogItem) ||
    !Array.isArray(result.deleted) ||
    !result.deleted.every((entry) => deletedItemId(entry))
  ) {
    throw new Error("The server returned an invalid catalog update.");
  }

  const deletedIds = result.deleted.map(deletedItemId);
  forgetCatalogItems(deletedIds);
  rememberCatalogItems(result.items);
  await persistentCatalog?.putMany?.(result.items, deletedIds);
  return result;
}
