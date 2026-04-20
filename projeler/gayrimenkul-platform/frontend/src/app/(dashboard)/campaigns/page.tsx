'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Campaign, Client } from '@/lib/types'
import {
  Megaphone, Plus, Send, Users, CheckCircle,
  Clock, XCircle, Loader2, MessageSquare,
} from 'lucide-react'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Taslak', color: 'bg-surface-container-high text-on-surface-variant', icon: Clock },
  scheduled: { label: 'Planlandı', color: 'bg-primary-container text-primary', icon: Clock },
  sending: { label: 'Gönderiliyor', color: 'bg-yellow-100 text-yellow-700', icon: Loader2 },
  completed: { label: 'Tamamlandı', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  cancelled: { label: 'İptal', color: 'bg-red-100 text-red-600', icon: XCircle },
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    message_template: '',
    target_type: 'all', // all | buyer | seller
  })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const supabase = createClient()
    const [campRes, clientRes] = await Promise.all([
      supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, full_name, phone, client_type').eq('is_active', true),
    ])
    if (campRes.data) setCampaigns(campRes.data as Campaign[])
    if (clientRes.data) setClients(clientRes.data as Client[])
    setLoading(false)
  }

  const targetClients = clients.filter(c => {
    if (form.target_type === 'all') return true
    if (form.target_type === 'buyer') return ['buyer', 'both', 'investor', 'tenant'].includes(c.client_type)
    if (form.target_type === 'seller') return ['seller', 'both', 'landlord'].includes(c.client_type)
    return true
  })

  async function handleCreate() {
    if (!form.name.trim() || !form.message_template.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: consultant } = await supabase
      .from('consultants').select('id').eq('user_id', user?.id).single()

    await supabase.from('campaigns').insert({
      name: form.name.trim(),
      message_template: form.message_template.trim(),
      consultant_id: consultant?.id,
      status: 'draft',
      target_count: targetClients.length,
      sent_count: 0,
      failed_count: 0,
    })

    setForm({ name: '', message_template: '', target_type: 'all' })
    setShowForm(false)
    setSaving(false)
    fetchData()
  }

  const totalSent = campaigns.reduce((a, c) => a + c.sent_count, 0)
  const completed = campaigns.filter(c => c.status === 'completed').length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Kampanyalar</h1>
          <p className="text-on-surface-variant text-sm mt-1">WhatsApp toplu mesaj kampanyaları</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Yeni Kampanya
        </button>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Toplam Kampanya', value: campaigns.length, icon: Megaphone, color: 'blue' },
          { label: 'Tamamlanan', value: completed, icon: CheckCircle, color: 'green' },
          { label: 'Toplam Gönderim', value: totalSent, icon: Send, color: 'purple' },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="stat-card">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-on-surface-variant">{s.label}</p>
                <div className={`w-8 h-8 rounded-lg bg-${s.color}-50 flex items-center justify-center`}>
                  <Icon size={15} className={`text-${s.color}-600`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-on-surface">{s.value}</p>
            </div>
          )
        })}
      </div>

      {/* Yeni Kampanya Formu */}
      {showForm && (
        <div className="card mb-6 border-primary/20 bg-primary-container">
          <h3 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <MessageSquare size={16} className="text-primary" /> Yeni Kampanya Oluştur
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Kampanya Adı</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Bahar Kampanyası 2026"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Hedef Kitle</label>
              <select
                value={form.target_type}
                onChange={e => setForm(f => ({ ...f, target_type: e.target.value }))}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">Tüm Müşteriler ({clients.length} kişi)</option>
                <option value="buyer">Alıcılar ({clients.filter(c => ['buyer','both','investor','tenant'].includes(c.client_type)).length} kişi)</option>
                <option value="seller">Satıcılar ({clients.filter(c => ['seller','both','landlord'].includes(c.client_type)).length} kişi)</option>
              </select>
              <p className="text-xs text-on-surface-variant mt-1">
                Seçilen hedef: <strong>{targetClients.length} kişi</strong>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Mesaj Şablonu</label>
              <textarea
                value={form.message_template}
                onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
                rows={4}
                placeholder="Merhaba {isim}, size özel bir fırsatımız var..."
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <p className="text-xs text-on-surface-variant mt-1">
                <code className="bg-surface-container-high px-1 rounded">{'{isim}'}</code> kullanıcı adıyla otomatik değiştirilir.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">İptal</button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.name.trim() || !form.message_template.trim()}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Taslak Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kampanya Listesi */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <Megaphone size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Henüz kampanya yok</p>
            <p className="text-xs mt-1">Yeni kampanya oluşturun ve WhatsApp üzerinden gönderin</p>
          </div>
        ) : (
          <div className="divide-y divide-outline">
            {campaigns.map(c => {
              const st = statusConfig[c.status] || statusConfig.draft
              const StIcon = st.icon
              return (
                <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-surface-container-high">
                  <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center flex-shrink-0">
                    <Megaphone size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-on-surface text-sm truncate">{c.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{c.message_template}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{formatDate(c.created_at)}</p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${st.color}`}>
                      <StIcon size={10} /> {st.label}
                    </span>
                    <div className="flex items-center gap-1 justify-end text-xs text-on-surface-variant">
                      <Users size={10} />
                      <span>{c.sent_count}/{c.target_count}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
