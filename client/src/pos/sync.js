import { api } from "../api";
import { refreshCatalog, rememberCatalogItems, setCatalogPersistence } from "./catalog";
import {
  addOutbox,
  getCatalogByBarcode,
  getMeta,
  getOutbox,
  putCatalogItems,
  removeCatalogIds,
  removeOutbox,
  setMeta,
} from "./db";

const SYNC_BATCH = 200; // server MAX_SYNC_BATCH
const listeners = new Set();
let flushing = null;

const adapter = {
  getByBarcode: (code) => getCatalogByBarcode(code).catch(() => null),
  put: (item) => putCatalogItems([item]).catch(() => {}),
  async putMany(items = [], deleted = []) {
    await putCatalogItems(items);
    await removeCatalogIds((deleted || []).map((entry) => entry.id || entry));
  },
};

export function isNetworkError(error) {
  return !error?.status;
}

export async function getOutboxStats() {
  const rows = await getOutbox().catch(() => []);
  const conflicts = rows.filter((sale) => sale.status === "conflict").length;
  return { pending: rows.length - conflicts, conflicts, total: rows.length };
}

async function notify() {
  if (!listeners.size) return;
  const stats = await getOutboxStats();
  listeners.forEach((listener) => listener(stats));
}

// Subscribe to outbox count changes. Returns an unsubscribe function.
export function subscribeOutbox(listener) {
  listeners.add(listener);
  getOutboxStats().then(listener);
  return () => listeners.delete(listener);
}

export async function syncCatalog() {
  const since = (await getMeta("since").catch(() => "")) || "";
  const result = await refreshCatalog(since);
  if (result.serverTime) await setMeta("since", result.serverTime);
  return result;
}

// Queue a completed sale locally. Prices are kept so the server records what the customer was charged.
export async function queueSale(sale) {
  const record = {
    clientId: sale.clientId,
    items: sale.items.map(({ itemId, qty, price, barcode }) => ({ itemId, qty, price, barcode })),
    paymentMethod: sale.paymentMethod,
    discount: Number(sale.discount) || 0,
    createdAt: sale.createdAt || new Date().toISOString(),
    queuedAt: new Date().toISOString(),
    status: "pending",
  };
  await addOutbox(record);
  await notify();
  return record;
}

function wireSale({ clientId, items, paymentMethod, discount, createdAt }) {
  return { clientId, items, paymentMethod, discount, createdAt };
}

async function flush({ includeConflicts, force }) {
  const rows = await getOutbox();
  const queue = rows.filter((sale) => includeConflicts || sale.status !== "conflict");
  const summary = { accepted: [], conflicts: [], remaining: rows.length, error: null };
  if (!queue.length) return summary;

  let changedStock = false;
  for (let start = 0; start < queue.length; start += SYNC_BATCH) {
    const batch = queue.slice(start, start + SYNC_BATCH);
    let result;
    try {
      result = await api("/api/pos/sales/sync", {
        method: "POST",
        body: { sales: batch.map(wireSale), force: force === true },
      });
    } catch (error) {
      // Network/auth/server failure: leave everything queued and retry later.
      summary.error = error;
      break;
    }

    for (const entry of result.accepted || []) {
      await removeOutbox(entry.clientId);
      summary.accepted.push(entry);
      changedStock = true;
    }
    for (const conflict of result.conflicts || []) {
      const sale = batch.find((row) => row.clientId === conflict.clientId);
      if (!sale) continue;
      // Keep the sale queued but flagged so it is not retried automatically.
      await addOutbox({ ...sale, status: "conflict", conflict: { reason: conflict.reason, details: conflict.details || [] } });
      if (conflict.items?.length) {
        rememberCatalogItems(conflict.items);
        await putCatalogItems(conflict.items);
      }
      summary.conflicts.push(conflict);
    }
  }

  if (changedStock) await syncCatalog().catch(() => {});
  summary.remaining = (await getOutbox()).length;
  return summary;
}

// Send queued sales to the server. Accepted sales leave the outbox; conflicting sales stay, marked
// status "conflict", until retried with { includeConflicts: true } (optionally { force: true }).
export function flushOutbox(options = {}) {
  if (!navigator.onLine) return Promise.resolve({ accepted: [], conflicts: [], remaining: 0, error: null, skipped: true });
  if (flushing) return flushing;
  flushing = flush(options)
    .finally(() => {
      flushing = null;
      notify();
    });
  return flushing;
}

// Sets up IndexedDB catalog persistence, pulls catalog changes, and flushes the outbox when back online.
// onFlush(summary) is called whenever a flush sent or rejected sales. Returns a cleanup function.
export function initOfflineCatalog({ onFlush } = {}) {
  setCatalogPersistence(adapter);

  const run = async () => {
    if (!navigator.onLine) return;
    const summary = await flushOutbox();
    if (onFlush && (summary.accepted.length || summary.conflicts.length || summary.error)) onFlush(summary);
    await syncCatalog().catch(() => {});
  };

  window.addEventListener("online", run);
  run().catch(() => {});
  notify();
  return () => window.removeEventListener("online", run);
}
