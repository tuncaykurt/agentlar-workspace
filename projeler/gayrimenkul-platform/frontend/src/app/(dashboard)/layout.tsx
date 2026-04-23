import Sidebar from '@/components/Sidebar'
import { FeatureProvider, useFeatures } from '@/lib/features'
import { Clock } from 'lucide-react'

function ActiveGuard({ children }: { children: React.ReactNode }) {
  const { isActive, loading } = useFeatures()

  if (loading) {
    return (
      <div className="flex-1 min-w-0 flex items-center justify-center pt-14 md:pt-0">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isActive) {
    return (
      <div className="flex-1 min-w-0 flex items-center justify-center p-4 pt-14 md:pt-0">
        <div className="max-w-md w-full bg-surface-container rounded-2xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock size={32} className="text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-on-surface mb-2">Hesabınız Onay Bekliyor</h2>
          <p className="text-on-surface-variant text-sm mb-6">
            Kayıt işleminiz tamamlandı. Ancak platformu kullanmaya başlayabilmeniz için yönetici onayı gerekmektedir. Onaylandıktan sonra modüllere erişebilirsiniz.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="btn-primary w-full"
          >
            Durumu Yenile
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <FeatureProvider>
      <div className="flex min-h-screen bg-surface">
        <Sidebar />
        {/* pt-14 on mobile to clear the fixed top header; no padding on md+ */}
        <main className="flex-1 min-w-0 overflow-auto pt-14 md:pt-0 flex flex-col">
          <ActiveGuard>
            {children}
          </ActiveGuard>
        </main>
      </div>
    </FeatureProvider>
  )
}
