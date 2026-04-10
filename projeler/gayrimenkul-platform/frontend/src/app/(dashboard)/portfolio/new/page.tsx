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
  { value: 'detached_house', label: 'Müstakil Ev' },
]

type ScrapingStatus = 'idle' | 'loading' | 'success' | 'error'

interface FormData {
  title: string
  description: string
  price: string
  currency: string
  property_type: PropertyType
  city: string
  district: string
  neighborhood: string
  address: string
  m2_gross: string
  m2_net: string
  room_count: string
  bathroom_count: string
  floor: string
  total_floors: string
  age: string
  heating_type: string
  features: string[]
  source_url: string
  source: ListingSource
}

const emptyForm: FormData = {
  title: '', description: '', price: '', currency: 'TRY',
  property_type: 'apartment', city: '', district: '', neighborhood: '',
  address: '', m2_gross: '', m2_net: '', room_count: '',
  bathroom_count: '', floor: '', total_floors: '', age: '',
  heating_type: '', features: [], source_url: '', source: 'manual',
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

      setForm({
        ...emptyForm,
        ...data,
        source_url: url.trim(),
        source: detectPlatform(url.trim()),
        features: Array.isArray(data.features) ? data.features : [],
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
      property_type: form.property_type,
      city: form.city.trim() || null,
      district: form.district.trim() || null,
      neighborhood: form.neighborhood.trim() || null,
      address: form.address.trim() || null,
      m2_gross: form.m2_gross ? Number(form.m2_gross) : null,
      m2_net: form.m2_net ? Number(form.m2_net) : null,
      room_count: form.room_count.trim() || null,
      bathroom_count: form.bathroom_count ? Number(form.bathroom_count) : null,
      floor: form.floor ? Number(form.floor) : null,
      total_floors: form.total_floors ? Number(form.total_floors) : null,
      age: form.age ? Number(form.age) : null,
      heating_type: form.heating_type.trim() || null,
      features: form.features,
      source: form.source,
      source_url: form.source_url || null,
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
        <Link href="/portfolio" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mülk Ekle</h1>
          <p className="text-slate-500 text-sm">URL yapıştırarak otomatik doldurun veya manuel girin</p>
        </div>
      </div>

      {/* URL Scraping Kutusu */}
      <div className="card mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={18} className="text-blue-600" />
          <h2 className="font-semibold text-slate-900">Otomatik Doldur (URL ile)</h2>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Önerilen</span>
        </div>
        <p className="text-xs text-slate-500 mb-3 flex items-center gap-1">
          <Info size={11} />
          Sahibinden, CB.com.tr, Hepsiemlak, Emlakjet, Zingat desteklenmektedir.
          AI ile otomatik parse edilir.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleScrape()}
              placeholder="https://www.sahibinden.com/ilan/..."
              className="w-full pl-9 pr-4 py-2.5 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
          <div className="mt-3 flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle size={15} /> Mülk bilgileri başarıyla çekildi! Aşağıdaki alanları gözden geçirin.
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
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Home size={16} /> Temel Bilgiler
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Başlık <span className="text-red-500">*</span>
              </label>
              <input
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="3+1 Satılık Daire, Kadıköy"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mülk Tipi</label>
                <select
                  value={form.property_type}
                  onChange={e => set('property_type', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {propertyTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Oda Sayısı</label>
                <input
                  value={form.room_count}
                  onChange={e => set('room_count', e.target.value)}
                  placeholder="3+1"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Açıklama</label>
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={3}
                placeholder="Mülk hakkında detaylı bilgi..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Fiyat */}
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <DollarSign size={16} /> Fiyat
          </h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="number"
                value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="2.500.000"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={form.currency}
              onChange={e => set('currency', e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="TRY">₺ TRY</option>
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
            </select>
          </div>
        </div>

        {/* Konum */}
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <MapPin size={16} /> Konum
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Şehir</label>
              <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="İstanbul"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">İlçe</label>
              <input value={form.district} onChange={e => set('district', e.target.value)} placeholder="Kadıköy"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mahalle</label>
              <input value={form.neighborhood} onChange={e => set('neighborhood', e.target.value)} placeholder="Moda"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-sm font-medium text-slate-700 mb-1">Tam Adres</label>
            <input value={form.address} onChange={e => set('address', e.target.value)}
              placeholder="Moda Cad. No:15 D:8"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* Detaylar */}
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-4">Fiziksel Özellikler</h2>
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
                <label className="block text-xs font-medium text-slate-600 mb-1">{f.label}</label>
                <input
                  type="number"
                  value={form[f.field as keyof FormData] as string}
                  onChange={e => set(f.field as keyof FormData, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Isıtma</label>
              <input value={form.heating_type} onChange={e => set('heating_type', e.target.value)}
                placeholder="Doğalgaz, Merkezi, Kombi..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* Özellikler */}
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-3">Özellikler / Sosyal Alanlar</h2>
          <div className="flex flex-wrap gap-2">
            {commonFeatures.map(f => (
              <button
                key={f}
                type="button"
                onClick={() => toggleFeature(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  form.features.includes(f)
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {form.features.length > 0 && (
            <p className="text-xs text-slate-400 mt-2">
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
