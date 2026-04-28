'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import {
  Gift, Save, Play, Clock, MessageSquare, Users, User,
  CheckSquare, Square, Loader2, CheckCircle, AlertCircle,
  ToggleLeft, ToggleRight, Search,
} from 'lucide-react'

interface Contact {
  id: string
  full_name: string
  salutation?: string
  phone?: string
  birth_date?: string
}

interface Config {
  is_enabled: boolean
  trigger_time: string
  system_prompt: string
  message_template: string
  contact_filter: 'all' | 'specific'
  selected_contact_ids: string[]
}

const DEFAULT_CONFIG: Config = {
  is_enabled: false,
  trigger_time: '09:00',
  system_prompt: 'Sen yardımsever bir gayrimenkul danışmanı asistanısın. Müşterilere kısa, samimi ve kişisel doğum günü mesajları yazıyorsun.',
  message_template: 'Merhaba {ad} {hitap}, doğum gününüz kutlu olsun! 🎂\n\nSizi her zaman düşünüyoruz. İyi ki varsınız!',
  contact_filter: 'all',
  selected_contact_ids: [],
}

function previewMessage(template: string, contact?: Contact) {
  const name = contact?.full_name || 'Ahmet Yılmaz'
  const ad = name.split(' ')[0]
  const hitap = contact?.salutation || 'Bey'
  return template
    .replace(/\{ad\}/gi, ad)
    .replace(/\{adsoyad\}/gi, name)
    .replace(/\{hitap\}/gi, hitap)
}

function todayBirthday(birth_date?: string) {
  if (!birth_date) return false
  const today = new Date()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return birth_date.slice(5, 10) === `${mm}-${dd}`
}

