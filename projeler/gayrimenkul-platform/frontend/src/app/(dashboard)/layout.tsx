import Sidebar from '@/components/Sidebar'
import { FeatureProvider } from '@/lib/features'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <FeatureProvider>
      <div className="flex min-h-screen bg-slate-100">
        <Sidebar />
        {/* pt-14 on mobile to clear the fixed top header; no padding on md+ */}
        <main className="flex-1 min-w-0 overflow-auto pt-14 md:pt-0">
          {children}
        </main>
      </div>
    </FeatureProvider>
  )
}
