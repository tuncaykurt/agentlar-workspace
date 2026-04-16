'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, MapPin, Home, Tag,
  Clock, Search, Bot, Loader2, RefreshCw
} from 'lucide-react'
import VapiCallModal from '@/components/VapiCallModal'

type MarketListing = {
  id: string
  title: string
  price: number
  currency: string
  city: string
  district: string
  neighborhood: string
  m2_gross: number
  m2_net: number
  room_count: string
  property_type: string
  seller_name: string
  seller_phone: string
  seller_type: string
  contact_status: string
  source_url: string
  photos: string[]
  created_at: string
  last_seen_at: string
}

const STATUS_CONFIG = {
  new:           { label: 'Yeni',           color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',     dot: 'bg-blue-400' },
  contacted:     { label: 'Arandı',         color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' },
  interested:    { label: 'İlgili',         color: 'bg-green-500/20 text-green-400 border-green-500/30',  dot: 'bg-green-400' },
  not_interested:{ label: 'İlgisiz',        color: 'bg-red-500/20 text-red-400 border-red-500/30',        dot: 'bg-red-400' },
  converted:     { label: 'Portföye Alındı',color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', dot: 'bg-purple-400' },
  stale:         { label: 'Pasif',          color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', dot: 'bg-slate-400' },
}

function fmtPrice(price: number, currency: string) {
  if (!price) return '—'
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 0
  }).format(price)
}

function timeAgo(date: string) {
  const d = (Date.now() - new Date(date).getTime()) / 1000
  if (d < 60) return 'Az önce'
  if (d < 3600) return `${Math.floor(d / 60)}dk önce`
  if (d < 86400) return `${Math.floor(d / 3600)}sa önce`
  return `${Math.floor(d / 86400)}g önce`
}

export default function PiyasaClient() {
  const [listings, setListings] = useState<MarketListing[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [callTarget, setCallTarget] = useState<MarketListing | null>(null)

  const fetchListings = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (search) params.set('q', search)
      const res = await fetch(`/api/piyasa/listings?${params.toString()}`)
      if (!res.ok) throw new Error('Veri çekilemedi')
      const data = await res.json()
      setListings(data.listings || [])
      setTotalCount(data.count || 0)
    } catch {
      setListings([])
    } finally {
      setLoading(false)
    }
  }, [filterStatus, search])

  useEffect(() => {
    const t = setTimeout(fetchListings, search ? 400 : 0)
    return () => clearTimeout(t)
  }, [fetchListings, search])

  const statusCounts = listings.reduce((acc, l) => {
    const s = l.contact_status as keyof typeof acc
    if (s in acc) acc[s]++
    return acc
  }, { new: 0, contacted: 0, interested: 0, converted: 0, stale: 0 })

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Vapi Arama Modalı */}
      <VapiCallModal
        isOpen={!!callTarget}
        onClose={() => setCallTarget(null)}
        listing={callTarget as any}
      />

      {/* Header */}
      <div className="border-b border-slate-700/60 bg-slate-800/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <TrendingUp size={18} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Piyasa İlanları</h1>
              <p className="text-xs text-slate-400">
                Sahibinden'den otomatik çekilen {totalCount} potansiyel mülk sahibi
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchListings}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
              title="Yenile"
            >
              <RefreshCw size={15} />
            </button>
            <span className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs font-medium flex items-center gap-1.5">
              <Bot size={13} />
              Lina ile Ara
            </span>
          </div>
        </div>

        {/* İstatistik kartları */}
        <div className="grid grid-cols-5 gap-3 mt-5">
          {[
            { label: 'Yeni Lead',    value: statusCounts.new,        color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
            { label: 'Arandı',       value: statusCounts.contacted,  color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
            { label: 'İlgili',       value: statusCounts.interested, color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
            { label: 'Portföye Alındı', value: statusCounts.converted,color: 'text-purple-400',bg: 'bg-purple-500/10 border-purple-500/20' },
            { label: 'Toplam',       value: totalCount,              color: 'text-slate-300',  bg: 'bg-slate-700/40 border-slate-600/30' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border rounded-xl p-3 text-center`}>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filtreler */}
      <div className="px-6 py-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="İlan, şehir veya mülk sahibi ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex items-center gap-2">
          {['all', 'new', 'contacted', 'interested', 'converted'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStatus === s
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              {s === 'all' ? 'Tümü' : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div className="px-6 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 size={28} className="animate-spin mr-2" />
            <span className="text-sm">İlanlar yükleniyor...</span>
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Henüz ilan yok. Scheduled Task çalıştığında ilanlar burada görünecek.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {listings.map(l => {
              const status = STATUS_CONFIG[l.contact_status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.new
              const photo = l.photos?.[0]
              return (
                <div key={l.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden hover:border-slate-600 transition-all group">
                  {/* Fotoğraf */}
                  <div className="relative h-40 bg-slate-700/50">
                    {photo ? (
                      <img src={photo} alt={l.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Home size={32} className="text-slate-600" />
                      </div>
                    )}
                    <span className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${status.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                    <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-lg text-white text-sm font-bold">
                      {fmtPrice(l.price, l.currency)}
                    </div>
                  </div>

                  {/* İçerik */}
                  <div className="p-4">
                    <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug mb-2 group-hover:text-emerald-400 transition-colors">
                      {l.title || 'İlan başlığı yok'}
                    </h3>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                      <MapPin size={12} />
                      <span>{[l.neighborhood, l.district, l.city].filter(Boolean).join(', ')}</span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                      {l.room_count && <span className="flex items-center gap-1"><Home size={11} />{l.room_count}</span>}
                      {l.m2_gross && <span>{l.m2_gross} m²</span>}
                      {l.property_type && <span className="flex items-center gap-1"><Tag size={11} />{l.property_type}</span>}
                    </div>

                    {l.seller_name && (
                      <div className="flex items-center gap-2 py-2 border-t border-slate-700/60">
                        <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs text-slate-300">{l.seller_name[0]}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-white truncate">{l.seller_name}</p>
                          {l.seller_type && (
                            <p className="text-xs text-slate-500">{l.seller_type === 'owner' ? 'Mülk Sahibi' : 'Acente'}</p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-3">
                      {l.seller_phone && (
                        <button
                          onClick={() => setCallTarget(l)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs hover:bg-emerald-500/20 transition-all"
                        >
                          <Bot size={12} />
                          Lina ile Ara
                        </button>
                      )}
                      {l.source_url && (
                        <a
                          href={l.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-300 text-xs hover:bg-slate-700 transition-all"
                        >
                          İlanı Gör
                        </a>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 mt-2 flex items-center gap-1">
                      <Clock size={10} />
                      {timeAgo(l.created_at)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
