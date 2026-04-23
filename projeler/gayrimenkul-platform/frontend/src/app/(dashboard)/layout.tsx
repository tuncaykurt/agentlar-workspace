import Sidebar from '@/components/Sidebar'
import { FeatureProvider } from '@/lib/features'
import ActiveGuard from '@/components/ActiveGuard'

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
