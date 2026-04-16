'use client'

import { useState, useEffect, useCallback } from 'react'
import VapiCallModal from '@/components/VapiCallModal'
import {
  Search, Home, MapPin, Eye, ChevronLeft, ChevronRight,
  X, ExternalLink, Thermometer, Banknote, BedDouble,
  Ruler, Building2, Layers, Phone, Bot,
  Loader2, RefreshCw, Tag, Clock,
} from 'lucide-react'

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
  heating_type: string
  floor: number
  total_floors: number
  age: number
  dues: number
  deposit: number
  bathroom_count: number
  features: string[]
  description: string
  seller_name: string
  seller_phone: string
  seller_type: string
  contact_status: string
  source_url: string
  photos: string[]
  created_at: string
  last_seen_at: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  new:            { label: 'Yeni',            color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',     dot: 'bg-blue-400' },
  contacted:      { label: 'Arandı',         color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' },
  interested:     { label: 'İlgili',         color: 'bg-green-500/20 text-green-400 border-green-500/30',  dot: 'bg-green-400' },
  not_interested: { label: 'İlgisiz',        color: 'bg-red-500/20 text-red-400 border-red-500/30',        dot: 'bg-red-400' },
  converted:      { label: 'Portföye Alındı',color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', dot: 'bg-purple-400' },
  stale:          { label: 'Pasif',          color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', dot: 'bg-slate-400' },
}

function fmtPrice(price: number, currency?: string) {
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

/* ── Image Carousel ──────────────────────────────────────────────── */
function ImageCarousel({ photos, height = 'h-52' }: { photos: string[]; height?: string }) {
  const [idx, setIdx] = useState(0)
  const imgs = photos?.length > 0 ? photos : []

  if (imgs.length === 0) {
    return (
      <div className={`${height} bg-slate-100 flex items-center justify-center`}>
        <Home size={40} className="text-slate-300" />
      </div>
    )
  }

  return (
    <div className={`relative ${height} bg-slate-900 group overflow-hidden`}>
      <img
        src={imgs[idx]}
        alt={`Fotoğraf ${idx + 1}`}
        className="w-full h-full object-cover transition-opacity duration-300"
      />
      {imgs.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + imgs.length) % imgs.length) }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % imgs.length) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight size={16} />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {imgs.slice(0, 8).map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setIdx(i) }}
                className={`w-2 h-2 rounded-full transition-all ${i === idx ? 'bg-white scale-110' : 'bg-white/50'}`}
              />
            ))}
            {imgs.length > 8 && <span className="text-white/60 text-[10px]">+{imgs.length - 8}</span>}
          </div>
          <span className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
            {idx + 1}/{imgs.length}
          </span>
        </>
      )}
    </div>
  )
}

