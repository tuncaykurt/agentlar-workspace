'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { ClientType, LeadStatus, PropertyType, ListingSource } from '@/lib/types'
import { ArrowLeft, Save, User, Phone, Mail, MapPin, Home, DollarSign, Calendar, Loader2, Trash2 } from 'lucide-react'

const SALUTATIONS = [
  '', 'Bey', 'Hanım', 'Dr.', 'Op. Dr.', 'Uzm. Dr.', 'Av.', 'Prof.', 'Prof. Dr.',
  'Doç.', 'Müh.', 'Ecz.', 'Dt.', 'Öğretmen', 'Arh.', 'Psik.', 'Vet.',
]

const PREDEFINED_TAGS = ['Emlakçı', 'VIP', 'Yatırımcı', 'Aktif Alıcı', 'Taşınma Planlıyor', 'Sektör Bağlantısı', 'Referans Kaynağı']

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
  { value: 'won', label: 'Kazanıldı' },
  { value: 'lost', label: 'Kaybedildi' },
  { value: 'dormant', label: 'Pasif' },
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

export default function EditClientPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [form, setForm] = useState({
    full_name: '',
    salutation: '',
    phone: '',
    email: '',
    birth_date: '',
    client_type: 'buyer' as ClientType,
    lead_status: 'new' as LeadStatus,
    source: 'other' as ListingSource,
    notes: '',
    tags: [] as string[],
    budget_min: '',
    budget_max: '',
    preferred_cities: [] as string[],
    preferred_property_types: [] as PropertyType[],
    min_m2: '',
    max_m2: '',
    min_rooms: '',
  })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.from('clients').select('*').eq('id', id).single()
      if (data) {
        setForm({
          full_name: data.full_name || '',
          salutation: data.salutation || '',
          phone: data.phone || '',
          email: data.email || '',
          birth_date: data.birth_date || '',
          client_type: data.client_type || 'buyer',
          lead_status: data.lead_status || 'new',
          source: data.source || 'other',
          notes: data.notes || '',
          tags: data.tags || [],
          budget_min: data.budget_min ? String(data.budget_min) : '',
          budget_max: data.budget_max ? String(data.budget_max) : '',
          preferred_cities: data.preferred_cities || [],
          preferred_property_types: data.preferred_property_types || [],
          min_m2: data.min_m2 ? String(data.min_m2) : '',
          max_m2: data.max_m2 ? String(data.max_m2) : '',
          min_rooms: data.min_rooms ? String(data.min_rooms) : '',
        })
      }
      setFetching(false)
    }
    load()
  }, [id])

  const isBuyer = ['buyer', 'both', 'investor', 'tenant'].includes(form.client_type)

  function toggle<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Ad Soyad zorunludur.'); return }
    setLoading(true)
    setError('')

    const supabase = createClient()
    const payload: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      salutation: form.salutation.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      birth_date: form.birth_date || null,
      client_type: form.client_type,
      lead_status: form.lead_status,
      source: form.source,
      notes: form.notes.trim() || null,
      tags: form.tags,
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

    const { error: updateError } = await supabase.from('clients').update(payload).eq('id', id)

    if (updateError) {
      setError('Kaydedilemedi: ' + updateError.message)
      setLoading(false)
      return
    }
    router.push(`/crm/${id}`)
  }

  async function handleDelete() {
    const supabase = createClient()
    await supabase.from('clients').update({ is_active: false }).eq('id', id)
    router.push('/crm')
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/crm/${id}`} className="text-on-surface-variant hover:text-on-surface transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-on-surface">Müşteri Düzenle</h1>
          <p className="text-on-surface-variant text-sm">{form.full_name}</p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
        >
          <Trash2 size={15} /> Sil
        </button>
      </div>

      {confirmDelete && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
          <p className="text-sm text-red-700 font-medium">Bu müşteriyi silmek istediğinizden emin misiniz?</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="btn-secondary text-sm">İptal</button>
            <button onClick={handleDelete} className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-700">Evet, Sil</button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <User size={16} /> Temel Bilgiler
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-on-surface mb-1">Ad Soyad <span className="text-red-500">*</span></label>
                <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="w-36">
                <label className="block text-sm font-medium text-on-surface mb-1">Hitap</label>
                <select value={form.salutation} onChange={e => setForm(f => ({ ...f, salutation: e.target.value }))}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary">
                  {SALUTATIONS.map(s => <option key={s} value={s}>{s || '—'}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1 flex items-center gap-1"><Phone size={13} /> Telefon</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="05XX XXX XXXX"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1 flex items-center gap-1"><Mail size={13} /> E-posta</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ahmet@email.com"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1 flex items-center gap-1"><Calendar size={13} /> Doğum Tarihi</label>
              <input type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
        </div>

        {/* Etiketler */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-3">Etiketler</h2>
          <div className="flex flex-wrap gap-2">
            {PREDEFINED_TAGS.map(tag => (
              <button key={tag} type="button"
                onClick={() => setForm(f => ({ ...f, tags: toggle(f.tags, tag) }))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  form.tags.includes(tag)
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-surface-container border-outline text-on-surface-variant hover:border-indigo-300'
                }`}>
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-on-surface mb-4">Sınıflandırma</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Müşteri Tipi</label>
              <select value={form.client_type} onChange={e => setForm(f => ({ ...f, client_type: e.target.value as ClientType }))}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container">
                {clientTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Durum</label>
              <select value={form.lead_status} onChange={e => setForm(f => ({ ...f, lead_status: e.target.value as LeadStatus }))}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container">
                {leadStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Kaynak</label>
              <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value as ListingSource }))}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container">
                {sources.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {isBuyer && (
          <div className="card">
            <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
              <Home size={16} /> Arama Kriterleri
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-2 flex items-center gap-1"><DollarSign size={13} /> Bütçe Aralığı (₺)</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={form.budget_min} onChange={e => setForm(f => ({ ...f, budget_min: e.target.value }))} placeholder="Min"
                    className="flex-1 border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <span className="text-on-surface-variant">—</span>
                  <input type="number" value={form.budget_max} onChange={e => setForm(f => ({ ...f, budget_max: e.target.value }))} placeholder="Max"
                    className="flex-1 border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1">Min m²</label>
                  <input type="number" value={form.min_m2} onChange={e => setForm(f => ({ ...f, min_m2: e.target.value }))} placeholder="60"
                    className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1">Max m²</label>
                  <input type="number" value={form.max_m2} onChange={e => setForm(f => ({ ...f, max_m2: e.target.value }))} placeholder="150"
                    className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1">Min Oda</label>
                  <input type="number" value={form.min_rooms} onChange={e => setForm(f => ({ ...f, min_rooms: e.target.value }))} placeholder="2"
                    className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface mb-2 flex items-center gap-1"><MapPin size={13} /> Tercih Edilen Şehirler</label>
                <div className="flex flex-wrap gap-2">
                  {cities.map(city => (
                    <button key={city} type="button" onClick={() => setForm(f => ({ ...f, preferred_cities: toggle(f.preferred_cities, city) }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        form.preferred_cities.includes(city)
                          ? 'bg-primary border-primary text-white'
                          : 'bg-surface-container border-outline text-on-surface-variant hover:border-primary/30'
                      }`}>
                      {city}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface mb-2">Tercih Edilen Mülk Tipleri</label>
                <div className="flex flex-wrap gap-2">
                  {propertyTypes.map(pt => (
                    <button key={pt.value} type="button" onClick={() => setForm(f => ({ ...f, preferred_property_types: toggle(f.preferred_property_types, pt.value) }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        form.preferred_property_types.includes(pt.value)
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'bg-surface-container border-outline text-on-surface-variant hover:border-green-300'
                      }`}>
                      {pt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <label className="block text-sm font-medium text-on-surface mb-2">Notlar</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Müşteriyle ilgili özel notlar..." rows={3}
            className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        <div className="flex items-center justify-end gap-3">
          <Link href={`/crm/${id}`} className="btn-secondary">İptal</Link>
          <button type="submit" disabled={loading}
            className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {loading ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </button>
        </div>
      </form>
    </div>
  )
}
