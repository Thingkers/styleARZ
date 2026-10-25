// StyleARZ POS service worker: caches the app shell so /pos and /pos/scan open offline.
const VERSION = "v3";
const SHELL_CACHE = `sa-shell-${VERSION}`;
const ASSET_CACHE = `sa-assets-${VERSION}`;
const SHELL_URLS = ["/", "/pos", "/pos/scan", "/favicon.svg", "/index.html"];

// Pull the hashed /assets/* bundles referenced by index.html so the first visit works offline too.
async function precacheAssets() {
  const response = await fetch("/", { cache: "reload" });
  if (!response.ok) throw new Error("Could not download the app shell.");
  const html = await response.text();
  const urls = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) || [])];
  if (!urls.length) throw new Error("The app shell did not contain any assets to cache.");
  const cache = await caches.open(ASSET_CACHE);
  await Promise.all(
    urls.map(async (url) => {
      const asset = await fetch(url, { cache: "reload" });
      if (!asset.ok) throw new Error(`Could not download app asset: ${url}`);
      await cache.put(url, asset);
    })
  );
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    SHELL_URLS.map(async (url) => {
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) throw new Error(`Could not download app page: ${url}`);
      await cache.put(url, response);
    })
  );
}

async function prepareOfflineCaches() {
  await precacheShell();
  await precacheAssets();
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "PREPARE_OFFLINE") return;
  const port = event.ports?.[0];
  event.waitUntil(
    prepareOfflineCaches()
      .then(() => port?.postMessage({ ok: true }))
      .catch((error) => port?.postMessage({ ok: false, error: error.message }))
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    precacheShell()
      .then(() => precacheAssets())
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = [SHELL_CACHE, ASSET_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("sa-") && !keep.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        await cache.put(fallbackKey || request, response.clone());
      } catch (error) {
        console.warn("Could not cache network response.", error);
      }
    }
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
  if (response.ok) {
    try {
      await cache.put(request, response.clone());
    } catch (error) {
      console.warn("Could not cache network response.", error);
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    // Network-first so deploys show up; offline, POS routes use POS shell and other routes use the app shell.
    const isPosRoute = url.pathname === "/pos" || url.pathname.startsWith("/pos/");
    const shellKey = isPosRoute ? url.pathname : "/";
    event.respondWith(
      networkFirst(request, SHELL_CACHE, shellKey).catch(async (error) => {
        const cache = await caches.open(SHELL_CACHE);
        const fallback = await cache.match(isPosRoute ? "/pos" : "/");
        if (fallback) return fallback;
        throw error;
      })
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname === "/favicon.svg" || url.pathname.startsWith("/images/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
