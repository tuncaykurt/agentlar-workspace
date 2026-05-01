import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import BrokerSidebar from '@/components/BrokerSidebar'
import ActiveGuard from '@/components/ActiveGuard'
import { FeatureProvider } from '@/lib/features'

export default async function BrokerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: consultant } = await supabase
    .from('consultants')
    .select('role')
    .eq('user_id', user.id)
    .single()

  // Sadece broker ve admin yetkili olabilir
  if (consultant?.role !== 'broker' && consultant?.role !== 'admin') {
    redirect('/dashboard')
  }

  return (
    <FeatureProvider>
      <div className="flex min-h-screen bg-surface">
        <BrokerSidebar />
        <main className="flex-1 min-w-0 overflow-auto pt-14 md:pt-0 flex flex-col">
          <ActiveGuard>
            {children}
          </ActiveGuard>
        </main>
      </div>
    </FeatureProvider>
  )
}
