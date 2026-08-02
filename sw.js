const CACHE_NAME = 'hft-shell-v2';
const SHELL_FILES = [
  './index.html', './styles.css', './config.js', './api.js', './store.js', './categorize.js', './app.js',
  './views/dashboard.js', './views/accounts.js', './views/trends.js', './views/goals.js', './views/upload.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Never cache API calls to Apps Script — always go to network for fresh data
  if (e.request.url.includes('script.google.com')) return;
  // Network-first for app shell files, so code updates show up on next load
  // instead of being masked by a stale cache. Falls back to cache only if offline.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
