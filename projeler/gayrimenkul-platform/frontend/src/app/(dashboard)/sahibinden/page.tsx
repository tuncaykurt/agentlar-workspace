'use client'

import { useState, useEffect, useCallback } from 'react'
import VapiCallModal from '@/components/VapiCallModal'
import {
  Search, Home, MapPin, Eye, ChevronLeft, ChevronRight,
  X, ExternalLink, Thermometer, Banknote, BedDouble,
  Ruler, Building2, Layers, Phone, Bot,
  Loader2, RefreshCw, Tag, Clock, Bath, Calendar,
  Maximize2, Zap, User, PhoneCall,
} from 'lucide-react'

/* ── Types ───────────────────────────────────────────────────────── */
type MarketListing = {
  id: string
  title: string
  description: string
  price: number
  currency: string
  property_type: string
  city: string
  district: string
  neighborhood: string
  address: string
  m2_gross: number
  m2_net: number
  room_count: string
  bathroom_count: number
  floor: number
  total_floors: number
  age: number
  heating_type: string
  dues: number
  deposit: number
  features: string[]
  photos: string[]
  source: string
  source_url: string
  source_listing_id: string
  seller_name: string
  seller_phone: string
  seller_type: string
  contact_status: string
  contact_notes: string
  contacted_at: string
  created_at: string
  last_seen_at: string
  is_active: boolean
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  new:            { label: 'Yeni',            color: 'bg-blue-500/20 text-blue-600 border-blue-200',      dot: 'bg-blue-500' },
  contacted:      { label: 'Arandı',         color: 'bg-yellow-500/20 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  interested:     { label: 'İlgili',         color: 'bg-green-500/20 text-green-700 border-green-200',   dot: 'bg-green-500' },
  not_interested: { label: 'İlgisiz',        color: 'bg-red-500/20 text-red-600 border-red-200',         dot: 'bg-red-500' },
  converted:      { label: 'Portföye Alındı',color: 'bg-purple-500/20 text-purple-700 border-purple-200',dot: 'bg-purple-500' },
  stale:          { label: 'Pasif',          color: 'bg-slate-500/20 text-slate-500 border-slate-200',   dot: 'bg-slate-400' },
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Daire', villa: 'Villa', land: 'Arsa', commercial: 'İşyeri',
  office: 'Ofis', shop: 'Dükkan', warehouse: 'Depo', detached_house: 'Müstakil', field: 'Tarla',
}

function fmtPrice(price: number, currency?: string) {
  if (!price) return '—'
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 0,
  }).format(price)
}

function timeAgo(date: string) {
  if (!date) return ''
  const d = (Date.now() - new Date(date).getTime()) / 1000
  if (d < 60) return 'Az önce'
  if (d < 3600) return `${Math.floor(d / 60)}dk önce`
  if (d < 86400) return `${Math.floor(d / 3600)}sa önce`
  return `${Math.floor(d / 86400)}g önce`
}

