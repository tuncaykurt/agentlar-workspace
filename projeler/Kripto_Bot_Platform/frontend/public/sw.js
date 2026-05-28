const CACHE_NAME = 'kriptobot-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/dashboard', '/offline']).catch(() => {})
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('/api/')) return

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(e.request).then((cached) => cached || caches.match('/offline')))
  )
})

self.addEventListener('push', (e) => {
  if (!e.data) return

  try {
    const data = e.data.json()
    const options = {
      body: data.body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      vibrate: [200, 100, 200],
      tag: data.tag || 'kriptobot',
      data: data.data || { url: '/hft' },
      requireInteraction: true
    }

    e.waitUntil(
      self.registration.showNotification(data.title, options)
    )
  } catch (err) {
    console.error('Push data error:', err)
  }
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()

  const targetUrl = e.notification.data?.url || '/hft'

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i]
        // If so, just focus it.
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus()
        }
      }
      // If not, then open the target URL in a new window/tab.
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})
