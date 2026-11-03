// Service worker template for ELOS PWA
const CACHE_NAME = 'elos-c58bad1e50a6';
const PRECACHE = [
  "/",
  "/apple-touch-icon.png",
  "/dist/ai/gateway.js",
  "/dist/app/backup.js",
  "/dist/app/curriculum.js",
  "/dist/app/exercises.js",
  "/dist/app/index.js",
  "/dist/app/progress.js",
  "/dist/app/session.js",
  "/dist/app/storage.js",
  "/dist/content/grammar-pack.js",
  "/dist/content/types.js",
  "/dist/content/units/articles-a-an.js",
  "/dist/content/units/articles-the.js",
  "/dist/content/units/comparatives.js",
  "/dist/content/units/do-does-did.js",
  "/dist/content/units/go-went-gone.js",
  "/dist/content/units/modals-basic.js",
  "/dist/content/units/much-many.js",
  "/dist/content/units/past-simple.js",
  "/dist/content/units/prepositions-time.js",
  "/dist/content/units/present-perfect-basic.js",
  "/dist/content/units/present-simple-s.js",
  "/dist/kernel/admissibility.js",
  "/dist/kernel/index.js",
  "/dist/kernel/planner.js",
  "/dist/kernel/schedule.js",
  "/dist/kernel/sync.js",
  "/dist/sync/auth.js",
  "/dist/sync/config.js",
  "/dist/sync/sync.js",
  "/dist/ui/authStore.js",
  "/dist/ui/backupIo.js",
  "/dist/ui/indexedDbStore.js",
  "/dist/ui/main.js",
  "/dist/ui/pwa.js",
  "/dist/ui/screens/aiCard.js",
  "/dist/ui/screens/clipboard.js",
  "/dist/ui/screens/common.js",
  "/dist/ui/screens/corrupt.js",
  "/dist/ui/screens/exercise.js",
  "/dist/ui/screens/home.js",
  "/dist/ui/screens/intro.js",
  "/dist/ui/screens/progress.js",
  "/dist/ui/screens/statusBlock.js",
  "/dist/ui/screens/summary.js",
  "/dist/ui/screens/syncBar.js",
  "/dist/ui/screens/unitCard.js",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/index.html",
  "/manifest.webmanifest"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigation requests: respond with the cached "/index.html" from CACHE_NAME (network only if it is missing)
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match('/index.html');
        if (cached) {
          return cached;
        }
        return fetch(req).catch(() => {
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        });
      })
    );
    return;
  }

  // All other requests: CACHE-FIRST from CACHE_NAME only (no runtime caching); on a miss use network; if network fails return 503
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) {
        return cached;
      }
      return fetch(req).catch(() => {
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      });
    })
  );
});