/* ── Image Carousel ──────────────────────────────────────────────── */
function ImageCarousel({ photos, height = 'h-56', rounded = '' }: { photos: string[]; height?: string; rounded?: string }) {
  const [idx, setIdx] = useState(0)
  const imgs = photos?.length > 0 ? photos : []

  if (imgs.length === 0) {
    return (
      <div className={`${height} ${rounded} bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center`}>
        <Home size={48} className="text-slate-200" />
      </div>
    )
  }

  return (
    <div className={`relative ${height} ${rounded} bg-slate-900 group overflow-hidden`}>
      <img
        src={imgs[idx]}
        alt={`Fotoğraf ${idx + 1}`}
        className="w-full h-full object-cover"
        style={{ objectPosition: 'center' }}
      />
      {/* Gradient overlay bottom */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />

      {imgs.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + imgs.length) % imgs.length) }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 hover:bg-white text-slate-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % imgs.length) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 hover:bg-white text-slate-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
          >
            <ChevronRight size={16} />
          </button>
          {/* Dots */}
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
            {imgs.slice(0, 6).map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setIdx(i) }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? 'bg-white w-4' : 'bg-white/50'}`}
              />
            ))}
            {imgs.length > 6 && <span className="text-white/60 text-[9px] ml-1">+{imgs.length - 6}</span>}
          </div>
          <span className="absolute top-2.5 right-2.5 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
            {idx + 1}/{imgs.length}
          </span>
        </>
      )}
    </div>
  )
}

/* ── Detail Modal — TÜM DETAYLAR ────────────────────────────────── */
function DetailModal({ listing: l, onClose, onCall }: { listing: MarketListing; onClose: () => void; onCall: () => void }) {
  const details = [
    { icon: BedDouble,    label: 'Oda Sayısı',  value: l.room_count },
    { icon: Bath,         label: 'Banyo',        value: l.bathroom_count ? `${l.bathroom_count}` : null },
    { icon: Ruler,        label: 'Brüt m²',      value: l.m2_gross ? `${l.m2_gross} m²` : null },
    { icon: Maximize2,    label: 'Net m²',        value: l.m2_net ? `${l.m2_net} m²` : null },
    { icon: Layers,       label: 'Bulunduğu Kat', value: l.floor != null && l.floor !== undefined ? `${l.floor}. kat` : null },
    { icon: Building2,    label: 'Toplam Kat',    value: l.total_floors ? `${l.total_floors} kat` : null },
    { icon: Calendar,     label: 'Bina Yaşı',    value: l.age != null && l.age !== undefined ? (l.age === 0 ? 'Sıfır bina' : `${l.age} yıl`) : null },
    { icon: Thermometer,  label: 'Isıtma',        value: l.heating_type },
    { icon: Banknote,     label: 'Aidat',          value: l.dues ? fmtPrice(l.dues) : null },
    { icon: Banknote,     label: 'Depozito',       value: l.deposit ? fmtPrice(l.deposit) : null },
    { icon: Tag,          label: 'Emlak Tipi',     value: PROPERTY_TYPE_LABELS[l.property_type] || l.property_type },
    { icon: MapPin,       label: 'İlçe',           value: l.district },
    { icon: MapPin,       label: 'Mahalle',        value: l.neighborhood },
  ].filter(d => d.value)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
        >
          <X size={18} />
        </button>

        {/* Images */}
        <ImageCarousel photos={l.photos || []} height="h-80" rounded="rounded-t-2xl" />

        <div className="p-6">
          {/* Status badge */}
          {l.contact_status && STATUS_CONFIG[l.contact_status] && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border mb-3 ${STATUS_CONFIG[l.contact_status].color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[l.contact_status].dot}`} />
              {STATUS_CONFIG[l.contact_status].label}
            </span>
          )}

          {/* Title & Price */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-slate-900 leading-tight">{l.title || 'İlan'}</h2>
              {(l.city || l.district || l.neighborhood) && (
                <p className="text-sm text-slate-500 flex items-center gap-1 mt-1.5">
                  <MapPin size={14} className="flex-shrink-0" />
                  {[l.neighborhood, l.district, l.city].filter(Boolean).join(', ')}
                </p>
              )}
              {l.address && (
                <p className="text-xs text-slate-400 mt-1">{l.address}</p>
              )}
            </div>
            {l.price > 0 && (
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-bold text-blue-600">{fmtPrice(l.price, l.currency)}</p>
              </div>
            )}
          </div>

          {/* Satıcı bilgisi */}
          {(l.seller_name || l.seller_phone) && (
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl mb-5 border border-slate-100">
              <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{l.seller_name || 'İlan Sahibi'}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-500">
                    {l.seller_type === 'owner' ? 'Mülk Sahibi' : l.seller_type === 'agency' ? 'Emlak Ofisi' : 'Sahibinden'}
                  </p>
                  {l.seller_phone && (
                    <span className="text-xs text-slate-400">• {l.seller_phone}</span>
                  )}
                </div>
              </div>
              {l.seller_phone && (
                <button
                  onClick={onCall}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <PhoneCall size={14} />
                  Lina ile Ara
                </button>
              )}
            </div>
          )}

          {/* Detail Grid */}
          {details.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">İlan Detayları</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {details.map(d => {
                  const Icon = d.icon
                  return (
                    <div key={d.label} className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Icon size={16} className="text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">{d.label}</p>
                        <p className="text-sm font-semibold text-slate-800 truncate">{d.value}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Features */}
          {l.features && l.features.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Özellikler</h3>
              <div className="flex flex-wrap gap-2">
                {l.features.map((f, i) => (
                  <span key={i} className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-100">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {l.description && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Açıklama</h3>
              <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line bg-slate-50 rounded-xl p-4 border border-slate-100 max-h-60 overflow-y-auto">
                {l.description}
              </div>
            </div>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-4 border-t border-slate-100 mb-5">
            {l.source_listing_id && <span>İlan No: {l.source_listing_id}</span>}
            {l.created_at && <span>Eklenme: {new Date(l.created_at).toLocaleDateString('tr-TR')}</span>}
            {l.last_seen_at && <span>Son Görülme: {timeAgo(l.last_seen_at)}</span>}
            {l.contact_notes && <span>Not: {l.contact_notes}</span>}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            {l.source_url && (
              <a
                href={l.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <ExternalLink size={15} />
                Sahibinden&apos;de Görüntüle
              </a>
            )}
            {l.seller_phone && (
              <button
                onClick={onCall}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <Bot size={15} />
                Lina ile Ara
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Test Arama Paneli ───────────────────────────────────────────── */
function TestCallPanel({ listings, onStartCall }: { listings: MarketListing[]; onStartCall: (listing: MarketListing) => void }) {
  const [testPhone, setTestPhone] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const selectedListing = listings.find(l => l.id === selectedId)

  function handleTestCall() {
    if (!testPhone.trim()) return

    // Seçili bir mülk varsa onu kullan, yoksa dummy bir listing oluştur
    const listing: MarketListing = selectedListing
      ? { ...selectedListing, seller_phone: testPhone.trim() }
      : {
          id: 'test-call',
          title: 'Test Arama',
          description: '',
          price: 0,
          currency: 'TRY',
          property_type: '',
          city: '',
          district: '',
          neighborhood: '',
          address: '',
          m2_gross: 0,
          m2_net: 0,
          room_count: '',
          bathroom_count: 0,
          floor: 0,
          total_floors: 0,
          age: 0,
          heating_type: '',
          dues: 0,
          deposit: 0,
          features: [],
          photos: [],
          source: 'test',
          source_url: '',
          source_listing_id: '',
          seller_name: 'Test Kullanıcı',
          seller_phone: testPhone.trim(),
          seller_type: 'owner',
          contact_status: 'new',
          contact_notes: '',
          contacted_at: '',
          created_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          is_active: true,
        }

    onStartCall(listing)
  }

  return (
    <div className="card mb-6 bg-gradient-to-r from-slate-800 to-slate-900 border-0">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
          <Bot size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-white font-semibold">Dijital Arama Asistanı — Lina</h3>
          <p className="text-slate-400 text-xs">Numara girin, portföyden mülk seçin ve Lina ile deneme araması yapın</p>
        </div>
      </div>

      {/* Mülk seçimi */}
      <div className="mb-3">
        <label className="text-slate-400 text-xs mb-1.5 block">Portföyden mülk seçin (isteğe bağlı — arama senaryosu için)</label>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">— Mülk seçilmedi (genel deneme araması) —</option>
          {listings.map(l => (
            <option key={l.id} value={l.id}>
              {l.title?.slice(0, 40)} {l.price ? `— ${fmtPrice(l.price, l.currency)}` : ''} {l.district ? `(${l.district})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Seçili mülk mini kartı */}
      {selectedListing && (
        <div className="mb-3 p-3 bg-slate-700/50 rounded-xl border border-slate-600/50">
          <div className="flex items-center gap-3">
            {selectedListing.photos?.[0] && (
              <img src={selectedListing.photos[0]} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{selectedListing.title}</p>
              <p className="text-slate-400 text-xs">
                {[selectedListing.room_count, selectedListing.m2_gross ? `${selectedListing.m2_gross}m²` : null, selectedListing.district].filter(Boolean).join(' · ')}
                {selectedListing.seller_name && ` · ${selectedListing.seller_name}`}
              </p>
            </div>
            {selectedListing.price > 0 && (
              <p className="text-green-400 font-bold text-sm flex-shrink-0">{fmtPrice(selectedListing.price, selectedListing.currency)}</p>
            )}
          </div>
        </div>
      )}

      {/* Telefon girişi + Ara butonu */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="tel"
            placeholder="05XX XXX XX XX (kendi numaranızı yazın)"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTestCall()}
            className="w-full pl-9 pr-4 py-3 bg-slate-700 border border-slate-600 text-white placeholder-slate-500 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <button
          onClick={handleTestCall}
          disabled={!testPhone.trim()}
          className="flex items-center justify-center gap-2 px-8 py-3 bg-green-500 hover:bg-green-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors whitespace-nowrap shadow-lg shadow-green-500/20"
        >
          <PhoneCall size={18} />
          Lina ile Ara
        </button>
      </div>

      <p className="text-slate-500 text-[11px] mt-2 px-1">
        Kendi numaranızı yazıp deneme yapabilirsiniz. Lina sizi arayacak ve seçili mülk hakkında konuşacak.
      </p>
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
    const s = l.contact_status
    if (s && s in acc) (acc as any)[s]++
    return acc
  }, { new: 0, contacted: 0, interested: 0, converted: 0 })

  return (
    <div className="p-6">
      {/* Vapi Arama Modalı */}
      {callTarget && (
        <VapiCallModal
          isOpen={true}
          onClose={() => setCallTarget(null)}
          listing={callTarget as any}
        />
      )}

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
          className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
          title="Yenile"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Yeni Lead',        value: statusCounts.new,       color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-100' },
          { label: 'Arandı',           value: statusCounts.contacted, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-100' },
          { label: 'İlgili',           value: statusCounts.interested,color: 'text-green-600',  bg: 'bg-green-50 border-green-100' },
          { label: 'Portföye Alındı',  value: statusCounts.converted, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100' },
          { label: 'Toplam',           value: totalCount,             color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Test Arama Paneli */}
      <TestCallPanel listings={listings} onStartCall={setCallTarget} />

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
                    ? 'bg-blue-600 text-white shadow-sm'
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
                className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg hover:border-slate-200 transition-all duration-300 group"
              >
                {/* Image — 16:10 aspect ratio */}
                <div className="relative aspect-[16/10] overflow-hidden">
                  <ImageCarousel photos={l.photos || []} height="h-full" />
                  {/* Status badge */}
                  <span className={`absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border backdrop-blur-sm ${status.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                  {/* Price overlay */}
                  {l.price > 0 && (
                    <div className="absolute bottom-2.5 left-2.5 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-xl text-white font-bold text-sm">
                      {fmtPrice(l.price, l.currency)}
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-4">
                  <h3
                    className="font-semibold text-slate-900 text-sm leading-snug mb-1.5 line-clamp-2 group-hover:text-blue-600 transition-colors cursor-pointer"
                    onClick={() => setSelectedListing(l)}
                  >
                    {l.title || 'İlan başlığı yok'}
                  </h3>

                  {(l.city || l.district) && (
                    <p className="text-xs text-slate-500 flex items-center gap-1 mb-3">
                      <MapPin size={11} className="flex-shrink-0" />
                      {[l.neighborhood, l.district, l.city].filter(Boolean).join(', ')}
                    </p>
                  )}

                  {/* Quick specs */}
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-3 flex-wrap">
                    {l.room_count && (
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md">
                        <BedDouble size={11} /> {l.room_count}
                      </span>
                    )}
                    {l.m2_gross > 0 && (
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md">
                        <Ruler size={11} /> {l.m2_gross}m²
                      </span>
                    )}
                    {l.heating_type && (
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md">
                        <Thermometer size={11} /> {l.heating_type}
                      </span>
                    )}
                    {l.property_type && (
                      <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md">
                        <Tag size={11} /> {PROPERTY_TYPE_LABELS[l.property_type] || l.property_type}
                      </span>
                    )}
                  </div>

                  {/* Seller row */}
                  {l.seller_name && (
                    <div className="flex items-center gap-2 py-2.5 border-t border-slate-100 mb-3">
                      <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-blue-600">{l.seller_name[0]}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-700 font-medium truncate">{l.seller_name}</p>
                        <p className="text-[10px] text-slate-400">
                          {l.seller_type === 'owner' ? 'Mülk Sahibi' : l.seller_type === 'agency' ? 'Emlak Ofisi' : 'Sahibinden'}
                        </p>
                      </div>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1 flex-shrink-0">
                        <Clock size={9} /> {timeAgo(l.created_at)}
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
                      onClick={() => setSelectedListing(l)}
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
          onCall={() => { setCallTarget(selectedListing); setSelectedListing(null) }}
        />
      )}
    </div>
  )
}
