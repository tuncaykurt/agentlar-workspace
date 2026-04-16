'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Property, PropertyStatus, PropertyType } from '@/lib/types'
import {
  Plus, Search, Building2, MapPin, Home,
  Eye, ChevronRight, Grid3x3, List,
} from 'lucide-react'

const statusColors: Record<PropertyStatus, string> = {
  active: 'bg-green-100 text-green-700',
  under_offer: 'bg-yellow-100 text-yellow-700',
  sold: 'bg-slate-100 text-slate-500',
  rented: 'bg-blue-100 text-blue-700',
  withdrawn: 'bg-red-100 text-red-600',
}

const statusLabels: Record<PropertyStatus, string> = {
  active: 'Aktif', under_offer: 'Teklif Var', sold: 'Satıldı',
  rented: 'Kiralandı', withdrawn: 'Kaldırıldı',
}

const typeLabels: Record<PropertyType, string> = {
  apartment: 'Daire', villa: 'Villa', land: 'Arsa',
  commercial: 'İşyeri', office: 'Ofis', shop: 'Dükkan',
  warehouse: 'Depo', detached_house: 'Müstakil', field: 'Tarla',
}

function formatPrice(n: number, currency = 'TRY') {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n)
}

export default function PortfolioPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<PropertyStatus | 'all'>('active')
  const [filterType, setFilterType] = useState<PropertyType | 'all'>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  useEffect(() => { fetchProperties() }, [filterStatus, filterType])

  async function fetchProperties() {
    const supabase = createClient()
    let query = supabase
      .from('properties')
      .select('*, consultant:consultants(full_name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (filterStatus !== 'all') query = query.eq('status', filterStatus)
    if (filterType !== 'all') query = query.eq('property_type', filterType)

    const { data, error } = await query
    if (!error && data) setProperties(data as Property[])
    setLoading(false)
  }

  const filtered = properties.filter(p => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      p.title.toLowerCase().includes(s) ||
      p.city?.toLowerCase().includes(s) ||
      p.district?.toLowerCase().includes(s) ||
      p.neighborhood?.toLowerCase().includes(s)
    )
  })

  const stats = [
    { label: 'Aktif İlan', value: properties.filter(p => p.status === 'active').length, color: 'green' },
    { label: 'Teklif Var', value: properties.filter(p => p.status === 'under_offer').length, color: 'yellow' },
    { label: 'Satıldı (Ay)', value: properties.filter(p => p.status === 'sold').length, color: 'slate' },
    { label: 'Toplam Görüntülenme', value: properties.reduce((a, p) => a + (p.view_count || 0), 0), color: 'blue' },
  ]

  return (
    <div className="p-6">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Portföy</h1>
          <p className="text-slate-500 text-sm mt-1">Tüm mülk ilanlarınız</p>
        </div>
        <Link href="/portfolio/new" className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Mülk Ekle
        </Link>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map(s => (
          <div key={s.label} className="stat-card">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtreler */}
      <div className="card mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Başlık, şehir veya ilçe ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as PropertyStatus | 'all')}
              className="border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tüm Durumlar</option>
              {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as PropertyType | 'all')}
              className="border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tüm Tipler</option>
              {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="flex border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <Grid3x3 size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mülk Listesi */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-slate-400">
          <Building2 size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">Mülk bulunamadı</p>
          <p className="text-xs mt-1">Yeni mülk ekleyin veya URL yapıştırarak otomatik doldurun</p>
          <Link href="/portfolio/new" className="btn-primary mt-4 text-sm">
            <Plus size={14} className="inline mr-1" /> İlk Mülkü Ekle
          </Link>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => (
            <Link key={p.id} href={`/portfolio/${p.id}`}
              className="card p-0 overflow-hidden hover:shadow-md transition-shadow group">
              {/* Fotoğraf */}
              <div className="h-44 bg-slate-100 relative overflow-hidden">
                {p.photos?.[0] ? (
                  <img src={p.photos[0]} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Home size={40} className="text-slate-300" />
                  </div>
                )}
                {/* Durum badge */}
                <span className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[p.status]}`}>
                  {statusLabels[p.status]}
                </span>
                {/* Tip badge */}
                <span className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                  {typeLabels[p.property_type]}
                </span>
              </div>

              <div className="p-4">
                <h3 className="font-semibold text-slate-900 text-sm truncate mb-1">{p.title}</h3>
                {(p.city || p.district) && (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                    <MapPin size={11} /> {[p.district, p.city].filter(Boolean).join(', ')}
                  </p>
                )}

                <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                  {p.m2_gross && <span>{p.m2_gross} m²</span>}
                  {p.room_count && <><span>·</span><span>{p.room_count}</span></>}
                  {p.floor != null && <><span>·</span><span>{p.floor}. kat</span></>}
                </div>

                <div className="flex items-center justify-between">
                  {p.price ? (
                    <p className="font-bold text-slate-900 text-sm">{formatPrice(p.price, p.currency)}</p>
                  ) : (
                    <p className="text-slate-400 text-xs">Fiyat belirtilmemiş</p>
                  )}
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Eye size={11} /> {p.view_count || 0}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Liste Görünümü */
        <div className="card p-0 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map(p => (
              <Link key={p.id} href={`/portfolio/${p.id}`}
                className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors group">
                <div className="w-14 h-14 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                  {p.photos?.[0]
                    ? <img src={p.photos[0]} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Home size={20} className="text-slate-300" /></div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 text-sm truncate">{p.title}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin size={10} /> {[p.district, p.city].filter(Boolean).join(', ')}
                    {p.m2_gross && <><span className="mx-1">·</span>{p.m2_gross} m²</>}
                    {p.room_count && <><span className="mx-1">·</span>{p.room_count}</>}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {p.price && <p className="font-semibold text-slate-900 text-sm">{formatPrice(p.price, p.currency)}</p>}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[p.status]}`}>{statusLabels[p.status]}</span>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
