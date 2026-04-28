'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { ClientType, LeadStatus, PropertyType, ListingSource } from '@/lib/types'
import { ArrowLeft, Save, User, Phone, Mail, MapPin, Home, DollarSign } from 'lucide-react'

const clientTypes: { value: ClientType; label: string }[] = [
  { value: 'buyer', label: 'Alıcı' },
  { value: 'seller', label: 'Satıcı' },
  { value: 'both', label: 'Alıcı & Satıcı' },
  { value: 'investor', label: 'Yatırımcı' },
  { value: 'tenant', label: 'Kiracı' },
  { value: 'landlord', label: 'Ev Sahibi' },
  { value: 'network', label: 'Ağ / Tanışık' },
]

const leadStatuses: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'Yeni' },
  { value: 'contacted', label: 'İletişime Geçildi' },
  { value: 'qualified', label: 'Nitelikli' },
  { value: 'negotiating', label: 'Müzakere' },
]

const sources: { value: ListingSource; label: string }[] = [
  { value: 'referral', label: 'Referans' },
  { value: 'walk_in', label: 'Ofise Geldi' },
  { value: 'sahibinden', label: 'Sahibinden.com' },
  { value: 'hepsiemlak', label: 'Hepsiemlak' },
  { value: 'other', label: 'Diğer' },
]

const propertyTypes: { value: PropertyType; label: string }[] = [
  { value: 'apartment', label: 'Daire' },
  { value: 'villa', label: 'Villa' },
  { value: 'land', label: 'Arsa' },
  { value: 'commercial', label: 'İşyeri' },
  { value: 'office', label: 'Ofis' },
  { value: 'detached_house', label: 'Müstakil Ev' },
  { value: 'field', label: 'Tarla' },
]

const cities = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Mersin', 'Adana', 'Kocaeli', 'Konya', 'Gaziantep']

