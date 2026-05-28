'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { api } from '@/lib/api'

// VAPID Public Key - Backend'den de alabiliriz ama sabit olduğu için buraya ekledik
const VAPID_PUBLIC_KEY = "BJ8TZYDjv-OHYrjJu0Y5xwEgNRfsrxdZ2sLi16Aj13PttTxfwrhtBs8j5OYkp1fIOc0qkPtMxnEr7rVNq1izPF8"

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function PWARegister() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        // Kontrol et
        reg.pushManager.getSubscription().then(sub => {
          if (sub) setIsSubscribed(true)
        })
      }).catch(() => {})
    }
    if ('Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)

      if (perm === 'granted') {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        })

        // Backend'e gönder
        await api.post("/simulations/push/subscribe", sub)

        setIsSubscribed(true)
      }
    } catch (e) {
      console.error('Push error:', e)
      alert("Bildirim izni alınırken hata oluştu.")
    }
  }

  if (permission === 'granted' && isSubscribed) return null

  return (
    <button
      onClick={subscribeToPush}
      className="fixed bottom-4 right-4 z-50 bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-full shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 group"
      title="Mobil Bildirimleri Aç"
    >
      <Bell className="w-5 h-5 group-hover:animate-ping" />
      <span className="text-sm font-medium pr-1 hidden group-hover:block">Bildirimleri Aç</span>
    </button>
  )
}

