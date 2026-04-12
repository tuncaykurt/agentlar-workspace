'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Document, SignatureStatus } from '@/lib/types'
import {
  ArrowLeft, Printer, Trash2, CheckCircle, Clock,
  XCircle, AlertCircle, FileText, User, Building2, Edit3,
  Send, MessageCircle, Copy, ExternalLink, Plus, RefreshCw,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type DocRow = Document & {
  client?: { id: string; full_name: string; salutation?: string; phone?: string; email?: string } | null
  property?: { id: string; title: string; city?: string; district?: string } | null
  consultant?: { id: string; full_name: string } | null
}

type SigRequest = {
  id: string
  document_id: string
  signer_name: string
  signer_phone: string | null
  signer_role: string
  token: string
  status: string
  signature_type: string | null
  signature_data: string | null
  viewed_at: string | null
  signed_at: string | null
  wa_sent_at: string | null
  ip_address: string | null
}

type TemplateData = Record<string, string | null | undefined>

// ─── Config ───────────────────────────────────────────────────────────────────

const sigStatusConfig: Record<SignatureStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft:    { label: 'Taslak',       color: 'bg-slate-100 text-slate-600',   icon: FileText },
  sent:     { label: 'Gönderildi',   color: 'bg-blue-100 text-blue-700',     icon: Clock },
  viewed:   { label: 'Görüldü',      color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  signed:   { label: 'İmzalandı',    color: 'bg-green-100 text-green-700',   icon: CheckCircle },
  declined: { label: 'Reddedildi',   color: 'bg-red-100 text-red-700',       icon: XCircle },
  expired:  { label: 'Süresi Doldu', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
}

const reqStatusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Bekliyor',    color: 'bg-slate-100 text-slate-600',   icon: Clock },
  viewed:  { label: 'Görüldü',     color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  signed:  { label: 'İmzalandı',   color: 'bg-green-100 text-green-700',   icon: CheckCircle },
  declined:{ label: 'Reddedildi',  color: 'bg-red-100 text-red-700',       icon: XCircle },
}

const docTypeLabels: Record<string, string> = {
  authorization:   'Yetki Belgesi',
  sales_contract:  'Satış Sözleşmesi',
  rental_contract: 'Kira Sözleşmesi',
  offer_letter:    'Teklif Mektubu',
  other:           'Diğer',
}

const STATUS_OPTIONS: SignatureStatus[] = ['draft', 'sent', 'viewed', 'signed', 'declined', 'expired']

function formatDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatDateTime(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function money(v: string | null | undefined) {
  if (!v) return '—'
  const n = parseFloat(v.replace(',', '.'))
  if (isNaN(n)) return v
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n)
}

// ─── Template Detail Renderer ─────────────────────────────────────────────────

function TemplateDetails({ docType, data }: { docType: string; data: TemplateData }) {
  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div key={label} className="flex gap-2 text-sm py-1.5 border-b border-slate-100 last:border-0">
        <span className="text-slate-500 w-44 flex-shrink-0">{label}</span>
        <span className="text-slate-900 font-medium">{value}</span>
      </div>
    ) : null

  if (docType === 'authorization') return <div>
    {row('Yetki Türü', data.yetki_turu)}
    {row('Başlangıç Tarihi', formatDate(data.baslangic_tarihi as string))}
    {row('Yetki Süresi', data.yetki_suresi_gun ? data.yetki_suresi_gun + ' gün' : null)}
    {row('Komisyon Oranı', data.komisyon_orani ? '%' + data.komisyon_orani + ' + KDV' : null)}
    {row('Komisyon Kime Ait', data.komisyon_turu)}
    {row('Özel Şartlar', data.ozel_sartlar)}
  </div>

  if (docType === 'sales_contract') return <div>
    {row('Satış Bedeli', money(data.satis_bedeli as string))}
    {row('Kapora Tutarı', money(data.kapora as string))}
    {row('Kapora Tarihi', formatDate(data.kapora_tarihi as string))}
    {row('Tapu Tescil Tarihi', formatDate(data.teslim_tarihi as string))}
    {data.second_client_name && row('Alıcı', data.second_client_name)}
    {row('Özel Şartlar', data.ozel_sartlar)}
  </div>

  if (docType === 'rental_contract') return <div>
    {row('Aylık Kira', money(data.aylik_kira as string))}
    {row('Depozito', money(data.depozito as string))}
    {row('Kira Başlangıcı', formatDate(data.kira_baslangic as string))}
    {row('Kira Süresi', data.kira_suresi_ay ? data.kira_suresi_ay + ' ay' : null)}
    {row('Ödeme Günü', data.odeme_gunu ? 'Her ayın ' + data.odeme_gunu + '. günü' : null)}
    {data.second_client_name && row('Kiracı', data.second_client_name)}
    {row('Özel Şartlar', data.ozel_sartlar)}
  </div>

  if (docType === 'offer_letter') return <div>
    {row('Teklif Bedeli', money(data.teklif_bedeli as string))}
    {row('Geçerlilik Tarihi', formatDate(data.gecerlilik_tarihi as string))}
    {data.second_client_name && row('Satıcı', data.second_client_name)}
    {row('Özel Şartlar', data.ozel_sartlar)}
  </div>

  return null
}

// ─── Add Signer Modal ─────────────────────────────────────────────────────────

function AddSignerModal({
  doc,
  onClose,
  onAdded,
}: {
  doc: DocRow
  onClose: () => void
  onAdded: () => void
}) {
  const templateData = (doc.template_data || {}) as TemplateData
  const [signerName, setSignerName] = useState('')
  const [signerPhone, setSignerPhone] = useState('')
  const [signerRole, setSignerRole] = useState('main')
  const [saving, setSaving] = useState(false)

  // Pre-fill from doc parties
  useEffect(() => {
    if (doc.client) {
      setSignerName(`${doc.client.salutation ? doc.client.salutation + ' ' : ''}${doc.client.full_name}`.trim())
      setSignerPhone(doc.client.phone || '')
    }
  }, [doc])

  const mainLabel =
    doc.doc_type === 'authorization' ? 'Mülk Sahibi' :
    doc.doc_type === 'sales_contract' ? 'Satıcı' :
    doc.doc_type === 'rental_contract' ? 'Kiraya Veren' : 'Alıcı'

  const secondLabel =
    doc.doc_type === 'sales_contract' ? 'Alıcı' :
    doc.doc_type === 'rental_contract' ? 'Kiracı' : 'Diğer Taraf'

  const hasSecond = doc.doc_type !== 'authorization'

  async function handleAdd() {
    if (!signerName.trim() || !signerPhone.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('signature_requests').insert({
      document_id: doc.id,
      signer_name: signerName.trim(),
      signer_phone: signerPhone.trim().replace(/\s/g, ''),
      signer_role: signerRole,
    })
    setSaving(false)
    onAdded()
    onClose()
  }

  // Pre-fill second party when role changes
  function handleRoleChange(role: string) {
    setSignerRole(role)
    if (role === 'main' && doc.client) {
      setSignerName(`${doc.client.salutation ? doc.client.salutation + ' ' : ''}${doc.client.full_name}`.trim())
      setSignerPhone(doc.client.phone || '')
    } else if (role === 'second') {
      const secondName = templateData.second_client_name
      setSignerName(String(secondName || ''))
      setSignerPhone('')
    } else {
      setSignerName('')
      setSignerPhone('')
    }
  }

  const inp = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h3 className="font-semibold text-slate-900">İmzacı Ekle</h3>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
          <select value={signerRole} onChange={e => handleRoleChange(e.target.value)} className={inp}>
            <option value="main">{mainLabel}</option>
            {hasSecond && <option value="second">{secondLabel}</option>}
            <option value="other">Diğer</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Ad Soyad</label>
          <input type="text" value={signerName} onChange={e => setSignerName(e.target.value)} className={inp} placeholder="İmzacı adı" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp Numarası</label>
          <input type="tel" value={signerPhone} onChange={e => setSignerPhone(e.target.value)} className={inp} placeholder="905xxxxxxxxx" />
          <p className="text-xs text-slate-400 mt-1">Ülke kodu ile yazın (ör: 905551234567)</p>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            İptal
          </button>
          <button
            onClick={handleAdd}
            disabled={saving || !signerName.trim() || !signerPhone.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Ekleniyor...' : 'Ekle'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Signer Row ───────────────────────────────────────────────────────────────

function SignerRow({
  req,
  appUrl,
  officeName,
  docTitle,
  consultantInstance,
  onRefresh,
  onDelete,
}: {
  req: SigRequest
  appUrl: string
  officeName: string
  docTitle: string
  consultantInstance?: string | null
  onRefresh: () => void
  onDelete: (id: string) => void
}) {
  const supabase = createClient()
  const signingLink = `${appUrl}/sign/${req.token}`
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sendResult, setSendResult] = useState<'idle' | 'ok' | 'error'>('idle')
  const [sendError, setSendError] = useState<string>('')
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const statusConf = reqStatusConfig[req.status] || reqStatusConfig.pending
  const StatusIcon = statusConf.icon

  async function sendWhatsApp() {
    setSending(true)
    setSendResult('idle')
    setSendError('')
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: req.signer_phone,
          message: `Merhaba ${req.signer_name},\n\n*${officeName}* adına düzenlenen belgeni imzalamak için aşağıdaki linke tıkla:\n\n${signingLink}\n\n_Bu link yalnızca sana özeldir._`,
          ...(consultantInstance ? { instanceName: consultantInstance } : {}),
        }),
      })
      if (res.ok) {
        await supabase
          .from('signature_requests')
          .update({ wa_sent_at: new Date().toISOString() })
          .eq('id', req.id)
        setSendResult('ok')
        onRefresh()
      } else {
        const errData = await res.json().catch(() => ({}))
        const detail = errData.detail ? ` (${errData.detail.slice(0, 120)})` : ''
        setSendError((errData.error || `HTTP ${res.status}`) + detail)
        setSendResult('error')
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Bağlantı hatası')
      setSendResult('error')
    }
    setSending(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('signature_requests').delete().eq('id', req.id)
    onDelete(req.id)
    setDeleting(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(signingLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const roleLabels: Record<string, string> = {
    main: 'Birinci Taraf', second: 'İkinci Taraf', other: 'Diğer',
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-slate-900 text-sm">{req.signer_name}</p>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {roleLabels[req.signer_role] || req.signer_role}
            </span>
          </div>
          {req.signer_phone && <p className="text-xs text-slate-500 mt-0.5">{req.signer_phone}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${statusConf.color}`}>
            <StatusIcon size={10} />
            {statusConf.label}
          </span>
          {req.status !== 'signed' && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="text-slate-300 hover:text-red-500 transition-colors p-0.5"
              title="İmzacıyı Sil"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
          <p className="text-xs text-red-700 font-medium">{req.signer_name} imzacıyı silmek istiyor musunuz?</p>
          <div className="flex gap-2">
            <button
              onClick={() => setDeleteConfirm(false)}
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
            >
              İptal
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Siliniyor...' : 'Sil'}
            </button>
          </div>
        </div>
      )}

      {/* Timestamps */}
      {(req.wa_sent_at || req.viewed_at || req.signed_at) && (
        <div className="text-xs text-slate-400 space-y-0.5">
          {req.wa_sent_at && <p>📤 Gönderildi: {formatDateTime(req.wa_sent_at)}</p>}
          {req.viewed_at && <p>👁 Görüldü: {formatDateTime(req.viewed_at)}</p>}
          {req.signed_at && <p>✅ İmzalandı: {formatDateTime(req.signed_at)}</p>}
          {req.ip_address && req.signed_at && <p>🌐 IP: {req.ip_address}</p>}
        </div>
      )}

      {/* İmza bilgisi */}
      {req.status === 'signed' && req.signature_type && (
        <div className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded-lg">
          {req.signature_type === 'drawn' ? '✏️ El imzası ile imzalandı' : '⌨️ İsim yazılarak imzalandı'}
        </div>
      )}

      {/* Actions */}
      {req.status !== 'signed' && (
        <div className="flex gap-2 flex-wrap">
          {req.signer_phone && (
            <button
              onClick={sendWhatsApp}
              disabled={sending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <MessageCircle size={12} />
              {sending ? 'Gönderiliyor...' : req.wa_sent_at ? 'Tekrar Gönder' : 'WhatsApp Gönder'}
            </button>
          )}
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
          >
            <Copy size={12} />
            {copied ? 'Kopyalandı!' : 'Linki Kopyala'}
          </button>
          <a
            href={signingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
          >
            <ExternalLink size={12} /> Önizle
          </a>
        </div>
      )}

      {sendResult === 'ok' && (
        <p className="text-xs text-green-600">✅ WhatsApp mesajı gönderildi.</p>
      )}
      {sendResult === 'error' && (
        <p className="text-xs text-red-600">⚠️ Gönderilemedi: {sendError || 'Evolution API hatası'}</p>
      )}
    </div>
  )
}

// ─── Print HTML ───────────────────────────────────────────────────────────────

function buildPrintHTML(doc: DocRow, officeName: string, sigRequests: SigRequest[] = [], officeAddress?: string, _officeLogo?: string) {
  const data = (doc.template_data || {}) as TemplateData
  const created = formatDate(doc.created_at)

  // CB Ambiance logo — sabit SVG
  const CB_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 68" width="220" height="62">
    <rect x="1" y="1" width="62" height="62" rx="5" fill="#1B3A6B"/>
    <rect x="5" y="5" width="54" height="54" rx="3" fill="none" stroke="white" stroke-width="1.5"/>
    <text x="6" y="50" font-family="Georgia,Times New Roman,serif" font-weight="bold" font-size="38" fill="white" letter-spacing="-3">CB</text>
    <polygon points="52,8 54.5,15 62,15 56,19 58.5,26 52,22 45.5,26 48,19 42,15 49.5,15" fill="white"/>
    <text x="58" y="56" font-family="Arial,sans-serif" font-size="5.5" fill="white">SM</text>
    <text x="73" y="24" font-family="Arial,sans-serif" font-weight="bold" font-size="15.5" fill="#1B3A6B" letter-spacing="1">COLDWELL BANKER</text>
    <line x1="73" y1="29" x2="238" y2="29" stroke="#1B3A6B" stroke-width="1.5"/>
    <text x="73" y="52" font-family="Arial,sans-serif" font-weight="bold" font-size="19" fill="#1B3A6B" letter-spacing="4">AMBIANCE</text>
  </svg>`

  const clientName = (c?: { full_name: string; salutation?: string } | null) =>
    c ? `${c.salutation ? c.salutation + ' ' : ''}${c.full_name}` : '_______________'

  // Find signed request for a given role and render signature
  const sigArea = (role: string, fallbackName: string) => {
    const req = sigRequests.find(r => r.signer_role === role && r.status === 'signed')
    if (!req) {
      return `<div class="sig-area"></div>`
    }
    if (req.signature_type === 'drawn' && req.signature_data?.startsWith('data:image')) {
      return `<div class="sig-area"><img src="${req.signature_data}" alt="İmza" /></div>`
    }
    if (req.signature_type === 'typed' && req.signature_data) {
      return `<div class="sig-area"><span class="sig-typed">${req.signature_data}</span></div>`
    }
    return `<div class="sig-area"></div>`
  }

  const m = (v: string | null | undefined) => money(v)
  const fd = (v: string | null | undefined) => formatDate(v as string)

  const styles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', Times, serif; max-width: 820px; margin: 0 auto; padding: 48px 40px; color: #111; font-size: 13px; line-height: 1.8; }
    h1 { font-size: 20px; text-align: center; text-transform: uppercase; letter-spacing: 4px; margin-bottom: 6px; }
    .sub { text-align: center; font-size: 12px; color: #555; margin-bottom: 6px; }
    .divider { border: none; border-top: 2px solid #111; margin: 12px 0 24px; }
    h2 { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 20px 0 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    td { padding: 3px 6px; vertical-align: top; }
    td:first-child { font-weight: bold; width: 200px; white-space: nowrap; }
    p { margin-bottom: 8px; text-align: justify; }
    .sigs { display: flex; justify-content: space-between; margin-top: 64px; flex-wrap: wrap; gap: 24px; }
    .sig { text-align: center; min-width: 180px; }
    .sig-line { border-top: 1px solid #333; padding-top: 8px; margin-top: 8px; font-size: 12px; }
    .sig-area { height: 56px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 0; }
    .sig-area img { max-height: 52px; max-width: 180px; object-fit: contain; }
    .sig-typed { font-family: 'Brush Script MT', cursive; font-size: 22px; color: #1e293b; line-height: 1.2; }
    .footer { margin-top: 40px; font-size: 10px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 10px; }
    .print-btn { background: #2563eb; color: #fff; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; margin-bottom: 24px; }
    .letterhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .letterhead img { max-height: 70px; max-width: 220px; object-fit: contain; }
    .letterhead-text { text-align: right; font-size: 11px; color: #444; line-height: 1.6; }
    @media print { .no-print { display: none !important; } body { padding: 20px; } }
  `

  const cRow = (label: string, c?: { full_name: string; salutation?: string; phone?: string; email?: string } | null) => `
    <tr><td>${label}:</td><td>${clientName(c)}</td></tr>
    <tr><td>Telefon:</td><td>${c?.phone || '_______________'}</td></tr>
    <tr><td>E-posta:</td><td>${c?.email || '_______________'}</td></tr>
    <tr><td>TC / Vergi No:</td><td>_______________</td></tr>
    <tr><td>Adres:</td><td>_______________</td></tr>
  `

  const prop = doc.property
  const propRows = prop ? `
    <tr><td>Mülk Adı:</td><td>${prop.title}</td></tr>
    ${prop.city || prop.district ? `<tr><td>Konum:</td><td>${[prop.city, prop.district].filter(Boolean).join(' / ')}</td></tr>` : ''}
  ` : `<tr><td>Taşınmaz:</td><td>Ada: ___ Parsel: ___ Pafta: ___</td></tr><tr><td>Adres:</td><td>_______________</td></tr>`

  const secondName = data.second_client_name || '_______________'

  // Authorization helpers (reuse in template)
  const chk = (c: boolean) => c ? '&#9745;' : '&#9744;'
  const sureSon = (() => {
    try { const d = new Date(data.baslangic_tarihi as string || new Date()); d.setDate(d.getDate() + parseInt(String(data.yetki_suresi_gun || '90'))); return d.toLocaleDateString('tr-TR', { day:'2-digit', month:'long', year:'numeric' }) } catch { return '___' }
  })()
  const propType = doc.property?.property_type || ''
  const propAddr = [doc.property?.address, doc.property?.district, doc.property?.city].filter(Boolean).join(', ') || '___'
  const stBAuth = `
    <style>
      .auth-table{width:100%;border-collapse:collapse;margin-bottom:0;font-size:11px;}
      .auth-table td{border:1px solid #000;padding:3px 6px;vertical-align:middle;}
      .sec-title{background:#e0e0e0;font-weight:bold;font-size:11px;padding:3px 6px;border:1px solid #000;border-bottom:none;text-transform:uppercase;}
      .clause{font-size:10.5px;line-height:1.65;margin-bottom:5px;text-align:justify;}
      .auth-sigs{display:flex;justify-content:space-between;margin-top:24px;gap:20px;}
      .auth-sig{text-align:center;flex:1;}
      .auth-sig-label{font-size:10px;font-weight:bold;margin-bottom:4px;}
      .auth-sig-box{border-top:1px solid #000;padding-top:4px;min-height:60px;font-size:10px;}
    </style>`

  const templates: Record<string, { title: string; body: string; sigs: string }> = {
    authorization: {
      title: 'ARACILIK SÖZLEŞMESİ',
      body: `
        ${stBAuth}
        <table class="auth-table" style="margin-bottom:0;">
          <tr>
            <td style="width:42%;vertical-align:top;padding:8px;border-right:2px solid #000;">
              <div style="margin-bottom:4px;">${CB_LOGO_SVG.replace('width="220"','width="160"').replace('height="62"','height="46"')}</div>
              <div style="font-size:9px;margin-top:3px;line-height:1.5;">${(officeAddress || '').replace(/\n/g, '<br>')}</div>
            </td>
            <td style="width:58%;padding:0;vertical-align:top;">
              <div style="background:#1a3a6b;color:#fff;text-align:center;padding:5px 8px;font-weight:bold;font-size:13px;letter-spacing:2px;">ARACILIK SÖZLEŞMESİ</div>
              <div style="padding:6px 8px;">
                <table style="width:100%;border-collapse:collapse;font-size:10px;">
                  <tr><td style="font-weight:bold;width:85px;padding:2px 0;">AD SOYAD</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${clientName(doc.client)}</td></tr>
                  <tr><td style="font-weight:bold;padding:2px 0;">ADRESİ</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${(data.main_address as string) || doc.client?.address || ''}</td></tr>
                  <tr><td style="font-weight:bold;padding:2px 0;">TELEFON</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${doc.client?.phone || ''}</td></tr>
                  <tr><td style="font-weight:bold;padding:2px 0;">TC No</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${(data.main_tc_no as string) || ''}</td></tr>
                  <tr><td style="font-weight:bold;padding:2px 0;">e-mail</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${(data.main_email as string) || doc.client?.email || ''}</td></tr>
                </table>
              </div>
            </td>
          </tr>
        </table>
        <div class="sec-title" style="margin-top:6px;">GAYRİMENKULE AİT BİLGİLER</div>
        <table class="auth-table">
          <tr>
            <td style="text-align:center;">${chk(propType==='detached_house')} Ev</td>
            <td style="text-align:center;">${chk(propType==='apartment')} Apt. Dairesi</td>
            <td style="text-align:center;">${chk(['commercial','office'].includes(propType))} İşyeri</td>
            <td style="text-align:center;">${chk(propType==='shop')} Dükkan</td>
            <td style="text-align:center;">${chk(propType==='villa')} Villa</td>
            <td style="text-align:center;">${chk(propType==='land')} Arsa</td>
            <td style="text-align:center;">${chk(!['detached_house','apartment','commercial','office','shop','villa','land'].includes(propType))} Diğer</td>
          </tr>
          <tr><td colspan="2" style="font-weight:bold;">Adresi</td><td colspan="5">${propAddr}</td></tr>
          <tr><td style="font-weight:bold;">İlçesi</td><td colspan="2">${doc.property?.district || '___'}</td><td style="font-weight:bold;">İli</td><td colspan="3">${doc.property?.city || '___'}</td></tr>
          <tr><td colspan="2" style="font-weight:bold;">Tapu Kayıt Bilg.</td><td>Pafta: ${data.pafta || '___'}</td><td colspan="2">Ada: ${data.ada || '___'}</td><td colspan="2">Parsel: ${data.parsel || '___'}</td></tr>
          <tr><td colspan="2" style="font-weight:bold;">Diğer Özellikler</td><td colspan="5">${data.ozel_sartlar || ''}</td></tr>
        </table>
        <div class="sec-title" style="margin-top:6px;">YAPILACAK İŞLEME AİT BİLGİLER</div>
        <table class="auth-table">
          <tr>
            <td style="font-weight:bold;">Satış Tutarı</td><td>${data.satis_tutari ? money(data.satis_tutari as string) : '___'} TL</td>
            <td style="font-weight:bold;">Ödeme Şekli</td><td>${data.odeme_sekli || 'Nakit'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;">Komisyon Oranı</td><td>%${data.komisyon_orani || '3'} + KDV (${data.komisyon_turu || 'Satıcıdan'})</td>
            <td style="font-weight:bold;">Gayrimenkul Danışmanı</td><td>${doc.consultant?.full_name || '___'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;">Yetki Türü</td><td>${data.yetki_turu || 'Satış'}</td>
            <td style="font-weight:bold;">Süre</td><td>${data.yetki_suresi_gun || '90'} gün (${fd(data.baslangic_tarihi as string)} – ${sureSon})</td>
          </tr>
        </table>
        <div style="margin-top:8px;">
          <p class="clause"><strong>1. KONU:</strong> Müşteri ile ${officeName}, yukarıda belirtilen gayrimenkulün ${data.yetki_turu || 'satış'}ına aracılık edilmesi işlemi için karşılıklı olarak anlaşılmıştır.</p>
          <p class="clause"><strong>2. TANITIM YETKİSİ:</strong> Müşteri, gayrimenkulü ile ilgili olarak satış işlemi amacıyla internet, basın, yayın ve medyayı da dahil etmek üzere tanıtım faaliyetlerinde bulunmak hakkını ve gayrimenkule giriş imkânı sağlamayı ${officeName}'e kabul ve taahhüt eder.</p>
          <p class="clause"><strong>3. YETKİ:</strong> Müşteri, gayrimenkulü ile ilgili olarak kendisine gelen tüm başvuruları ${officeName}'e bildirmeyi ve sözleşme süresi dolmadan başka bir gayrimenkul şirketi ile çalışmamayı kabul ve taahhüt eder. Sözleşmeyi süresinden önce feshetmesi ya da başka bir şirkete sattırması halinde komisyon miktarını ${officeName}'e ödemeyi kabul eder.</p>
          <p class="clause"><strong>4. İŞLEM YETKİSİ:</strong> Müşteri, gayrimenkulünün üzerinde işlem yapma yetkisi bulunmayan üçüncü kişilerin sebep olacağı zararı önlemek amacıyla ${officeName}'in gerekli tedbirleri almasına izin vermeyi kabul eder.</p>
          <p class="clause"><strong>5. SÜRE:</strong> İşbu sözleşme imzalandığı tarihten itibaren <strong>${data.yetki_suresi_gun || '90'} gün</strong> süreyle geçerlidir. Bitiş: <strong>${sureSon}</strong>. Sözleşme süresi içinde taşınmaz satılır/kiralanırsa komisyon tutarı tahsil edilecektir.</p>
          <p class="clause"><strong>6. SÜRENİN BİTİMİ:</strong> Sözleşme süresinin dolmasından sonra 90 gün içinde ${officeName}'in tanıştırdığı kişiyle işlem yapılması halinde komisyon miktarının 2 katı + KDV hizmet bedeli olarak ödenir.</p>
          <p class="clause"><strong>7. İHTİLAF:</strong> Bu sözleşmenin uygulanmasından doğacak uyuşmazlıklarda Bursa (Merkez) Mahkemeleri ve İcra Daireleri yetkilidir. Doğacak damga vergisi, resim, pul ve harçların tamamı müşteriye aittir.</p>
        </div>
      `,
      sigs: `
        <div class="auth-sigs">
          <div class="auth-sig">
            <div class="auth-sig-label">Müşteri<br>Ad Soyad ve İmza</div>
            <div class="auth-sig-box">${sigArea('main', clientName(doc.client))}</div>
            <div style="font-size:10px;margin-top:4px;">${clientName(doc.client)}</div>
          </div>
          <div class="auth-sig">
            <div class="auth-sig-label">${officeName} Adına<br>İsim ve İmza</div>
            <div class="auth-sig-box">${sigArea('consultant', doc.consultant?.full_name || '')}</div>
            <div style="font-size:10px;margin-top:4px;">${doc.consultant?.full_name || '___'}</div>
          </div>
          <div class="auth-sig" style="flex:0.5;text-align:left;">
            <div class="auth-sig-label">Tarih</div>
            <div class="auth-sig-box">${created}</div>
          </div>
        </div>
      `,
    },
    sales_contract: {
      title: 'GAYRİMENKUL SATIŞ SÖZLEŞMESİ',
      body: `
        <h2>1. Satıcı</h2><table>${cRow('Satıcı', doc.client)}</table>
        <h2>2. Alıcı</h2><table><tr><td>Alıcı:</td><td>${secondName}</td></tr><tr><td>TC / Vergi No:</td><td>_______________</td></tr></table>
        <h2>3. Taşınmaz</h2><table>${propRows}</table>
        <h2>4. Satış Şartları</h2>
        <table>
          <tr><td>Satış Bedeli:</td><td>${m(data.satis_bedeli as string)}</td></tr>
          <tr><td>Kapora:</td><td>${m(data.kapora as string)}</td></tr>
          <tr><td>Kapora Tarihi:</td><td>${fd(data.kapora_tarihi as string)}</td></tr>
          <tr><td>Tapu Tescil Tarihi:</td><td>${fd(data.teslim_tarihi as string)}</td></tr>
        </table>
        <h2>5. Özel Şartlar</h2><p>${data.ozel_sartlar || 'Yoktur.'}</p>
        <h2>6. Genel Hükümler</h2><p>İş bu sözleşme taraflarca serbestçe imzalanmıştır.</p>
      `,
      sigs: `
        <div class="sig">${sigArea('main', clientName(doc.client))}<div class="sig-line">Satıcı<br><strong>${clientName(doc.client)}</strong></div></div>
        <div class="sig">${sigArea('second', secondName)}<div class="sig-line">Alıcı<br><strong>${secondName}</strong></div></div>
        <div class="sig"><div class="sig-area"></div><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong></div></div>
      `,
    },
    rental_contract: {
      title: 'GAYRİMENKUL KİRA SÖZLEŞMESİ',
      body: `
        <h2>1. Kiraya Veren</h2><table>${cRow('Kiraya Veren', doc.client)}</table>
        <h2>2. Kiracı</h2><table><tr><td>Kiracı:</td><td>${secondName}</td></tr><tr><td>TC / Vergi No:</td><td>_______________</td></tr></table>
        <h2>3. Taşınmaz</h2><table>${propRows}</table>
        <h2>4. Kira Şartları</h2>
        <table>
          <tr><td>Aylık Kira:</td><td>${m(data.aylik_kira as string)}</td></tr>
          <tr><td>Depozito:</td><td>${m(data.depozito as string)}</td></tr>
          <tr><td>Kira Başlangıcı:</td><td>${fd(data.kira_baslangic as string)}</td></tr>
          <tr><td>Süre:</td><td>${data.kira_suresi_ay || '12'} ay</td></tr>
          <tr><td>Ödeme Günü:</td><td>Her ayın ${data.odeme_gunu || '1'}. günü</td></tr>
        </table>
        <h2>5. Özel Şartlar</h2><p>${data.ozel_sartlar || 'Yoktur.'}</p>
      `,
      sigs: `
        <div class="sig">${sigArea('main', clientName(doc.client))}<div class="sig-line">Kiraya Veren<br><strong>${clientName(doc.client)}</strong></div></div>
        <div class="sig">${sigArea('second', secondName)}<div class="sig-line">Kiracı<br><strong>${secondName}</strong></div></div>
        <div class="sig"><div class="sig-area"></div><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong></div></div>
      `,
    },
    offer_letter: {
      title: 'GAYRİMENKUL ALIM TEKLİF MEKTUBU',
      body: `
        <h2>1. Teklif Eden</h2><table>${cRow('Alıcı', doc.client)}</table>
        <h2>2. Mülk</h2><table>${propRows}</table>
        <h2>3. Teklif</h2>
        <table>
          <tr><td>Teklif Bedeli:</td><td>${m(data.teklif_bedeli as string)}</td></tr>
          <tr><td>Teklif Tarihi:</td><td>${created}</td></tr>
          <tr><td>Geçerlilik:</td><td>${fd(data.gecerlilik_tarihi as string)}</td></tr>
        </table>
        <h2>4. Özel Şartlar</h2><p>${data.ozel_sartlar || 'Yoktur.'}</p>
      `,
      sigs: `
        <div class="sig">${sigArea('main', clientName(doc.client))}<div class="sig-line">Teklif Eden<br><strong>${clientName(doc.client)}</strong></div></div>
        <div class="sig"><div class="sig-area"></div><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong></div></div>
      `,
    },
  }

  const cfg = templates[doc.doc_type] || templates.authorization

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>${cfg.title}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="no-print" style="text-align:right;margin-bottom:20px;">
    <button class="print-btn" onclick="window.print()">🖨️ Yazdır / PDF Kaydet</button>
  </div>
  <div class="letterhead">
    ${CB_LOGO_SVG}
    <div class="letterhead-text">
      <strong>${officeName}</strong><br>
      ${officeAddress ? officeAddress.replace(/\n/g, '<br>') : ''}
    </div>
  </div>
  <h1>${cfg.title}</h1>
  ${doc.doc_type === 'sales_contract' ? `<div class="sub" style="font-size:13px;font-weight:bold;letter-spacing:1px;color:#333;">PROTOKOL YAZISI</div>` : ''}
  <div class="sub">Düzenlenme: ${created}</div>
  <hr class="divider">
  ${cfg.body}
  <div class="sigs">${cfg.sigs}</div>
  <div class="footer">${officeName}${officeAddress ? ' &bull; ' + officeAddress.split('\n')[0] : ''} &bull; Referans: ${doc.id.slice(0, 8).toUpperCase()}</div>
</body>
</html>`
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [doc, setDoc] = useState<DocRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [officeName, setOfficeName] = useState('Ambiance Gayrimenkul')
  const [officeAddress, setOfficeAddress] = useState('Ahmet Yesevi Mah. Hudut Sok. Central Balat Sitesi 1/C\nNilüfer / BURSA')
  const [officeLogo, setOfficeLogo] = useState('')
  const [appUrl, setAppUrl] = useState('')
  const [sigRequests, setSigRequests] = useState<SigRequest[]>([])
  const [newStatus, setNewStatus] = useState<SignatureStatus>('draft')
  const [updating, setUpdating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [showAddSigner, setShowAddSigner] = useState(false)
  const [consultantInstance, setConsultantInstance] = useState<string | null>(null)

  useEffect(() => {
    loadAll()
  }, [id])

  // Auto-poll signature status every 8s while any request is pending/viewed
  useEffect(() => {
    const hasPending = sigRequests.some(r => r.status === 'pending' || r.status === 'viewed')
    if (!hasPending) return
    const interval = setInterval(loadSigRequests, 8000)
    return () => clearInterval(interval)
  }, [sigRequests])

  async function loadAll() {
    const supabase = createClient()
    const [docRes, sigsRes, settingsRes] = await Promise.all([
      supabase
        .from('documents')
        .select('*, client:clients(id, full_name, salutation, phone, email), property:properties(id, title, city, district), consultant:consultants(id, full_name, wa_instance)')
        .eq('id', id)
        .single(),
      supabase
        .from('signature_requests')
        .select('*')
        .eq('document_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('settings')
        .select('key, value')
        .in('key', ['office_name', 'office_address', 'office_logo', 'app_url']),
    ])

    if (docRes.data) {
      setDoc(docRes.data as DocRow)
      setNewStatus(docRes.data.signature_status)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setConsultantInstance((docRes.data as any).consultant?.wa_instance || null)
    }
    if (sigsRes.data) setSigRequests(sigsRes.data as SigRequest[])

    if (settingsRes.data) {
      for (const row of settingsRes.data) {
        const v = String(row.value).replace(/^"|"$/g, '')
        if (row.key === 'office_name' && v) setOfficeName(v)
        if (row.key === 'office_address' && v) setOfficeAddress(v)
        if (row.key === 'office_logo' && v) setOfficeLogo(v)
        if (row.key === 'app_url' && v) setAppUrl(v)
      }
    }

    // Priority: env var > DB setting > window.location.origin
    const envUrl = process.env.NEXT_PUBLIC_APP_URL
    if (envUrl) {
      setAppUrl(envUrl)
    } else if (typeof window !== 'undefined') {
      setAppUrl(prev => prev || window.location.origin)
    }

    setLoading(false)
  }

  async function loadSigRequests() {
    const supabase = createClient()
    const [sigsRes, docRes] = await Promise.all([
      supabase
        .from('signature_requests')
        .select('*')
        .eq('document_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('documents')
        .select('signature_status, signed_at')
        .eq('id', id)
        .single(),
    ])
    if (sigsRes.data) setSigRequests(sigsRes.data as SigRequest[])
    if (docRes.data) {
      setDoc(prev => prev ? { ...prev, signature_status: docRes.data.signature_status, signed_at: docRes.data.signed_at } : prev)
      setNewStatus(docRes.data.signature_status as SignatureStatus)
    }
  }

  async function handleUpdateStatus() {
    if (!doc) return
    setUpdating(true)
    const supabase = createClient()
    await supabase.from('documents').update({ signature_status: newStatus }).eq('id', doc.id)
    setDoc(prev => prev ? { ...prev, signature_status: newStatus } : prev)
    setUpdating(false)
  }

  async function handleDelete() {
    if (!doc) return
    const supabase = createClient()
    await supabase.from('documents').delete().eq('id', doc.id)
    router.push('/documents')
  }

  function handlePrint() {
    if (!doc) return
    const html = buildPrintHTML(doc, officeName, sigRequests, officeAddress, officeLogo)
    const w = window.open('', '_blank', 'width=900,height=750,scrollbars=yes')
    if (w) { w.document.write(html); w.document.close(); w.focus() }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-500">Belge bulunamadı.</p>
        <Link href="/documents" className="btn-primary mt-3 inline-flex">Geri Dön</Link>
      </div>
    )
  }

  const sigConf = sigStatusConfig[doc.signature_status]
  const SigIcon = sigConf.icon
  const templateData = (doc.template_data || {}) as TemplateData
  const resolvedAppUrl = appUrl || (typeof window !== 'undefined' ? window.location.origin : '')

  const signedCount = sigRequests.filter(r => r.status === 'signed').length
  const totalCount = sigRequests.length

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/documents" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">{doc.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {docTypeLabels[doc.doc_type]}
              </span>
              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${sigConf.color}`}>
                <SigIcon size={10} /> {sigConf.label}
              </span>
              <span className="text-xs text-slate-400">{formatDate(doc.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <Printer size={14} /> Yazdır
          </button>
          <button onClick={() => setDeleteConfirm(true)} className="flex items-center gap-1.5 px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-4">

        {/* Taraflar */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Taraflar</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {doc.client && (
              <div className="flex items-start gap-2">
                <User size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">
                    {doc.doc_type === 'authorization' ? 'Mülk Sahibi' :
                     doc.doc_type === 'sales_contract' ? 'Satıcı' :
                     doc.doc_type === 'rental_contract' ? 'Kiraya Veren' : 'Alıcı'}
                  </p>
                  <Link href={`/crm/${doc.client.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                    {doc.client.salutation ? doc.client.salutation + ' ' : ''}{doc.client.full_name}
                  </Link>
                  {doc.client.phone && <p className="text-xs text-slate-500">{doc.client.phone}</p>}
                </div>
              </div>
            )}
            {templateData.second_client_name && (
              <div className="flex items-start gap-2">
                <User size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">
                    {doc.doc_type === 'sales_contract' ? 'Alıcı' :
                     doc.doc_type === 'rental_contract' ? 'Kiracı' : 'Diğer Taraf'}
                  </p>
                  {templateData.second_client_id ? (
                    <Link href={`/crm/${templateData.second_client_id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {String(templateData.second_client_name)}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium text-slate-900">{String(templateData.second_client_name)}</p>
                  )}
                </div>
              </div>
            )}
            {doc.property && (
              <div className="flex items-start gap-2">
                <Building2 size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Mülk</p>
                  <Link href={`/portfolio/${doc.property.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                    {doc.property.title}
                  </Link>
                  {(doc.property.city || doc.property.district) && (
                    <p className="text-xs text-slate-500">{[doc.property.city, doc.property.district].filter(Boolean).join(', ')}</p>
                  )}
                </div>
              </div>
            )}
            {doc.consultant && (
              <div className="flex items-start gap-2">
                <Edit3 size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Danışman</p>
                  <p className="text-sm font-medium text-slate-900">{doc.consultant.full_name}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Belge Detayları */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Belge Detayları</h2>
          <TemplateDetails docType={doc.doc_type} data={templateData} />
        </div>

        {/* Dijital İmza */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Dijital İmza</h2>
              {totalCount > 0 && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {signedCount}/{totalCount} imzacı tamamladı
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadSigRequests} className="text-slate-400 hover:text-slate-600 p-1" title="Yenile">
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => setShowAddSigner(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
              >
                <Plus size={12} /> İmzacı Ekle
              </button>
            </div>
          </div>

          {sigRequests.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">
              <Send size={24} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm text-slate-400">Henüz imzacı eklenmedi</p>
              <p className="text-xs text-slate-400 mt-1">
                "İmzacı Ekle" ile tarafları ekleyin, ardından WhatsApp'tan imzalama linki gönderin.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sigRequests.map(req => (
                <SignerRow
                  key={req.id}
                  req={req}
                  appUrl={resolvedAppUrl}
                  officeName={officeName}
                  docTitle={doc.title}
                  consultantInstance={consultantInstance}
                  onRefresh={loadSigRequests}
                  onDelete={(deletedId) => setSigRequests(prev => prev.filter(r => r.id !== deletedId))}
                />
              ))}
              {totalCount > 0 && signedCount === totalCount && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
                  <CheckCircle size={16} />
                  Tüm taraflar belgeyi imzaladı!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Durum Güncelle */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">İmza Durumu</h2>
          <div className="flex items-center gap-3">
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value as SignatureStatus)}
              className="flex-1 border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{sigStatusConfig[s].label}</option>
              ))}
            </select>
            <button
              onClick={handleUpdateStatus}
              disabled={updating || newStatus === doc.signature_status}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed text-sm px-4"
            >
              {updating ? 'Güncelleniyor...' : 'Güncelle'}
            </button>
          </div>
          {doc.signed_at && (
            <p className="text-xs text-slate-500 mt-2">İmzalanma tarihi: {formatDate(doc.signed_at)}</p>
          )}
        </div>

        {/* Notlar */}
        {doc.notes && (
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">İç Notlar</h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{doc.notes}</p>
          </div>
        )}

      </div>

      {/* Add Signer Modal */}
      {showAddSigner && (
        <AddSignerModal
          doc={doc}
          onClose={() => setShowAddSigner(false)}
          onAdded={loadSigRequests}
        />
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-slate-900 mb-2">Belgeyi Sil</h3>
            <p className="text-sm text-slate-500 mb-4">
              <strong>{doc.title}</strong> belgesini kalıcı olarak silmek istediğinize emin misiniz?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                İptal
              </button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
