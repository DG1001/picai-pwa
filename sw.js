const CACHE_NAME = 'picai-v1';
const urlsToCache = [
  '/picai-pwa/',
  '/picai-pwa/index.html',
  '/picai-pwa/app.js',
  '/picai-pwa/manifest.json',
  '/picai-pwa/icon-192.png',
  '/picai-pwa/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      }
    )
  );
});