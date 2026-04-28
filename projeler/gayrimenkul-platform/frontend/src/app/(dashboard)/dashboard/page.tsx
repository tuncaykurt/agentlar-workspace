import type { LucideIcon } from 'lucide-react'
import {
  Users,
  Building2,
  DollarSign,
  MessageSquare,
  Clock,
  CheckCircle,
  Megaphone,
} from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// ─── Feature helper (server-side, mirrors /api/features logic) ────────────────

async function getEnabledFeatures(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { isAdmin: false, features: new Set<string>() }

  const { data: consultant } = await supabase
    .from('consultants')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  if (!consultant) return { isAdmin: false, features: new Set<string>() }

  const isAdmin = consultant.role === 'admin'
  if (isAdmin) {
    // Admin sees everything — return a sentinel so hasFeature always returns true
    return { isAdmin: true, features: new Set<string>(['*']) }
  }

  const [{ data: featureConfigs }, { data: overrides }] = await Promise.all([
    supabase.from('feature_config').select('feature_key, is_enabled, enabled_for_roles'),
    supabase.from('consultant_feature_overrides').select('feature_key, is_enabled').eq('consultant_id', consultant.id),
  ])

  const overrideMap: Record<string, boolean> = {}
  for (const o of overrides || []) overrideMap[o.feature_key] = o.is_enabled

  const features = new Set<string>()
  for (const f of featureConfigs || []) {
    if (overrideMap[f.feature_key] !== undefined) {
      if (overrideMap[f.feature_key]) features.add(f.feature_key)
      continue
    }
    if (f.is_enabled && (f.enabled_for_roles || []).includes(consultant.role)) {
      features.add(f.feature_key)
    }
  }

  return { isAdmin, features }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { isAdmin, features } = await getEnabledFeatures(supabase)

  const has = (key: string) => isAdmin || features.has('*') || features.has(key)

  // Fetch only what's needed for enabled modules
  let activeClientsCount = 0
  let activePropertiesCount = 0
  let thisMonthCommission = 0
  let pendingFollowupsCount = 0
  let todaysFollowups: any[] = []

  const fetches: Promise<void>[] = []

  if (has('crm')) {
    fetches.push(
      supabase
        .from('properties')
        .select('client_id')
        .eq('status', 'active')
        .eq('is_active', true)
        .not('client_id', 'is', null)
        .then(({ data }) => {
          activeClientsCount = new Set(data?.map(p => p.client_id) || []).size
        })
    )
  }

  if (has('portfolio')) {
    fetches.push(
      supabase
        .from('properties')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('is_active', true)
        .then(({ count }) => { activePropertiesCount = count || 0 })
    )
  }

  if (has('finance')) {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    fetches.push(
      supabase
        .from('commissions')
        .select('consultant_share_amount')
        .gte('created_at', startOfMonth.toISOString())
        .in('status', ['paid', 'confirmed'])
        .then(({ data }) => {
          thisMonthCommission = data?.reduce((s, r) => s + (r.consultant_share_amount || 0), 0) || 0
        })
    )
  }

  if (has('communications')) {
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999)
    fetches.push(
      supabase
        .from('follow_ups')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then(({ count }) => { pendingFollowupsCount = count || 0 }),
      supabase
        .from('follow_ups')
        .select('id, notes, channel, due_at, status, clients(full_name)')
        .gte('due_at', startOfToday.toISOString())
        .lte('due_at', endOfToday.toISOString())
        .order('due_at', { ascending: true })
        .then(({ data }) => { todaysFollowups = (data as any[]) || [] })
    )
  }

  await Promise.all(fetches)

  // ── Stat cards (only enabled modules) ──────────────────────────────────────
  const stats = [
    has('crm') && {
      label: 'Aktif Müşteri/Mal Sahibi',
      value: activeClientsCount.toString(),
      icon: Users,
      color: 'blue',
    },
    has('portfolio') && {
      label: 'Portföy (Aktif)',
      value: activePropertiesCount.toString(),
      icon: Building2,
      color: 'green',
    },
    has('finance') && {
      label: 'Bu Ay Komisyon',
      value: `₺ ${thisMonthCommission.toLocaleString('tr-TR')}`,
      icon: DollarSign,
      color: 'yellow',
    },
    has('communications') && {
      label: 'Bekleyen Takip',
      value: pendingFollowupsCount.toString(),
      icon: Clock,
      color: 'red',
    },
  ].filter(Boolean) as { label: string; value: string; icon: LucideIcon; color: string }[]

  // ── Quick actions (only enabled modules) ───────────────────────────────────
  const quickActions = [
    has('crm') && { label: 'Yeni Müşteri Ekle', href: '/crm/new', icon: Users },
    has('portfolio') && { label: 'Mülk Ekle / URL İçe Aktar', href: '/portfolio/new', icon: Building2 },
    has('documents') && { label: 'Belge Oluştur', href: '/documents/new', icon: MessageSquare },
    has('campaigns') && { label: 'Kampanya Oluştur', href: '/campaigns/new', icon: Megaphone },
  ].filter(Boolean) as { label: string; href: string; icon: LucideIcon }[]

  const noModulesEnabled = stats.length === 0 && quickActions.length === 0

  return (
    <div className="p-6">
      {/* Başlık */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Dashboard</h1>
        <p className="text-on-surface-variant text-sm mt-1">Hoş geldiniz. Bugünkü özet aşağıda.</p>
      </div>

      {/* Henüz modül açılmamış — yeni danışman */}
      {noModulesEnabled && (
        <div className="card flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-primary-container rounded-2xl flex items-center justify-center mb-4">
            <Building2 size={28} className="text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-on-surface mb-2">Hesabınız Onaylandı</h2>
          <p className="text-sm text-on-surface-variant">
            Modülleriniz henüz aktifleştirilmedi. Yöneticiniz modüllerinizi açtıkça buradaki özet ve aksiyonlar görünür hale gelecek.
          </p>
        </div>
      )}

      {/* İstatistik Kartları */}
      {stats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className="stat-card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-on-surface-variant">{stat.label}</p>
                  <div className={`w-9 h-9 rounded-lg bg-${stat.color}-50 flex items-center justify-center`}>
                    <Icon size={18} className={`text-${stat.color}-600`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-on-surface">{stat.value}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Ana İçerik Alanı */}
      {(has('communications') || quickActions.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bugünkü Takipler — sadece communications modülü açıksa */}
          {has('communications') && (
            <div className="lg:col-span-2 card flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-on-surface">Bugünkü Takipler</h2>
                <span className="text-xs text-on-surface-variant bg-surface-container-high px-2 py-1 rounded-full">
                  {todaysFollowups.length} Adet
                </span>
              </div>

              {todaysFollowups.length > 0 ? (
                <div className="space-y-3 flex-1">
                  {todaysFollowups.map((f: any) => (
                    <div key={f.id} className="flex items-center gap-4 p-3 border border-outline rounded-lg hover:bg-surface-container-high transition-colors">
                      <div className={`w-10 h-10 rounded-full flex items-center shrink-0 justify-center ${f.status === 'done' ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        <Clock size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-on-surface truncate">
                          {f.clients ? (f.clients as any).full_name : 'Bilinmeyen Müşteri'}
                        </h3>
                        <p className="text-xs text-on-surface-variant truncate">{f.notes || 'Not girilmemiş...'}</p>
                      </div>
                      <div className="text-xs font-semibold text-on-surface-variant shrink-0">
                        {new Date(f.due_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant flex-1 border border-dashed border-outline rounded-lg">
                  <CheckCircle size={40} className="mb-3 opacity-30 text-green-500" />
                  <p className="text-sm">Bugün için planlanan takip bulunmuyor</p>
                </div>
              )}
            </div>
          )}

          {/* Hızlı Aksiyonlar — en az bir modül açıksa */}
          {quickActions.length > 0 && (
            <div className={has('communications') ? 'card' : 'card lg:col-span-3'}>
              <h2 className="font-semibold text-on-surface mb-4">Hızlı Aksiyonlar</h2>
              <div className={has('communications') ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2'}>
                {quickActions.map((action) => {
                  const Icon = action.icon
                  return (
                    <a
                      key={action.label}
                      href={action.href}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-container-high transition-colors group"
                    >
                      <div className="w-8 h-8 bg-primary-container rounded-lg flex items-center justify-center">
                        <Icon size={15} className="text-primary" />
                      </div>
                      <span className="text-sm text-on-surface font-medium">{action.label}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
