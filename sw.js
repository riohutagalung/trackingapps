const CACHE_NAME = 'rh-habits-v1';
const urlsToCache = [
  './',
  './manifest.json'
];

// Install Service Worker dan Cache file static
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetching: Lewati cache untuk request ke Google Apps Script agar data selalu real-time
self.addEventListener('fetch', event => {
  // Jika URL mengarah ke Google Script, gunakan jaringan (Network Only / Network First)
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Untuk file lainnya, gunakan Cache First
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request).then(networkResponse => {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
          return networkResponse;
        });
      })
      .catch(() => caches.match('./'))
  );
});

// Activate dan hapus cache lama
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
