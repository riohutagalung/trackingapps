const CACHE_NAME = 'rh-habits-v1';
const urlsToCache = [
  './catatanku_V10_FINAL_2.html',
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
        if (response) {
          return response; // Gunakan versi cache
        }
        return fetch(event.request); // Gunakan network jika tidak ada di cache
      })
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
