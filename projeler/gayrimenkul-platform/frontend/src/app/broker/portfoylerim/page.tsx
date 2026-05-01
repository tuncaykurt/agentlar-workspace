'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Office } from '@/lib/types'
import {
  Layout, Loader2, Building2, MapPin, Tag, Search, User,
} from 'lucide-react'

type PropertyRow = {
  id: string
  title: string
  description?: string
  price?: number
  currency: string
  city?: string
  district?: string
  property_type: string
  status: string
  m2_gross?: number
  room_count?: string
  photos: string[]
  is_active: boolean
  listed_at: string
  consultant?: { id: string; full_name: string; profile_photo_url?: string }
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  available:    { label: 'Satışta',     color: 'bg-green-100 text-green-700' },
  reserved:     { label: 'Rezerve',     color: 'bg-yellow-100 text-yellow-700' },
  sold:         { label: 'Satıldı',     color: 'bg-gray-100 text-gray-600' },
  rented:       { label: 'Kiralandı',   color: 'bg-blue-100 text-blue-700' },
  withdrawn:    { label: 'Çekildi',     color: 'bg-red-100 text-red-700' },
}

const TYPE_LABELS: Record<string, string> = {
  apartment:    'Daire',
  house:        'Müstakil Ev',
  villa:        'Villa',
  land:         'Arsa',
  commercial:   'Ticari',
  office:       'Ofis',
  warehouse:    'Depo',
  other:        'Diğer',
}

function formatPrice(price?: number, currency?: string) {
  if (!price) return '—'
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 0 }).format(price)
}

export default function BrokerPortfoylerimPage() {
  const supabase = createClient()
  const [offices, setOffices] = useState<Office[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => {
    supabase.from('offices').select('*').order('name').then(({ data }) => {
      if (data && data.length > 0) {
        setOffices(data as Office[])
        setSelectedOfficeId(data[0].id)
      } else {
        setLoading(false)
      }
    })
  }, [])

  useEffect(() => {
    if (!selectedOfficeId) return
    fetchProperties(selectedOfficeId)
  }, [selectedOfficeId, filterStatus])

  async function fetchProperties(officeId: string) {
    setLoading(true)

    // Önce ofisteki danışman id'lerini al
    const { data: members } = await supabase
      .from('office_memberships')
      .select('consultant_id')
      .eq('office_id', officeId)
      .is('end_date', null)

    if (!members || members.length === 0) {
      setProperties([])
      setLoading(false)
      return
    }

    const consultantIds = members.map((m: any) => m.consultant_id)

    let query = supabase
      .from('properties')
      .select('id, title, description, price, currency, city, district, property_type, status, m2_gross, room_count, photos, is_active, listed_at, consultant:consultants(id, full_name, profile_photo_url)')
      .in('assigned_consultant_id', consultantIds)
      .order('listed_at', { ascending: false })

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus)
    }

    const { data } = await query
    setProperties((data as PropertyRow[]) || [])
    setLoading(false)
  }

  const filtered = properties.filter(p => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      p.title.toLowerCase().includes(s) ||
      p.city?.toLowerCase().includes(s) ||
      p.district?.toLowerCase().includes(s) ||
      (p.consultant as any)?.full_name?.toLowerCase().includes(s)
    )
  })

  const stats = [
    { label: 'Toplam', value: properties.length, status: 'all' },
    { label: 'Satışta', value: properties.filter(p => p.status === 'available').length, status: 'available' },
    { label: 'Rezerve', value: properties.filter(p => p.status === 'reserved').length, status: 'reserved' },
    { label: 'Satıldı', value: properties.filter(p => p.status === 'sold').length, status: 'sold' },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Layout size={22} className="text-primary" />
            Ofis Portföyleri
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Tüm danışmanların portföydeki mülkleri
          </p>
        </div>
        {offices.length > 1 && (
          <select value={selectedOfficeId} onChange={e => setSelectedOfficeId(e.target.value)} className="input max-w-xs">
            {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      {/* Stat kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map(s => (
          <button
            key={s.status}
            onClick={() => setFilterStatus(s.status)}
            className={`stat-card text-left transition-all hover:ring-2 hover:ring-primary/30 ${filterStatus === s.status ? 'ring-2 ring-primary' : ''}`}
          >
            <p className="text-xs text-on-surface-variant mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-on-surface">{s.value}</p>
          </button>
        ))}
      </div>

      {/* Arama + filtre */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              className="input pl-9"
              placeholder="Mülk, şehir, danışman ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="input max-w-[180px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">Tüm Durumlar</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mülk listesi */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Building2 size={40} className="text-on-surface-variant opacity-30 mb-3" />
          <p className="text-on-surface-variant">
            {search || filterStatus !== 'all' ? 'Filtreyle eşleşen mülk bulunamadı.' : 'Bu ofise ait henüz portföy yok.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const statusCfg = STATUS_LABELS[p.status] || { label: p.status, color: 'bg-gray-100 text-gray-600' }
            const photo = p.photos?.[0]
            const consultant = p.consultant as any

            return (
              <div key={p.id} className="card overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                {/* Fotoğraf */}
                <div className="relative h-44 bg-surface-container-high flex-shrink-0">
                  {photo ? (
                    <img src={photo} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 size={36} className="text-on-surface-variant opacity-30" />
                    </div>
                  )}
                  <span className={`absolute top-2 right-2 text-xs px-2 py-1 rounded-full font-medium ${statusCfg.color}`}>
                    {statusCfg.label}
                  </span>
                </div>

                {/* İçerik */}
                <div className="p-4 flex flex-col flex-1 gap-2">
                  <p className="font-semibold text-on-surface text-sm leading-snug line-clamp-2">{p.title}</p>

                  <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                    <MapPin size={11} />
                    {[p.district, p.city].filter(Boolean).join(', ') || '—'}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <Tag size={11} />
                      {TYPE_LABELS[p.property_type] || p.property_type}
                    </span>
                    {p.m2_gross && <span>{p.m2_gross} m²</span>}
                    {p.room_count && <span>{p.room_count}</span>}
                  </div>

                  <p className="text-base font-bold text-primary mt-auto">
                    {formatPrice(p.price, p.currency)}
                  </p>

                  {/* Danışman */}
                  {consultant && (
                    <div className="flex items-center gap-2 pt-2 border-t border-outline mt-1">
                      {consultant.profile_photo_url ? (
                        <img src={consultant.profile_photo_url} alt={consultant.full_name} className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center">
                          <User size={12} className="text-primary" />
                        </div>
                      )}
                      <p className="text-xs text-on-surface-variant">{consultant.full_name}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
