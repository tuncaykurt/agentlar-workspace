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
  Zap, ToggleLeft, ToggleRight, Coins, Plus, Minus,
  Puzzle, UserPlus, ChevronDown,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingKey =
  | 'office_name' | 'office_legal_name' | 'office_phone' | 'office_address' | 'office_logo' | 'office_commission_rate' | 'office_mersis' | 'office_jurisdiction'
  | 'default_follow_up_days' | 'whatsapp_welcome_template'
  | 'evolution_api_url' | 'evolution_api_key' | 'evolution_instance' | 'app_url'
  | 'n8n_url' | 'n8n_api_key'
  | 'smtp_host' | 'smtp_port' | 'smtp_user' | 'smtp_pass' | 'smtp_from_name'
  | 'openrouter_api_key'
  | 'office_sahibinden_url' | 'office_sync_cron_secret'

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
  consultant: 'bg-primary-container text-primary',
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
      { key: 'office_jurisdiction',      label: 'Yetkili Mahkeme (Şehir)', type: 'text',     placeholder: 'Bursa',                       desc: 'Sözleşme uyuşmazlıklarında yetkili merci' },
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
    title: 'Sahibinden Ofis Senkronizasyonu',
    icon: Building2,
    color: 'orange',
    settings: [
      { key: 'office_sahibinden_url',    label: 'Sahibinden Mağaza/Liste URL', type: 'url',      placeholder: 'https://www.sahibinden.com/magaza/xyz-emlak', desc: 'Ofise ait tüm ilanları içeren sayfa (mağaza veya arama URL\'i)' },
      { key: 'office_sync_cron_secret',  label: 'Cron Secret',                 type: 'password', placeholder: 'rastgele-uzun-bir-string',                    desc: 'Coolify Scheduled Task bu secret ile isteği doğrulayacak' },
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
      <label className="block text-sm font-medium text-on-surface mb-1">
        Ofis Logosu
        {desc && <span className="text-on-surface-variant font-normal ml-1.5 text-xs">— {desc}</span>}
      </label>

      {/* Preview */}
      {value && (
        <div className="mb-3 relative inline-block">
          <div className="border border-outline rounded-xl p-3 bg-surface-container-high inline-flex items-center justify-center" style={{ minWidth: 120, minHeight: 60 }}>
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
          className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-outline rounded-xl text-sm text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary-container transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {uploading ? 'Yükleniyor...' : value ? 'Logoyu Değiştir' : 'Logo Seç (PNG / JPG)'}
        </button>
        <p className="text-xs text-on-surface-variant mt-1.5">Dosya seçildiğinde otomatik olarak yüklenir. &quot;Kaydet&quot; ile kaydedin.</p>
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
  const inp = 'w-full px-3 py-2 border border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container'

  if (meta.type === 'logo') {
    return <LogoUploadField value={value} onChange={onChange} desc={meta.desc} />
  }

  return (
    <div>
      <label className="block text-sm font-medium text-on-surface mb-1">
        {meta.label}
        {meta.desc && <span className="text-on-surface-variant font-normal ml-1.5 text-xs">— {meta.desc}</span>}
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
            className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface-variant p-1"
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
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline">
          <div className="flex items-center gap-2">
            <Smartphone size={18} className="text-green-600" />
            <h3 className="font-semibold text-on-surface">WhatsApp Bağla</h3>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface-variant p-1 rounded-lg hover:bg-surface-container-highest">
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
              <h4 className="font-semibold text-on-surface mb-1">WhatsApp Bağlandı!</h4>
              <p className="text-sm text-on-surface-variant mb-4">Mesaj gönderebilirsiniz.</p>
              <button onClick={onClose} className="btn-primary">Tamam</button>
            </div>
          ) : error ? (
            /* Error State */
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <WifiOff size={22} className="text-red-500" />
              </div>
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <p className="text-xs text-on-surface-variant mb-4">
                WhatsApp API URL, API Key ve Instance adını kontrol edin.
              </p>
              <button onClick={fetchQR} className="flex items-center gap-1.5 mx-auto px-4 py-2 border border-outline rounded-lg text-sm hover:bg-surface-container-high">
                <RefreshCw size={13} /> Tekrar Dene
              </button>
            </div>
          ) : (
            /* QR State */
            <div className="text-center">
              <p className="text-sm text-on-surface-variant mb-4">
                WhatsApp'ı açın → <strong>Bağlı Cihazlar</strong> → <strong>Cihaz Ekle</strong> → QR kodu okutun
              </p>

              {/* QR Code */}
              <div className="relative inline-block">
                {loadingQr ? (
                  <div className="w-52 h-52 bg-surface-container-high rounded-xl flex items-center justify-center mx-auto">
                    <Loader2 size={32} className="animate-spin text-on-surface-variant" />
                  </div>
                ) : qr ? (
                  <div className="relative">
                    <img
                      src={qr}
                      alt="WhatsApp QR Kodu"
                      className="w-52 h-52 rounded-xl border-2 border-outline mx-auto"
                    />
                    {/* Countdown ring overlay */}
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-surface-container border border-outline rounded-full flex items-center justify-center shadow-sm">
                      <span className="text-xs font-bold text-on-surface-variant">{countdown}</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-52 h-52 bg-surface-container-high rounded-xl flex items-center justify-center mx-auto">
                    <QrCode size={48} className="text-on-surface-variant" />
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-1">
                <p className="text-xs text-on-surface-variant">
                  QR kod {countdown} saniye sonra yenilenir
                </p>
                <div className="flex items-center justify-center gap-1.5 text-xs text-on-surface-variant">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  Telefon bağlantısı bekleniyor...
                </div>
              </div>

              <button
                onClick={fetchQR}
                disabled={loadingQr}
                className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 border border-outline rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
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
        <h3 className="font-semibold text-on-surface flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
            <Zap size={14} className="text-orange-500" />
          </div>
          n8n Otomasyon Bağlantısı
        </h3>
        <button onClick={test} disabled={status === 'testing'} className="text-on-surface-variant hover:text-on-surface-variant p-1" title="Yenile">
          <RefreshCw size={14} className={status === 'testing' ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3 p-3 bg-surface-container-high rounded-xl mb-4">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          status === 'idle' || status === 'testing' ? 'bg-surface-container-highest animate-pulse' :
          status === 'ok' ? 'bg-green-500' : 'bg-red-400'
        }`} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${
            status === 'idle' || status === 'testing' ? 'text-on-surface-variant' :
            status === 'ok' ? 'text-green-600' : 'text-red-500'
          }`}>
            {status === 'idle' || status === 'testing' ? 'Bağlantı kontrol ediliyor...' :
             status === 'ok' ? 'n8n Bağlantısı Aktif' : error}
          </p>
          {status === 'ok' && (
            <p className="text-xs text-on-surface-variant mt-0.5">İş akışları oluşturulabilir ve yönetilebilir</p>
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

      <p className="text-xs text-on-surface-variant mt-3">
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
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-outline">
        <button
          onClick={test}
          disabled={status === 'testing'}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-outline rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
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
            <Wifi size={12} /> Bağlı {msg && <span className="text-on-surface-variant">({msg})</span>}
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
        <h3 className="font-semibold text-on-surface flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
            <MessageCircle size={14} className="text-green-600" />
          </div>
          WhatsApp Bağlantısı
        </h3>
        <button onClick={checkStatus} disabled={checking} className="text-on-surface-variant hover:text-on-surface-variant p-1" title="Yenile">
          <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Durum */}
      <div className="flex items-center gap-3 p-3 bg-surface-container-high rounded-xl mb-4">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          checking ? 'bg-surface-container-highest animate-pulse' :
          result?.reachable ? 'bg-green-500' : 'bg-red-400'
        }`} />
        <div className="flex-1">
          <p className={`text-sm font-medium ${
            checking ? 'text-on-surface-variant' :
            result?.reachable ? 'text-green-600' : 'text-red-500'
          }`}>
            {checking ? 'Kontrol ediliyor...' :
             result?.reachable ? 'WhatsApp Bağlantısı Aktif' : (result?.error || 'Bağlanamadı')}
          </p>
          {result?.reachable && (
            <p className="text-xs text-on-surface-variant mt-0.5">WhatsApp mesajları gönderilebilir</p>
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
        className="flex items-center gap-1.5 px-4 py-2 border border-outline rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
      >
        <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
        Durumu Kontrol Et
      </button>

      <p className="text-xs text-on-surface-variant mt-3">
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
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
            <h3 className="font-semibold text-on-surface flex items-center gap-2">
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
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
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

const ROLES = [
  { value: 'consultant', label: 'Danışman' },
  { value: 'broker',     label: 'Broker' },
  { value: 'manager',    label: 'Müdür' },
  { value: 'admin',      label: 'Admin' },
]

function ConsultantsTab() {
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editRate, setEditRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [roleChangingId, setRoleChangingId] = useState<string | null>(null)

  // Yeni kullanıcı formu
  const [showNewForm, setShowNewForm] = useState(false)
  const [newForm, setNewForm] = useState({ full_name: '', email: '', password: '', role: 'consultant', phone: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

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

  async function changeRole(id: string, newRole: string) {
    setRoleChangingId(id)
    const supabase = createClient()
    await supabase.from('consultants').update({ role: newRole }).eq('id', id)
    // Aynı zamanda office_memberships tablosundaki rolü de senkronize et
    await supabase.from('office_memberships').update({ role: newRole }).eq('consultant_id', id).is('end_date', null)
    setRoleChangingId(null)
    fetchConsultants()
  }

  async function createNewUser() {
    if (!newForm.full_name || !newForm.email || !newForm.password) {
      setCreateError('Ad, e-posta ve şifre zorunludur.')
      return
    }
    setCreating(true)
    setCreateError('')
    setCreateSuccess('')
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Hata oluştu')
      setCreateSuccess(`✅ ${newForm.full_name} (${newForm.role}) başarıyla oluşturuldu!`)
      setNewForm({ full_name: '', email: '', password: '', role: 'consultant', phone: '' })
      fetchConsultants()
    } catch (e: any) {
      setCreateError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const activeCount = consultants.filter(c => c.is_active).length

  return (
    <div className="space-y-4">
      {/* Stats + Yeni Kullanıcı */}
      <div className="flex items-start gap-3">
        <div className="grid grid-cols-3 gap-3 flex-1">
          {[
            { label: 'Toplam', value: consultants.length, color: 'blue' },
            { label: 'Aktif', value: activeCount, color: 'green' },
            { label: 'Pasif', value: consultants.length - activeCount, color: 'slate' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <p className="text-xs text-on-surface-variant">{s.label}</p>
              <p className="text-2xl font-bold text-on-surface mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => { setShowNewForm(v => !v); setCreateError(''); setCreateSuccess('') }}
          className="btn-primary flex items-center gap-2 text-sm flex-shrink-0 mt-0.5"
        >
          <UserPlus size={15} />
          Yeni Kullanıcı
        </button>
      </div>

      {/* Yeni Kullanıcı Formu */}
      {showNewForm && (
        <div className="card border-2 border-primary/20 bg-primary-container/10">
          <h3 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <UserPlus size={16} className="text-primary" />
            Yeni Kullanıcı Oluştur
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Ad Soyad <span className="text-red-500">*</span></label>
              <input
                className="input"
                value={newForm.full_name}
                onChange={e => setNewForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Ahmet Yılmaz"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">E-posta <span className="text-red-500">*</span></label>
              <input
                type="email"
                className="input"
                value={newForm.email}
                onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                placeholder="ahmet@ofis.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Şifre <span className="text-red-500">*</span></label>
              <input
                type="password"
                className="input"
                value={newForm.password}
                onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min. 8 karakter"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Telefon</label>
              <input
                className="input"
                value={newForm.phone}
                onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+905551234567"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-on-surface mb-1">Rol <span className="text-red-500">*</span></label>
              <div className="flex gap-2 flex-wrap">
                {ROLES.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setNewForm(f => ({ ...f, role: r.value }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                      newForm.role === r.value
                        ? r.value === 'broker' ? 'bg-purple-600 text-white border-purple-600'
                          : r.value === 'admin' ? 'bg-red-600 text-white border-red-600'
                          : 'bg-primary text-white border-primary'
                        : 'bg-surface border-outline text-on-surface-variant hover:border-primary'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {newForm.role === 'broker' && (
                <p className="text-xs text-purple-600 mt-2 bg-purple-50 px-3 py-1.5 rounded-lg">
                  🏢 Broker hesabı oluşturulduğunda kullanıcı giriş yaptığında otomatik olarak <strong>/broker</strong> paneline yönlendirilir.
                </p>
              )}
            </div>
          </div>

          {createError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-3">{createError}</p>
          )}
          {createSuccess && (
            <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg mt-3">{createSuccess}</p>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={() => setShowNewForm(false)} className="btn-secondary flex-1">İptal</button>
            <button
              onClick={createNewUser}
              disabled={creating}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {creating ? 'Oluşturuluyor...' : 'Oluştur'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-outline">
          <Shield size={15} className="text-primary" />
          <h2 className="font-semibold text-on-surface text-sm">Kullanıcılar & Roller</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : consultants.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <Users size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Danışman bulunamadı</p>
          </div>
        ) : (
          <div className="divide-y divide-outline">
            {consultants.map(c => (
              <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-surface-container-high">
                <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0 text-primary font-semibold text-sm">
                  {c.full_name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-on-surface text-sm">{c.full_name}</p>
                    {!c.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">Pasif</span>
                    )}
                    {c.wa_phone ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                        <MessageCircle size={10} /><span className="hidden sm:inline">WA</span>
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      </span>
                    ) : c.wa_instance ? (
                      <span className="flex items-center gap-1 text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full">
                        <MessageCircle size={10} /><span className="hidden sm:inline">WA</span>
                        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full" />
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">{c.email}</p>
                  {c.phone && <p className="text-xs text-on-surface-variant">{c.phone}</p>}
                </div>

                {/* Rol Değiştirme */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="relative">
                    <select
                      value={c.role}
                      onChange={e => changeRole(c.id, e.target.value)}
                      disabled={roleChangingId === c.id}
                      className={`appearance-none pr-7 pl-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                        c.role === 'broker' ? 'bg-purple-100 text-purple-700 border-purple-300'
                        : c.role === 'admin' ? 'bg-red-100 text-red-700 border-red-300'
                        : c.role === 'manager' ? 'bg-blue-100 text-blue-700 border-blue-300'
                        : 'bg-surface-container-high text-on-surface-variant border-outline'
                      }`}
                      title="Rolü değiştir"
                    >
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2">
                      {roleChangingId === c.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <ChevronDown size={11} />}
                    </div>
                  </div>

                  {/* Komisyon */}
                  <div className="flex items-center gap-1">
                    <TrendingUp size={12} className="text-on-surface-variant" />
                    {editId === c.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={editRate}
                          onChange={e => setEditRate(e.target.value)}
                          className="w-14 border border-primary rounded px-2 py-0.5 text-xs focus:outline-none"
                          placeholder={String(c.commission_rate)}
                        />
                        <span className="text-xs text-on-surface-variant">%</span>
                        <button onClick={() => updateRate(c.id)} disabled={saving} className="text-green-600 hover:text-green-700">
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={14} />}
                        </button>
                        <button onClick={() => setEditId(null)} className="text-on-surface-variant">
                          <XCircle size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditId(c.id); setEditRate(String(c.commission_rate)) }}
                        className="text-xs text-on-surface-variant hover:text-primary flex items-center gap-1"
                      >
                        %{c.commission_rate} <Edit2 size={10} />
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => toggleActive(c.id, c.is_active)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      c.is_active ? 'text-green-600 hover:bg-green-50' : 'text-on-surface-variant hover:bg-surface-container-highest'
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

const DEFAULT_AI_SYSTEM = `Sen Ambiance Gayrimenkul'dan bir danışmansın. WhatsApp'tan gelen müşteri mesajlarına danışmanın yerine samimi ve doğal şekilde yanıt veriyorsun.

KİŞİLİK:
- Güven veren, aceleci olmayan, sıcak bir gayrimenkul uzmanısın
- Müşteriye ismiyle hitap et (mesajdan çıkarabilirsen)
- Kısa ve öz yaz — maksimum 2-3 cümle, gereksiz doldurma yok
- Emoji kullanabilirsin ama abartma (1-2 max)

SENARYO KARŞILIKLARI:
- Fiyat sorusu → Bölge/tip öğren önce: "Hangi bölge ve kaç oda düşünüyorsunuz?"
- Randevu/görüşme isteği → Gün sor: "Ne zaman müsaitsiniz, bu hafta uyar mı?"
- İlan/yer sorgusu → Yönlendir: "Bütçeniz ve tercih ettiğiniz bölge nedir?"
- Teşekkür/kapanış → Sıcak bitir: "Ne zaman olursa yazın, her zaman buradayım 👍"
- Belirsiz mesaj → Nazikçe netleştir: "Biraz daha anlatır mısınız, doğru anlayayım"
- Ses/görsel/çıkartma → "Mesajınız geldi ama içerik açılmadı, yazarak belirtir misiniz?"

YAPMA:
- "Size nasıl yardımcı olabilirim?" gibi çağrı merkezi kalıpları
- "Yapay zeka olarak..." ibareleri
- Uzun paragraflar, madde listeleri
- "Merhaba" ile başlama (ilk mesajda tamam, tekrar mesajda hayır)
- Bilmediğin bir mülk detayını uydurmak — "Detayları kontrol edeyim, döneceğim" de`

const DEFAULT_PROPERTY_BOT_SYSTEM = `Sen Ambiance Gayrimenkul'dan bir danışmansın. Sana gönderilen mülk bilgilerini kullanarak müşteri sorularını WhatsApp'tan yanıtlıyorsun.

KİŞİLİK:
- Güven veren, sıcak, bilgili bir gayrimenkul danışmanısın
- Mülk bilgilerini doğal bir dille aktar — tablo gibi listeleme, sohbet et
- Kısa tut: maksimum 2-3 cümle, soru cevapsa doğrudan yanıtla
- Emoji kullanabilirsin ama abartma (1-2 max)

MÜLK BİLGİLERİ KULLANIMI:
- Fiyat sorulunca: mülk bilgisindeki fiyatı ver, müzakere edilebilirliğini belirt
- Özellik sorulunca: mülk bilgisindeki detayları doğal cümleyle ilet
- Bilmediğin detay sorulunca: "Detayları kontrol edeyim, döneceğim" de — uydurmak yok

YAPMA:
- "Yapay zeka olarak..." ibareleri
- Uzun paragraflar, madde listeleri
- Bilmediğin bilgiyi uydurmak`

const DEFAULT_AI_USER = `Gönderen: {{ $('Webhook').item.json.body.data.pushName || 'Müşteri' }}
Mesaj: {{ $('Webhook').item.json.body.data.message.conversation || $('Webhook').item.json.body.data.message.extendedTextMessage?.text || '[Ses/görsel/çıkartma]' }}

Danışman olarak bu mesaja kısa ve doğal bir WhatsApp yanıtı yaz.`

const TEMPLATES = [
  // WhatsApp — Outbound
  { id: 'wa_welcome',      label: 'WA Karşılama',         icon: '👋', cat: 'wa',    desc: 'Yeni müşteriye karşılama mesajı',             defaultMsg: 'Merhaba, Ambiance Gayrimenkul ailesine hoş geldiniz! Size nasıl yardımcı olabiliriz?', defaultSubj: '', defaultSystemPrompt: '' },
  { id: 'wa_followup',     label: 'WA Takip',              icon: '📅', cat: 'wa',    desc: 'Takip tarihi gelen müşteriye hatırlatma',     defaultMsg: 'Merhaba, bugün sizi aramayı planlamıştık. Uygun bir zaman var mı?',                    defaultSubj: '', defaultSystemPrompt: '' },
  { id: 'wa_document',     label: 'WA Belge',              icon: '📄', cat: 'wa',    desc: 'Belge imzalandığında bildirim gönder',        defaultMsg: 'Merhaba, belgeniz başarıyla imzalanmıştır.',                                            defaultSubj: '', defaultSystemPrompt: '' },
  { id: 'wa_campaign',     label: 'WA Kampanya',           icon: '📣', cat: 'wa',    desc: 'Manuel tetiklenen toplu mesaj akışı',         defaultMsg: 'Merhaba, size özel bir teklifimiz var. Detaylar için bizi arayın.',                     defaultSubj: '', defaultSystemPrompt: '' },
  { id: 'wa_targeted',     label: 'WA Hedefli',            icon: '🎯', cat: 'wa',    desc: 'Seçilen müşterilere WA gönder + log',        defaultMsg: 'Merhaba, size önemli bir bilgi iletmek istedik.',                                       defaultSubj: '', defaultSystemPrompt: '' },
  // WhatsApp — AI Bots
  { id: 'wa_aibot',        label: 'WA AI Bot',             icon: '🤖', cat: 'wa',    desc: 'Gelen mesajlara AI ile otomatik yanıt ver',   defaultMsg: DEFAULT_AI_USER, defaultSubj: '', defaultSystemPrompt: DEFAULT_AI_SYSTEM },
  { id: 'wa_property_bot', label: 'WA Mülk Botu',          icon: '🏠', cat: 'wa',    desc: 'Seçilen mülk hakkında AI ile soru yanıtlar', defaultMsg: DEFAULT_AI_USER, defaultSubj: '', defaultSystemPrompt: DEFAULT_PROPERTY_BOT_SYSTEM },
  // Email
  { id: 'email_welcome',   label: 'Email Karşılama',       icon: '✉️', cat: 'email', desc: 'Yeni müşteriye karşılama e-postası gönder',   defaultMsg: 'Merhaba,\n\nAmbiance Gayrimenkul ailesine hoş geldiniz!\n\nSize en iyi hizmeti sunmak için buradayız.\n\nSaygılarımızla,\nAmbiance Gayrimenkul', defaultSubj: 'Ambiance Gayrimenkul\'e Hoş Geldiniz!', defaultSystemPrompt: '' },
  { id: 'email_followup',  label: 'Email Takip',           icon: '📬', cat: 'email', desc: 'Takip tarihi gelen müşteriye email gönder',   defaultMsg: 'Merhaba,\n\nSizi aramayı planlamıştık. Gayrimenkul ihtiyaçlarınızda yardımcı olmak isteriz.\n\nSaygılarımızla,\nAmbiance Gayrimenkul', defaultSubj: 'Sizi Arayacağız — Ambiance Gayrimenkul', defaultSystemPrompt: '' },
  { id: 'email_document',  label: 'Email Belge',           icon: '📋', cat: 'email', desc: 'Belge imzalandığında email bildirimi gönder', defaultMsg: 'Merhaba,\n\nBelgeniz başarıyla imzalanmıştır. Süreçle ilgili sorularınız için bize ulaşabilirsiniz.\n\nSaygılarımızla,\nAmbiance Gayrimenkul', defaultSubj: 'Belgeniz İmzalandı — Ambiance Gayrimenkul', defaultSystemPrompt: '' },
]

type WFlow = { id: string; name: string; active: boolean; webhookUrl?: string }
type ClientItem = { id: string; full_name: string; phone?: string }
type PropertyItem = { id: string; title: string; city?: string; district?: string }

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
  const [syncing, setSyncing] = useState<string | null>(null)
  const [error, setError] = useState('')
  // Targeted campaign state
  const [clientList, setClientList] = useState<ClientItem[]>([])
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [clientSearch, setClientSearch] = useState('')
  // Property bot state
  const [propertyList, setPropertyList] = useState<PropertyItem[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('')

  useEffect(() => {
    const supabase = createClient()
    supabase.from('consultants').select('id, full_name, wa_instance, evolution_instance_key, is_active').order('full_name').then(({ data }) => {
      if (data) setConsultants(data as Consultant[])
    })
    // Fetch clients and properties for selectors
    supabase.from('clients').select('id, full_name, phone').order('full_name').then(({ data }) => {
      if (data) setClientList(data as ClientItem[])
    })
    supabase.from('properties').select('id, title, city, district').eq('is_active', true).order('title').then(({ data }) => {
      if (data) setPropertyList(data as PropertyItem[])
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
        body: JSON.stringify({
          consultantId: selectedId,
          templateId: tplId,
          message,
          subject,
          systemPrompt,
          clientIds: tplId === 'wa_targeted' ? selectedClients : undefined,
          propertyId: tplId === 'wa_property_bot' ? selectedPropertyId : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); } else { setShowModal(false); loadWorkflows(); if (data.warning) setError(data.warning) }
    } catch { setError('Oluşturulamadı') }
    setCreating(false)
  }

  async function handleToggle(wf: WFlow) {
    setToggling(wf.id)
    setError('')
    try {
      const res = await fetch(`/api/n8n/workflows/${wf.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !wf.active }),
      })
      const text = await res.text()
      let data: Record<string, string> = {}
      try { data = JSON.parse(text) } catch { /* raw text */ }
      if (!res.ok) {
        const msg = data.error || text.slice(0, 300) || 'Durum değiştirilemedi'
        setError(`n8n hatası: ${msg}`)
      } else {
        loadWorkflows()
      }
    } catch (e) { setError(`Bağlantı hatası: ${e instanceof Error ? e.message : String(e)}`) }
    setToggling(null)
  }

  async function handleSyncWebhook(wfId: string) {
    setSyncing(wfId)
    setError('')
    try {
      const res = await fetch(`/api/n8n/workflows/${wfId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncWebhook: true, consultantId: selectedId }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error)
      else setError('✅ Evolution webhook başarıyla ayarlandı. Bot mesajları almaya hazır.')
    } catch { setError('Webhook ayarlanamadı') }
    setSyncing(null)
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
        <h3 className="font-semibold text-on-surface flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
            <Zap size={14} className="text-orange-500" />
          </div>
          İş Akışı Yönetimi
        </h3>
        <label className="block text-sm text-on-surface-variant mb-1">Danışman Seçin</label>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="w-full px-3 py-2 border border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-surface-container"
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
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline">
            <h4 className="font-semibold text-on-surface text-sm flex items-center gap-2">
              <Zap size={14} className="text-orange-500" />
              {selected?.full_name} — İş Akışları
            </h4>
            <button
              onClick={() => {
                setShowModal(true)
                setError('')
                setSelectedClients([])
                setSelectedPropertyId('')
                setClientSearch('')
                setTplId('wa_welcome')
                setTplCat('wa')
                setMessage(TEMPLATES[0].defaultMsg)
                setSubject(TEMPLATES[0].defaultSubj)
                setSystemPrompt(TEMPLATES[0].defaultSystemPrompt)
              }}
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
              <Loader2 size={22} className="animate-spin text-on-surface-variant" />
            </div>
          ) : workflows.length === 0 ? (
            <div className="text-center py-10 text-on-surface-variant">
              <Zap size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">Henüz iş akışı yok</p>
              <p className="text-xs mt-1">Yeni İş Akışı butonuyla şablon seçin</p>
            </div>
          ) : (
            <div className="divide-y divide-outline">
              {workflows.map(wf => (
                <div key={wf.id} className="px-3 sm:px-4 py-2.5 hover:bg-surface-container-high">
                  {/* Top row: name + active toggle */}
                  <div className="flex items-center gap-2 mb-1">
                    <p className="flex-1 text-xs sm:text-sm font-medium text-on-surface truncate">{wf.name}</p>
                    {/* Active toggle */}
                    <button
                      onClick={() => handleToggle(wf)}
                      disabled={toggling === wf.id}
                      className={`flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium transition-colors ${
                        wf.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                      }`}
                    >
                      {toggling === wf.id
                        ? <Loader2 size={10} className="animate-spin" />
                        : wf.active ? <CheckCircle size={10} /> : <XCircle size={10} />}
                      {wf.active ? 'Aktif' : 'Pasif'}
                    </button>
                  </div>
                  {/* Bottom row: url + action buttons */}
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      {wf.webhookUrl
                        ? <p className="text-[10px] text-on-surface-variant truncate font-mono">{wf.webhookUrl}</p>
                        : <p className="text-[10px] text-on-surface-variant">ID: {wf.id}</p>
                      }
                    </div>
                    {/* Copy URL */}
                    {wf.webhookUrl && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(wf.webhookUrl!); alert('URL kopyalandı!') }}
                        className="p-1 text-on-surface-variant hover:text-primary hover:bg-primary-container rounded-lg transition-colors"
                        title="Webhook URL'yi kopyala"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      </button>
                    )}
                    {/* Sync Evolution webhook — for AI Bot and Property Bot */}
                    {(wf.name.includes('AI Bot') || wf.name.includes('Pazarlama Botu')) && (
                      <button
                        onClick={() => handleSyncWebhook(wf.id)}
                        disabled={syncing === wf.id}
                        className="p-1 text-on-surface-variant hover:text-purple-500 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Evolution webhook'u senkronize et"
                      >
                        {syncing === wf.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      </button>
                    )}
                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(wf.id)}
                      disabled={deleting === wf.id}
                      className="p-1 text-on-surface-variant hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Sil"
                    >
                      {deleting === wf.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-surface-container rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline flex-shrink-0">
              <h3 className="font-semibold text-on-surface text-sm">Yeni İş Akışı Oluştur</h3>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface-variant p-1.5 rounded-lg hover:bg-surface-container-highest">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* Category tabs */}
              <div>
                <div className="flex gap-1 bg-surface-container-high rounded-lg p-0.5 mb-3">
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
                        setSelectedClients([])
                        setSelectedPropertyId('')
                        setClientSearch('')
                      }}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        tplCat === cat ? 'bg-surface-container text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {cat === 'wa' ? '💬 WhatsApp' : '✉️ Email'}
                    </button>
                  ))}
                </div>
                {/* Template selection */}
                <label className="block text-xs font-medium text-on-surface-variant mb-2">Şablon Seçin</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {TEMPLATES.filter(t => t.cat === tplCat).map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTplId(t.id)
                        setMessage(t.defaultMsg)
                        setSubject(t.defaultSubj)
                        setSystemPrompt(t.defaultSystemPrompt)
                        setSelectedClients([])
                        setSelectedPropertyId('')
                        setClientSearch('')
                      }}
                      className={`p-2.5 rounded-xl border-2 text-left transition-colors ${
                        tplId === t.id ? 'border-orange-400 bg-orange-50' : 'border-outline hover:border-outline'
                      }`}
                    >
                      <div className="text-base mb-0.5">{t.icon}</div>
                      <div className="text-xs font-semibold text-on-surface leading-tight">{t.label}</div>
                      <div className="text-[10px] text-on-surface-variant mt-0.5 leading-tight">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Client multi-select (wa_targeted only) */}
              {tplId === 'wa_targeted' && (
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
                    Müşteri Seçin <span className="text-on-surface-variant">({selectedClients.length} seçili)</span>
                  </label>
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    placeholder="Müşteri ara..."
                    className="w-full px-3 py-1.5 border border-outline rounded-lg text-xs mb-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <div className="border border-outline rounded-lg max-h-40 overflow-y-auto divide-y divide-outline">
                    {clientList
                      .filter(c => c.full_name.toLowerCase().includes(clientSearch.toLowerCase()) || (c.phone || '').includes(clientSearch))
                      .map(c => (
                        <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-container-high cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedClients.includes(c.id)}
                            onChange={e => setSelectedClients(prev =>
                              e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                            )}
                            className="rounded border-outline text-orange-500 focus:ring-orange-400"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-on-surface truncate">{c.full_name}</p>
                            {c.phone && <p className="text-[10px] text-on-surface-variant">{c.phone}</p>}
                          </div>
                        </label>
                      ))}
                    {clientList.filter(c => c.full_name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                      <p className="text-xs text-on-surface-variant text-center py-3">Müşteri bulunamadı</p>
                    )}
                  </div>
                  {selectedClients.length > 0 && (
                    <button onClick={() => setSelectedClients([])} className="mt-1 text-[10px] text-on-surface-variant hover:text-red-500">Seçimi temizle</button>
                  )}
                </div>
              )}

              {/* Property selector (wa_property_bot only) */}
              {tplId === 'wa_property_bot' && (
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Mülk Seçin</label>
                  <select
                    value={selectedPropertyId}
                    onChange={e => setSelectedPropertyId(e.target.value)}
                    className="w-full px-3 py-2 border border-outline rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400 bg-surface-container"
                  >
                    <option value="">— Mülk seçin —</option>
                    {propertyList.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.title}{p.city ? ` — ${p.city}${p.district ? ` / ${p.district}` : ''}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-on-surface-variant mt-1">Bot bu mülkün bilgilerini Supabase&apos;den çekip müşteri sorularını yanıtlar</p>
                </div>
              )}

              {/* System Prompt (AI bots only) */}
              {(tplId === 'wa_aibot' || tplId === 'wa_property_bot') && (
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">AI Sistem Promptu</label>
                  <textarea
                    value={systemPrompt}
                    onChange={e => setSystemPrompt(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-outline rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none font-mono"
                    placeholder="AI'nın nasıl davranacağını tanımlayan talimatlar..."
                  />
                </div>
              )}

              {/* Subject (email only) */}
              {tplCat === 'email' && (
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">E-posta Konusu</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-outline rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="E-posta konu satırı"
                  />
                </div>
              )}

              {/* Message — hide for property bot (AI handles everything) */}
              {tplId !== 'wa_property_bot' && (
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">
                    {tplCat === 'email' ? 'E-posta İçeriği' : tplId === 'wa_aibot' ? 'Kullanıcı Prompt Şablonu' : 'Mesaj Şablonu'}
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-outline rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                  />
                  {tplId !== 'wa_aibot' && (
                    <p className="text-[10px] text-on-surface-variant mt-1">Değişkenler: &#123;name&#125;, &#123;phone&#125;, &#123;email&#125;</p>
                  )}
                </div>
              )}

              {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>

            {/* Sticky footer buttons */}
            <div className="px-4 py-3 border-t border-outline flex-shrink-0 flex gap-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-outline rounded-xl text-sm text-on-surface-variant hover:bg-surface-container-high">İptal</button>
              <button
                onClick={handleCreate}
                disabled={
                  creating ||
                  (tplId !== 'wa_property_bot' && !message) ||
                  (tplCat === 'email' && !subject) ||
                  (tplId === 'wa_targeted' && selectedClients.length === 0) ||
                  (tplId === 'wa_property_bot' && !selectedPropertyId)
                }
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
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

// ─── Features Tab ────────────────────────────────────────────────────────────

type FeatureRow = {
  id: string
  feature_key: string
  label: string
  description: string
  route: string
  sort_order: number
  enabled_for_roles: string[]
  is_enabled: boolean
}

function FeaturesTab() {
  const [features, setFeatures] = useState<FeatureRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => { loadFeatures() }, [])

  async function loadFeatures() {
    const supabase = createClient()
    const { data } = await supabase
      .from('feature_config')
      .select('*')
      .order('sort_order')
    if (data) setFeatures(data as FeatureRow[])
    setLoading(false)
  }

  async function toggleFeature(feat: FeatureRow) {
    setSaving(feat.feature_key)
    const supabase = createClient()
    await supabase
      .from('feature_config')
      .update({ is_enabled: !feat.is_enabled })
      .eq('id', feat.id)
    setFeatures(prev => prev.map(f =>
      f.id === feat.id ? { ...f, is_enabled: !f.is_enabled } : f
    ))
    setSaving(null)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-primary-container border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary">
        <strong>Not:</strong> Admin hesabı tüm özelliklere her zaman erişir. Burada açıp kapattığınız özellikler sadece danışman ve müdür rollerini etkiler.
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-outline">
          <Puzzle size={15} className="text-purple-600" />
          <h2 className="font-semibold text-on-surface text-sm">Özellik Yönetimi</h2>
        </div>

        <div className="divide-y divide-outline">
          {features.map(feat => (
            <div key={feat.id} className="flex items-center gap-4 p-4 hover:bg-surface-container-high">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-on-surface text-sm">{feat.label}</p>
                  <code className="text-[10px] text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded">{feat.route}</code>
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5">{feat.description}</p>
              </div>
              <button
                onClick={() => toggleFeature(feat)}
                disabled={saving === feat.feature_key}
                className="flex-shrink-0"
                title={feat.is_enabled ? 'Aktif — kapat' : 'Kapalı — aç'}
              >
                {saving === feat.feature_key ? (
                  <Loader2 size={24} className="animate-spin text-on-surface-variant" />
                ) : feat.is_enabled ? (
                  <ToggleRight size={28} className="text-green-500" />
                ) : (
                  <ToggleLeft size={28} className="text-on-surface-variant" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Credits Tab ─────────────────────────────────────────────────────────────

function CreditsTab() {
  const [consultants, setConsultants] = useState<(Consultant & { credit_balance?: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [grantId, setGrantId] = useState<string | null>(null)
  const [grantAmount, setGrantAmount] = useState('')
  const [grantDesc, setGrantDesc] = useState('')
  const [granting, setGranting] = useState(false)
  const [msg, setMsg] = useState('')

  // Credit settings
  const [initialCredits, setInitialCredits] = useState('5')
  const [costPerDoc, setCostPerDoc] = useState('1')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const [{ data: cons }, { data: settings }] = await Promise.all([
      supabase.from('consultants').select('*').order('full_name'),
      supabase.from('settings').select('key, value').in('key', ['initial_free_credits', 'credit_cost_per_document']),
    ])
    if (cons) setConsultants(cons as (Consultant & { credit_balance?: number })[])
    for (const s of settings || []) {
      const val = String(s.value).replace(/^"|"$/g, '')
      if (s.key === 'initial_free_credits') setInitialCredits(val)
      if (s.key === 'credit_cost_per_document') setCostPerDoc(val)
    }
    setLoading(false)
  }

  async function handleGrant() {
    if (!grantId || !grantAmount) return
    setGranting(true)
    setMsg('')
    try {
      const res = await fetch('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consultant_id: grantId,
          amount: parseInt(grantAmount, 10),
          description: grantDesc || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setMsg(`${data.consultant_name}: yeni bakiye ${data.new_balance} kredi`)
        setGrantId(null)
        setGrantAmount('')
        setGrantDesc('')
        loadData()
      } else {
        setMsg(data.error || 'Hata oluştu')
      }
    } catch {
      setMsg('Bağlantı hatası')
    }
    setGranting(false)
  }

  async function saveSettings() {
    setSavingSettings(true)
    const supabase = createClient()
    await supabase.from('settings').upsert([
      { key: 'initial_free_credits', value: parseInt(initialCredits, 10) || 5, updated_at: new Date().toISOString() },
      { key: 'credit_cost_per_document', value: parseInt(costPerDoc, 10) || 1, updated_at: new Date().toISOString() },
    ], { onConflict: 'key' })
    setSavingSettings(false)
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Kredi Ayarları */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-on-surface flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-yellow-50 flex items-center justify-center">
            <Coins size={14} className="text-yellow-600" />
          </div>
          Kredi Ayarları
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">
              Hoş Geldin Kredisi
              <span className="text-on-surface-variant font-normal ml-1.5 text-xs">— Yeni kayıt olan danışmana verilen ücretsiz kredi</span>
            </label>
            <input
              type="number"
              value={initialCredits}
              onChange={e => setInitialCredits(e.target.value)}
              className="w-full px-3 py-2 border border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">
              Belge Başına Maliyet
              <span className="text-on-surface-variant font-normal ml-1.5 text-xs">— Her belge oluşturmada kesilecek kredi</span>
            </label>
            <input
              type="number"
              value={costPerDoc}
              onChange={e => setCostPerDoc(e.target.value)}
              className="w-full px-3 py-2 border border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              min="0"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          {settingsSaved && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle size={12} /> Kaydedildi
            </span>
          )}
          <button
            onClick={saveSettings}
            disabled={savingSettings}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            {savingSettings ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Kaydet
          </button>
        </div>
      </div>

      {/* Kredi Yükleme */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-on-surface flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
            <Plus size={14} className="text-green-600" />
          </div>
          Kredi Yükle / Düş
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Danışman</label>
            <select
              value={grantId || ''}
              onChange={e => setGrantId(e.target.value || null)}
              className="w-full px-3 py-2 border border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Seçin...</option>
              {consultants.filter(c => c.role !== 'admin').map(c => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.credit_balance ?? 0} kredi)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">
              Miktar <span className="text-on-surface-variant">(+ yükle, - düş)</span>
            </label>
            <input
              type="number"
              value={grantAmount}
              onChange={e => setGrantAmount(e.target.value)}
              className="w-full px-3 py-2 border border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="10"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Açıklama (opsiyonel)</label>
            <input
              type="text"
              value={grantDesc}
              onChange={e => setGrantDesc(e.target.value)}
              className="w-full px-3 py-2 border border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Kredi yükleme"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGrant}
            disabled={granting || !grantId || !grantAmount}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {granting ? <Loader2 size={14} className="animate-spin" /> : <Coins size={14} />}
            Uygula
          </button>
          {msg && <span className="text-xs text-on-surface-variant">{msg}</span>}
        </div>
      </div>

      {/* Danışman Kredi Tablosu */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-outline">
          <Coins size={15} className="text-yellow-500" />
          <h2 className="font-semibold text-on-surface text-sm">Danışman Kredi Bakiyeleri</h2>
        </div>
        <div className="divide-y divide-outline">
          {consultants.filter(c => c.role !== 'admin').map(c => (
            <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-surface-container-high">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0 text-yellow-700 font-semibold text-sm">
                {c.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-on-surface text-sm">{c.full_name}</p>
                <p className="text-xs text-on-surface-variant">{c.email}</p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-50 border border-yellow-200">
                <Coins size={13} className="text-yellow-600" />
                <span className="text-sm font-semibold text-yellow-700">{c.credit_balance ?? 0}</span>
                <span className="text-xs text-yellow-500">kredi</span>
              </div>
            </div>
          ))}
          {consultants.filter(c => c.role !== 'admin').length === 0 && (
            <div className="text-center py-8 text-on-surface-variant text-sm">
              Henüz danışman yok
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type AdminTab = 'consultants' | 'automations' | 'features' | 'credits' | 'settings'

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('consultants')

  const tabs: { key: AdminTab; label: string; shortLabel: string; icon: React.ElementType }[] = [
    { key: 'consultants', label: 'Danışmanlar', shortLabel: 'Ekip',       icon: Users },
    { key: 'features',    label: 'Özellikler',  shortLabel: 'Özellik',    icon: Puzzle },
    { key: 'credits',     label: 'Krediler',     shortLabel: 'Kredi',      icon: Coins },
    { key: 'automations', label: 'Otomasyonlar', shortLabel: 'Otomasyon',  icon: Zap },
    { key: 'settings',    label: 'Ayarlar',      shortLabel: 'Ayarlar',    icon: Settings },
  ]

  return (
    <div className="p-3 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-on-surface">Yönetim Paneli</h1>
        <p className="text-on-surface-variant text-xs sm:text-sm mt-0.5">Danışman yönetimi, özellikler, krediler ve sistem ayarları</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-container-high rounded-xl p-1 mb-4 sm:mb-5 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap min-w-0 ${
                tab === t.key ? 'bg-surface-container text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon size={13} /> <span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{t.shortLabel}</span>
            </button>
          )
        })}
      </div>

      {tab === 'consultants' && <ConsultantsTab />}
      {tab === 'features' && <FeaturesTab />}
      {tab === 'credits' && <CreditsTab />}
      {tab === 'automations' && <AutomationsTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}
