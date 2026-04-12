'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Consultant } from '@/lib/types'
import {
  Settings, Users, Edit2, CheckCircle,
  XCircle, Shield, Loader2, TrendingUp,
  MessageCircle, Building2, Globe,
  Eye, EyeOff, Save, RefreshCw, Wifi, WifiOff,
  QrCode, X, Smartphone, Upload, Trash2,
  Zap,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingKey =
  | 'office_name' | 'office_legal_name' | 'office_phone' | 'office_address' | 'office_logo' | 'office_commission_rate' | 'office_mersis'
  | 'default_follow_up_days' | 'whatsapp_welcome_template'
  | 'evolution_api_url' | 'evolution_api_key' | 'evolution_instance' | 'app_url'
  | 'n8n_url' | 'n8n_api_key'
  | 'smtp_host' | 'smtp_port' | 'smtp_user' | 'smtp_pass' | 'smtp_from_name'
  | 'openrouter_api_key'

type SettingMeta = {
  key: SettingKey
  label: string
  desc: string
  type: 'text' | 'password' | 'number' | 'textarea' | 'url' | 'logo'
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
      { key: 'office_name',             label: 'Ofis Kısa Adı',           type: 'text',     placeholder: 'Ambiance Gayrimenkul',        desc: 'WA mesajları ve başlıklarda kullanılır' },
      { key: 'office_legal_name',       label: 'Yasal Ünvan',             type: 'text',     placeholder: 'Ambiance Gayrimenkul Yatırım Ortaklığı İnşaat San. Ltd. Şti.', desc: 'Belge sağ üst köşesinde görünür' },
      { key: 'office_mersis',           label: 'Mersis No',               type: 'text',     placeholder: '0068090568900012',            desc: 'Belge başlığında görünür' },
      { key: 'office_phone',            label: 'Ofis Telefonu',           type: 'text',     placeholder: '0224 xxx xx xx',              desc: '' },
      { key: 'office_address',          label: 'Ofis Adresi',             type: 'textarea', placeholder: 'Ahmet Yesevi Mah. Hudut Sok. Central Balat Sitesi 1/C\nNilüfer / BURSA', desc: '' },
      { key: 'office_logo',             label: 'Ofis Logosu',             type: 'logo',     placeholder: '', desc: 'Belgelerin sol üstünde görünür (PNG/JPG)' },
      { key: 'office_commission_rate',  label: 'Varsayılan Komisyon (%)', type: 'number',   placeholder: '3',                           desc: 'Yeni belgeler için default oran' },
      { key: 'default_follow_up_days',  label: 'Takip Aralığı (gün)',    type: 'number',   placeholder: '7',                           desc: 'Otomatik takip oluşturma aralığı' },
    ],
  },
  {
    title: 'Uygulama',
    icon: Globe,
    color: 'purple',
    settings: [
      { key: 'app_url',                    label: 'Uygulama URL',          type: 'url',      placeholder: 'https://crm.domain.com',      desc: 'İmzalama linkleri bu URL ile oluşturulur' },
      { key: 'whatsapp_welcome_template',  label: 'WA Karşılama Şablonu', type: 'textarea', placeholder: 'Merhaba {name}, hoş geldiniz!', desc: '{name} yerine müşteri adı gelir' },
    ],
  },
  {
    title: 'Otomasyon Ayarları (n8n)',
    icon: Zap,
    color: 'orange',
    settings: [
      { key: 'n8n_url',     label: 'n8n URL',     type: 'url',      placeholder: 'https://n8n.sirketiniz.com', desc: 'n8n sunucusunun adresi' },
      { key: 'n8n_api_key', label: 'n8n API Key', type: 'password', placeholder: 'n8n_api_xxx...',             desc: 'n8n → Settings → API → Create API Key' },
    ],
  },
  {
    title: 'AI Ayarları (OpenRouter)',
    icon: Zap,
    color: 'purple',
    settings: [
      { key: 'openrouter_api_key', label: 'OpenRouter API Key', type: 'password', placeholder: 'sk-or-v1-...', desc: 'openrouter.ai → Keys → Create Key' },
    ],
  },
  {
    title: 'Email Ayarları (Gmail SMTP)',
    icon: Globe,
    color: 'green',
    settings: [
      { key: 'smtp_host',      label: 'SMTP Sunucu',       type: 'text',     placeholder: 'smtp.gmail.com',          desc: 'Gmail için: smtp.gmail.com' },
      { key: 'smtp_port',      label: 'SMTP Port',         type: 'number',   placeholder: '587',                     desc: 'Gmail için: 587 (TLS)' },
      { key: 'smtp_user',      label: 'Gmail Adresi',      type: 'text',     placeholder: 'siz@gmail.com',           desc: 'Gönderici Gmail hesabı' },
      { key: 'smtp_pass',      label: 'Uygulama Şifresi',  type: 'password', placeholder: 'xxxx xxxx xxxx xxxx',     desc: 'Google Hesabı → Güvenlik → 2FA → Uygulama Şifreleri' },
      { key: 'smtp_from_name', label: 'Gönderici Adı',     type: 'text',     placeholder: 'Ambiance Gayrimenkul',    desc: 'Mailde görünen isim' },
    ],
  },
]

