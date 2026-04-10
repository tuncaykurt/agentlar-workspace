'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Client, LeadStatus, ClientType } from '@/lib/types'
import {
  Search,
  Plus,
  Filter,
  Phone,
  Mail,
  ChevronRight,
  Users,
  Clock,
  TrendingUp,
  CheckCircle,
} from 'lucide-react'

const statusColors: Record<LeadStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-purple-100 text-purple-700',
  qualified: 'bg-yellow-100 text-yellow-700',
  negotiating: 'bg-orange-100 text-orange-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
  dormant: 'bg-slate-100 text-slate-600',
}

const statusLabels: Record<LeadStatus, string> = {
  new: 'Yeni',
  contacted: 'İletişime Geçildi',
  qualified: 'Nitelikli',
  negotiating: 'Müzakere',
  won: 'Kazanıldı',
  lost: 'Kaybedildi',
  dormant: 'Pasif',
}

const typeLabels: Record<ClientType, string> = {
  buyer: 'Alıcı',
  seller: 'Satıcı',
  both: 'Alıcı & Satıcı',
  investor: 'Yatırımcı',
  tenant: 'Kiracı',
  landlord: 'Ev Sahibi',
}

export default function CRMPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<LeadStatus | 'all'>('all')
  const [filterType, setFilterType] = useState<ClientType | 'all'>('all')

  useEffect(() => {
    fetchClients()
  }, [filterStatus, filterType])

  async function fetchClients() {
    const supabase = createClient()
    let query = supabase
      .from('clients')
      .select('*, consultant:consultants(full_name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (filterStatus !== 'all') query = query.eq('lead_status', filterStatus)
    if (filterType !== 'all') query = query.eq('client_type', filterType)

    const { data, error } = await query
    if (!error && data) setClients(data as Client[])
    setLoading(false)
  }

  const filtered = clients.filter((c) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      c.full_name.toLowerCase().includes(s) ||
      c.phone?.includes(s) ||
      c.email?.toLowerCase().includes(s)
    )
  })

  return (
    <div className="p-6">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">CRM</h1>
          <p className="text-slate-500 text-sm mt-1">Tüm müşterilerinizi buradan yönetin</p>
        </div>
        <Link href="/crm/new" className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Yeni Müşteri
        </Link>
      </div>

      {/* Özet Kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Toplam', value: clients.length, icon: Users, color: 'blue' },
          { label: 'Yeni Lead', value: clients.filter(c => c.lead_status === 'new').length, icon: TrendingUp, color: 'purple' },
          { label: 'Müzakere', value: clients.filter(c => c.lead_status === 'negotiating').length, icon: Clock, color: 'orange' },
          { label: 'Kazanılan', value: clients.filter(c => c.lead_status === 'won').length, icon: CheckCircle, color: 'green' },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="stat-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">{s.value}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg bg-${s.color}-50 flex items-center justify-center`}>
                  <Icon size={18} className={`text-${s.color}-600`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filtreler */}
      <div className="card mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="İsim, telefon veya e-posta ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as LeadStatus | 'all')}
              className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">Tüm Durumlar</option>
              {Object.entries(statusLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as ClientType | 'all')}
              className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">Tüm Tipler</option>
              {Object.entries(typeLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Müşteri Listesi */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">Yükleniyor...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Users size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">Müşteri bulunamadı</p>
            <p className="text-xs mt-1">Yeni müşteri ekleyin veya filtreyi değiştirin</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((client) => (
              <Link
                key={client.id}
                href={`/crm/${client.id}`}
                className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors group"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-700 font-semibold text-sm">
                    {client.full_name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Bilgiler */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-slate-900 text-sm truncate">{client.full_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${typeLabels[client.client_type] ? 'bg-slate-100 text-slate-600' : ''}`}>
                      {typeLabels[client.client_type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {client.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {client.phone}
                      </span>
                    )}
                    {client.email && (
                      <span className="flex items-center gap-1 truncate">
                        <Mail size={11} /> {client.email}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sağ Taraf */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[client.lead_status]}`}>
                    {statusLabels[client.lead_status]}
                  </span>
                  {client.consultant && (
                    <span className="text-xs text-slate-400 hidden lg:block">
                      {(client.consultant as { full_name: string }).full_name}
                    </span>
                  )}
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
