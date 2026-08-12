const CACHE_NAME = 'stayease-v2'

// Don't cache anything - always fetch from network
self.addEventListener('install', event => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(cacheNames.map(name => caches.delete(name)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  // Always fetch from network, never cache
  event.respondWith(fetch(event.request))
})
