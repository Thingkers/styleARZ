// StyleARZ POS service worker: caches the app shell so /pos and /pos/scan open offline.
const VERSION = "v2";
const SHELL_CACHE = `sa-shell-${VERSION}`;
const ASSET_CACHE = `sa-assets-${VERSION}`;
const API_CACHE = `sa-api-${VERSION}`;
const SHELL_URLS = ["/", "/pos", "/pos/scan", "/favicon.svg", "/index.html"];

// Pull the hashed /assets/* bundles referenced by index.html so the first visit works offline too.
async function precacheAssets() {
  const html = await (await fetch("/", { cache: "reload" })).text();
  const urls = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) || [])];
  const cache = await caches.open(ASSET_CACHE);
  await Promise.all(urls.map((url) => cache.add(url).catch(() => {})));
}

async function prepareOfflineCaches() {
  const shell = await caches.open(SHELL_CACHE);
  await Promise.all(
    SHELL_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) await shell.put(url, response.clone());
      } catch {
        /* ignore */
      }
    })
  );
  await precacheAssets();
  try {
    const catalog = await fetch("/api/pos/catalog", { cache: "reload" });
    if (catalog.ok) {
      const api = await caches.open(API_CACHE);
      await api.put("/api/pos/catalog", catalog.clone());
    }
  } catch {
    /* auth cookie/token may be absent in SW; page prepare still fills IndexedDB */
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "PREPARE_OFFLINE") return;
  const port = event.ports?.[0];
  event.waitUntil(
    prepareOfflineCaches()
      .then(() => port?.postMessage({ ok: true }))
      .catch(() => port?.postMessage({ ok: false }))
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // Every SPA route serves the same index.html; cache it under each POS path.
      .then((cache) => Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {}))))
      .then(() => precacheAssets().catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = [SHELL_CACHE, ASSET_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackKey || request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackKey || request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    // Network-first; only the catalog is kept as an offline fallback (other API data is live/authenticated).
    if (url.pathname === "/api/pos/catalog") event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    // Network-first so deploys show up; fall back to the cached shell for POS routes while offline.
    const shellKey = url.pathname.startsWith("/pos") ? url.pathname : "/";
    event.respondWith(
      networkFirst(request, SHELL_CACHE, shellKey).catch(() => caches.match("/pos", { cacheName: SHELL_CACHE }))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname === "/favicon.svg" || url.pathname.startsWith("/images/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
