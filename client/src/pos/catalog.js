import { api } from "../api";
import { searchCatalogItems as searchOfflineCatalog } from "./db";

const barcodeCache = new Map();
const itemCache = new Map();
let persistentCatalog = null;

function normalizeBarcode(value) {
  return String(value || "").trim().toUpperCase();
}

export function rememberCatalogItems(items = []) {
  items.forEach((item) => {
    if (!item) return;
    if (item.id) itemCache.set(item.id, item);
    if (item.barcode) barcodeCache.set(normalizeBarcode(item.barcode), item);
  });
}

function rankMatch(item, q) {
  const barcode = normalizeBarcode(item.barcode);
  if (barcode && barcode === normalizeBarcode(q)) return 0;
  if (String(item.name || "").toLowerCase().startsWith(q)) return 1;
  return 2;
}

function filterCached(q, limit) {
  const needle = q.toLowerCase();
  const scored = [];
  itemCache.forEach((item) => {
    const hay = [item.name, item.sku, item.barcode, item.color, item.size, item.category, item.notes]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(needle)) return;
    scored.push({ item, rank: rankMatch(item, needle) });
  });
  scored.sort((a, b) => a.rank - b.rank || String(a.item.name).localeCompare(String(b.item.name)));
  return scored.slice(0, limit).map((entry) => entry.item);
}

/** Search inventory by name, barcode, SKU, color, size, or notes. */
export async function searchCatalog(query, limit = 16) {
  const q = String(query || "").trim();
  const capped = Math.max(1, Math.min(40, Number(limit) || 16));
  if (!q) return [];

  if (navigator.onLine) {
    try {
      const result = await api(`/api/pos/search?q=${encodeURIComponent(q)}&limit=${capped}`);
      const items = Array.isArray(result.items) ? result.items : [];
      rememberCatalogItems(items);
      return items;
    } catch {
      // Fall through to local catalog when the API is unreachable.
    }
  }

  try {
    const offline = await searchOfflineCatalog(q, capped);
    if (offline.length) {
      rememberCatalogItems(offline);
      return offline;
    }
  } catch {
    // IndexedDB may be unavailable; use in-memory cache next.
  }

  return filterCached(q, capped);
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
