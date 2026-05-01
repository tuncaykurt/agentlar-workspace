'use client'

import { useState, useEffect } from 'react'
import type { MarketingLead } from '@/lib/types'
import {
  Users, Search, Plus, Mail, Phone, Briefcase,
  UserPlus, Loader2, Upload, Trash2, MapPin,
} from 'lucide-react'

const SOURCE_LABELS: Record<string, string> = {
  apify_google_maps: 'Google Maps',
  apify_linkedin_people: 'LinkedIn Kişi',
  apify_linkedin_company: 'LinkedIn Şirket',
  apify_emlak: 'Emlak Portal',
  manual_csv: 'CSV Import',
  manual: 'Manuel',
}

export default function LeadsPoolTab() {
  const [leads, setLeads] = useState<MarketingLead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [source, setSource] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [addForm, setAddForm] = useState({ full_name: '', email: '', phone: '', company: '', city: '', linkedin_url: '' })

  useEffect(() => { fetchLeads() }, [city, source])

  async function fetchLeads() {
    setLoading(true)
    const qs = new URLSearchParams()
    if (city) qs.set('city', city)
    if (source) qs.set('source', source)
    if (search) qs.set('q', search)
    const res = await fetch(`/api/leads?${qs}`)
    const j = await res.json()
    setLeads(j.leads || [])
    setLoading(false)
  }

  async function handleImport() {
    if (!csvText.trim()) return
    setImporting(true)
    try {
      const res = await fetch('/api/leads/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText, source: 'manual_csv', defaultCity: city || undefined }),
      })
      const j = await res.json()
      if (!res.ok) alert('Hata: ' + j.error)
      else {
        alert(`İçeri aktarıldı: ${j.imported}/${j.total} (atlanan: ${j.skipped})`)
        setCsvText(''); setShowImport(false); fetchLeads()
      }
    } finally {
      setImporting(false)
    }
  }

  async function handleAdd() {
    if (!addForm.email && !addForm.phone) { alert('En az email veya telefon gerekli'); return }
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    if (res.ok) {
      setAddForm({ full_name: '', email: '', phone: '', company: '', city: '', linkedin_url: '' })
      setShowAdd(false); fetchLeads()
    } else {
      const j = await res.json()
      alert('Hata: ' + j.error)
    }
  }

  async function handleConvert(id: string) {
    if (!confirm('Bu lead müşteriye dönüştürülsün mü?')) return
    setConvertingId(id)
    try {
      const res = await fetch(`/api/leads/${id}/convert`, { method: 'POST' })
      const j = await res.json()
      if (res.ok) { alert('Müşteriye dönüştürüldü'); fetchLeads() }
      else alert('Hata: ' + j.error)
    } finally {
      setConvertingId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Lead silinsin mi?')) return
    await fetch(`/api/leads/${id}`, { method: 'DELETE' })
    fetchLeads()
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 justify-between">
        <div className="flex flex-wrap gap-2 flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchLeads()}
              placeholder="İsim, email, şirket ara..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
          </div>
          <input value={city} onChange={e => setCity(e.target.value)} placeholder="Şehir"
            className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container w-32" />
          <select value={source} onChange={e => setSource(e.target.value)}
            className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container">
            <option value="">Tüm Kaynaklar</option>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(!showAdd)} className="btn-secondary flex items-center gap-1">
            <Plus size={14} /> Ekle
          </button>
          <button onClick={() => setShowImport(!showImport)} className="btn-secondary flex items-center gap-1">
            <Upload size={14} /> CSV Yükle
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card mb-4">
          <h4 className="font-semibold mb-3">Manuel Lead Ekle</h4>
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="Ad Soyad" value={addForm.full_name} onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))}
              className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
            <input placeholder="Email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
              className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
            <input placeholder="Telefon" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
              className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
            <input placeholder="Şirket" value={addForm.company} onChange={e => setAddForm(f => ({ ...f, company: e.target.value }))}
              className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
            <input placeholder="Şehir" value={addForm.city} onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))}
              className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
            <input placeholder="LinkedIn URL" value={addForm.linkedin_url} onChange={e => setAddForm(f => ({ ...f, linkedin_url: e.target.value }))}
              className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
          </div>
          <div className="flex justify-end mt-3">
            <button onClick={handleAdd} className="btn-primary">Kaydet</button>
          </div>
        </div>
      )}

      {showImport && (
        <div className="card mb-4">
          <h4 className="font-semibold mb-3">CSV Import</h4>
          <p className="text-xs text-on-surface-variant mb-2">
            Beklenen başlıklar: <code>full_name, email, phone, company, title, city, district, linkedin_url, website</code>
          </p>
          <textarea
            value={csvText} onChange={e => setCsvText(e.target.value)} rows={6}
            placeholder="full_name,email,phone,city&#10;Ahmet Yılmaz,ahmet@example.com,5551112233,Bursa"
            className="w-full px-3 py-2 text-xs font-mono border border-outline rounded-lg bg-surface-container resize-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setShowImport(false)} className="btn-secondary">İptal</button>
            <button onClick={handleImport} disabled={importing} className="btn-primary flex items-center gap-2">
              {importing && <Loader2 size={14} className="animate-spin" />} İçeri Aktar
            </button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <Users size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Henüz lead yok</p>
            <p className="text-xs mt-1">CSV yükleyin veya Scrape İşleri sekmesinden Apify ile çekin</p>
          </div>
        ) : (
          <div className="divide-y divide-outline max-h-[600px] overflow-y-auto">
            {leads.map(l => (
              <div key={l.id} className="flex items-center gap-3 p-3 hover:bg-surface-container-high text-sm">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{l.full_name || l.company || l.email}</span>
                    {l.unsubscribed && <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded">Listeden çıktı</span>}
                    {l.converted_to_client_id && <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded">Müşteri</span>}
                    <span className="text-xs px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant rounded">{SOURCE_LABELS[l.source] || l.source}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-on-surface-variant flex-wrap">
                    {l.email && <span className="flex items-center gap-1"><Mail size={11} />{l.email}</span>}
                    {l.phone && <span className="flex items-center gap-1"><Phone size={11} />{l.phone}</span>}
                    {l.linkedin_url && <a href={l.linkedin_url} target="_blank" className="flex items-center gap-1 text-blue-600"><Briefcase size={11} />LinkedIn</a>}
                    {l.city && <span className="flex items-center gap-1"><MapPin size={11} />{l.city}{l.district && ` / ${l.district}`}</span>}
                    {l.company && <span className="text-on-surface-variant">· {l.company}</span>}
                  </div>
                </div>
                {!l.converted_to_client_id && (
                  <button onClick={() => handleConvert(l.id)} disabled={convertingId === l.id}
                    className="btn-secondary text-xs flex items-center gap-1 px-2 py-1">
                    {convertingId === l.id ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                    Müşteriye dönüştür
                  </button>
                )}
                <button onClick={() => handleDelete(l.id)} className="text-red-500 hover:bg-red-50 rounded p-1.5">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