export default function BirthdayAutomationPage() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [lastRunDate, setLastRunDate] = useState<string | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [cfgRes, contactRes] = await Promise.all([
      fetch('/api/automations/birthday'),
      loadContacts(),
    ])
    if (cfgRes.ok) {
      const { config: c } = await cfgRes.json()
      if (c) {
        setConfig(c)
        if (c.last_run_date) setLastRunDate(c.last_run_date)
      }
    }
    setLoading(false)
    void contactRes
  }

  async function loadContacts() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: consultant } = await supabase
      .from('consultants').select('id, role').eq('user_id', user.id).single()
    const isAdmin = (consultant as any)?.role === 'admin'

    let q = supabase
      .from('clients')
      .select('id, full_name, salutation, phone, birth_date')
      .eq('is_active', true)
      .not('birth_date', 'is', null)
      .order('full_name')
    if (!isAdmin && consultant?.id) q = q.eq('assigned_consultant_id', consultant.id)
    const { data } = await q
    setContacts((data as Contact[]) || [])
  }

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/automations/birthday', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
  }

  async function handleRunNow() {
    setRunning(true)
    setRunResult(null)
    const res = await fetch('/api/automations/birthday/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true, config }),
    })
    setRunning(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setRunResult(`❌ ${data.error || 'Hata oluştu'}`)
      return
    }
    if (data.reason) {
      setRunResult(`ℹ️ ${data.reason}`)
      return
    }
    const lines = [`✅ ${data.sent} mesaj gönderildi${data.failed ? `, ${data.failed} başarısız` : ''}`]
    if (data.detail?.length) {
      data.detail.forEach((d: { name: string; ok: boolean; error?: string }) => {
        lines.push(`${d.ok ? '✓' : '✗'} ${d.name}${d.error ? ` — ${d.error}` : ''}`)
      })
    }
    setRunResult(lines.join('\n'))
  }

  function toggleContact(id: string) {
    setConfig(c => ({
      ...c,
      selected_contact_ids: c.selected_contact_ids.includes(id)
        ? c.selected_contact_ids.filter(x => x !== id)
        : [...c.selected_contact_ids, id],
    }))
  }

  function selectAllBirthday() {
    setConfig(c => ({ ...c, selected_contact_ids: contacts.map(ct => ct.id) }))
  }

  function clearSelection() {
    setConfig(c => ({ ...c, selected_contact_ids: [] }))
  }

  const todayContacts = contacts.filter(c => todayBirthday(c.birth_date))
  const filteredContacts = contacts.filter(c =>
    !search || c.full_name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-primary" />
    </div>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Gift size={22} className="text-pink-500" /> Doğum Günü Otomasyonu
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Doğum günü olan müşterilere otomatik WhatsApp mesajı gönder
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRunNow}
            disabled={running}
            className="flex items-center gap-1.5 px-4 py-2 border border-outline rounded-lg text-sm hover:bg-surface-container-high disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Şimdi Gönder
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saved ? 'Kaydedildi!' : 'Kaydet'}
          </button>
        </div>
      </div>

      {runResult && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${runResult.includes('❌') ? 'bg-red-50 text-red-700' : runResult.includes('ℹ️') ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
          {runResult.split('\n').map((line, i) => (
            <p key={i} className={i === 0 ? 'font-medium' : 'text-xs mt-0.5 opacity-80'}>{line}</p>
          ))}
        </div>
      )}

      {/* Bugün doğum günü olanlar */}
      {todayContacts.length > 0 && (
        <div className="card bg-pink-50 border-pink-200 mb-5">
          <p className="text-sm font-semibold text-pink-800 flex items-center gap-2 mb-2">
            <Gift size={15} /> Bugün doğum günü olan {todayContacts.length} müşteri var!
          </p>
          <div className="flex flex-wrap gap-2">
            {todayContacts.map(c => (
              <span key={c.id} className="text-xs bg-pink-100 text-pink-700 px-2 py-1 rounded-full">
                {c.salutation ? c.salutation + ' ' : ''}{c.full_name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {/* Aktif / Pasif */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-on-surface">Otomasyon Durumu</p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Aktif olduğunda her gün belirtilen saatte çalışır
              </p>
            </div>
            <button
              onClick={() => setConfig(c => ({ ...c, is_enabled: !c.is_enabled }))}
              className="flex items-center gap-2"
            >
              {config.is_enabled
                ? <ToggleRight size={36} className="text-primary" />
                : <ToggleLeft size={36} className="text-on-surface-variant" />
              }
              <span className={`text-sm font-medium ${config.is_enabled ? 'text-primary' : 'text-on-surface-variant'}`}>
                {config.is_enabled ? 'Aktif' : 'Pasif'}
              </span>
            </button>
          </div>
        </div>

        {/* Tetiklenme Zamanı */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
            <Clock size={16} /> Tetiklenme Zamanı
          </h2>
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">Gönderim Saati</label>
              <input
                type="time"
                value={config.trigger_time}
                onChange={e => setConfig(c => ({ ...c, trigger_time: e.target.value }))}
                className="border border-outline rounded-lg px-4 py-2.5 text-base font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="text-sm text-on-surface-variant">
              <p>Her gün <strong className="text-on-surface">{config.trigger_time}</strong>'de gönderilir.</p>
              {lastRunDate ? (
                <p className="text-xs mt-1 text-green-600">
                  ✓ Son çalışma: {new Date(lastRunDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              ) : (
                <p className="text-xs mt-1 text-on-surface-variant">Henüz çalışmadı</p>
              )}
            </div>
          </div>
        </div>

        {/* Sistem Promptu */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
            <MessageSquare size={16} /> Sistem Promptu
          </h2>
          <p className="text-xs text-on-surface-variant mb-3">
            Mesajın tonu ve karakterini belirler (AI destekli mesajlar için)
          </p>
          <textarea
            value={config.system_prompt}
            onChange={e => setConfig(c => ({ ...c, system_prompt: e.target.value }))}
            rows={3}
            className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        {/* Mesaj Şablonu */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
            <MessageSquare size={16} /> Mesaj Şablonu
          </h2>
          <p className="text-xs text-on-surface-variant mb-2">
            Değişkenler: <code className="bg-surface-container-high px-1 rounded">{'{ad}'}</code> ad,{' '}
            <code className="bg-surface-container-high px-1 rounded">{'{adsoyad}'}</code> ad soyad,{' '}
            <code className="bg-surface-container-high px-1 rounded">{'{hitap}'}</code> hitap (Bey/Hanım vb.)
          </p>
          <textarea
            value={config.message_template}
            onChange={e => setConfig(c => ({ ...c, message_template: e.target.value }))}
            rows={4}
            className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none font-mono"
          />
          <div className="mt-2 p-3 bg-surface-container-high rounded-lg">
            <p className="text-xs text-on-surface-variant mb-1">Önizleme:</p>
            <p className="text-sm text-on-surface whitespace-pre-wrap">{previewMessage(config.message_template)}</p>
          </div>
        </div>

        {/* Kişi Seçimi */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
            <Users size={16} /> Kişi Seçimi
          </h2>

          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setConfig(c => ({ ...c, contact_filter: 'all' }))}
              className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                config.contact_filter === 'all'
                  ? 'bg-primary text-white border-primary'
                  : 'border-outline text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Tüm doğum günü olanlar
            </button>
            <button
              onClick={() => setConfig(c => ({ ...c, contact_filter: 'specific' }))}
              className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${
                config.contact_filter === 'specific'
                  ? 'bg-primary text-white border-primary'
                  : 'border-outline text-on-surface hover:bg-surface-container-high'
              }`}
            >
              Belirli kişiler seç
            </button>
          </div>

          {config.contact_filter === 'all' ? (
            <div className="text-sm text-on-surface-variant text-center py-4 bg-surface-container-high rounded-lg">
              <Gift size={20} className="mx-auto mb-1 opacity-50" />
              Doğum tarihi kayıtlı tüm müşterilerinize otomatik gönderilir.<br />
              Şu an <strong className="text-on-surface">{contacts.length}</strong> kayıtlı müşteri var.
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-on-surface-variant">
                  {config.selected_contact_ids.length} / {contacts.length} seçili
                </span>
                <div className="flex gap-2">
                  <button onClick={selectAllBirthday} className="text-xs text-primary hover:underline">Tümünü seç</button>
                  <button onClick={clearSelection} className="text-xs text-on-surface-variant hover:underline">Temizle</button>
                </div>
              </div>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Kişi ara..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="max-h-64 overflow-y-auto border border-outline rounded-lg divide-y divide-outline">
                {filteredContacts.length === 0 ? (
                  <p className="text-sm text-on-surface-variant text-center py-6">Doğum tarihi kayıtlı müşteri yok</p>
                ) : filteredContacts.map(c => {
                  const selected = config.selected_contact_ids.includes(c.id)
                  const isBdToday = todayBirthday(c.birth_date)
                  const bd = c.birth_date ? new Date(c.birth_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'long' }) : ''
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleContact(c.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container-high transition-colors text-left"
                    >
                      {selected
                        ? <CheckSquare size={16} className="text-primary flex-shrink-0" />
                        : <Square size={16} className="text-on-surface-variant flex-shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-on-surface truncate">
                          {c.salutation ? c.salutation + ' ' : ''}{c.full_name}
                          {isBdToday && <span className="ml-1.5 text-xs">🎂</span>}
                        </p>
                        {bd && <p className="text-xs text-on-surface-variant">{bd}</p>}
                      </div>
                      {c.phone && <span className="text-xs text-on-surface-variant flex-shrink-0"><User size={10} className="inline mr-0.5" />{c.phone}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
