'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { PropertyType, ListingSource } from '@/lib/types'
import {
  ArrowLeft, Link2, Zap, Save, CheckCircle,
  AlertCircle, Loader2, Home, MapPin, DollarSign, Info,
} from 'lucide-react'

const propertyTypes: { value: PropertyType; label: string }[] = [
  { value: 'apartment', label: 'Daire' },
  { value: 'villa', label: 'Villa' },
  { value: 'land', label: 'Arsa' },
  { value: 'commercial', label: 'İşyeri' },
  { value: 'office', label: 'Ofis' },
  { value: 'shop', label: 'Dükkan' },
  { value: 'warehouse', label: 'Depo' },
  { value: 'detached_house', label: 'Müstakil Ev' },
  { value: 'field', label: 'Tarla' },
]

type ScrapingStatus = 'idle' | 'loading' | 'success' | 'error'

interface FormData {
  title: string
  description: string
  price: string
  currency: string
  deposit: string
  dues: string
  property_type: PropertyType
  city: string
  district: string
  neighborhood: string
  address: string
  latitude: string
  longitude: string
  m2_gross: string
  m2_net: string
  room_count: string
  bathroom_count: string
  floor: string
  total_floors: string
  age: string
  heating_type: string
  features: string[]
  photos: string[]
  source_url: string
  source_listing_id: string
  source: ListingSource
}

const emptyForm: FormData = {
  title: '', description: '', price: '', currency: 'TRY',
  deposit: '', dues: '',
  property_type: 'apartment', city: '', district: '', neighborhood: '',
  address: '', latitude: '', longitude: '',
  m2_gross: '', m2_net: '', room_count: '',
  bathroom_count: '', floor: '', total_floors: '', age: '',
  heating_type: '', features: [], photos: [],
  source_url: '', source_listing_id: '', source: 'manual',
}

function detectPlatform(url: string): ListingSource {
  if (url.includes('sahibinden.com')) return 'sahibinden'
  if (url.includes('cb.com.tr') || url.includes('coldwellbanker')) return 'cb_com_tr'
  if (url.includes('hepsiemlak.com')) return 'hepsiemlak'
  if (url.includes('emlakjet.com')) return 'emlakjet'
  if (url.includes('zingat.com')) return 'zingat'
  return 'other'
}

