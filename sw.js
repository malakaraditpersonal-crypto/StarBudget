// StarBudget Service Worker v2
// Strategy: Cache-first for assets, network-first for Firebase API calls

const CACHE_NAME = 'starbudget-v2';
const OFFLINE_URL = './index.html';

// Core assets to pre-cache on install
const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png'
];

// ── INSTALL ─────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Remove old caches
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      ),
      // Take control of all pages immediately
      self.clients.claim()
    ])
  );
});

// ── FETCH ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Firebase, Google auth, and analytics — always go network
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('google') ||
    url.hostname.includes('analytics') ||
    url.hostname.includes('fonts.gstatic') ||
    url.hostname.includes('fonts.googleapis')
  ) {
    // Network-only for auth/API — don't cache
    return;
  }

  // For CDN assets (chart.js etc.) — stale-while-revalidate
  if (url.hostname.includes('cdn.jsdelivr') || url.hostname.includes('cdnjs') || url.hostname.includes('svgrepo')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // For our own app assets — cache first, then network
  event.respondWith(cacheFirstStrategy(request));
});

// ── STRATEGIES ────────────────────────────────────────────────────────────────

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()); // non-blocking
    }
    return response;
  } catch {
    // Offline fallback — return main app shell
    const fallback = await caches.match(OFFLINE_URL);
    return fallback || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || (await networkFetch) || new Response('Offline', { status: 503 });
}
