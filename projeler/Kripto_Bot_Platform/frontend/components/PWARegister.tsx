'use client'

import { useEffect, useState } from 'react'
import { Bell, Download } from 'lucide-react'
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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(async (reg) => {
        // Mevcut subscription'ı kontrol et
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          setIsSubscribed(true)
          // Her açılışta backend'e kaydet (Redis temizlenmiş olabilir)
          try {
            await api.post("/simulations/push/subscribe", sub)
          } catch (e) {
            console.warn('[Push] Subscription backend sync hatası:', e)
          }
        } else if ('Notification' in window && Notification.permission === 'granted') {
          // İzin var ama subscription yok — otomatik oluştur
          try {
            const newSub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            })
            await api.post("/simulations/push/subscribe", newSub)
            setIsSubscribed(true)
          } catch (e) {
            console.warn('[Push] Auto-subscribe hatası:', e)
          }
        }
      }).catch(() => {})
    }
    if ('Notification' in window) {
      setPermission(Notification.permission)
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // iOS Tespiti
    const userAgent = window.navigator.userAgent.toLowerCase()
    const ios = /iphone|ipad|ipod/.test(userAgent)
    setIsIOS(ios)
    
    // Yüklü mü Tespiti
    const standalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as any).standalone)
    setIsStandalone(standalone)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
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

  const handleInstallClick = async () => {
    if (isIOS) {
      alert("iPhone/iPad'de uygulamayı yüklemek için:\n\n1. Safari'nin altındaki 'Paylaş' (Kare içinden çıkan ok) ikonuna dokunun.\n2. Listeden 'Ana Ekrana Ekle' (Add to Home Screen) seçeneğini seçin.")
      return
    }
    
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }

  const showPushBtn = permission !== 'granted' || !isSubscribed
  const showInstallBtn = !!deferredPrompt || (isIOS && !isStandalone)

  if (!showPushBtn && !showInstallBtn) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3">
      {showInstallBtn && (
        <button
          onClick={handleInstallClick}
          className="bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-full shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 group"
          title="Telefona Yükle"
        >
          <Download className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
          <span className="text-sm font-medium pr-1 hidden group-hover:block whitespace-nowrap">Telefona Yükle</span>
        </button>
      )}

      {showPushBtn && (
        <button
          onClick={subscribeToPush}
          className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-full shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 group"
          title="Mobil Bildirimleri Aç"
        >
          <Bell className="w-5 h-5 group-hover:animate-ping" />
          <span className="text-sm font-medium pr-1 hidden group-hover:block whitespace-nowrap">Bildirimleri Aç</span>
        </button>
      )}
    </div>
  )
}

