'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { MarketingLead } from '@/lib/types'
import {
  Briefcase, Send, Loader2, AlertTriangle, Save, Check,
} from 'lucide-react'

export default function LinkedInOutreachTab() {
  const [leads, setLeads] = useState<MarketingLead[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [city, setCity] = useState('')
  const [cookie, setCookie] = useState('')
  const [savedCookie, setSavedCookie] = useState(false)
  const [savingCookie, setSavingCookie] = useState(false)
  const [message, setMessage] = useState('Merhaba {isim},\n\n{sirket} ekibinizdeki yatırım fırsatlarını paylaşmak için size ulaşmak istedim. Müsait olduğunuzda kısa bir görüşme yapabilir miyiz?\n\nSaygılarımla')
  const [sending, setSending] = useState(false)

  useEffect(() => { fetchLeads(); fetchCookie() }, [])

  async function fetchLeads() {
    setLoading(true)
    const qs = new URLSearchParams()
    if (city) qs.set('city', city)
    const res = await fetch(`/api/leads?${qs}`)
    const j = await res.json()
    setLeads((j.leads || []).filter((l: MarketingLead) => l.linkedin_url && !l.unsubscribed))
    setLoading(false)
  }

  async function fetchCookie() {
    const supabase = createClient()
    const { data } = await supabase.from('settings').select('value').eq('key', 'linkedin_cookie').maybeSingle()
    if (data?.value) setSavedCookie(true)
  }

  async function saveCookie() {
    if (!cookie.trim()) return
    setSavingCookie(true)
    const supabase = createClient()
    await supabase.from('settings').upsert({ key: 'linkedin_cookie', value: cookie.trim() })
    setSavedCookie(true); setCookie(''); setSavingCookie(false)
  }

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  function toggleAll() {
    if (selected.size === leads.length) setSelected(new Set())
    else setSelected(new Set(leads.map(l => l.id)))
  }

  async function handleSend() {
    if (selected.size === 0) { alert('En az 1 lead seçin'); return }
    if (selected.size > 30) {
      if (!confirm(`${selected.size} kişiye mesaj atılacak. LinkedIn günde 20-30 mesaj sınırı uygular. Devam edilsin mi?`)) return
    }
    setSending(true)
    try {
      const res = await fetch('/api/leads/linkedin-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: Array.from(selected), message_template: message }),
      })
      const j = await res.json()
      if (!res.ok) alert('Hata: ' + j.error)
      else {
        alert(`Apify run başlatıldı: ${j.target_count} lead\n${j.warning || ''}`)
        setSelected(new Set())
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div className="card mb-4 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20">
        <div className="flex gap-3">
          <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-yellow-900 dark:text-yellow-200">LinkedIn Otomasyon Riski</p>
            <p className="text-yellow-800 dark:text-yellow-300 mt-1 text-xs">
              LinkedIn ToS otomatik mesajlaşmayı yasaklar. Apify aktörü kendi cookie'nizi kullanır;
              hesap geçici/kalıcı kısıtlanabilir. Günde <strong>20-30 mesaj</strong> üstüne çıkmayın,
              mesajlar arası <strong>30-90 saniye</strong> bırakın.
            </p>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <h4 className="font-semibold mb-3 flex items-center gap-2"><Briefcase size={16} className="text-blue-600" /> LinkedIn Cookie</h4>
        <p className="text-xs text-on-surface-variant mb-2">
          LinkedIn'e tarayıcıdan giriş yapın → DevTools → Application → Cookies → <code>li_at</code> değerini kopyalayın.
        </p>
        <div className="flex gap-2 items-center">
          <input
            type="password" value={cookie} onChange={e => setCookie(e.target.value)}
            placeholder={savedCookie ? '✓ Cookie kayıtlı (üzerine yazmak için yapıştırın)' : 'li_at değeri'}
            className="flex-1 px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container font-mono"
          />
          <button onClick={saveCookie} disabled={!cookie.trim() || savingCookie} className="btn-primary flex items-center gap-1 disabled:opacity-50">
            {savingCookie ? <Loader2 size={14} className="animate-spin" /> : savedCookie ? <Check size={14} /> : <Save size={14} />}
            Kaydet
          </button>
        </div>
      </div>

      <div className="card mb-4">
        <h4 className="font-semibold mb-2">Mesaj Şablonu</h4>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6}
          className="w-full px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container resize-none" />
        <p className="text-xs text-on-surface-variant mt-1">
          Değişkenler: <code>{'{isim}'}</code> <code>{'{ad_soyad}'}</code> <code>{'{sirket}'}</code> <code>{'{unvan}'}</code>
        </p>
      </div>

      <div className="flex items-center justify-between mb-3">
        <input value={city} onChange={e => setCity(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchLeads()}
          placeholder="Şehir filtresi (Bursa)..." className="px-3 py-2 text-sm border border-outline rounded-lg bg-surface-container w-64" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-on-surface-variant">{selected.size} seçili</span>
          <button onClick={handleSend} disabled={sending || selected.size === 0}
            className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            LinkedIn Mesajı Gönder
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <Briefcase size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">LinkedIn URL'si olan lead yok</p>
            <p className="text-xs mt-1">Önce Scrape İşleri'nden LinkedIn üzerinden çekim yapın</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 p-3 border-b border-outline text-sm bg-surface-container-high">
              <input type="checkbox" checked={selected.size === leads.length} onChange={toggleAll} />
              <span className="font-medium">Tümünü seç ({leads.length})</span>
            </div>
            <div className="divide-y divide-outline max-h-[500px] overflow-y-auto">
              {leads.map(l => (
                <label key={l.id} className="flex items-center gap-3 p-3 hover:bg-surface-container-high cursor-pointer text-sm">
                  <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{l.full_name || l.company}</p>
                    <p className="text-xs text-on-surface-variant truncate">
                      {l.title}{l.company && ` · ${l.company}`}{l.city && ` · ${l.city}`}
                    </p>
                  </div>
                  <a href={l.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs">
                    Profil →
                  </a>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
