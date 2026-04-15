import {
  Users,
  Building2,
  DollarSign,
  MessageSquare,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()

  // 1. Aktif Müşteri (SADECE ilanda olan mülk sahiplerinin sayısı)
  const { data: activeProps } = await supabase
    .from('properties')
    .select('client_id')
    .eq('status', 'active')
    .not('client_id', 'is', null)

  const uniqueOwnerIds = new Set(activeProps?.map(p => p.client_id) || [])
  const activeClientsCount = uniqueOwnerIds.size

  // 2. Portföy (Aktif)
  const { count: activePropertiesCount } = await supabase
    .from('properties')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  // 3. Bu Ay Komisyon
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  
  const { data: commissions } = await supabase
    .from('commissions')
    .select('consultant_share_amount')
    // Bu ay kazanılan (paid) veya onaylanan (confirmed) komisyonlar hesaba katılabilir
    .gte('created_at', startOfMonth.toISOString())
    .in('status', ['paid', 'confirmed'])

  const thisMonthCommission = commissions?.reduce(
    (acc, curr) => acc + (curr.consultant_share_amount || 0),
    0
  ) || 0

  // 4. Bekleyen Takip
  const { count: pendingFollowupsCount } = await supabase
    .from('follow_ups')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  // 5. Bugünkü Takipler Listesi
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)

  const { data: todaysFollowups } = await supabase
    .from('follow_ups')
    .select(`
      id,
      notes,
      channel,
      due_at,
      status,
      clients (
        full_name
      )
    `)
    .gte('due_at', startOfToday.toISOString())
    .lte('due_at', endOfToday.toISOString())
    .order('due_at', { ascending: true })

  const stats = [
    { label: 'Aktif Müşteri/Mal Sahibi', value: activeClientsCount?.toString() || '0', icon: Users, color: 'blue', change: '' },
    { label: 'Portföy (Aktif)', value: activePropertiesCount?.toString() || '0', icon: Building2, color: 'green', change: '' },
    { label: 'Bu Ay Komisyon', value: `₺ ${thisMonthCommission.toLocaleString('tr-TR')}`, icon: DollarSign, color: 'yellow', change: '' },
    { label: 'Bekleyen Takip', value: pendingFollowupsCount?.toString() || '0', icon: Clock, color: 'red', change: '' },
  ]

  return (
    <div className="p-6">
      {/* Başlık */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Hoş geldiniz. Bugünkü özet aşağıda.</p>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="stat-card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                <div className={`w-9 h-9 rounded-lg bg-${stat.color}-50 flex items-center justify-center`}>
                  <Icon size={18} className={`text-${stat.color}-600`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              {stat.change && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <TrendingUp size={12} />
                  {stat.change}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Ana İçerik Alanı */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bugünkü Takipler */}
        <div className="lg:col-span-2 card flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Bugünkü Takipler</h2>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
              {todaysFollowups?.length || 0} Adet
            </span>
          </div>
          
          {todaysFollowups && todaysFollowups.length > 0 ? (
            <div className="space-y-3 flex-1">
              {todaysFollowups.map((f: any) => (
                <div key={f.id} className="flex items-center gap-4 p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className={`w-10 h-10 rounded-full flex items-center shrink-0 justify-center ${f.status === 'done' ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    <Clock size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-slate-900 truncate">
                      {f.clients ? f.clients.full_name : 'Bilinmeyen Müşteri'}
                    </h3>
                    <p className="text-xs text-slate-500 truncate">{f.notes || 'Not girilmemiş...'}</p>
                  </div>
                  <div className="text-xs font-semibold text-slate-400 shrink-0">
                    {new Date(f.due_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 flex-1 border border-dashed border-slate-200 rounded-lg">
              <CheckCircle size={40} className="mb-3 opacity-30 text-green-500" />
              <p className="text-sm">Bugün için planlanan takip bulunmuyor</p>
            </div>
          )}
        </div>

        {/* Hızlı Aksiyonlar */}
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-4">Hızlı Aksiyonlar</h2>
          <div className="space-y-2">
            {[
              { label: 'Yeni Müşteri Ekle', href: '/crm/new', icon: Users },
              { label: 'Mülk Ekle / URL İçe Aktar', href: '/portfolio/new', icon: Building2 },
              { label: 'Belge Oluştur', href: '/documents/new', icon: MessageSquare },
              { label: 'Kampanya Oluştur', href: '/campaigns/new', icon: AlertCircle },
            ].map((action) => {
              const Icon = action.icon
              return (
                <a
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors group"
                >
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100">
                    <Icon size={15} className="text-blue-600" />
                  </div>
                  <span className="text-sm text-slate-700 font-medium">{action.label}</span>
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
