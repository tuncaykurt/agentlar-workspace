'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import VapiCallModal from '@/components/VapiCallModal'
import {
  Search, Home, MapPin, Eye, ChevronLeft, ChevronRight,
  X, ExternalLink, Thermometer, Banknote, BedDouble,
  Ruler, Building2, Layers, Phone, Bot,
  Loader2, RefreshCw, Tag, Clock, Bath, Calendar,
  Maximize2, User, PhoneCall, Settings, Save, RotateCcw,
  ChevronDown, ChevronUp,
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
  new:            { label: 'Yeni',            color: 'bg-primary/20 text-primary border-primary/20',      dot: 'bg-primary' },
  contacted:      { label: 'Arandı',         color: 'bg-yellow-500/20 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  interested:     { label: 'İlgili',         color: 'bg-green-500/20 text-green-700 border-green-200',   dot: 'bg-green-500' },
  not_interested: { label: 'İlgisiz',        color: 'bg-red-500/20 text-red-600 border-red-200',         dot: 'bg-red-500' },
  converted:      { label: 'Portföye Alındı',color: 'bg-purple-500/20 text-purple-700 border-purple-200',dot: 'bg-purple-500' },
  stale:          { label: 'Pasif',          color: 'bg-surface-container-high/20 text-on-surface-variant border-outline',   dot: 'bg-surface-container-highest' },
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

/* ── Swipeable Image Carousel ────────────────────────────────────── */
function ImageCarousel({ photos, aspect = 'aspect-[4/3]', rounded = '' }: {
  photos: string[]
  aspect?: string
  rounded?: string
}) {
  const [idx, setIdx] = useState(0)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const imgs = photos?.length > 0 ? photos : []

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }
  function handleTouchMove(e: React.TouchEvent) {
    touchEndX.current = e.touches[0].clientX
  }
  function handleTouchEnd() {
    const diff = touchStartX.current - touchEndX.current
    if (Math.abs(diff) > 50) {
      if (diff > 0) setIdx(i => (i + 1) % imgs.length) // swipe left → next
      else setIdx(i => (i - 1 + imgs.length) % imgs.length) // swipe right → prev
    }
  }

  if (imgs.length === 0) {
    return (
      <div className={`${aspect} ${rounded} bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center`}>
        <Home size={48} className="text-on-surface" />
      </div>
    )
  }

  return (
    <div
      className={`relative ${aspect} ${rounded} bg-black group overflow-hidden`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <img
        src={imgs[idx]}
        alt={`Fotoğraf ${idx + 1}`}
        className="w-full h-full object-contain"
        draggable={false}
      />
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/50 to-transparent" />

      {imgs.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + imgs.length) % imgs.length) }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-surface-container/90 hover:bg-surface-container text-on-surface rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % imgs.length) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-surface-container/90 hover:bg-surface-container text-on-surface rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md"
          >
            <ChevronRight size={16} />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {imgs.slice(0, 7).map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setIdx(i) }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? 'bg-surface-container w-4' : 'bg-surface-container/50'}`}
              />
            ))}
            {imgs.length > 7 && <span className="text-white/60 text-[9px] ml-1">+{imgs.length - 7}</span>}
          </div>
          <span className="absolute top-2 right-2 bg-black/50 dark:bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
            {idx + 1}/{imgs.length}
          </span>
        </>
      )}
    </div>
  )
}

/* ── Detail Modal ────────────────────────────────────────────────── */
function DetailModal({ listing: l, onClose, onCall }: { listing: MarketListing; onClose: () => void; onCall: () => void }) {
  const details = [
    { icon: BedDouble,    label: 'Oda Sayısı',    value: l.room_count },
    { icon: Bath,         label: 'Banyo',          value: l.bathroom_count ? `${l.bathroom_count}` : null },
    { icon: Ruler,        label: 'Brüt m²',        value: l.m2_gross ? `${l.m2_gross} m²` : null },
    { icon: Maximize2,    label: 'Net m²',          value: l.m2_net ? `${l.m2_net} m²` : null },
    { icon: Layers,       label: 'Bulunduğu Kat',  value: l.floor != null ? `${l.floor}. kat` : null },
    { icon: Building2,    label: 'Toplam Kat',      value: l.total_floors ? `${l.total_floors} kat` : null },
    { icon: Calendar,     label: 'Bina Yaşı',      value: l.age != null ? (l.age === 0 ? 'Sıfır bina' : `${l.age} yıl`) : null },
    { icon: Thermometer,  label: 'Isıtma',          value: l.heating_type },
    { icon: Banknote,     label: 'Aidat',            value: l.dues ? fmtPrice(l.dues) : null },
    { icon: Banknote,     label: 'Depozito',         value: l.deposit ? fmtPrice(l.deposit) : null },
    { icon: Tag,          label: 'Emlak Tipi',       value: PROPERTY_TYPE_LABELS[l.property_type] || l.property_type },
    { icon: MapPin,       label: 'İlçe',             value: l.district },
    { icon: MapPin,       label: 'Mahalle',           value: l.neighborhood },
  ].filter(d => d.value)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-surface-container rounded-2xl shadow-2xl max-w-3xl w-full max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-9 h-9 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center">
          <X size={18} />
        </button>

        {/* Images — contain, no stretch */}
        <ImageCarousel photos={l.photos || []} aspect="aspect-[16/10]" rounded="rounded-t-2xl" />

        <div className="p-5 sm:p-6">
          {/* Status */}
          {l.contact_status && STATUS_CONFIG[l.contact_status] && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border mb-3 ${STATUS_CONFIG[l.contact_status].color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[l.contact_status].dot}`} />
              {STATUS_CONFIG[l.contact_status].label}
            </span>
          )}

          {/* Title & Price */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-5">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-on-surface leading-tight">{l.title || 'İlan'}</h2>
              {(l.city || l.district) && (
                <p className="text-sm text-on-surface-variant flex items-center gap-1 mt-1">
                  <MapPin size={14} className="flex-shrink-0" />
                  {[l.neighborhood, l.district, l.city].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            {l.price > 0 && (
              <p className="text-xl sm:text-2xl font-bold text-primary flex-shrink-0">{fmtPrice(l.price, l.currency)}</p>
            )}
          </div>

          {/* Satıcı bilgisi — isim, soyisim, telefon, tip */}
          {(l.seller_name || l.seller_phone) && (
            <div className="flex items-center gap-3 p-4 bg-surface-container-high rounded-xl mb-5 border border-outline">
              <div className="w-11 h-11 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface">{l.seller_name || 'İlan Sahibi'}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="text-xs text-on-surface-variant">
                    {l.seller_type === 'owner' ? 'Mülk Sahibi' : l.seller_type === 'agency' ? 'Emlak Ofisi' : l.seller_type || 'Sahibinden'}
                  </p>
                  {l.seller_phone && (
                    <a href={`tel:${l.seller_phone}`} className="text-xs text-primary font-medium hover:underline">
                      {l.seller_phone}
                    </a>
                  )}
                </div>
              </div>
              {l.seller_phone && (
                <button onClick={onCall} className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0">
                  <PhoneCall size={14} />
                  <span className="hidden sm:inline">Lina ile Ara</span>
                  <span className="sm:hidden">Ara</span>
                </button>
              )}
            </div>
          )}

          {/* Detail Grid */}
          {details.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-on-surface mb-3">İlan Detayları</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {details.map(d => {
                  const Icon = d.icon
                  return (
                    <div key={d.label} className="flex items-center gap-2.5 p-2.5 bg-surface-container-high rounded-xl border border-outline">
                      <div className="w-8 h-8 bg-surface-container rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Icon size={15} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-on-surface-variant uppercase tracking-wide">{d.label}</p>
                        <p className="text-sm font-semibold text-on-surface truncate">{d.value}</p>
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
              <h3 className="text-sm font-semibold text-on-surface mb-3">Özellikler</h3>
              <div className="flex flex-wrap gap-1.5">
                {l.features.map((f, i) => (
                  <span key={i} className="text-xs bg-primary-container text-primary px-2.5 py-1 rounded-lg border border-primary/20">{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {l.description && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-on-surface mb-3">Açıklama</h3>
              <div className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-line bg-surface-container-high rounded-xl p-4 border border-outline max-h-48 overflow-y-auto">
                {l.description}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant pt-4 border-t border-outline mb-5">
            {l.source_listing_id && <span>İlan No: {l.source_listing_id}</span>}
            {l.created_at && <span>Eklenme: {new Date(l.created_at).toLocaleDateString('tr-TR')}</span>}
            {l.last_seen_at && <span>Son Görülme: {timeAgo(l.last_seen_at)}</span>}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {l.source_url && (
              <a href={l.source_url} target="_blank" rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-xl transition-colors">
                <ExternalLink size={15} />
                Sahibinden&apos;de Gör
              </a>
            )}
            {l.seller_phone && (
              <button onClick={onCall}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl transition-colors">
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

/* ── Prompt Editör ──────────────────────────────────────────────── */
function PromptEditor() {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isDefault, setIsDefault] = useState(true)

  useEffect(() => {
    if (open && !prompt) {
      setLoading(true)
      fetch('/api/vapi/prompt').then(r => r.json())
        .then(d => { setPrompt(d.prompt); setOriginal(d.prompt); setIsDefault(d.isDefault) })
        .catch(() => {}).finally(() => setLoading(false))
    }
  }, [open, prompt])

  async function handleSave() {
    setSaving(true); setSaved(false)
    try {
      const res = await fetch('/api/vapi/prompt', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) })
      if (!res.ok) throw new Error()
      setOriginal(prompt); setIsDefault(false); setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch { alert('Prompt kaydedilemedi') } finally { setSaving(false) }
  }

  return (
    <div className="card mb-6 border border-outline">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Settings size={20} className="text-amber-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-on-surface">Konuşma Akış Promptu</h3>
            <p className="text-on-surface-variant text-xs">Lina&apos;nın arama esnasında kullandığı sistem talimatını düzenleyin</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDefault && <span className="text-[10px] bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full">Varsayılan</span>}
          {open ? <ChevronUp size={18} className="text-on-surface-variant" /> : <ChevronDown size={18} className="text-on-surface-variant" />}
        </div>
      </button>
      {open && (
        <div className="mt-4 pt-4 border-t border-outline">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-on-surface-variant"><Loader2 size={20} className="animate-spin mr-2" /><span className="text-sm">Yükleniyor...</span></div>
          ) : (
            <>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={12}
                className="w-full px-4 py-3 border border-outline rounded-xl text-sm text-on-surface font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-y"
                placeholder="Sistem promptunu buraya yazın..." />
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setPrompt(original)} disabled={prompt === original}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest rounded-lg disabled:opacity-30 disabled:cursor-not-allowed">
                    <RotateCcw size={13} /> Geri Al
                  </button>
                  {saved && <span className="text-xs text-green-600 font-medium">Kaydedildi!</span>}
                </div>
                <button onClick={handleSave} disabled={prompt === original || saving}
                  className="flex items-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-surface-container-highest disabled:text-on-surface-variant disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
                </button>
              </div>
            </>
          )}
        </div>
      )}
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
    const listing: MarketListing = selectedListing
      ? { ...selectedListing, seller_phone: testPhone.trim() }
      : { id:'test-call',title:'Test Arama',description:'',price:0,currency:'TRY',property_type:'',city:'',district:'',neighborhood:'',address:'',m2_gross:0,m2_net:0,room_count:'',bathroom_count:0,floor:0,total_floors:0,age:0,heating_type:'',dues:0,deposit:0,features:[],photos:[],source:'test',source_url:'',source_listing_id:'',seller_name:'Test Kullanıcı',seller_phone:testPhone.trim(),seller_type:'owner',contact_status:'new',contact_notes:'',contacted_at:'',created_at:new Date().toISOString(),last_seen_at:new Date().toISOString(),is_active:true }
    onStartCall(listing)
  }

  return (
    <div className="card mb-6 bg-gradient-to-r from-slate-800 to-slate-900 border-0">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center"><Bot size={20} className="text-white" /></div>
        <div className="flex-1">
          <h3 className="text-white font-semibold">Dijital Arama Asistanı — Lina</h3>
          <p className="text-on-surface-variant text-xs">Numara girin, portföyden mülk seçin ve Lina ile deneme araması yapın</p>
        </div>
      </div>
      <div className="mb-3">
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
          className="w-full bg-surface-container border border-outline text-white rounded-xl text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">— Mülk seçilmedi (genel deneme araması) —</option>
          {listings.map(l => <option key={l.id} value={l.id}>{l.title?.slice(0,40)} {l.price?`— ${fmtPrice(l.price,l.currency)}`:''} {l.district?`(${l.district})`:''}</option>)}
        </select>
      </div>
      {selectedListing && (
        <div className="mb-3 p-3 bg-surface-container/50 rounded-xl border border-outline">
          <div className="flex items-center gap-3">
            {selectedListing.photos?.[0] && <img src={selectedListing.photos[0]} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{selectedListing.title}</p>
              <p className="text-on-surface-variant text-xs">{[selectedListing.room_count,selectedListing.m2_gross?`${selectedListing.m2_gross}m²`:null,selectedListing.district].filter(Boolean).join(' · ')}</p>
            </div>
            {selectedListing.price>0 && <p className="text-green-400 font-bold text-sm flex-shrink-0">{fmtPrice(selectedListing.price,selectedListing.currency)}</p>}
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input type="tel" placeholder="05XX XXX XX XX" value={testPhone} onChange={e=>setTestPhone(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleTestCall()}
            className="w-full pl-9 pr-4 py-3 bg-surface-container border border-outline text-white placeholder-on-surface-variant rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <button onClick={handleTestCall} disabled={!testPhone.trim()}
          className="flex items-center justify-center gap-2 px-8 py-3 bg-green-500 hover:bg-green-600 disabled:bg-surface-container-high disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm whitespace-nowrap shadow-lg shadow-green-500/20">
          <PhoneCall size={18} /> Lina ile Ara
        </button>
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
      const res = await fetch(`/api/piyasa/listings?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setListings(data.listings || [])
      setTotalCount(data.count || 0)
    } catch { setListings([]) } finally { setLoading(false) }
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
    <div className="p-4 sm:p-6">
      {callTarget && <VapiCallModal isOpen onClose={() => setCallTarget(null)} listing={callTarget as any} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-on-surface">Sahibinden İlanlar</h1>
          <p className="text-on-surface-variant text-sm mt-1">Sahibinden&apos;den çekilen {totalCount} ilan</p>
        </div>
        <button onClick={fetchListings} className="p-2.5 text-on-surface-variant hover:text-on-surface-variant hover:bg-surface-container-highest rounded-xl"><RefreshCw size={18} /></button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label:'Yeni Lead', value:statusCounts.new, color:'text-primary', bg:'bg-primary-container border-primary/20' },
          { label:'Arandı', value:statusCounts.contacted, color:'text-yellow-600', bg:'bg-yellow-50 border-yellow-100' },
          { label:'İlgili', value:statusCounts.interested, color:'text-green-600', bg:'bg-green-50 border-green-100' },
          { label:'Portföye Alındı', value:statusCounts.converted, color:'text-purple-600', bg:'bg-purple-50 border-purple-100' },
          { label:'Toplam', value:totalCount, color:'text-on-surface', bg:'bg-surface-container-high border-outline' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <PromptEditor />
      <TestCallPanel listings={listings} onStartCall={setCallTarget} />

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input type="text" placeholder="İlan, şehir veya satıcı ara..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {['all','new','contacted','interested','converted'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterStatus===s?'bg-primary text-white shadow-sm':'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}`}>
                {s==='all'?'Tümü':STATUS_CONFIG[s]?.label||s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Listing Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-on-surface-variant">
          <Loader2 size={28} className="animate-spin mr-2" /><span className="text-sm">İlanlar yükleniyor...</span>
        </div>
      ) : listings.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-on-surface-variant">
          <Building2 size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">İlan bulunamadı</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {listings.map(l => {
            const status = STATUS_CONFIG[l.contact_status] || STATUS_CONFIG.new
            return (
              <div key={l.id} className="bg-surface-container rounded-2xl shadow-sm border border-outline overflow-hidden hover:shadow-lg transition-all duration-300 group">
                {/* Image */}
                <div className="relative">
                  <ImageCarousel photos={l.photos || []} aspect="aspect-[4/3]" />
                  <span className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border backdrop-blur-sm ${status.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />{status.label}
                  </span>
                  {l.price > 0 && (
                    <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm px-3 py-1 rounded-xl text-white font-bold text-sm">
                      {fmtPrice(l.price, l.currency)}
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="p-4">
                  <h3 onClick={() => setSelectedListing(l)}
                    className="font-semibold text-on-surface text-sm leading-snug mb-1 line-clamp-2 group-hover:text-primary cursor-pointer">
                    {l.title || 'İlan başlığı yok'}
                  </h3>

                  {(l.city || l.district) && (
                    <p className="text-xs text-on-surface-variant flex items-center gap-1 mb-2">
                      <MapPin size={11} className="flex-shrink-0" />
                      {[l.neighborhood, l.district, l.city].filter(Boolean).join(', ')}
                    </p>
                  )}

                  {/* Specs */}
                  <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant mb-3 flex-wrap">
                    {l.room_count && <span className="flex items-center gap-1 bg-surface-container-high px-2 py-0.5 rounded-md"><BedDouble size={10} /> {l.room_count}</span>}
                    {l.m2_gross > 0 && <span className="flex items-center gap-1 bg-surface-container-high px-2 py-0.5 rounded-md"><Ruler size={10} /> {l.m2_gross}m²</span>}
                    {l.floor != null && l.total_floors && <span className="flex items-center gap-1 bg-surface-container-high px-2 py-0.5 rounded-md"><Layers size={10} /> {l.floor}/{l.total_floors}</span>}
                    {l.age != null && <span className="flex items-center gap-1 bg-surface-container-high px-2 py-0.5 rounded-md"><Calendar size={10} /> {l.age===0?'Sıfır':`${l.age}y`}</span>}
                  </div>

                  {/* Seller — isim + telefon */}
                  <div className="flex items-center gap-2 py-2 border-t border-outline mb-3">
                    <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-on-surface font-medium truncate">{l.seller_name || 'İlan Sahibi'}</p>
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] text-on-surface-variant">
                          {l.seller_type === 'owner' ? 'Sahibinden' : l.seller_type === 'agency' ? 'Emlak Ofisi' : l.seller_type || 'Sahibinden'}
                        </p>
                        {l.seller_phone && (
                          <span className="text-[10px] text-primary font-medium">{l.seller_phone}</span>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-on-surface-variant flex items-center gap-0.5 flex-shrink-0">
                      <Clock size={9} /> {timeAgo(l.created_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {l.seller_phone && (
                      <button onClick={e => { e.stopPropagation(); setCallTarget(l) }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl text-green-700 text-xs font-medium">
                        <Bot size={13} /> Lina ile Ara
                      </button>
                    )}
                    <button onClick={() => setSelectedListing(l)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary-container hover:bg-primary-container border border-primary/20 rounded-xl text-primary text-xs font-medium">
                      <Eye size={13} /> İlanı Gör
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selectedListing && (
        <DetailModal listing={selectedListing} onClose={() => setSelectedListing(null)}
          onCall={() => { setCallTarget(selectedListing); setSelectedListing(null) }} />
      )}
    </div>
  )
}
