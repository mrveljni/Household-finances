const CACHE_NAME = 'hft-shell-v1';
const SHELL_FILES = [
  './index.html', './styles.css', './config.js', './api.js', './store.js', './app.js',
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
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
