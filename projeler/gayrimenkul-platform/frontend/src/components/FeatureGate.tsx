'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useFeatures } from '@/lib/features'
import { Lock } from 'lucide-react'

/**
 * Wrap a page with this component to gate it behind a feature flag.
 * If the feature is disabled, shows a locked message and redirects.
 */
export default function FeatureGate({
  featureKey,
  children,
}: {
  featureKey: string
  children: React.ReactNode
}) {
  const { hasFeature, loading } = useFeatures()
  const router = useRouter()
  const allowed = hasFeature(featureKey)

  useEffect(() => {
    if (!loading && !allowed) {
      // Small delay before redirect so user sees the message
      const t = setTimeout(() => router.push('/dashboard'), 2000)
      return () => clearTimeout(t)
    }
  }, [loading, allowed, router])

  if (loading) return null // Layout already shows sidebar, just wait

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <div className="w-16 h-16 bg-surface-container-high rounded-2xl flex items-center justify-center mb-4">
          <Lock size={28} className="text-on-surface-variant" />
        </div>
        <h2 className="text-lg font-semibold text-on-surface mb-1">Bu Özellik Aktif Değil</h2>
        <p className="text-sm text-on-surface-variant text-center max-w-sm">
          Bu özellik henüz hesabınız için aktifleştirilmemiş. Yöneticinizle iletişime geçin.
        </p>
        <p className="text-xs text-on-surface-variant mt-3">Dashboard'a yönlendiriliyorsunuz...</p>
      </div>
    )
  }

  return <>{children}</>
}
