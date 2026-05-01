'use client'

import { useState, useEffect } from 'react'
import type { LeadScrapeJob } from '@/lib/types'
import {
  Search, Loader2, RefreshCw, Download, MapPin, Briefcase, Building2, Plus,
  CheckCircle, XCircle, Clock,
} from 'lucide-react'

const JOB_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  google_maps:      { label: 'Google Maps',     icon: MapPin,    color: 'text-red-600' },
  linkedin_people:  { label: 'LinkedIn Kişiler', icon: Briefcase, color: 'text-blue-600' },
  linkedin_company: { label: 'LinkedIn Şirket',  icon: Building2, color: 'text-blue-700' },
  linkedin_message: { label: 'LinkedIn Mesaj',   icon: Briefcase, color: 'text-purple-600' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: 'Bekliyor',  color: 'bg-surface-container-high text-on-surface-variant', icon: Clock },
  running:   { label: 'Çalışıyor', color: 'bg-yellow-100 text-yellow-700', icon: Loader2 },
  succeeded: { label: 'Tamam',     color: 'bg-green-100 text-green-700',   icon: CheckCircle },
  failed:    { label: 'Hata',      color: 'bg-red-100 text-red-600',       icon: XCircle },
}

export default function ScrapeJobsTab() {
  const [jobs, setJobs] = useState<LeadScrapeJob[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [starting, setStarting] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    job_type: 'google_maps' as 'google_maps' | 'linkedin_people' | 'linkedin_company',
    query: '',
    city: '',
    district: '',
    max_results: 100,
    search_url: '',
    company_urls: '',
  })

  useEffect(() => { fetchJobs() }, [])

  async function fetchJobs() {
    setLoading(true)
    const res = await fetch('/api/leads/scrape')
    const j = await res.json()
    setJobs(j.jobs || [])
    setLoading(false)
  }

  async function handleStart() {
    if (form.job_type === 'google_maps' && !form.query) { alert('Arama sorgusu gerekli'); return }
    if (form.job_type === 'linkedin_people' && !form.search_url && !form.query) { alert('Sorgu veya search URL gerekli'); return }
    if (form.job_type === 'linkedin_company' && !form.company_urls.trim()) { alert('En az 1 şirket URL gerekli'); return }

    setStarting(true)
    try {
      const body: Record<string, unknown> = {
        job_type: form.job_type,
        query: form.query,
        city: form.city,
        district: form.district,
        max_results: form.max_results,
      }
      if (form.search_url) body.search_url = form.search_url
      if (form.company_urls) body.company_urls = form.company_urls.split('\n').map(s => s.trim()).filter(Boolean)

      const res = await fetch('/api/leads/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) alert('Hata: ' + j.error)
      else {
        alert(`Apify scrape başlatıldı. Run ID: ${j.apify_run_id}`)
        setShowForm(false)
        fetchJobs()
      }
    } finally {
      setStarting(false)
    }
  }

  async function handleRefresh(id: string) {
    setRefreshingId(id)
    try {
      await fetch(`/api/leads/scrape/${id}`)
      fetchJobs()
    } finally {
      setRefreshingId(null)
    }
  }

  async function handleImport(id: string) {
    setImportingId(id)
    try {
      const res = await fetch(`/api/leads/scrape/${id}`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) alert('Hata: ' + j.error)
      else alert(`Çekilen: ${j.fetched}, Kaydedilen: ${j.imported}, Atlanan: ${j.skipped_no_contact}`)
      fetchJobs()
    } finally {
      setImportingId(null)
    }
  }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <button onClick={fetchJobs} className="btn-secondary flex items-center gap-1">
          <RefreshCw size={14} /> Yenile
        </button>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Yeni Scrape İşi
        </button>
      </div>

      {showForm && (
        <div className="card mb-4 border-primary/20 bg-primary-container">
          <h4 className="font-semibold mb-3 flex items-center gap-2"><Search size={16} className="text-primary" /> Apify ile Lead Scrape</h4>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <button onClick={() => setForm(f => ({ ...f, job_type: 'google_maps' }))}
              className={`p-3 border rounded-lg text-left ${form.job_type === 'google_maps' ? 'border-primary bg-surface-container' : 'border-outline'}`}>
              <MapPin size={18} className="text-red-600 mb-1" />
              <p className="font-medium text-sm">Google Maps</p>
              <p className="text-xs text-on-surface-variant">Bölgedeki işletmeler (mail+telefon dahil)</p>
            </button>
            <button onClick={() => setForm(f => ({ ...f, job_type: 'linkedin_people' }))}
              className={`p-3 border rounded-lg text-left ${form.job_type === 'linkedin_people' ? 'border-primary bg-surface-container' : 'border-outline'}`}>
              <Briefcase size={18} className="text-blue-600 mb-1" />
              <p className="font-medium text-sm">LinkedIn Kişiler</p>
              <p className="text-xs text-on-surface-variant">Bölgedeki profesyoneller</p>
            </button>
            <button onClick={() => setForm(f => ({ ...f, job_type: 'linkedin_company' }))}
              className={`p-3 border rounded-lg text-left ${form.job_type === 'linkedin_company' ? 'border-primary bg-surface-container' : 'border-outline'}`}>
              <Building2 size={18} className="text-blue-700 mb-1" />
              <p className="font-medium text-sm">LinkedIn Şirket</p>
              <p className="text-xs text-on-surface-variant">B2B (ofis/dükkan ihtiyacı)</p>
            </button>
          </div>

          <div className="space-y-3">
            {form.job_type === 'google_maps' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <input value={form.query} onChange={e => setForm(f => ({ ...f, query: e.target.value }))}
                    placeholder="emlak ofisi / kafe / cafe / berber"
                    className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container col-span-2" />
                  <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Şehir (Bursa)" className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
                </div>
                <input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                  placeholder="İlçe (Nilüfer)" className="w-full px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
              </>
            )}
            {form.job_type === 'linkedin_people' && (
              <>
                <input value={form.query} onChange={e => setForm(f => ({ ...f, query: e.target.value }))}
                  placeholder="Anahtar kelime (CEO, mühendis, doktor...)"
                  className="w-full px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
                <input value={form.search_url} onChange={e => setForm(f => ({ ...f, search_url: e.target.value }))}
                  placeholder="LinkedIn arama URL'i (opsiyonel ama daha kesin)"
                  className="w-full px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Şehir" className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
                  <input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                    placeholder="Lokasyon ek" className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
                </div>
              </>
            )}
            {form.job_type === 'linkedin_company' && (
              <textarea value={form.company_urls} onChange={e => setForm(f => ({ ...f, company_urls: e.target.value }))}
                rows={4} placeholder="https://www.linkedin.com/company/example1&#10;https://www.linkedin.com/company/example2"
                className="w-full px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container resize-none" />
            )}
            <div className="flex items-center gap-3">
              <label className="text-sm">Maks. sonuç:</label>
              <input type="number" value={form.max_results} onChange={e => setForm(f => ({ ...f, max_results: parseInt(e.target.value) || 100 }))}
                className="w-24 px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container" />
              <p className="text-xs text-on-surface-variant flex-1">Her iş Apify kredisi tüketir.</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="btn-secondary">İptal</button>
              <button onClick={handleStart} disabled={starting} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {starting && <Loader2 size={14} className="animate-spin" />} Scrape Başlat
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <Search size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Henüz scrape işi yok</p>
          </div>
        ) : (
          <div className="divide-y divide-outline">
            {jobs.map(j => {
              const meta = JOB_LABELS[j.job_type] || JOB_LABELS.google_maps
              const st = STATUS_CONFIG[j.status] || STATUS_CONFIG.pending
              const StIcon = st.icon
              const Icon = meta.icon
              const inputAny = j.input as Record<string, unknown>
              return (
                <div key={j.id} className="flex items-center gap-3 p-3 text-sm">
                  <Icon size={18} className={meta.color} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{meta.label}</p>
                    <p className="text-xs text-on-surface-variant truncate">
                      {String(inputAny.query || inputAny.searchKeywords || inputAny.searchStringsArray || '')}
                      {inputAny.locationQuery ? ` · ${inputAny.locationQuery}` : ''}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {new Date(j.created_at).toLocaleString('tr-TR')}
                      {j.cost_usd ? ` · $${j.cost_usd}` : ''}
                      {j.result_count ? ` · ${j.result_count} sonuç` : ''}
                      {j.imported_count ? ` · ${j.imported_count} eklendi` : ''}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${st.color}`}>
                    <StIcon size={10} className={j.status === 'running' ? 'animate-spin' : ''} /> {st.label}
                  </span>
                  {(j.status === 'pending' || j.status === 'running') && (
                    <button onClick={() => handleRefresh(j.id)} disabled={refreshingId === j.id}
                      className="btn-secondary text-xs flex items-center gap-1 px-2 py-1">
                      {refreshingId === j.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                    </button>
                  )}
                  {j.status === 'succeeded' && j.imported_count === 0 && (
                    <button onClick={() => handleImport(j.id)} disabled={importingId === j.id}
                      className="btn-primary text-xs flex items-center gap-1 px-2 py-1">
                      {importingId === j.id ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                      Lead havuzuna al
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