export default function NewClientPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    full_name: '',
    salutation: '',
    phone: '',
    email: '',
    client_type: 'buyer' as ClientType,
    lead_status: 'new' as LeadStatus,
    source: 'other' as ListingSource,
    notes: '',
    // Alıcı kriterleri
    budget_min: '',
    budget_max: '',
    preferred_cities: [] as string[],
    preferred_property_types: [] as PropertyType[],
    min_m2: '',
    max_m2: '',
    min_rooms: '',
  })

  const isBuyer = ['buyer', 'both', 'investor', 'tenant'].includes(form.client_type)

  function toggle<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Ad Soyad zorunludur.'); return }
    if (!form.phone && !form.email) { setError('Telefon veya e-posta gereklidir.'); return }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Danışman ID'sini al
    const { data: consultant } = await supabase
      .from('consultants')
      .select('id')
      .eq('user_id', user?.id)
      .single()

    const payload = {
      full_name: form.full_name.trim(),
      salutation: form.salutation.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      client_type: form.client_type,
      lead_status: form.lead_status,
      source: form.source,
      notes: form.notes.trim() || null,
      assigned_consultant_id: consultant?.id || null,
      ...(isBuyer && {
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        preferred_cities: form.preferred_cities.length ? form.preferred_cities : null,
        preferred_property_types: form.preferred_property_types.length ? form.preferred_property_types : null,
        min_m2: form.min_m2 ? Number(form.min_m2) : null,
        max_m2: form.max_m2 ? Number(form.max_m2) : null,
        min_rooms: form.min_rooms ? Number(form.min_rooms) : null,
      }),
    }

    const { data, error: insertError } = await supabase
      .from('clients')
      .insert(payload)
      .select('id')
      .single()

    if (insertError) {
      setError('Müşteri kaydedilemedi: ' + insertError.message)
      setLoading(false)
      return
    }

    if (data?.id) {
      router.push(`/crm/${data.id}`)
    } else {
      router.push('/crm')
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Başlık */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/crm" className="text-on-surface-variant hover:text-on-surface-variant transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Yeni Müşteri</h1>
          <p className="text-on-surface-variant text-sm">Alıcı veya satıcı müşteri ekleyin</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Temel Bilgiler */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <User size={16} /> Temel Bilgiler
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 flex gap-3">
              <div className="w-36">
                <label className="block text-sm font-medium text-on-surface mb-1">Hitap Şekli</label>
                <select
                  value={form.salutation}
                  onChange={e => setForm(f => ({ ...f, salutation: e.target.value }))}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">—</option>
                  <option value="Bey">Bey</option>
                  <option value="Hanım">Hanım</option>
                  <option value="Dr.">Dr.</option>
                  <option value="Op. Dr.">Op. Dr.</option>
                  <option value="Uzm. Dr.">Uzm. Dr.</option>
                  <option value="Av.">Av.</option>
                  <option value="Prof.">Prof.</option>
                  <option value="Prof. Dr.">Prof. Dr.</option>
                  <option value="Doç.">Doç.</option>
                  <option value="Müh.">Müh.</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-on-surface mb-1">
                  Ad Soyad <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Ahmet Yılmaz"
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1 flex items-center gap-1">
                <Phone size={13} /> Telefon
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="05XX XXX XXXX"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1 flex items-center gap-1">
                <Mail size={13} /> E-posta
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="ahmet@email.com"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Müşteri Tipi & Durum */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-4">Sınıflandırma</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Müşteri Tipi</label>
              <select
                value={form.client_type}
                onChange={e => setForm(f => ({ ...f, client_type: e.target.value as ClientType }))}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container"
              >
                {clientTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Durum</label>
              <select
                value={form.lead_status}
                onChange={e => setForm(f => ({ ...f, lead_status: e.target.value as LeadStatus }))}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container"
              >
                {leadStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Kaynak</label>
              <select
                value={form.source}
                onChange={e => setForm(f => ({ ...f, source: e.target.value as ListingSource }))}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container"
              >
                {sources.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Alıcı Kriterleri */}
        {isBuyer && (
          <div className="card">
            <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
              <Home size={16} /> Arama Kriterleri
              <span className="text-xs text-on-surface-variant font-normal">(Eşleştirme için kullanılır)</span>
            </h2>
            <div className="space-y-4">
              {/* Bütçe */}
              <div>
                <label className="block text-sm font-medium text-on-surface mb-2 flex items-center gap-1">
                  <DollarSign size={13} /> Bütçe Aralığı (₺)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={form.budget_min}
                    onChange={e => setForm(f => ({ ...f, budget_min: e.target.value }))}
                    placeholder="Min"
                    className="flex-1 border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-on-surface-variant text-sm">—</span>
                  <input
                    type="number"
                    value={form.budget_max}
                    onChange={e => setForm(f => ({ ...f, budget_max: e.target.value }))}
                    placeholder="Max"
                    className="flex-1 border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* m2 ve Oda */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1">Min m²</label>
                  <input
                    type="number"
                    value={form.min_m2}
                    onChange={e => setForm(f => ({ ...f, min_m2: e.target.value }))}
                    placeholder="60"
                    className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1">Max m²</label>
                  <input
                    type="number"
                    value={form.max_m2}
                    onChange={e => setForm(f => ({ ...f, max_m2: e.target.value }))}
                    placeholder="150"
                    className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1">Min Oda</label>
                  <input
                    type="number"
                    value={form.min_rooms}
                    onChange={e => setForm(f => ({ ...f, min_rooms: e.target.value }))}
                    placeholder="2"
                    className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Şehir */}
              <div>
                <label className="block text-sm font-medium text-on-surface mb-2 flex items-center gap-1">
                  <MapPin size={13} /> Tercih Edilen Şehirler
                </label>
                <div className="flex flex-wrap gap-2">
                  {cities.map(city => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, preferred_cities: toggle(f.preferred_cities, city) }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        form.preferred_cities.includes(city)
                          ? 'bg-primary border-primary text-white'
                          : 'bg-surface-container border-outline text-on-surface-variant hover:border-primary/30'
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mülk Tipi */}
              <div>
                <label className="block text-sm font-medium text-on-surface mb-2">Tercih Edilen Mülk Tipleri</label>
                <div className="flex flex-wrap gap-2">
                  {propertyTypes.map(pt => (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, preferred_property_types: toggle(f.preferred_property_types, pt.value) }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        form.preferred_property_types.includes(pt.value)
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'bg-surface-container border-outline text-on-surface-variant hover:border-green-300'
                      }`}
                    >
                      {pt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notlar */}
        <div className="card">
          <label className="block text-sm font-medium text-on-surface mb-2">Notlar</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Müşteriyle ilgili özel notlar..."
            rows={3}
            className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        {/* Hata */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Butonlar */}
        <div className="flex items-center justify-end gap-3">
          <Link href="/crm" className="btn-secondary">İptal</Link>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {loading ? 'Kaydediliyor...' : 'Müşteri Kaydet'}
          </button>
        </div>
      </form>
    </div>
  )
}
