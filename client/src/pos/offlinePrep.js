import { syncCatalog } from "./sync";

const PREPARED_KEY = "sa-pos-offline-prepared";
const SHELL_PATHS = ["/", "/pos", "/pos/scan", "/favicon.svg", "/index.html"];
// Keep cache names in sync with client/public/sw.js VERSION.
const SHELL_CACHE = "sa-shell-v3";
const ASSET_CACHE = "sa-assets-v3";

function stamp() {
  return {
    at: new Date().toISOString(),
    day: new Date().toISOString().slice(0, 10),
  };
}

export function readOfflinePrepared() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREPARED_KEY) || "null");
    if (!parsed?.at) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isPreparedToday() {
  const saved = readOfflinePrepared();
  return Boolean(saved && saved.day === new Date().toISOString().slice(0, 10));
}

async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser cannot store the POS offline. Use Chrome or Safari on the shop devices.");
  }
  if (!window.isSecureContext && location.hostname !== "localhost") {
    throw new Error("Offline prep needs HTTPS (use stylearz.com).");
  }
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) return existing;
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return registration;
}

async function cacheShellInPage() {
  if (!("caches" in window)) {
    throw new Error("This browser cannot store the POS offline. Use Chrome or Safari on the shop devices.");
  }
  const shell = await caches.open(SHELL_CACHE);
  const assets = await caches.open(ASSET_CACHE);
  const htmlResponse = await fetch("/", { cache: "reload" });
  if (!htmlResponse.ok) throw new Error("Could not download the app shell.");
  const text = await htmlResponse.clone().text();

  const urls = [...new Set(text.match(/\/assets\/[^"'\s)]+/g) || [])];
  if (!urls.length) throw new Error("The app shell did not contain any assets to cache.");

  await Promise.all(
    SHELL_PATHS.map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (!response.ok) throw new Error(`Could not download app page: ${path}`);
      await shell.put(path, response);
    })
  );

  await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) throw new Error(`Could not download app asset: ${url}`);
      await assets.put(url, response);
    })
  );
}

async function askServiceWorkerToPrepare(registration) {
  const worker = registration.active || registration.waiting || registration.installing;
  if (!worker || !navigator.serviceWorker.controller) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      channel.port1.close();
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(false), 8000);
    channel.port1.onmessage = (event) => {
      finish(Boolean(event.data?.ok));
    };
    channel.port1.onmessageerror = () => finish(false);
    try {
      worker.postMessage({ type: "PREPARE_OFFLINE" }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

/**
 * Prefetch POS UI + barcode catalog on this device so /pos and /pos/scan open without internet.
 */
export async function prepareOfflinePos() {
  if (!navigator.onLine) {
    throw new Error("Connect to the internet once, then tap Prepare offline.");
  }

  const registration = await ensureServiceWorker();
  await cacheShellInPage();
  const serviceWorkerPrepared = await askServiceWorkerToPrepare(registration);
  if (serviceWorkerPrepared === false) {
    throw new Error("The service worker could not finish offline preparation. Try again while online.");
  }

  // Pull inventory barcodes into IndexedDB for Solo offline scanning/sales.
  try {
    await syncCatalog();
  } catch (error) {
    // Shell cache still helps Dual WebRTC; catalog sync is best-effort.
    if (!error?.status) {
      throw new Error("App shell saved, but the product catalog did not download. Try again on Wi‑Fi.");
    }
  }

  const prepared = stamp();
  localStorage.setItem(PREPARED_KEY, JSON.stringify(prepared));
  return prepared;
}
