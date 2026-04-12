'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Consultant } from '@/lib/types'
import {
  Settings, Users, Edit2, CheckCircle,
  XCircle, Shield, Loader2, TrendingUp,
  MessageCircle, Building2, Globe,
  Eye, EyeOff, Save, RefreshCw, Wifi, WifiOff,
  QrCode, X, Smartphone,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingKey =
  | 'office_name' | 'office_phone' | 'office_address' | 'office_commission_rate'
  | 'default_follow_up_days' | 'whatsapp_welcome_template'
  | 'evolution_api_url' | 'evolution_api_key' | 'evolution_instance' | 'app_url'

type SettingMeta = {
  key: SettingKey
  label: string
  desc: string
  type: 'text' | 'password' | 'number' | 'textarea' | 'url'
  placeholder?: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

const roleLabels: Record<string, string> = {
  admin: 'Yönetici', manager: 'Müdür', consultant: 'Danışman',
}

const roleColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-purple-100 text-purple-700',
  consultant: 'bg-blue-100 text-blue-700',
}

const SETTING_GROUPS: { title: string; icon: React.ElementType; color: string; settings: SettingMeta[] }[] = [
  {
    title: 'Ofis Bilgileri',
    icon: Building2,
    color: 'blue',
    settings: [
      { key: 'office_name',             label: 'Ofis Adı',                type: 'text',   placeholder: 'Gayrimenkul Ofisi',  desc: 'Belgelerde ve mesajlarda görünür' },
      { key: 'office_phone',            label: 'Ofis Telefonu',           type: 'text',   placeholder: '0212 xxx xx xx',     desc: '' },
      { key: 'office_address',          label: 'Ofis Adresi',             type: 'textarea', placeholder: 'Adres...',         desc: '' },
      { key: 'office_commission_rate',  label: 'Varsayılan Komisyon (%)', type: 'number', placeholder: '3',                  desc: 'Yeni belgeler için default oran' },
      { key: 'default_follow_up_days',  label: 'Takip Aralığı (gün)',    type: 'number', placeholder: '7',                  desc: 'Otomatik takip oluşturma aralığı' },
    ],
  },
  {
    title: 'WhatsApp (Evolution API)',
    icon: MessageCircle,
    color: 'green',
    settings: [
      { key: 'evolution_api_url',      label: 'Evolution API URL',      type: 'url',      placeholder: 'https://evo.domain.com',      desc: 'Sonunda / olmadan yazın' },
      { key: 'evolution_api_key',      label: 'Evolution API Key',      type: 'password', placeholder: '••••••••',                    desc: 'Evolution API key (apikey header)' },
      { key: 'evolution_instance',     label: 'Instance Adı',           type: 'text',     placeholder: 'my-instance',                 desc: 'Evolution instance ismi' },
    ],
  },
  {
    title: 'Uygulama',
    icon: Globe,
    color: 'purple',
    settings: [
      { key: 'app_url',                label: 'Uygulama URL',           type: 'url',      placeholder: 'https://crm.domain.com',      desc: 'İmzalama linkleri bu URL ile oluşturulur' },
      { key: 'whatsapp_welcome_template', label: 'WA Karşılama Şablonu', type: 'textarea', placeholder: 'Merhaba {name}, hoş geldiniz!', desc: '{name} yerine müşteri adı gelir' },
    ],
  },
]

// ─── Setting Field ────────────────────────────────────────────────────────────

function SettingField({
  meta,
  value,
  onChange,
}: {
  meta: SettingMeta
  value: string
  onChange: (v: string) => void
}) {
  const [showPass, setShowPass] = useState(false)
  const inp = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {meta.label}
        {meta.desc && <span className="text-slate-400 font-normal ml-1.5 text-xs">— {meta.desc}</span>}
      </label>
      {meta.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={meta.placeholder}
          className={`${inp} min-h-[64px] resize-y`}
        />
      ) : meta.type === 'password' ? (
        <div className="relative">
          <input
            type={showPass ? 'text' : 'password'}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={meta.placeholder}
            className={`${inp} pr-10`}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowPass(p => !p)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
          >
            {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      ) : (
        <input
          type={meta.type === 'url' ? 'text' : meta.type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={meta.placeholder}
          className={inp}
          step={meta.type === 'number' ? '0.5' : undefined}
        />
      )}
    </div>
  )
}

// ─── QR Modal ─────────────────────────────────────────────────────────────────

function QRModal({ onClose }: { onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [loadingQr, setLoadingQr] = useState(true)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(25)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const qrRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchQR = useCallback(async () => {
    setLoadingQr(true)
    setError('')
    try {
      const res = await fetch('/api/whatsapp/qr')
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'QR alınamadı'); setLoadingQr(false); return }
      if (data.connected) { setConnected(true); setLoadingQr(false); return }
      setQr(data.base64)
      setCountdown(25)
    } catch {
      setError('Bağlantı hatası')
    }
    setLoadingQr(false)
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status')
      const data = await res.json()
      if (data.connected) setConnected(true)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchQR()

    // Poll connection status every 4 seconds
    pollRef.current = setInterval(checkStatus, 4000)

    // Refresh QR every 25 seconds
    qrRef.current = setInterval(fetchQR, 25000)

    // Countdown timer
    countRef.current = setInterval(() => {
      setCountdown(c => (c <= 1 ? 25 : c - 1))
    }, 1000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (qrRef.current) clearInterval(qrRef.current)
      if (countRef.current) clearInterval(countRef.current)
    }
  }, [fetchQR, checkStatus])

  // Stop polling once connected
  useEffect(() => {
    if (connected) {
      if (pollRef.current) clearInterval(pollRef.current)
      if (qrRef.current) clearInterval(qrRef.current)
      if (countRef.current) clearInterval(countRef.current)
    }
  }, [connected])

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Smartphone size={18} className="text-green-600" />
            <h3 className="font-semibold text-slate-900">WhatsApp Bağla</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {connected ? (
            /* Success State */
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <h4 className="font-semibold text-slate-900 mb-1">WhatsApp Bağlandı!</h4>
              <p className="text-sm text-slate-500 mb-4">Mesaj gönderebilirsiniz.</p>
              <button onClick={onClose} className="btn-primary">Tamam</button>
            </div>
          ) : error ? (
            /* Error State */
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <WifiOff size={22} className="text-red-500" />
              </div>
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <p className="text-xs text-slate-400 mb-4">
                Evolution API URL, API Key ve Instance adını kontrol edin.
              </p>
              <button onClick={fetchQR} className="flex items-center gap-1.5 mx-auto px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">
                <RefreshCw size={13} /> Tekrar Dene
              </button>
            </div>
          ) : (
            /* QR State */
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-4">
                WhatsApp'ı açın → <strong>Bağlı Cihazlar</strong> → <strong>Cihaz Ekle</strong> → QR kodu okutun
              </p>

              {/* QR Code */}
              <div className="relative inline-block">
                {loadingQr ? (
                  <div className="w-52 h-52 bg-slate-100 rounded-xl flex items-center justify-center mx-auto">
                    <Loader2 size={32} className="animate-spin text-slate-400" />
                  </div>
                ) : qr ? (
                  <div className="relative">
                    <img
                      src={qr}
                      alt="WhatsApp QR Kodu"
                      className="w-52 h-52 rounded-xl border-2 border-slate-200 mx-auto"
                    />
                    {/* Countdown ring overlay */}
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm">
                      <span className="text-xs font-bold text-slate-500">{countdown}</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-52 h-52 bg-slate-100 rounded-xl flex items-center justify-center mx-auto">
                    <QrCode size={48} className="text-slate-300" />
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-1">
                <p className="text-xs text-slate-400">
                  QR kod {countdown} saniye sonra yenilenir
                </p>
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  Telefon bağlantısı bekleniyor...
                </div>
              </div>

              <button
                onClick={fetchQR}
                disabled={loadingQr}
                className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw size={11} className={loadingQr ? 'animate-spin' : ''} />
                QR'ı Yenile
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── WA Connection Test ───────────────────────────────────────────────────────

function WAConnectTest({ saved }: { saved: boolean }) {
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [showQR, setShowQR] = useState(false)

  async function test() {
    setStatus('testing')
    setMsg('')
    try {
      const res = await fetch('/api/whatsapp/status')
      const data = await res.json()
      if (res.ok && data.connected) {
        setStatus('ok')
        setMsg(`Instance: ${data.instanceName || ''}`)
      } else {
        setStatus('error')
        setMsg(data.error || 'Bağlantı kurulamadı')
      }
    } catch {
      setStatus('error')
      setMsg('API\'ye ulaşılamadı')
    }
  }

  if (!saved) return null

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
        <button
          onClick={test}
          disabled={status === 'testing'}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={12} className={status === 'testing' ? 'animate-spin' : ''} />
          Bağlantıyı Test Et
        </button>

        <button
          onClick={() => setShowQR(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
        >
          <QrCode size={12} /> QR ile Bağla
        </button>

        {status === 'ok' && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Wifi size={12} /> Bağlı {msg && <span className="text-slate-400">({msg})</span>}
          </span>
        )}
        {status === 'error' && (
          <span className="flex items-center gap-1 text-xs text-red-600">
            <WifiOff size={12} /> {msg}
          </span>
        )}
      </div>

      {showQR && <QRModal onClose={() => { setShowQR(false); test() }} />}
    </>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [waSaved, setWaSaved] = useState(false)

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    const supabase = createClient()
    const { data } = await supabase.from('settings').select('key, value')
    if (data) {
      const map: Record<string, string> = {}
      for (const row of data) {
        // Strip surrounding quotes from JSON strings
        const v = typeof row.value === 'string'
          ? row.value.replace(/^"|"$/g, '')
          : String(row.value)
        map[row.key] = v
      }
      setValues(map)
      setWaSaved(!!(map.evolution_api_url && map.evolution_api_key && map.evolution_instance))
    }
    setLoading(false)
  }

  async function saveGroup(keys: SettingKey[]) {
    const groupId = keys[0]
    setSaving(groupId)
    const supabase = createClient()

    for (const key of keys) {
      const val = values[key] ?? ''
      // Store strings as JSON strings (quoted), numbers as numbers
      const isNumeric = ['office_commission_rate', 'default_follow_up_days'].includes(key)
      const dbValue = isNumeric ? parseFloat(val) || 0 : val

      await supabase.from('settings').upsert(
        { key, value: dbValue, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
    }

    setSaving(null)
    setSaved(groupId)
    setTimeout(() => setSaved(null), 2000)

    // Check if WA settings now complete
    const waKeys: SettingKey[] = ['evolution_api_url', 'evolution_api_key', 'evolution_instance']
    const allWA = waKeys.every(k => values[k]?.trim())
    setWaSaved(allWA)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {SETTING_GROUPS.map(group => {
        const groupId = group.settings[0].key
        const isSaving = saving === groupId
        const isSaved = saved === groupId
        const Icon = group.icon

        return (
          <div key={group.title} className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg bg-${group.color}-50 flex items-center justify-center`}>
                  <Icon size={14} className={`text-${group.color}-600`} />
                </div>
                {group.title}
              </h3>
            </div>

            <div className="space-y-3">
              {group.settings.map(meta => (
                <SettingField
                  key={meta.key}
                  meta={meta}
                  value={values[meta.key] ?? ''}
                  onChange={v => setValues(prev => ({ ...prev, [meta.key]: v }))}
                />
              ))}
            </div>

            {group.title.includes('WhatsApp') && (
              <WAConnectTest saved={waSaved} />
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {isSaved && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle size={12} /> Kaydedildi
                </span>
              )}
              <button
                onClick={() => saveGroup(group.settings.map(s => s.key))}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Consultants Tab ──────────────────────────────────────────────────────────

function ConsultantsTab() {
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editRate, setEditRate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchConsultants() }, [])

  async function fetchConsultants() {
    const supabase = createClient()
    const { data } = await supabase
      .from('consultants')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setConsultants(data as Consultant[])
    setLoading(false)
  }

  async function updateRate(id: string) {
    if (!editRate) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('consultants').update({ commission_rate: Number(editRate) }).eq('id', id)
    setEditId(null)
    setEditRate('')
    setSaving(false)
    fetchConsultants()
  }

  async function toggleActive(id: string, current: boolean) {
    const supabase = createClient()
    await supabase.from('consultants').update({ is_active: !current }).eq('id', id)
    fetchConsultants()
  }

  const activeCount = consultants.filter(c => c.is_active).length

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Toplam', value: consultants.length, color: 'blue' },
          { label: 'Aktif', value: activeCount, color: 'green' },
          { label: 'Pasif', value: consultants.length - activeCount, color: 'slate' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <Shield size={15} className="text-blue-600" />
          <h2 className="font-semibold text-slate-800 text-sm">Danışmanlar</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : consultants.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Users size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Danışman bulunamadı</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {consultants.map(c => (
              <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-700 font-semibold text-sm">
                  {c.full_name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-slate-900 text-sm">{c.full_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${roleColors[c.role] || 'bg-slate-100 text-slate-600'}`}>
                      {roleLabels[c.role] || c.role}
                    </span>
                    {!c.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Pasif</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{c.email}</p>
                  {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                </div>

                {/* Komisyon */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <TrendingUp size={12} className="text-slate-400" />
                    {editId === c.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={editRate}
                          onChange={e => setEditRate(e.target.value)}
                          className="w-16 border border-blue-300 rounded px-2 py-0.5 text-xs focus:outline-none"
                          placeholder={String(c.commission_rate)}
                        />
                        <span className="text-xs text-slate-500">%</span>
                        <button onClick={() => updateRate(c.id)} disabled={saving} className="text-green-600 hover:text-green-700">
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={14} />}
                        </button>
                        <button onClick={() => setEditId(null)} className="text-slate-400">
                          <XCircle size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditId(c.id); setEditRate(String(c.commission_rate)) }}
                        className="text-xs text-slate-600 hover:text-blue-600 flex items-center gap-1"
                      >
                        %{c.commission_rate} <Edit2 size={10} />
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => toggleActive(c.id, c.is_active)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      c.is_active ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-100'
                    }`}
                    title={c.is_active ? 'Pasife Al' : 'Aktif Et'}
                  >
                    {c.is_active ? <CheckCircle size={16} /> : <XCircle size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<'consultants' | 'settings'>('consultants')

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Yönetim Paneli</h1>
        <p className="text-slate-500 text-sm mt-1">Danışman yönetimi ve sistem ayarları</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
        <button
          onClick={() => setTab('consultants')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'consultants' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users size={15} /> Danışmanlar
        </button>
        <button
          onClick={() => setTab('settings')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'settings' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Settings size={15} /> Sistem Ayarları
        </button>
      </div>

      {tab === 'consultants' ? <ConsultantsTab /> : <SettingsTab />}
    </div>
  )
}
