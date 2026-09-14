/* RH Habits legacy service-worker cleanup.
 * The current app does not register a cache-first service worker.
 * This worker exists only to clean up older RH Habits caches/registrations
 * that may still control an existing browser/PWA installation.
 */
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) {
      // Ignore cache cleanup failures; activation should still complete.
    }
    try {
      await self.registration.unregister();
    } catch (e) {
      // Ignore unregister failures.
    }
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => client.navigate(client.url).catch(() => {}));
    } catch (e) {
      // Ignore navigation failures.
    }
  })());
});
