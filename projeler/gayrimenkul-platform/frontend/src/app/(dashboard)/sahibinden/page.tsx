'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Property, PropertyType } from '@/lib/types'
import LiveCallPanel from '@/components/LiveCallPanel'
import {
  Search, Home, MapPin, Eye, ChevronLeft, ChevronRight,
  X, ExternalLink, Flame, Thermometer, Banknote, BedDouble,
  Bath, Ruler, Building2, Calendar, Layers, Phone, Bot,
  Loader2, PhoneOff,
} from 'lucide-react'

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

/* ── Image Carousel ──────────────────────────────────────────────── */
function ImageCarousel({ photos, height = 'h-52' }: { photos: string[]; height?: string }) {
  const [idx, setIdx] = useState(0)
  const imgs = photos.length > 0 ? photos : []

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
          {/* Dots */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {imgs.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setIdx(i) }}
                className={`w-2 h-2 rounded-full transition-all ${i === idx ? 'bg-white scale-110' : 'bg-white/50 hover:bg-white/70'}`}
              />
            ))}
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
function DetailModal({ property, onClose }: { property: Property; onClose: () => void }) {
  const p = property

  const details = [
    { icon: BedDouble, label: 'Oda Sayısı', value: p.room_count },
    { icon: Bath, label: 'Banyo', value: p.bathroom_count ? `${p.bathroom_count}` : null },
    { icon: Ruler, label: 'Brüt m²', value: p.m2_gross ? `${p.m2_gross} m²` : null },
    { icon: Ruler, label: 'Net m²', value: p.m2_net ? `${p.m2_net} m²` : null },
    { icon: Layers, label: 'Kat', value: p.floor != null ? `${p.floor}${p.total_floors ? ` / ${p.total_floors}` : ''}` : null },
    { icon: Calendar, label: 'Bina Yaşı', value: p.age != null ? `${p.age} yıl` : null },
    { icon: Thermometer, label: 'Isıtma', value: p.heating_type },
    { icon: Banknote, label: 'Aidat', value: p.dues ? formatPrice(p.dues) : null },
    { icon: Banknote, label: 'Depozito', value: p.deposit ? formatPrice(p.deposit) : null },
    { icon: Building2, label: 'Tip', value: typeLabels[p.property_type] },
  ].filter(d => d.value)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center"
        >
          <X size={16} />
        </button>

        {/* Images */}
        <ImageCarousel photos={p.photos || []} height="h-72" />

        {/* Content */}
        <div className="p-6">
          {/* Title & Price */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-slate-900">{p.title}</h2>
              {(p.city || p.district || p.neighborhood) && (
                <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                  <MapPin size={14} />
                  {[p.neighborhood, p.district, p.city].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            {p.price && (
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-bold text-blue-600">{formatPrice(p.price, p.currency)}</p>
                {p.price_negotiable && <span className="text-xs text-slate-400">Pazarlık payı var</span>}
              </div>
            )}
          </div>

          {/* Detail Grid */}
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

          {/* Features */}
          {p.features && p.features.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Özellikler</h3>
              <div className="flex flex-wrap gap-2">
                {p.features.map((f, i) => (
                  <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {p.description && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Açıklama</h3>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{p.description}</p>
            </div>
          )}

          {/* Source Link */}
          {p.source_url && (
            <a
              href={p.source_url}
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

/* ── Dijital Arama Asistanı (Vapi + Canlı Dinleme + Yönlendirme) ── */
type CallState = 'idle' | 'calling' | 'ringing' | 'in_progress' | 'ended' | 'error'

function DijitalAramaAsistani({ properties }: { properties: Property[] }) {
  const [phone, setPhone] = useState('')
  const [callState, setCallState] = useState<CallState>('idle')
  const [callId, setCallId] = useState<string | null>(null)
  const [callResult, setCallResult] = useState<{
    duration?: number
    summary?: string
    transcript?: string
    recordingUrl?: string
    endedReason?: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('')

  const selectedProp = properties.find(p => p.id === selectedPropertyId)
  const isBusy = callState === 'calling' || callState === 'ringing' || callState === 'in_progress'

  async function handleCall() {
    const num = phone.trim()
    if (!num) return

    setCallState('calling')
    setError(null)
    setCallResult(null)
    setCallId(null)

    let propertyDetails = ''
    if (selectedProp) {
      const parts = []
      if (selectedProp.price) parts.push(`Fiyat: ${formatPrice(selectedProp.price, selectedProp.currency)}`)
      if (selectedProp.room_count) parts.push(`Oda: ${selectedProp.room_count}`)
      if (selectedProp.m2_gross) parts.push(`m²: ${selectedProp.m2_gross}`)
      if (selectedProp.city) parts.push(`Şehir: ${selectedProp.city}`)
      if (selectedProp.district) parts.push(`İlçe: ${selectedProp.district}`)
      if (selectedProp.heating_type) parts.push(`Isıtma: ${selectedProp.heating_type}`)
      if (selectedProp.dues) parts.push(`Aidat: ${formatPrice(selectedProp.dues)}`)
      propertyDetails = parts.map(p => `- ${p}`).join('\n')
    }

    try {
      const res = await fetch('/api/vapi/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: num,
          propertyTitle: selectedProp?.title || 'Genel Arama',
          propertyDetails,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setCallState('error')
        setError(data.error || 'Arama başlatılamadı')
        return
      }

      setCallId(data.callId)
      setCallState('ringing')
    } catch (err: any) {
      setCallState('error')
      setError(err.message || 'Bağlantı hatası')
    }
  }

  function handleCallEnd(data: any) {
    setCallState('ended')
    setCallResult({
      duration: data.duration,
      summary: data.summary,
      transcript: data.transcript,
      recordingUrl: data.recordingUrl,
      endedReason: data.endedReason,
    })
  }

  function resetCall() {
    setCallState('idle')
    setCallId(null)
    setCallResult(null)
    setError(null)
  }

  return (
    <div className="space-y-4 mb-6">
      {/* Arama Başlatma Paneli */}
      <div className="card bg-gradient-to-r from-slate-800 to-slate-900 border-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Dijital Arama Asistanı</h3>
            <p className="text-slate-400 text-xs">AI destekli gerçek arama — Canlı dinleme ve anlık yönlendirme</p>
          </div>
          {isBusy && (
            <div className="ml-auto flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
              <span className="text-green-400 text-xs font-medium">Aktif Arama</span>
            </div>
          )}
        </div>

        {/* Mülk Seçimi */}
        <div className="mb-3">
          <label className="text-slate-400 text-xs mb-1.5 block">Portföyden mülk seçin (isteğe bağlı)</label>
          <select
            value={selectedPropertyId}
            onChange={e => setSelectedPropertyId(e.target.value)}
            disabled={isBusy}
            className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <option value="">— Mülk seçilmedi (genel arama) —</option>
            {properties.map(p => (
              <option key={p.id} value={p.id}>
                {p.title} {p.price ? `— ${formatPrice(p.price, p.currency)}` : ''} {p.district ? `(${p.district})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Seçili mülk özeti */}
        {selectedProp && (
          <div className="mb-3 p-3 bg-slate-700/50 rounded-xl border border-slate-600/50">
            <div className="flex items-center gap-3">
              {selectedProp.photos?.[0] && (
                <img src={selectedProp.photos[0]} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{selectedProp.title}</p>
                <p className="text-slate-400 text-xs">
                  {[selectedProp.room_count, selectedProp.m2_gross ? `${selectedProp.m2_gross}m²` : null, selectedProp.district].filter(Boolean).join(' · ')}
                </p>
              </div>
              {selectedProp.price && (
                <p className="text-green-400 font-bold text-sm flex-shrink-0">{formatPrice(selectedProp.price, selectedProp.currency)}</p>
              )}
            </div>
          </div>
        )}

        {/* Telefon & Arama */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="tel"
              placeholder="05XX XXX XX XX"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              disabled={isBusy}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-700 border border-slate-600 text-white placeholder-slate-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          {isBusy ? (
            <button
              onClick={resetCall}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl text-sm transition-colors whitespace-nowrap"
            >
              <PhoneOff size={16} />
              Aramayı Bitir
            </button>
          ) : callState === 'ended' || callState === 'error' ? (
            <button
              onClick={resetCall}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-600 hover:bg-slate-500 text-white font-medium rounded-xl text-sm transition-colors whitespace-nowrap"
            >
              Yeni Arama
            </button>
          ) : (
            <button
              onClick={handleCall}
              disabled={!phone.trim()}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-xl text-sm transition-colors whitespace-nowrap"
            >
              <Phone size={16} />
              Ara
            </button>
          )}
        </div>

        {/* Hata */}
        {callState === 'error' && error && (
          <div className="mt-3 text-sm px-4 py-2.5 rounded-xl bg-red-500/20 text-red-300">
            {error}
          </div>
        )}
        {callState === 'calling' && (
          <div className="mt-3 text-sm px-4 py-2.5 rounded-xl bg-blue-500/20 text-blue-300 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Arama başlatılıyor...
          </div>
        )}
      </div>

      {/* Canlı Arama Paneli — Arama aktifken göster */}
      {callId && (callState === 'ringing' || callState === 'in_progress') && (
        <LiveCallPanel
          callId={callId}
          onCallEnd={handleCallEnd}
          propertyTitle={selectedProp?.title}
        />
      )}

      {/* Arama Sonucu */}
      {callState === 'ended' && callResult && (
        <div className="card bg-slate-800 border-slate-700">
          <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Phone size={16} className="text-green-400" />
            Arama Sonucu
          </h4>
          {callResult.duration != null && (
            <div className="text-slate-400 text-xs mb-2">
              Süre: {Math.floor(callResult.duration / 60)}:{String(Math.round(callResult.duration % 60)).padStart(2, '0')}
            </div>
          )}
          {callResult.summary && (
            <div className="p-3 bg-slate-700/50 rounded-xl border border-slate-600/50 mb-3">
              <p className="text-slate-300 text-xs font-medium mb-1">AI Görüşme Özeti</p>
              <p className="text-white text-sm leading-relaxed">{callResult.summary}</p>
            </div>
          )}
          {callResult.transcript && (
            <details className="text-slate-400 text-xs mb-3">
              <summary className="cursor-pointer hover:text-slate-300 font-medium">Tam Transkript</summary>
              <pre className="mt-2 p-3 bg-slate-700/50 rounded-xl text-slate-300 text-xs whitespace-pre-wrap max-h-60 overflow-y-auto">
                {callResult.transcript}
              </pre>
            </details>
          )}
          {callResult.recordingUrl && (
            <a
              href={callResult.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 hover:text-blue-300 text-xs rounded-lg"
            >
              Kaydı Dinle →
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────── */
export default function SahibindenIlanlarPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<PropertyType | 'all'>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc'>('newest')
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)

  useEffect(() => { fetchProperties() }, [])

  async function fetchProperties() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (!error && data) setProperties(data as Property[])
    setLoading(false)
  }

  const filtered = properties
    .filter(p => {
      if (filterType !== 'all' && p.property_type !== filterType) return false
      if (!search) return true
      const s = search.toLowerCase()
      return (
        p.title?.toLowerCase().includes(s) ||
        p.city?.toLowerCase().includes(s) ||
        p.district?.toLowerCase().includes(s) ||
        p.neighborhood?.toLowerCase().includes(s)
      )
    })
    .sort((a, b) => {
      if (sortBy === 'price_asc') return (a.price || 0) - (b.price || 0)
      if (sortBy === 'price_desc') return (b.price || 0) - (a.price || 0)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const stats = [
    { label: 'Toplam İlan', value: properties.length, color: 'bg-blue-500' },
    { label: 'Satılık', value: properties.filter(p => p.status === 'active').length, color: 'bg-green-500' },
    { label: 'Teklif Var', value: properties.filter(p => p.status === 'under_offer').length, color: 'bg-yellow-500' },
    { label: 'Toplam Görüntülenme', value: properties.reduce((a, p) => a + (p.view_count || 0), 0), color: 'bg-purple-500' },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Sahibinden İlanlar</h1>
        <p className="text-slate-500 text-sm mt-1">
          Sahibinden&apos;den otomatik çekilen tüm platformdaki mülk ilanları
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500">{s.label}</p>
              <div className={`w-3 h-3 rounded-full ${s.color}`} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Dijital Arama Asistanı + Canlı Panel */}
      <DijitalAramaAsistani properties={properties} />

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="İl, ilçe, mahalle veya mülk adı ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as PropertyType | 'all')}
              className="border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tüm Tipler</option>
              {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="newest">En Yeni</option>
              <option value="price_asc">Fiyat (Düşük → Yüksek)</option>
              <option value="price_desc">Fiyat (Yüksek → Düşük)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Property Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-slate-400">
          <Building2 size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">İlan bulunamadı</p>
          <p className="text-xs mt-1">Filtreleri değiştirmeyi deneyin</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(p => (
            <div
              key={p.id}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg transition-all duration-300 group cursor-pointer"
              onClick={() => setSelectedProperty(p)}
            >
              {/* Image Carousel */}
              <ImageCarousel photos={p.photos || []} />

              {/* Type badge */}
              <div className="relative">
                <span className="absolute -top-6 left-3 bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full font-medium shadow-sm z-10">
                  {typeLabels[p.property_type]}
                </span>
              </div>

              {/* Card Body */}
              <div className="p-4 pt-3">
                <h3 className="font-semibold text-slate-900 text-sm leading-snug mb-1.5 line-clamp-2 group-hover:text-blue-600 transition-colors">
                  {p.title}
                </h3>

                {(p.city || p.district) && (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mb-3">
                    <MapPin size={12} className="flex-shrink-0" />
                    {[p.neighborhood, p.district, p.city].filter(Boolean).join(', ')}
                  </p>
                )}

                {/* Quick specs */}
                <div className="flex items-center gap-3 text-xs text-slate-500 mb-3 flex-wrap">
                  {p.room_count && (
                    <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md">
                      <BedDouble size={12} /> {p.room_count}
                    </span>
                  )}
                  {p.m2_gross && (
                    <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md">
                      <Ruler size={12} /> {p.m2_gross} m²
                    </span>
                  )}
                  {p.floor != null && (
                    <span className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md">
                      <Layers size={12} /> {p.floor}. kat
                    </span>
                  )}
                </div>

                {/* Price & CTA */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  {p.price ? (
                    <p className="font-bold text-lg text-slate-900">{formatPrice(p.price, p.currency)}</p>
                  ) : (
                    <p className="text-slate-400 text-sm">Fiyat belirtilmemiş</p>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); setSelectedProperty(p) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-medium rounded-lg transition-colors"
                  >
                    <Eye size={13} />
                    İlanı Gör
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedProperty && (
        <DetailModal
          property={selectedProperty}
          onClose={() => setSelectedProperty(null)}
        />
      )}
    </div>
  )
}