export default function NewPropertyPage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [scrapingStatus, setScrapingStatus] = useState<ScrapingStatus>('idle')
  const [scrapingError, setScrapingError] = useState('')
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function handleScrape() {
    if (!url.trim()) return
    setScrapingStatus('loading')
    setScrapingError('')

    try {
      const res = await fetch('/api/scrape-property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Scraping başarısız')
      }

      // null/undefined değerleri filtrele, sadece dolu alanları uygula
      const filtered = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '')
      )
      const toStr = (v: unknown) => (v == null || v === '' ? '' : String(v))
      setForm({
        ...emptyForm,
        ...filtered,
        price: toStr(filtered.price),
        deposit: toStr(filtered.deposit),
        dues: toStr(filtered.dues),
        m2_gross: toStr(filtered.m2_gross),
        m2_net: toStr(filtered.m2_net),
        bathroom_count: toStr(filtered.bathroom_count),
        floor: toStr(filtered.floor),
        total_floors: toStr(filtered.total_floors),
        age: toStr(filtered.age),
        latitude: toStr(filtered.latitude),
        longitude: toStr(filtered.longitude),
        source_url: url.trim(),
        source_listing_id: toStr(filtered.source_listing_id),
        source: detectPlatform(url.trim()),
        features: Array.isArray(data.features) ? data.features : [],
        photos: Array.isArray(data.photos) ? data.photos : [],
      })
      setScrapingStatus('success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata'
      setScrapingError(message)
      setScrapingStatus('error')
    }
  }

  function set(field: keyof FormData, value: string | string[]) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleFeature(feature: string) {
    setForm(f => ({
      ...f,
      features: f.features.includes(feature)
        ? f.features.filter(x => x !== feature)
        : [...f.features, feature],
    }))
  }

  async function handleSave() {
    if (!form.title.trim()) { setSaveError('Başlık zorunludur.'); return }
    setSaving(true)
    setSaveError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: consultant } = await supabase
      .from('consultants').select('id').eq('user_id', user?.id).single()

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      price: form.price ? Number(form.price) : null,
      currency: form.currency,
      deposit: form.deposit ? Number(form.deposit) : null,
      dues: form.dues ? Number(form.dues) : null,
      property_type: form.property_type,
      city: form.city.trim() || null,
      district: form.district.trim() || null,
      neighborhood: form.neighborhood.trim() || null,
      address: form.address.trim() || null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      m2_gross: form.m2_gross ? Number(form.m2_gross) : null,
      m2_net: form.m2_net ? Number(form.m2_net) : null,
      room_count: form.room_count.trim() || null,
      bathroom_count: form.bathroom_count ? Number(form.bathroom_count) : null,
      floor: form.floor ? Number(form.floor) : null,
      total_floors: form.total_floors ? Number(form.total_floors) : null,
      age: form.age ? Number(form.age) : null,
      heating_type: form.heating_type.trim() || null,
      features: form.features,
      photos: form.photos.length > 0 ? form.photos : null,
      source: form.source,
      source_url: form.source_url || null,
      source_listing_id: form.source_listing_id || null,
      assigned_consultant_id: consultant?.id || null,
      status: 'active',
    }

    const { data, error } = await supabase.from('properties').insert(payload).select('id').single()
    if (error) { setSaveError('Kaydedilemedi: ' + error.message); setSaving(false); return }
    router.push(`/portfolio/${data.id}`)
  }

  const commonFeatures = [
    'Asansör', 'Otopark', 'Havuz', 'Güvenlik', 'Kapıcı', 'Balkon',
    'Teras', 'Bahçe', 'Garaj', 'Depo', 'Site içi', 'Akıllı ev sistemi',
    'Isı yalıtımı', 'Ses yalıtımı', 'Doğalgaz', 'Klima', 'Ebeveyn banyosu',
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Başlık */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/portfolio" className="text-on-surface-variant hover:text-on-surface-variant transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Mülk Ekle</h1>
          <p className="text-on-surface-variant text-sm">URL yapıştırarak otomatik doldurun veya manuel girin</p>
        </div>
      </div>

      {/* URL Scraping Kutusu */}
      <div className="card mb-6 bg-gradient-to-r from-primary-container to-primary-container border-primary/20">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={18} className="text-primary" />
          <h2 className="font-semibold text-on-surface">Otomatik Doldur (URL ile)</h2>
          <span className="text-xs bg-primary-container text-primary px-2 py-0.5 rounded-full">Önerilen</span>
        </div>
        <p className="text-xs text-on-surface-variant mb-3 flex items-center gap-1">
          <Info size={11} />
          Sahibinden (Apify ile tam detay), Hepsiemlak, Emlakjet, Zingat, CB.com.tr desteklenir.
          Fotoğraflar, konum, tüm öznitelikler otomatik çekilir.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleScrape()}
              placeholder="https://www.sahibinden.com/ilan/..."
              className="w-full pl-9 pr-4 py-2.5 border border-primary/20 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container"
            />
          </div>
          <button
            onClick={handleScrape}
            disabled={scrapingStatus === 'loading' || !url.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
          >
            {scrapingStatus === 'loading'
              ? <><Loader2 size={15} className="animate-spin" /> Çekiliyor...</>
              : <><Zap size={15} /> Otomatik Doldur</>
            }
          </button>
        </div>

        {scrapingStatus === 'success' && (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <CheckCircle size={15} />
              Mülk bilgileri başarıyla çekildi!
              {form.photos.length > 0
                ? ` ${form.photos.length} fotoğraf bulundu.`
                : ' Fotoğraf bulunamadı — manuel ekleyebilirsiniz.'}
            </div>
            {form.photos.length > 0 && (
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {form.photos.map((src, i) => (
                  <img key={i} src={src} alt={`foto-${i + 1}`}
                    className="w-full h-20 object-cover rounded-lg border border-outline"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {scrapingStatus === 'error' && (
          <div className="mt-3 flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle size={15} />
            {scrapingError} — Bilgileri manuel olarak girebilirsiniz.
          </div>
        )}
      </div>

      {/* Form */}
      <div className="space-y-5">
        {/* Temel Bilgiler */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <Home size={16} /> Temel Bilgiler
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">
                Başlık <span className="text-red-500">*</span>
              </label>
              <input
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="3+1 Satılık Daire, Kadıköy"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Mülk Tipi</label>
                <select
                  value={form.property_type}
                  onChange={e => set('property_type', e.target.value)}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {propertyTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Oda Sayısı</label>
                <input
                  value={form.room_count}
                  onChange={e => set('room_count', e.target.value)}
                  placeholder="3+1"
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Açıklama</label>
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={3}
                placeholder="Mülk hakkında detaylı bilgi..."
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </div>
        </div>

        {/* Fiyat */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <DollarSign size={16} /> Fiyat
          </h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Fiyat</label>
              <input
                type="number"
                value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="2.500.000"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Para Birimi</label>
              <select
                value={form.currency}
                onChange={e => set('currency', e.target.value)}
                className="border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="TRY">₺ TRY</option>
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Depozito (TL)</label>
              <input
                type="number"
                value={form.deposit}
                onChange={e => set('deposit', e.target.value)}
                placeholder="16.000"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Aidat (TL)</label>
              <input
                type="number"
                value={form.dues}
                onChange={e => set('dues', e.target.value)}
                placeholder="500"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Konum */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <MapPin size={16} /> Konum
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Şehir</label>
              <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="İstanbul"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">İlçe</label>
              <input value={form.district} onChange={e => set('district', e.target.value)} placeholder="Kadıköy"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Mahalle</label>
              <input value={form.neighborhood} onChange={e => set('neighborhood', e.target.value)} placeholder="Moda"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-on-surface mb-1">Tam Adres</label>
            <input value={form.address} onChange={e => set('address', e.target.value)}
              placeholder="Moda Cad. No:15 D:8"
              className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Enlem (Latitude)</label>
              <input
                value={form.latitude}
                onChange={e => set('latitude', e.target.value)}
                placeholder="40.1937"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Boylam (Longitude)</label>
              <input
                value={form.longitude}
                onChange={e => set('longitude', e.target.value)}
                placeholder="29.0697"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          {form.latitude && form.longitude && (
            <a
              href={`https://www.google.com/maps?q=${form.latitude},${form.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
            >
              <MapPin size={11} /> Haritada gör
            </a>
          )}
        </div>

        {/* Detaylar */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-4">Fiziksel Özellikler</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Brüt m²', field: 'm2_gross', placeholder: '120' },
              { label: 'Net m²', field: 'm2_net', placeholder: '100' },
              { label: 'Banyo', field: 'bathroom_count', placeholder: '2' },
              { label: 'Kat', field: 'floor', placeholder: '3' },
              { label: 'Top. Kat', field: 'total_floors', placeholder: '8' },
              { label: 'Bina Yaşı', field: 'age', placeholder: '5' },
            ].map(f => (
              <div key={f.field}>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">{f.label}</label>
                <input
                  type="number"
                  value={form[f.field as keyof FormData] as string}
                  onChange={e => set(f.field as keyof FormData, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Isıtma</label>
              <input value={form.heating_type} onChange={e => set('heating_type', e.target.value)}
                placeholder="Doğalgaz, Merkezi, Kombi..."
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
        </div>

        {/* Özellikler */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-3">Özellikler / Sosyal Alanlar</h2>
          <div className="flex flex-wrap gap-2">
            {commonFeatures.map(f => (
              <button
                key={f}
                type="button"
                onClick={() => toggleFeature(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  form.features.includes(f)
                    ? 'bg-primary border-primary text-white'
                    : 'bg-surface-container border-outline text-on-surface-variant hover:border-primary/30'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {form.features.length > 0 && (
            <p className="text-xs text-on-surface-variant mt-2">
              Seçili: {form.features.join(', ')}
            </p>
          )}
        </div>

        {/* Hata */}
        {saveError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {saveError}
          </div>
        )}

        {/* Butonlar */}
        <div className="flex items-center justify-end gap-3">
          <Link href="/portfolio" className="btn-secondary">İptal</Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {saving
              ? <><Loader2 size={15} className="animate-spin" /> Kaydediliyor...</>
              : <><Save size={15} /> Mülkü Kaydet</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