// ─── Setting Field ────────────────────────────────────────────────────────────

function LogoUploadField({ value, onChange, desc }: { value: string; onChange: (v: string) => void; desc: string }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      onChange(reader.result as string)
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        Ofis Logosu
        {desc && <span className="text-slate-400 font-normal ml-1.5 text-xs">— {desc}</span>}
      </label>

      {/* Preview */}
      {value && (
        <div className="mb-3 relative inline-block">
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 inline-flex items-center justify-center" style={{ minWidth: 120, minHeight: 60 }}>
            <img
              src={value}
              alt="Logo önizleme"
              className="max-h-16 max-w-[200px] object-contain"
            />
          </div>
          <button
            type="button"
            onClick={() => { onChange(''); if (fileRef.current) fileRef.current.value = '' }}
            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
            title="Logoyu kaldır"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}

      {/* Upload button */}
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {uploading ? 'Yükleniyor...' : value ? 'Logoyu Değiştir' : 'Logo Seç (PNG / JPG)'}
        </button>
        <p className="text-xs text-slate-400 mt-1.5">Dosya seçildiğinde otomatik olarak yüklenir. &quot;Kaydet&quot; ile kaydedin.</p>
      </div>
    </div>
  )
}

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

  if (meta.type === 'logo') {
    return <LogoUploadField value={value} onChange={onChange} desc={meta.desc} />
  }

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
                WhatsApp API URL, API Key ve Instance adını kontrol edin.
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

// ─── n8n Connection Card ──────────────────────────────────────────────────────

