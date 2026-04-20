'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { SocialPost } from '@/lib/types'
import {
  Share2, Plus, Clock,
  CheckCircle, Loader2, Sparkles, Image,
} from 'lucide-react'

const platformConfig: Record<string, { label: string; color: string }> = {
  instagram: { label: 'Instagram', color: 'bg-pink-50 text-pink-700' },
  facebook: { label: 'Facebook', color: 'bg-primary-container text-primary' },
  linkedin: { label: 'LinkedIn', color: 'bg-sky-50 text-sky-700' },
  twitter: { label: 'Twitter/X', color: 'bg-surface-container-high text-on-surface' },
}

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: 'Taslak', color: 'bg-surface-container-high text-on-surface-variant' },
  scheduled: { label: 'Planlandı', color: 'bg-primary-container text-primary' },
  posted: { label: 'Yayınlandı', color: 'bg-green-100 text-green-700' },
  failed: { label: 'Hata', color: 'bg-red-100 text-red-600' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SocialPage() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    platform: 'instagram',
    content_text: '',
    property_desc: '',
    scheduled_at: '',
  })

  useEffect(() => { fetchPosts() }, [])

  async function fetchPosts() {
    const supabase = createClient()
    const { data } = await supabase
      .from('social_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setPosts(data as SocialPost[])
    setLoading(false)
  }

  async function generateContent() {
    if (!form.property_desc.trim()) return
    setGenerating(true)
    try {
      const res = await fetch('/api/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property: form.property_desc,
          platform: form.platform,
        }),
      })
      const data = await res.json()
      if (data.content) setForm(f => ({ ...f, content_text: data.content }))
    } catch {
      // ignore
    }
    setGenerating(false)
  }

  async function handleSave() {
    if (!form.content_text.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: consultant } = await supabase
      .from('consultants').select('id').eq('user_id', user?.id).single()

    await supabase.from('social_posts').insert({
      consultant_id: consultant?.id,
      platform: form.platform,
      content_text: form.content_text.trim(),
      status: form.scheduled_at ? 'scheduled' : 'draft',
      scheduled_at: form.scheduled_at || null,
    })

    setForm({ platform: 'instagram', content_text: '', property_desc: '', scheduled_at: '' })
    setShowForm(false)
    setSaving(false)
    fetchPosts()
  }

  const postedCount = posts.filter(p => p.status === 'posted').length
  const scheduledCount = posts.filter(p => p.status === 'scheduled').length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Sosyal Medya</h1>
          <p className="text-on-surface-variant text-sm mt-1">AI destekli içerik üretimi ve paylaşım takvimi</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Yeni İçerik
        </button>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Toplam İçerik', value: posts.length, icon: Image, color: 'blue' },
          { label: 'Yayınlanan', value: postedCount, icon: CheckCircle, color: 'green' },
          { label: 'Planlanmış', value: scheduledCount, icon: Clock, color: 'orange' },
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

      {/* Yeni İçerik Formu */}
      {showForm && (
        <div className="card mb-6 border-pink-200 bg-pink-50">
          <h3 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <Sparkles size={16} className="text-pink-600" /> Yeni İçerik Oluştur
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Platform</label>
              <select
                value={form.platform}
                onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {Object.entries(platformConfig).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Mülk Bilgisi (AI için)</label>
              <input
                value={form.property_desc}
                onChange={e => setForm(f => ({ ...f, property_desc: e.target.value }))}
                placeholder="Örn: Bursa Mudanya'da 4.5+1 satılık daire, 250m², havuzlu site, 26.5M TL"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              onClick={generateContent}
              disabled={generating || !form.property_desc.trim()}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-pink-300 text-pink-700 bg-surface-container hover:bg-pink-50 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI ile İçerik Üret
            </button>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">İçerik Metni</label>
              <textarea
                value={form.content_text}
                onChange={e => setForm(f => ({ ...f, content_text: e.target.value }))}
                rows={5}
                placeholder="Post içeriği burada görünecek veya kendiniz yazabilirsiniz..."
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Yayın Tarihi (opsiyonel)</label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">İptal</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.content_text.trim()}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* İçerik Listesi */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <Share2 size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Henüz içerik yok</p>
            <p className="text-xs mt-1">AI ile mülk ilanlarınız için otomatik post oluşturun</p>
          </div>
        ) : (
          <div className="divide-y divide-outline">
            {posts.map(p => {
              const pl = platformConfig[p.platform] || { label: p.platform, color: 'bg-surface-container-high text-on-surface-variant' }
              const st = statusConfig[p.status] || statusConfig.draft
              return (
                <div key={p.id} className="flex items-start gap-4 p-4 hover:bg-surface-container-high">
                  <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center flex-shrink-0">
                    <Share2 size={18} className="text-pink-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${pl.color}`}>{pl.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    </div>
                    <p className="text-sm text-on-surface line-clamp-2">{p.content_text}</p>
                    <p className="text-xs text-on-surface-variant mt-1">{formatDate(p.created_at)}</p>
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
