'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Consultant } from '@/lib/types'
import {
  User, Phone, Mail, FileText, Award, Upload,
  Save, Loader2, CheckCircle, Plus, Trash2,
  MessageCircle, QrCode, Wifi, WifiOff, X, Smartphone,
  RefreshCw, Unlink,
} from 'lucide-react'

// ─── WhatsApp QR Modal ────────────────────────────────────────────────────────

function WAQRModal({ onClose, onConnected }: { onClose: () => void; onConnected: (phone: string) => void }) {
  const [qr, setQr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(25)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const qrRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchQR = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/whatsapp/consultant', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'QR alınamadı'); setLoading(false); return }
      if (data.connected) { setConnected(true); setLoading(false); return }
      setQr(data.base64 || null)
      setCountdown(25)
    } catch {
      setError('Bağlantı hatası')
    }
    setLoading(false)
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/consultant')
      const data = await res.json()
      if (data.connected) {
        setConnected(true)
        onConnected(data.phone || '')
      }
    } catch { /* ignore */ }
  }, [onConnected])

  useEffect(() => {
    fetchQR()
    pollRef.current = setInterval(checkStatus, 4000)
    qrRef.current = setInterval(fetchQR, 25000)
    countRef.current = setInterval(() => setCountdown(c => c <= 1 ? 25 : c - 1), 1000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (qrRef.current) clearInterval(qrRef.current)
      if (countRef.current) clearInterval(countRef.current)
    }
  }, [fetchQR, checkStatus])

  useEffect(() => {
    if (!connected) return
    if (pollRef.current) clearInterval(pollRef.current)
    if (qrRef.current) clearInterval(qrRef.current)
    if (countRef.current) clearInterval(countRef.current)
  }, [connected])

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
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
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <h4 className="font-semibold text-on-surface mb-1">WhatsApp Bağlandı!</h4>
              <p className="text-sm text-on-surface-variant mb-4">Artık mesaj gönderebilirsiniz.</p>
              <button onClick={onClose} className="btn-primary">Tamam</button>
            </div>
          ) : error ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <WifiOff size={22} className="text-red-500" />
              </div>
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <button onClick={fetchQR} className="flex items-center gap-1.5 mx-auto px-4 py-2 border border-outline rounded-lg text-sm hover:bg-surface-container-high">
                <RefreshCw size={13} /> Tekrar Dene
              </button>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-on-surface-variant mb-4">
                WhatsApp'ı açın → <strong>Bağlı Cihazlar</strong> → <strong>Cihaz Ekle</strong> → QR kodu okutun
              </p>
              <div className="relative inline-block">
                {loading ? (
                  <div className="w-52 h-52 bg-surface-container-high rounded-xl flex items-center justify-center mx-auto">
                    <Loader2 size={32} className="animate-spin text-on-surface-variant" />
                  </div>
                ) : qr ? (
                  <div className="relative">
                    <img src={qr} alt="WhatsApp QR" className="w-52 h-52 rounded-xl border-2 border-outline mx-auto" />
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
                <p className="text-xs text-on-surface-variant">QR kod {countdown} saniye sonra yenilenir</p>
                <div className="flex items-center justify-center gap-1.5 text-xs text-on-surface-variant">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  Telefon bağlantısı bekleniyor...
                </div>
              </div>
              <button onClick={fetchQR} disabled={loading} className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 border border-outline rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50">
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> QR'ı Yenile
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── WhatsApp Status Card ─────────────────────────────────────────────────────

function WACard() {
  type WAStatus = { exists: boolean; connected: boolean; instanceName?: string; phone?: string; connectedAt?: string }
  const [status, setStatus] = useState<WAStatus | null>(null)
  const [checking, setChecking] = useState(true)
  const [showQR, setShowQR] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => { checkStatus() }, [])

  async function checkStatus() {
    setChecking(true)
    try {
      const res = await fetch('/api/whatsapp/consultant')
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus(null)
    }
    setChecking(false)
  }

  async function disconnect() {
    if (!confirm('WhatsApp bağlantısını kesmek istediğinize emin misiniz?')) return
    setDisconnecting(true)
    await fetch('/api/whatsapp/consultant', { method: 'DELETE' })
    setDisconnecting(false)
    checkStatus()
  }

  const isConnected = status?.connected
  const phone = status?.phone

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-on-surface flex items-center gap-2">
            <MessageCircle size={16} className="text-green-600" />
            WhatsApp Bağlantısı
          </h2>
          <button onClick={checkStatus} disabled={checking} className="text-on-surface-variant hover:text-on-surface-variant p-1">
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Durum */}
        <div className="flex items-center gap-3 p-3 bg-surface-container-high rounded-xl mb-4">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            checking ? 'bg-surface-container-highest animate-pulse' :
            isConnected ? 'bg-green-500' : 'bg-orange-400'
          }`} />
          <div className="flex-1">
            <p className={`text-sm font-medium ${
              checking ? 'text-on-surface-variant' :
              isConnected ? 'text-green-600' : 'text-orange-500'
            }`}>
              {checking ? 'Kontrol ediliyor...' : isConnected ? 'Bağlı' : 'Bağlı Değil'}
            </p>
            {isConnected && phone && (
              <p className="text-xs text-on-surface-variant mt-0.5">+{phone}</p>
            )}
            {isConnected && status?.connectedAt && (
              <p className="text-xs text-on-surface-variant mt-0.5">
                {new Date(status.connectedAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })} tarihinde bağlandı
              </p>
            )}
            {!isConnected && !checking && (
              <p className="text-xs text-on-surface-variant mt-0.5">Kendi WhatsApp numaranızı bağlayın</p>
            )}
          </div>
          {isConnected && (
            <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <Wifi size={11} /> Aktif
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowQR(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
          >
            <QrCode size={14} />
            {isConnected ? 'Yeniden Bağla' : 'QR ile Bağlan'}
          </button>
          {isConnected && (
            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50"
            >
              {disconnecting ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
              Bağlantıyı Kes
            </button>
          )}
        </div>

        <p className="text-xs text-on-surface-variant mt-3">
          Bağladığınız numara, müşterilere gönderilen tüm WhatsApp mesajlarında kullanılır.
        </p>
      </div>

      {showQR && (
        <WAQRModal
          onClose={() => { setShowQR(false); checkStatus() }}
          onConnected={(p) => { setShowQR(false); checkStatus(); void p }}
        />
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [consultant, setConsultant] = useState<Consultant | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    bio: '',
    tax_number: '',
    id_number: '',
    address: '',
    instagram_handle: '',
    facebook_page: '',
    linkedin_url: '',
    ticari_yetki_belgesi_no: '',
    office_phone: '',
  })

  // Yeni sertifika ekleme
  const [newCert, setNewCert] = useState({ name: '', expires_at: '' })
  const [certifications, setCertifications] = useState<{ name: string; expires_at: string }[]>([])

  useEffect(() => { fetchProfile() }, [])

  async function fetchProfile() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('consultants')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data) {
      setConsultant(data as Consultant)
      setForm({
        full_name: data.full_name || '',
        phone: data.phone || '',
        bio: data.bio || '',
        tax_number: data.tax_number || '',
        id_number: data.id_number || '',
        address: data.address || '',
        instagram_handle: data.instagram_handle || '',
        facebook_page: data.facebook_page || '',
        linkedin_url: data.linkedin_url || '',
        ticari_yetki_belgesi_no: (data as any).ticari_yetki_belgesi_no || '',
        office_phone: (data as any).office_phone || '',
      })
      setCertifications(Array.isArray(data.certifications) ? data.certifications : [])
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!consultant) return
    setSaving(true)

    const supabase = createClient()
    // Telefon numarasını +90 formatına çevir
    let phone = form.phone.replace(/\s/g, '')
    if (phone && !phone.startsWith('+')) {
      if (phone.startsWith('0')) phone = '+90' + phone.slice(1)
      else if (phone.startsWith('90')) phone = '+' + phone
      else phone = '+90' + phone
    }

    const { error } = await supabase
      .from('consultants')
      .update({
        ...form,
        phone,
        certifications: certifications,
      })
      .eq('id', consultant.id)

    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  function addCert() {
    if (!newCert.name) return
    setCertifications(c => [...c, { ...newCert }])
    setNewCert({ name: '', expires_at: '' })
  }

  function removeCert(index: number) {
    setCertifications(c => c.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const completionFields = [
    form.full_name, form.phone, form.bio, form.tax_number,
    consultant?.profile_photo_url, consultant?.authorization_doc_url,
    consultant?.tax_certificate_url, certifications.length > 0 ? 'ok' : '',
  ]
  const completionPct = Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Profilim</h1>
          <p className="text-on-surface-variant text-sm mt-1">Kişisel bilgilerinizi ve belgelerinizi yönetin</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <CheckCircle size={15} /> : <Save size={15} />}
          {saved ? 'Kaydedildi!' : 'Kaydet'}
        </button>
      </div>

      {/* Profil Tamamlık */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-on-surface">Profil Tamamlık</p>
          <span className={`text-sm font-bold ${completionPct >= 80 ? 'text-green-600' : completionPct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
            %{completionPct}
          </span>
        </div>
        <div className="w-full bg-surface-container-high rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${completionPct >= 80 ? 'bg-green-500' : completionPct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
            style={{ width: `${completionPct}%` }}
          />
        </div>
        {completionPct < 95 && (
          <p className="text-xs text-on-surface-variant mt-1.5">
            Profil tamamlık oranı yükseldikçe sistem tarafından daha az hatırlatma alırsınız.
          </p>
        )}
      </div>

      <div className="space-y-5">
        {/* Temel Bilgiler */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <User size={16} /> Kişisel Bilgiler
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Ad Soyad</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1 flex items-center gap-1">
                  <Phone size={12} /> Telefon
                </label>
                <input value={form.phone} onChange={e => {
                    let val = e.target.value.replace(/[^\d+]/g, '')
                    // Otomatik +90 prefix
                    if (val.startsWith('0')) val = '+90' + val.slice(1)
                    else if (val.startsWith('90') && !val.startsWith('+90')) val = '+' + val
                    else if (val.match(/^[1-9]/) && !val.startsWith('+')) val = '+90' + val
                    setForm(f => ({ ...f, phone: val }))
                  }}
                  placeholder="+905XX XXX XXXX"
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1 flex items-center gap-1">
                  <Mail size={12} /> E-posta
                </label>
                <input value={consultant?.email || ''} disabled
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container-high text-on-surface-variant cursor-not-allowed" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Adres</label>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="İlçe, Şehir"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Bio / Hakkımda</label>
              <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                rows={3} placeholder="Kendinizi kısaca tanıtın..."
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
          </div>
        </div>

        {/* Resmi Belgeler */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <FileText size={16} /> Resmi Bilgiler
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Vergi Numarası</label>
              <input value={form.tax_number} onChange={e => setForm(f => ({ ...f, tax_number: e.target.value }))}
                placeholder="1234567890"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">TC Kimlik No</label>
              <input value={form.id_number} onChange={e => setForm(f => ({ ...f, id_number: e.target.value }))}
                placeholder="12345678901"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Ticari Taşınmaz Yetki Belgesi No</label>
              <input value={form.ticari_yetki_belgesi_no} onChange={e => setForm(f => ({ ...f, ticari_yetki_belgesi_no: e.target.value }))}
                placeholder="00000000"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Ofis Telefonu</label>
              <input value={form.office_phone} onChange={e => setForm(f => ({ ...f, office_phone: e.target.value }))}
                placeholder="+902121234567"
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          {/* Belge Yükleme Alanları */}
          <div className="mt-4 space-y-3">
            {[
              { label: 'Vergi Levhası', field: 'tax_certificate_url', url: consultant?.tax_certificate_url },
              { label: 'Kimlik (Ön)', field: 'id_front_url', url: consultant?.id_front_url },
              { label: 'Yetki Belgesi', field: 'authorization_doc_url', url: consultant?.authorization_doc_url },
            ].map(doc => (
              <div key={doc.field} className="flex items-center justify-between p-3 border border-outline rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText size={15} className="text-on-surface-variant" />
                  <span className="text-sm text-on-surface">{doc.label}</span>
                </div>
                {doc.url ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle size={12} /> Yüklendi
                    </span>
                    <a href={doc.url} target="_blank" className="text-xs text-primary hover:underline">Görüntüle</a>
                  </div>
                ) : (
                  <button className="text-xs text-primary flex items-center gap-1 hover:text-primary-hover">
                    <Upload size={12} /> Yükle
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sertifikalar */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <Award size={16} /> Sertifikalar & Yetkinlikler
          </h2>

          {certifications.length > 0 && (
            <div className="space-y-2 mb-3">
              {certifications.map((cert, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-surface-container-high rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-on-surface">{cert.name}</p>
                    {cert.expires_at && (
                      <p className="text-xs text-on-surface-variant">
                        Geçerlilik: {new Date(cert.expires_at).toLocaleDateString('tr-TR')}
                      </p>
                    )}
                  </div>
                  <button onClick={() => removeCert(i)} className="text-red-400 hover:text-red-600 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Yeni Sertifika */}
          <div className="flex gap-2">
            <input
              value={newCert.name}
              onChange={e => setNewCert(c => ({ ...c, name: e.target.value }))}
              placeholder="Sertifika adı (SPK, TDUB...)"
              className="flex-1 border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="date"
              value={newCert.expires_at}
              onChange={e => setNewCert(c => ({ ...c, expires_at: e.target.value }))}
              className="w-36 border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button onClick={addCert} className="btn-secondary flex items-center gap-1 text-xs">
              <Plus size={13} /> Ekle
            </button>
          </div>
        </div>

        {/* Sosyal Medya */}
        <div className="card">
          <h2 className="font-semibold text-on-surface mb-4">Sosyal Medya Hesapları</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-pink-500 text-lg flex-shrink-0">📷</span>
              <input value={form.instagram_handle}
                onChange={e => setForm(f => ({ ...f, instagram_handle: e.target.value }))}
                placeholder="@kullanici_adi"
                className="flex-1 border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4.5 h-4.5 flex-shrink-0 text-primary font-bold text-sm">f</div>
              <input value={form.facebook_page}
                onChange={e => setForm(f => ({ ...f, facebook_page: e.target.value }))}
                placeholder="facebook.com/sayfaniz"
                className="flex-1 border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-primary text-lg flex-shrink-0">in</span>
              <input value={form.linkedin_url}
                onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))}
                placeholder="linkedin.com/in/adsoyadiniz"
                className="flex-1 border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
        </div>

        {/* WhatsApp Bağlantısı */}
        <WACard />

        {/* Komisyon Bilgisi (Salt Okunur) */}
        {consultant && (
          <div className="card bg-surface-container-high">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-on-surface">Komisyon Oranınız</p>
                <p className="text-xs text-on-surface-variant mt-0.5">Bu oran yönetici tarafından belirlenir</p>
              </div>
              <span className="text-2xl font-bold text-primary">%{consultant.commission_rate}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
