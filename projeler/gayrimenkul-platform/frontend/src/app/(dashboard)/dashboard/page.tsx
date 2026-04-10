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

const stats = [
  { label: 'Aktif Müşteri', value: '—', icon: Users, color: 'blue', change: '' },
  { label: 'Portföy (Aktif)', value: '—', icon: Building2, color: 'green', change: '' },
  { label: 'Bu Ay Komisyon', value: '—', icon: DollarSign, color: 'yellow', change: '' },
  { label: 'Bekleyen Takip', value: '—', icon: Clock, color: 'red', change: '' },
]

export default function DashboardPage() {
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
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Bugünkü Takipler</h2>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
              Yükleniyor...
            </span>
          </div>
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <CheckCircle size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Supabase bağlantısını yapılandırın</p>
            <p className="text-xs mt-1">.env.local dosyasını doldurun</p>
          </div>
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

      {/* Kurulum Uyarısı */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex gap-3">
          <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">Kurulum Adımları</p>
            <ol className="text-xs text-blue-700 mt-1 space-y-0.5 list-decimal list-inside">
              <li>Self-hosted Supabase URL ve key bilgilerini <code className="bg-blue-100 px-1 rounded">.env.local</code> dosyasına ekleyin</li>
              <li>SQL migration dosyalarını Supabase SQL Editor'da çalıştırın (<code className="bg-blue-100 px-1 rounded">supabase/migrations/</code>)</li>
              <li>n8n'de credential'ları tanımlayın ve workflow'ları import edin</li>
              <li>Evolution API webhook URL'lerini n8n'e bağlayın</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
