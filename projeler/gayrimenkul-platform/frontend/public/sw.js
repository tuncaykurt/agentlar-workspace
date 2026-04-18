const CACHE_NAME = 'gayrimenkul-v1'

// Install — cache shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/dashboard', '/offline'])
    ).catch(() => {})
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (e) => {
  // Skip non-GET and API/auth requests
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('/api/')) return
  if (e.request.url.includes('/auth/')) return

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache successful page responses
        if (res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(e.request).then((cached) => cached || caches.match('/offline')))
  )
})
