'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Campaign } from '@/lib/types'
import {
  Mail, Plus, Send, CheckCircle, Clock, XCircle, Loader2, Eye, MousePointer,
} from 'lucide-react'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Taslak', color: 'bg-surface-container-high text-on-surface-variant', icon: Clock },
  sending: { label: 'Gönderiliyor', color: 'bg-yellow-100 text-yellow-700', icon: Loader2 },
  completed: { label: 'Tamamlandı', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  cancelled: { label: 'İptal', color: 'bg-red-100 text-red-600', icon: XCircle },
}

export default function EmailCampaignsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [leadCount, setLeadCount] = useState(0)
  const [clientCount, setClientCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    subject: '',
    from_name: '',
    audience_source: 'leads' as 'clients' | 'leads' | 'mixed',
    filter_city: '',
    filter_source: '',
    html_template: '<p>Merhaba {isim},</p>\n<p>Yeni portföyümüzü sizinle paylaşmak istedik...</p>\n<p>Saygılarımızla<br>Ambiance Gayrimenkul</p>',
  })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const supabase = createClient()
    const [c, l, cl] = await Promise.all([
      supabase.from('campaigns').select('*').eq('channel', 'email').order('created_at', { ascending: false }),
      supabase.from('marketing_leads').select('id', { count: 'exact', head: true }).eq('unsubscribed', false),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true).not('email', 'is', null),
    ])
    if (c.data) setCampaigns(c.data as Campaign[])
    setLeadCount(l.count || 0)
    setClientCount(cl.count || 0)
    setLoading(false)
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.subject.trim() || !form.html_template.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: consultant } = await supabase
      .from('consultants').select('id').eq('user_id', user?.id).single()

    const lead_filter: Record<string, string> = {}
    if (form.filter_city) lead_filter.city = form.filter_city
    if (form.filter_source) lead_filter.source = form.filter_source

    await supabase.from('campaigns').insert({
      name: form.name.trim(),
      channel: 'email',
      audience_source: form.audience_source,
      lead_filter: Object.keys(lead_filter).length ? lead_filter : null,
      subject: form.subject.trim(),
      from_name: form.from_name.trim() || null,
      html_template: form.html_template,
      message_template: form.subject.trim(),
      consultant_id: consultant?.id,
      status: 'draft',
    })

    setForm({ ...form, name: '', subject: '' })
    setShowForm(false)
    setSaving(false)
    fetchData()
  }

  async function handleSend(id: string) {
    if (!confirm('E-posta kampanyası başlatılsın mı?')) return
    setSendingId(id)
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) alert('Hata: ' + (j.error || 'Bilinmeyen'))
      else alert(`Tamamlandı. Gönderilen: ${j.sent}, Başarısız: ${j.failed}`)
    } finally {
      setSendingId(null)
      fetchData()
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Yeni Email Kampanyası
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Aktif Lead', value: leadCount, icon: Mail },
          { label: 'Müşteri (mail)', value: clientCount, icon: Mail },
          { label: 'Toplam Açılma', value: campaigns.reduce((a, c) => a + (c.opened_count || 0), 0), icon: Eye },
          { label: 'Toplam Tık', value: campaigns.reduce((a, c) => a + (c.clicked_count || 0), 0), icon: MousePointer },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="stat-card">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-on-surface-variant">{s.label}</p>
                <Icon size={15} className="text-on-surface-variant" />
              </div>
              <p className="text-2xl font-bold text-on-surface">{s.value}</p>
            </div>
          )
        })}
      </div>

      {showForm && (
        <div className="card mb-6 border-primary/20 bg-primary-container">
          <h3 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <Mail size={16} className="text-primary" /> Yeni Email Kampanyası
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Kampanya Adı</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Gönderen Adı (ops.)</label>
                <input value={form.from_name} onChange={e => setForm(f => ({ ...f, from_name: e.target.value }))}
                  placeholder="Ambiance Gayrimenkul"
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Konu Satırı</label>
              <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="{isim}, size özel yatırım fırsatı"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Hedef</label>
                <select value={form.audience_source} onChange={e => setForm(f => ({ ...f, audience_source: e.target.value as 'clients' | 'leads' | 'mixed' }))}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container">
                  <option value="leads">Lead Havuzu</option>
                  <option value="clients">Müşteriler (CRM)</option>
                  <option value="mixed">Hepsi</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Şehir Filtresi</label>
                <input value={form.filter_city} onChange={e => setForm(f => ({ ...f, filter_city: e.target.value }))}
                  placeholder="Bursa"
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Lead Kaynak</label>
                <select value={form.filter_source} onChange={e => setForm(f => ({ ...f, filter_source: e.target.value }))}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container">
                  <option value="">Tümü</option>
                  <option value="apify_google_maps">Google Maps</option>
                  <option value="apify_linkedin_people">LinkedIn Kişiler</option>
                  <option value="apify_linkedin_company">LinkedIn Şirketler</option>
                  <option value="manual_csv">CSV Import</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">HTML İçerik</label>
              <textarea value={form.html_template} onChange={e => setForm(f => ({ ...f, html_template: e.target.value }))}
                rows={8}
                className="w-full border border-outline rounded-lg px-3 py-2 text-xs font-mono bg-surface-container resize-none" />
              <p className="text-xs text-on-surface-variant mt-1">
                Değişkenler: <code>{'{isim}'}</code> <code>{'{ad_soyad}'}</code> <code>{'{sirket}'}</code> <code>{'{unvan}'}</code> <code>{'{sehir}'}</code>
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">İptal</button>
              <button onClick={handleCreate} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Taslak Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <Mail size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Henüz email kampanyası yok</p>
          </div>
        ) : (
          <div className="divide-y divide-outline">
            {campaigns.map(c => {
              const st = statusConfig[c.status] || statusConfig.draft
              const StIcon = st.icon
              return (
                <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-surface-container-high">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Mail size={18} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-on-surface text-sm truncate">{c.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5 truncate">{c.subject}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{formatDate(c.created_at)}</p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${st.color}`}>
                      <StIcon size={10} /> {st.label}
                    </span>
                    <div className="flex items-center gap-3 justify-end text-xs text-on-surface-variant">
                      <span>{c.sent_count}/{c.target_count}</span>
                      <span className="flex items-center gap-1"><Eye size={10} /> {c.opened_count || 0}</span>
                    </div>
                  </div>
                  {c.status === 'draft' && (
                    <button onClick={() => handleSend(c.id)} disabled={sendingId === c.id}
                      className="btn-primary text-xs flex items-center gap-1 px-3 py-1.5 disabled:opacity-50">
                      {sendingId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Gönder
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