function N8nCard() {
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => { test() }, [])

  async function test() {
    setStatus('testing')
    setError('')
    try {
      const res = await fetch('/api/n8n/test')
      const data = await res.json()
      if (data.connected) {
        setStatus('ok')
      } else {
        setStatus('error')
        setError(data.error || 'Bağlantı kurulamadı')
      }
    } catch {
      setStatus('error')
      setError('Sunucuya ulaşılamadı')
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
            <Zap size={14} className="text-orange-500" />
          </div>
          n8n Otomasyon Bağlantısı
        </h3>
        <button onClick={test} disabled={status === 'testing'} className="text-slate-400 hover:text-slate-600 p-1" title="Yenile">
          <RefreshCw size={14} className={status === 'testing' ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-4">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          status === 'idle' || status === 'testing' ? 'bg-slate-300 animate-pulse' :
          status === 'ok' ? 'bg-green-500' : 'bg-red-400'
        }`} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${
            status === 'idle' || status === 'testing' ? 'text-slate-400' :
            status === 'ok' ? 'text-green-600' : 'text-red-500'
          }`}>
            {status === 'idle' || status === 'testing' ? 'Bağlantı kontrol ediliyor...' :
             status === 'ok' ? 'n8n Bağlantısı Aktif' : error}
          </p>
          {status === 'ok' && (
            <p className="text-xs text-slate-400 mt-0.5">İş akışları oluşturulabilir ve yönetilebilir</p>
          )}
        </div>
        {status === 'ok' && (
          <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
            <Wifi size={11} /> Aktif
          </div>
        )}
      </div>

      {/* Error hint */}
      {status === 'error' && (
        <div className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-4">
          <p className="font-medium mb-0.5">Bağlantı kurulamadı</p>
          <p>Aşağıdaki <strong>Otomasyon Ayarları</strong> bölümünden n8n URL ve API Key girin, kaydedin, sonra tekrar test edin.</p>
        </div>
      )}

      <button
        onClick={test}
        disabled={status === 'testing'}
        className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
      >
        <RefreshCw size={14} className={status === 'testing' ? 'animate-spin' : ''} />
        {status === 'testing' ? 'Test ediliyor...' : 'Bağlantıyı Test Et'}
      </button>

      <p className="text-xs text-slate-400 mt-3">
        n8n URL ve API Key aşağıdaki <strong>Otomasyon Ayarları</strong> bölümünden girilir.
      </p>
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

// ─── WhatsApp Status Card ──────────────────────────────────────────────────────

function WhatsAppCard() {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{
    reachable?: boolean
    instanceCount?: number
    connectedCount?: number
    url?: string
    error?: string
  } | null>(null)

  useEffect(() => { checkStatus() }, [])

  async function checkStatus() {
    setChecking(true)
    try {
      const res = await fetch('/api/whatsapp/status')
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ reachable: false, error: 'Sunucuya ulaşılamadı' })
    }
    setChecking(false)
  }

  const configured = result && !result.error?.includes('yapılandırılmamış')

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
            <MessageCircle size={14} className="text-green-600" />
          </div>
          WhatsApp Bağlantısı
        </h3>
        <button onClick={checkStatus} disabled={checking} className="text-slate-400 hover:text-slate-600 p-1" title="Yenile">
          <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Durum */}
      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-4">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          checking ? 'bg-slate-300 animate-pulse' :
          result?.reachable ? 'bg-green-500' : 'bg-red-400'
        }`} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${
            checking ? 'text-slate-400' :
            result?.reachable ? 'text-green-600' : 'text-red-500'
          }`}>
            {checking ? 'Kontrol ediliyor...' :
             result?.reachable ? 'WhatsApp Bağlantısı Aktif' : (result?.error || 'Bağlanamadı')}
          </p>
          {result?.reachable && (
            <p className="text-xs text-slate-400 mt-0.5">WhatsApp mesajları gönderilebilir</p>
          )}
        </div>
        {result?.reachable && (
          <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
            <Wifi size={11} /> Aktif
          </div>
        )}
      </div>

      {!configured && (
        <div className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-4">
          <p className="font-medium mb-0.5">WhatsApp bağlantısı yapılandırılmamış</p>
          <p>Coolify'da şu env variable'ları ekleyin:</p>
          <code className="block mt-1 font-mono">
            WA_API_URL<br />
            WA_API_KEY
          </code>
        </div>
      )}

      <button
        onClick={checkStatus}
        disabled={checking}
        className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
        Durumu Kontrol Et
      </button>

      <p className="text-xs text-slate-400 mt-3">
        Her danışman kendi WhatsApp numarasını profil sayfasından bağlayabilir.
      </p>
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    const supabase = createClient()
    const { data } = await supabase.from('settings').select('key, value')
    if (data) {
      const map: Record<string, string> = {}
      for (const row of data) {
        const v = typeof row.value === 'string'
          ? row.value.replace(/^"|"$/g, '')
          : String(row.value)
        map[row.key] = v
      }
      setValues(map)
    }
    setLoading(false)
  }

  async function saveGroup(keys: SettingKey[]) {
    const groupId = keys[0]
    setSaving(groupId)
    const supabase = createClient()

    for (const key of keys) {
      const val = values[key] ?? ''
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
      {/* n8n Bağlantısı */}
      <N8nCard />

      {/* WhatsApp Bağlantısı */}
      <WhatsAppCard />

      {/* Diğer ayar grupları */}
      {SETTING_GROUPS.map(group => {
        const groupId = group.settings[0].key
        const isSaving = saving === groupId
        const isSaved = saved === groupId
        const Icon = group.icon

        return (
          <div key={group.title} className="card space-y-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg bg-${group.color}-50 flex items-center justify-center`}>
                <Icon size={14} className={`text-${group.color}-600`} />
              </div>
              {group.title}
            </h3>

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
                    {/* WhatsApp durum rozeti */}
                    {c.wa_phone ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                        <MessageCircle size={10} />
                        <span className="hidden sm:inline">WA</span>
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      </span>
                    ) : c.wa_instance ? (
                      <span className="flex items-center gap-1 text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full" title="Instance var ama bağlı değil">
                        <MessageCircle size={10} />
                        <span className="hidden sm:inline">WA</span>
                        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full" />
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{c.email}</p>
                  {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                  {c.wa_phone && (
                    <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                      <MessageCircle size={10} /> +{c.wa_phone}
                    </p>
                  )}
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

// ─── Automations Tab ──────────────────────────────────────────────────────────

const DEFAULT_AI_SYSTEM = `Sen bir gayrimenkul danışmanının kişisel asistanısın. Danışmanın ağzından müşterilerle konuşuyorsun. Üslubun samimi, kısa, öz ve net olmalı.

Yanıt Stratejisi:
1. Soruları kısa ve net yanıtla, gereksiz detaya girme.
2. Gayrimenkul/iş soruları için bilgi ver ama çok uzun açıklama yapma.
3. Yanıtların 2-3 cümleyi geçmesin.
4. "Müsait değilim", "Döneceğim" gibi otomatik mesaj ibareleri kullanma.

Yasaklı:
- Yapay zeka olduğunu belli etme.
- "Size nasıl yardımcı olabilirim?" gibi profesyonel asistan cümleleri kurma.`

const DEFAULT_AI_USER = `Aşağıdaki WhatsApp mesajını analiz et ve danışman olarak samimi bir cevap üret:

Gönderen: {{ $json.body.data.pushName }}
Mesaj: {{ $json.body.data.message.conversation || "Metin dışı mesaj (görsel/ses/çıkartma)" }}
Tür: {{ $json.body.data.messageType }}
Kaynak: {{ $json.body.data.key.remoteJid.endsWith('@g.us') ? 'Grup Mesajı' : 'Kişisel Mesaj' }}`

const TEMPLATES = [
  // WhatsApp — Outbound
  { id: 'wa_welcome',     label: 'WA Karşılama',        icon: '👋', cat: 'wa',    desc: 'Yeni müşteriye karşılama mesajı',             defaultMsg: 'Merhaba, Ambiance Gayrimenkul ailesine hoş geldiniz! Size nasıl yardımcı olabiliriz?', defaultSubj: '', defaultSystemPrompt: '' },
  { id: 'wa_followup',    label: 'WA Takip',             icon: '📅', cat: 'wa',    desc: 'Takip tarihi gelen müşteriye hatırlatma',     defaultMsg: 'Merhaba, bugün sizi aramayı planlamıştık. Uygun bir zaman var mı?',                    defaultSubj: '', defaultSystemPrompt: '' },
  { id: 'wa_document',    label: 'WA Belge Bildirimi',   icon: '📄', cat: 'wa',    desc: 'Belge imzalandığında bildirim gönder',        defaultMsg: 'Merhaba, belgeniz başarıyla imzalanmıştır.',                                            defaultSubj: '', defaultSystemPrompt: '' },
  { id: 'wa_campaign',    label: 'WA Kampanya',          icon: '📣', cat: 'wa',    desc: 'Manuel tetiklenen toplu mesaj akışı',         defaultMsg: 'Merhaba, size özel bir teklifimiz var. Detaylar için bizi arayın.',                     defaultSubj: '', defaultSystemPrompt: '' },
  // WhatsApp — AI Bot
  { id: 'wa_aibot',       label: 'WA AI Bot',            icon: '🤖', cat: 'wa',    desc: 'Gelen mesajlara AI ile otomatik yanıt ver',   defaultMsg: DEFAULT_AI_USER, defaultSubj: '', defaultSystemPrompt: DEFAULT_AI_SYSTEM },
  // Email
  { id: 'email_welcome',  label: 'Email Karşılama',      icon: '✉️', cat: 'email', desc: 'Yeni müşteriye karşılama e-postası gönder',   defaultMsg: 'Merhaba,\n\nAmbiance Gayrimenkul ailesine hoş geldiniz!\n\nSize en iyi hizmeti sunmak için buradayız.\n\nSaygılarımızla,\nAmbiance Gayrimenkul', defaultSubj: 'Ambiance Gayrimenkul\'e Hoş Geldiniz!', defaultSystemPrompt: '' },
  { id: 'email_followup', label: 'Email Takip',          icon: '📬', cat: 'email', desc: 'Takip tarihi gelen müşteriye email gönder',   defaultMsg: 'Merhaba,\n\nSizi aramayı planlamıştık. Gayrimenkul ihtiyaçlarınızda yardımcı olmak isteriz.\n\nSaygılarımızla,\nAmbiance Gayrimenkul', defaultSubj: 'Sizi Arayacağız — Ambiance Gayrimenkul', defaultSystemPrompt: '' },
  { id: 'email_document', label: 'Email Belge Bildirimi',icon: '📋', cat: 'email', desc: 'Belge imzalandığında email bildirimi gönder', defaultMsg: 'Merhaba,\n\nBelgeniz başarıyla imzalanmıştır. Süreçle ilgili sorularınız için bize ulaşabilirsiniz.\n\nSaygılarımızla,\nAmbiance Gayrimenkul', defaultSubj: 'Belgeniz İmzalandı — Ambiance Gayrimenkul', defaultSystemPrompt: '' },
]

type WFlow = { id: string; name: string; active: boolean; webhookUrl?: string }

function AutomationsTab() {
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [workflows, setWorkflows] = useState<WFlow[]>([])
  const [loadingWf, setLoadingWf] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [tplId, setTplId] = useState('wa_welcome')
  const [tplCat, setTplCat] = useState<'wa' | 'email'>('wa')
  const [message, setMessage] = useState(TEMPLATES[0].defaultMsg)
  const [subject, setSubject] = useState(TEMPLATES[0].defaultSubj)
  const [systemPrompt, setSystemPrompt] = useState(TEMPLATES[0].defaultSystemPrompt)
  const [creating, setCreating] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.from('consultants').select('id, full_name, wa_instance, is_active').order('full_name').then(({ data }) => {
      if (data) setConsultants(data as Consultant[])
    })
  }, [])

  useEffect(() => {
    if (selectedId) loadWorkflows()
  }, [selectedId])

  async function loadWorkflows() {
    setLoadingWf(true)
    setError('')
    try {
      const res = await fetch(`/api/n8n/workflows?consultantId=${selectedId}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error); setWorkflows([]); } else setWorkflows(data.workflows || [])
    } catch { setError('Yüklenemedi') }
    setLoadingWf(false)
  }

  async function handleCreate() {
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/n8n/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultantId: selectedId, templateId: tplId, message, subject, systemPrompt }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); } else { setShowModal(false); loadWorkflows() }
    } catch { setError('Oluşturulamadı') }
    setCreating(false)
  }

  async function handleToggle(wf: WFlow) {
    setToggling(wf.id)
    try {
      await fetch(`/api/n8n/workflows/${wf.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !wf.active }),
      })
      loadWorkflows()
    } catch { /* ignore */ }
    setToggling(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Bu iş akışını silmek istediğinize emin misiniz?')) return
    setDeleting(id)
    try {
      await fetch(`/api/n8n/workflows/${id}`, { method: 'DELETE' })
      loadWorkflows()
    } catch { /* ignore */ }
    setDeleting(null)
  }

  const selected = consultants.find(c => c.id === selectedId)

  return (
    <div className="space-y-4">
      {/* Consultant selector */}
      <div className="card">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
            <Zap size={14} className="text-orange-500" />
          </div>
          İş Akışı Yönetimi
        </h3>
        <label className="block text-sm text-slate-600 mb-1">Danışman Seçin</label>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
        >
          <option value="">— Danışman seçin —</option>
          {consultants.map(c => (
            <option key={c.id} value={c.id}>
              {c.full_name} {!c.wa_instance ? '⚠️ WA yok' : ''}
            </option>
          ))}
        </select>
        {selected && !selected.wa_instance && (
          <p className="text-xs text-orange-600 mt-2">⚠️ Bu danışmanın WhatsApp instance&apos;ı yok. İş akışı oluşturmak için önce WhatsApp bağlantısı kurulmalı.</p>
        )}
      </div>

      {/* Workflow list */}
      {selectedId && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h4 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <Zap size={14} className="text-orange-500" />
              {selected?.full_name} — İş Akışları
            </h4>
            <button
              onClick={() => { setShowModal(true); setError('') }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600"
            >
              + Yeni İş Akışı
            </button>
          </div>

          {error && (
            <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{error}</div>
          )}

          {loadingWf ? (
            <div className="flex justify-center py-10">
              <Loader2 size={22} className="animate-spin text-slate-400" />
            </div>
          ) : workflows.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Zap size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">Henüz iş akışı yok</p>
              <p className="text-xs mt-1">Yeni İş Akışı butonuyla şablon seçin</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {workflows.map(wf => (
                <div key={wf.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{wf.name}</p>
                    {wf.webhookUrl
                      ? <p className="text-xs text-slate-400 truncate font-mono">{wf.webhookUrl}</p>
                      : <p className="text-xs text-slate-400">ID: {wf.id}</p>
                    }
                  </div>
                  {/* Copy URL */}
                  {wf.webhookUrl && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(wf.webhookUrl!); alert('URL kopyalandı!') }}
                      className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Webhook URL'yi kopyala"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    </button>
                  )}
                  {/* Active toggle */}
                  <button
                    onClick={() => handleToggle(wf)}
                    disabled={toggling === wf.id}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      wf.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {toggling === wf.id
                      ? <Loader2 size={11} className="animate-spin" />
                      : wf.active ? <CheckCircle size={11} /> : <XCircle size={11} />}
                    {wf.active ? 'Aktif' : 'Pasif'}
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(wf.id)}
                    disabled={deleting === wf.id}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Sil"
                  >
                    {deleting === wf.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <h3 className="font-semibold text-slate-900">Yeni İş Akışı Oluştur</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Category tabs */}
              <div>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 mb-3">
                  {(['wa', 'email'] as const).map(cat => (
                    <button
                      key={cat}
                      onClick={() => {
                        setTplCat(cat)
                        const first = TEMPLATES.find(t => t.cat === cat)!
                        setTplId(first.id)
                        setMessage(first.defaultMsg)
                        setSubject(first.defaultSubj)
                        setSystemPrompt(first.defaultSystemPrompt)
                      }}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        tplCat === cat ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {cat === 'wa' ? '💬 WhatsApp' : '✉️ Email'}
                    </button>
                  ))}
                </div>
                {/* Template selection */}
                <label className="block text-sm font-medium text-slate-700 mb-2">Şablon Seçin</label>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.filter(t => t.cat === tplCat).map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setTplId(t.id); setMessage(t.defaultMsg); setSubject(t.defaultSubj); setSystemPrompt(t.defaultSystemPrompt) }}
                      className={`p-3 rounded-xl border-2 text-left transition-colors ${
                        tplId === t.id ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-lg mb-1">{t.icon}</div>
                      <div className="text-xs font-semibold text-slate-800">{t.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5 leading-tight">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* System Prompt (AI Bot only) */}
              {tplId === 'wa_aibot' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">AI Kişilik / Sistem Promptu</label>
                  <textarea
                    value={systemPrompt}
                    onChange={e => setSystemPrompt(e.target.value)}
                    rows={5}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none font-mono text-xs"
                    placeholder="AI'nın nasıl davranacağını tanımlayan talimatlar..."
                  />
                  <p className="text-xs text-slate-400 mt-1">AI'nın karakterini ve yanıt kurallarını belirler</p>
                </div>
              )}

              {/* Subject (email only) */}
              {tplCat === 'email' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">E-posta Konusu</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="E-posta konu satırı"
                  />
                </div>
              )}

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {tplCat === 'email' ? 'E-posta İçeriği' : tplId === 'wa_aibot' ? 'Kullanıcı Prompt Şablonu' : 'Mesaj Şablonu'}
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">Değişkenler: &#123;name&#125;, &#123;phone&#125;, &#123;email&#125;</p>
              </div>

              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>

            {/* Sticky footer buttons */}
            <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0 flex gap-2">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">İptal</button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !message || (tplCat === 'email' && !subject)}
                  className="flex-1 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating ? <><Loader2 size={14} className="animate-spin" /> Oluşturuluyor...</> : 'Oluştur'}
                </button>
              </div>
            </div>
          </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<'consultants' | 'automations' | 'settings'>('consultants')

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
          onClick={() => setTab('automations')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'automations' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Zap size={15} /> Otomasyonlar
        </button>
        <button
          onClick={() => setTab('settings')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'settings' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Settings size={15} /> Ayarlar
        </button>
      </div>

      {tab === 'consultants' && <ConsultantsTab />}
      {tab === 'automations' && <AutomationsTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}