/* ── Detail Modal ────────────────────────────────────────────────── */
function DetailModal({ listing, onClose }: { listing: MarketListing; onClose: () => void }) {
  const l = listing

  const details = [
    { icon: BedDouble, label: 'Oda Sayısı', value: l.room_count },
    { icon: Ruler, label: 'Brüt m²', value: l.m2_gross ? `${l.m2_gross} m²` : null },
    { icon: Ruler, label: 'Net m²', value: l.m2_net ? `${l.m2_net} m²` : null },
    { icon: Layers, label: 'Kat', value: l.floor != null ? `${l.floor}${l.total_floors ? ` / ${l.total_floors}` : ''}` : null },
    { icon: Building2, label: 'Bina Yaşı', value: l.age != null ? `${l.age} yıl` : null },
    { icon: Thermometer, label: 'Isıtma', value: l.heating_type },
    { icon: Banknote, label: 'Aidat', value: l.dues ? fmtPrice(l.dues) : null },
    { icon: Banknote, label: 'Depozito', value: l.deposit ? fmtPrice(l.deposit) : null },
    { icon: Tag, label: 'Tip', value: l.property_type },
  ].filter(d => d.value)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center"
        >
          <X size={16} />
        </button>

        <ImageCarousel photos={l.photos || []} height="h-72" />

        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-slate-900">{l.title}</h2>
              {(l.city || l.district || l.neighborhood) && (
                <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                  <MapPin size={14} />
                  {[l.neighborhood, l.district, l.city].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            {l.price > 0 && (
              <p className="text-2xl font-bold text-blue-600 flex-shrink-0">{fmtPrice(l.price, l.currency)}</p>
            )}
          </div>

          {/* Satıcı bilgisi */}
          {l.seller_name && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-4">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                <span className="text-sm font-bold text-slate-600">{l.seller_name[0]}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">{l.seller_name}</p>
                <p className="text-xs text-slate-500">
                  {l.seller_type === 'owner' ? 'Mülk Sahibi' : l.seller_type === 'agent' ? 'Acente' : l.seller_type || 'Sahibinden'}
                </p>
              </div>
              {l.seller_phone && (
                <span className="ml-auto text-xs text-slate-400">{l.seller_phone}</span>
              )}
            </div>
          )}

          {/* Detail Grid */}
          {details.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              {details.map(d => {
                const Icon = d.icon
                return (
                  <div key={d.label} className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl">
                    <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon size={16} className="text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-400 leading-tight">{d.label}</p>
                      <p className="text-sm font-semibold text-slate-800 truncate">{d.value}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Features */}
          {l.features && l.features.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Özellikler</h3>
              <div className="flex flex-wrap gap-2">
                {l.features.map((f, i) => (
                  <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {l.description && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Açıklama</h3>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{l.description}</p>
            </div>
          )}

          {/* Source Link */}
          {l.source_url && (
            <a
              href={l.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <ExternalLink size={15} />
              Sahibinden&apos;de Görüntüle
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────── */
export default function SahibindenIlanlarPage() {
  const [listings, setListings] = useState<MarketListing[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selectedListing, setSelectedListing] = useState<MarketListing | null>(null)
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
  }, { new: 0, contacted: 0, interested: 0, converted: 0 } as Record<string, number>)

  return (
    <div className="p-6">
      {/* Vapi Arama Modalı */}
      <VapiCallModal
        isOpen={!!callTarget}
        onClose={() => setCallTarget(null)}
        listing={callTarget as any}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sahibinden İlanlar</h1>
          <p className="text-slate-500 text-sm mt-1">
            Sahibinden&apos;den otomatik çekilen {totalCount} potansiyel mülk sahibi
          </p>
        </div>
        <button
          onClick={fetchListings}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
          title="Yenile"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Yeni Lead',        value: statusCounts.new || 0,       color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-100' },
          { label: 'Arandı',           value: statusCounts.contacted || 0, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-100' },
          { label: 'İlgili',           value: statusCounts.interested || 0,color: 'text-green-600',  bg: 'bg-green-50 border-green-100' },
          { label: 'Portföye Alındı',  value: statusCounts.converted || 0, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100' },
          { label: 'Toplam',           value: totalCount,                  color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Dijital Arama Asistanı Banner */}
      <div className="card mb-6 bg-gradient-to-r from-slate-800 to-slate-900 border-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
            <Bot size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold">Dijital Arama Asistanı — Lina</h3>
            <p className="text-slate-400 text-xs">İlan kartlarındaki &quot;Lina ile Ara&quot; butonuna basarak mülk sahiplerini arayın. Canlı dinleme ve yönlendirme aktif.</p>
          </div>
          <Phone size={20} className="text-green-400" />
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="İlan, şehir veya mülk sahibi ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {['all', 'new', 'contacted', 'interested', 'converted'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filterStatus === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {s === 'all' ? 'Tümü' : STATUS_CONFIG[s]?.label || s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Listing Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={28} className="animate-spin mr-2" />
          <span className="text-sm">İlanlar yükleniyor...</span>
        </div>
      ) : listings.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-slate-400">
          <Building2 size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">İlan bulunamadı</p>
          <p className="text-xs mt-1">Sahibinden senkronizasyonu çalıştığında ilanlar burada görünecek</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {listings.map(l => {
            const status = STATUS_CONFIG[l.contact_status] || STATUS_CONFIG.new
            return (
              <div
                key={l.id}
                className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg transition-all duration-300 group cursor-pointer"
                onClick={() => setSelectedListing(l)}
              >
                {/* Image Carousel */}
                <div className="relative">
                  <ImageCarousel photos={l.photos || []} />
                  {/* Status badge */}
                  <span className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${status.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                  {/* Price overlay */}
                  {l.price > 0 && (
                    <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-lg text-white text-sm font-bold">
                      {fmtPrice(l.price, l.currency)}
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 text-sm leading-snug mb-1.5 line-clamp-2 group-hover:text-blue-600 transition-colors">
                    {l.title || 'İlan başlığı yok'}
                  </h3>

                  {(l.city || l.district) && (
                    <p className="text-xs text-slate-500 flex items-center gap-1 mb-3">
                      <MapPin size={12} className="flex-shrink-0" />
                      {[l.neighborhood, l.district, l.city].filter(Boolean).join(', ')}
                    </p>
                  )}

                  {/* Quick specs */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-3 flex-wrap">
                    {l.room_count && (
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md">
                        <BedDouble size={12} /> {l.room_count}
                      </span>
                    )}
                    {l.m2_gross > 0 && (
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md">
                        <Ruler size={12} /> {l.m2_gross} m²
                      </span>
                    )}
                    {l.property_type && (
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md">
                        <Tag size={12} /> {l.property_type}
                      </span>
                    )}
                  </div>

                  {/* Seller info */}
                  {l.seller_name && (
                    <div className="flex items-center gap-2 py-2 border-t border-slate-100 mb-3">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-slate-500">{l.seller_name[0]}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-700 font-medium truncate">{l.seller_name}</p>
                      </div>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock size={10} /> {timeAgo(l.created_at)}
                      </p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    {l.seller_phone && (
                      <button
                        onClick={e => { e.stopPropagation(); setCallTarget(l) }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl text-green-700 text-xs font-medium transition-colors"
                      >
                        <Bot size={13} />
                        Lina ile Ara
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedListing(l) }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-blue-700 text-xs font-medium transition-colors"
                    >
                      <Eye size={13} />
                      İlanı Gör
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedListing && (
        <DetailModal
          listing={selectedListing}
          onClose={() => setSelectedListing(null)}
        />
      )}
    </div>
  )
}
