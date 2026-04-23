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
  client?: { id: string; full_name: string; salutation?: string; phone?: string; email?: string; address?: string } | null
  property?: { id: string; title: string; city?: string; district?: string; address?: string; property_type?: string; price?: number; currency?: string } | null
  consultant?: { id: string; full_name: string; phone?: string } | null
  notes?: string | null
  template_data?: Record<string, any> | null
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
  draft:    { label: 'Taslak',       color: 'bg-surface-container-high text-on-surface-variant',   icon: FileText },
  sent:     { label: 'Gönderildi',   color: 'bg-primary-container text-primary',     icon: Clock },
  viewed:   { label: 'Görüldü',      color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  signed:   { label: 'İmzalandı',    color: 'bg-green-100 text-green-700',   icon: CheckCircle },
  declined: { label: 'Reddedildi',   color: 'bg-red-100 text-red-700',       icon: XCircle },
  expired:  { label: 'Süresi Doldu', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
}

const reqStatusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Bekliyor',    color: 'bg-surface-container-high text-on-surface-variant',   icon: Clock },
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
      <div key={label} className="flex gap-2 text-sm py-1.5 border-b border-outline last:border-0">
        <span className="text-on-surface-variant w-44 flex-shrink-0">{label}</span>
        <span className="text-on-surface font-medium">{value}</span>
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
  const mainName = doc.client ? `${doc.client.salutation ? doc.client.salutation + ' ' : ''}${doc.client.full_name}`.trim() : ''
  const [signerName, setSignerName] = useState(mainName)
  const [signerPhone, setSignerPhone] = useState(doc.client?.phone || '')
  const [signerRole, setSignerRole] = useState('main')
  const [saving, setSaving] = useState(false)

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

  // Telefon numarasını +90 formatına çevir
  function ensurePlus90(phone: string): string {
    if (!phone) return ''
    let p = phone.replace(/\s/g, '')
    if (p.startsWith('+90')) return p
    if (p.startsWith('0')) return '+90' + p.slice(1)
    if (p.startsWith('90')) return '+' + p
    return '+90' + p
  }

  // Pre-fill party info when role changes
  function handleRoleChange(role: string) {
    setSignerRole(role)
    if (role === 'main' && doc.client) {
      setSignerName(`${doc.client.salutation ? doc.client.salutation + ' ' : ''}${doc.client.full_name}`.trim())
      setSignerPhone(ensurePlus90(doc.client.phone || ''))
    } else if (role === 'second') {
      setSignerName(String(templateData.second_client_name || ''))
      setSignerPhone(ensurePlus90(String(templateData.second_client_phone || '')))
    } else if (role === 'consultant' && doc.consultant) {
      setSignerName(doc.consultant.full_name)
      setSignerPhone(ensurePlus90(doc.consultant.phone || ''))
    } else {
      setSignerName('')
      setSignerPhone('')
    }
  }

  const inp = 'w-full px-3 py-2 border border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-container rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h3 className="font-semibold text-on-surface">İmzacı Ekle</h3>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Rol</label>
          <select value={signerRole} onChange={e => handleRoleChange(e.target.value)} className={inp}>
            <option value="main">{mainLabel}</option>
            {hasSecond && <option value="second">{secondLabel}</option>}
            {doc.consultant && <option value="consultant">Danışman ({doc.consultant.full_name})</option>}
            <option value="other">Diğer</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Ad Soyad</label>
          <input type="text" value={signerName} onChange={e => setSignerName(e.target.value)} className={inp} placeholder="İmzacı adı" />
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">WhatsApp Numarası</label>
          <input type="tel" value={signerPhone} onChange={e => setSignerPhone(e.target.value)} className={inp} placeholder="905xxxxxxxxx" />
          <p className="text-xs text-on-surface-variant mt-1">Ülke kodu ile yazın (ör: 905551234567)</p>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-outline rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-high">
            İptal
          </button>
          <button
            onClick={handleAdd}
            disabled={saving || !signerName.trim() || !signerPhone.trim()}
            className="flex-1 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
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
    <div className="border border-outline rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-on-surface text-sm">{req.signer_name}</p>
            <span className="text-xs text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">
              {roleLabels[req.signer_role] || req.signer_role}
            </span>
          </div>
          {req.signer_phone && <p className="text-xs text-on-surface-variant mt-0.5">{req.signer_phone}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${statusConf.color}`}>
            <StatusIcon size={10} />
            {statusConf.label}
          </span>
          {req.status !== 'signed' && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="text-on-surface-variant hover:text-red-500 transition-colors p-0.5"
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
              className="flex-1 px-3 py-1.5 border border-outline rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-high"
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
        <div className="text-xs text-on-surface-variant space-y-0.5">
          {req.wa_sent_at && <p>📤 Gönderildi: {formatDateTime(req.wa_sent_at)}</p>}
          {req.viewed_at && <p>👁 Görüldü: {formatDateTime(req.viewed_at)}</p>}
          {req.signed_at && <p>✅ İmzalandı: {formatDateTime(req.signed_at)}</p>}
          {req.ip_address && req.signed_at && <p>🌐 IP: {req.ip_address}</p>}
        </div>
      )}

      {/* İmza bilgisi ve görsel */}
      {req.status === 'signed' && req.signature_type && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
          <p className="text-xs text-green-700">
            {req.signature_type === 'drawn' ? '✏️ El imzası ile imzalandı' : '⌨️ İsim yazılarak imzalandı'}
          </p>
          {req.signature_type === 'drawn' && req.signature_data?.startsWith('data:image') && (
            <div className="bg-white border border-green-100 rounded-lg p-3 flex justify-center">
              <img src={req.signature_data} alt={`${req.signer_name} imzası`} className="max-h-16 max-w-[200px] object-contain" />
            </div>
          )}
          {req.signature_type === 'typed' && req.signature_data && (
            <div className="bg-white border border-green-100 rounded-lg p-3 flex justify-center">
              <span style={{ fontFamily: "'Brush Script MT', cursive", fontSize: '24px', color: '#1a237e' }}>
                {req.signature_data}
              </span>
            </div>
          )}
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
            className="flex items-center gap-1.5 px-3 py-1.5 border border-outline text-on-surface-variant rounded-lg text-xs font-medium hover:bg-surface-container-high transition-colors"
          >
            <Copy size={12} />
            {copied ? 'Kopyalandı!' : 'Linki Kopyala'}
          </button>
          <a
            href={signingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-outline text-on-surface-variant rounded-lg text-xs font-medium hover:bg-surface-container-high transition-colors"
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

function buildPrintHTML(doc: DocRow, officeName: string, sigRequests: SigRequest[] = [], officeAddress?: string, _officeLogo?: string, officeLegalName?: string, officeMersis?: string, officeJurisdiction?: string) {
  const data = (doc.template_data || {}) as TemplateData
  const created = formatDate(doc.created_at)

  // CB Ambiance logo — sabit SVG
  const CB_LOGO_SVG = `<img src="data:image/png;base64,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" style="height:70px;max-width:220px;object-fit:contain;">`

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
  const numToWords = (v: string | null | undefined): string => {
    if (!v) return '___'
    const n = parseInt(String(v).replace(/[^0-9]/g, ''))
    if (isNaN(n) || n === 0) return 'sıfır'
    const ones = ['','bir','iki','üç','dört','beş','altı','yedi','sekiz','dokuz']
    const tens = ['','on','yirmi','otuz','kırk','elli','altmış','yetmiş','seksen','doksan']
    const cvt3 = (x: number): string => {
      if (x === 0) return ''
      let r = ''
      if (x >= 100) { r += (x >= 200 ? ones[Math.floor(x/100)] : '') + 'yüz'; x %= 100 }
      if (x >= 10) { r += tens[Math.floor(x/10)]; x %= 10 }
      if (x > 0) r += ones[x]
      return r
    }
    let x = n, r = ''
    if (x >= 1000000000) { r += cvt3(Math.floor(x/1000000000)) + 'milyar'; x %= 1000000000 }
    if (x >= 1000000) { r += cvt3(Math.floor(x/1000000)) + 'milyon'; x %= 1000000 }
    if (x >= 1000) { const t = Math.floor(x/1000); r += (t === 1 ? '' : cvt3(t)) + 'bin'; x %= 1000 }
    return r + cvt3(x)
  }

  const styles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { overflow-x: hidden; }
    body { font-family: 'Times New Roman', Times, serif; max-width: 860px; margin: 0 auto; padding: 32px 28px; color: #111; font-size: 16px; line-height: 1.9; overflow-x: hidden; word-break: break-word; }
    h1 { font-size: 21px; text-align: center; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 8px; }
    .sub { text-align: center; font-size: 15px; color: #555; margin-bottom: 6px; }
    .divider { border: none; border-top: 2px solid #111; margin: 14px 0 22px; }
    h2 { font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 20px 0 10px; }
    .tbl-scroll, .tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; width: 100%; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; min-width: 0; }
    td { padding: 5px 8px; vertical-align: top; font-size: 15px; word-break: break-word; }
    td:first-child { font-weight: bold; width: 170px; }
    p { margin-bottom: 10px; text-align: justify; font-size: 16px; }
    .sigs { display: flex; justify-content: space-around; margin-top: 52px; gap: 16px; flex-wrap: wrap; }
    .sig { text-align: center; flex: 1; min-width: 120px; }
    .sig-line { border-top: 1px solid #000; padding-top: 8px; font-size: 14px; min-height: 64px; }
    .sig-area { height: 60px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
    .sig-area img { max-height: 56px; max-width: 180px; object-fit: contain; }
    .sig-typed { font-family: 'Brush Script MT', cursive; font-size: 24px; color: #1a237e; line-height: 1.2; }
    .footer { margin-top: 40px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 10px; }
    .print-btn { background: #2563eb; color: #fff; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; margin: 0 8px 0 0; }
    .pdf-btn { background: #16a34a; color: #fff; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .letterhead { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #ccc; gap: 12px; flex-wrap: wrap; }
    .letterhead img { max-height: 80px; max-width: 220px; object-fit: contain; flex-shrink: 0; }
    .letterhead-text { text-align: right; font-size: 12px; color: #444; line-height: 1.8; }
    @media screen and (max-width: 640px) {
      body { font-size: 16px; padding: 20px 16px; line-height: 1.85; }
      h1 { font-size: 19px; letter-spacing: 2px; margin-bottom: 6px; }
      td { font-size: 14px; padding: 6px 8px; }
      td:first-child { width: auto; min-width: 90px; }
      .letterhead { flex-direction: column; }
      .letterhead-text { text-align: left; font-size: 12px; }
      .sigs { flex-direction: column; align-items: center; gap: 24px; }
      .sig { min-width: unset; width: 100%; max-width: 280px; }
      .sig-line { font-size: 13px; }
      .auth-table td { font-size: 13px; padding: 5px 6px; }
      .kira-tbl td { font-size: 14px; padding: 6px 8px; }
      .kira-tbl td:first-child { width: auto; white-space: normal; }
      .sec-title { font-size: 14px; padding: 6px 10px; }
      .clause { font-size: 15px; line-height: 1.75; }
      .print-btn, .pdf-btn { font-size: 13px; padding: 10px 18px; }
    }
    @media screen and (max-width: 400px) {
      body { padding: 16px 12px; font-size: 15px; }
      h1 { font-size: 17px; letter-spacing: 1px; }
      td { font-size: 13px; padding: 5px 6px; }
      .auth-table td { font-size: 12px; padding: 4px 5px; }
      .kira-tbl td { font-size: 13px; }
      .clause { font-size: 14px; }
    }
    @media print {
      .no-print { display: none !important; }
      @page { size: A4; margin: 8mm 6mm; }
      body { padding: 0 4px; font-size: 13px; max-width: 100%; }
      td { font-size: 12px; }
      h1 { font-size: 16px; }
      .sigs { break-inside: avoid; page-break-inside: avoid; display: flex !important; flex-wrap: wrap; }
      .sig { break-inside: avoid; page-break-inside: avoid; }
      .auth-sigs { break-inside: avoid; page-break-inside: avoid; display: flex !important; flex-wrap: wrap; }
      .auth-sig { break-inside: avoid; page-break-inside: avoid; }
      .sig-area { height: auto !important; min-height: 60px; }
      .sig-area img { display: block !important; max-height: 56px !important; max-width: 180px !important; visibility: visible !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sig-typed { display: block !important; visibility: visible !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .auth-sig-box { min-height: 60px; }
    }
  `

  const cRow = (label: string, c?: { full_name: string; salutation?: string; phone?: string; email?: string } | null, tc?: string, addr?: string) => `
    <tr><td>${label}:</td><td>${clientName(c)}</td></tr>
    <tr><td>Telefon:</td><td>${c?.phone || '_______________'}</td></tr>
    <tr><td>E-posta:</td><td>${c?.email || '_______________'}</td></tr>
    <tr><td>TC / Vergi No:</td><td>${tc || '_______________'}</td></tr>
    <tr><td>Adres:</td><td>${addr || '_______________'}</td></tr>
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
  const propType = (data.mulk_tipi as string) || doc.property?.property_type || ''
  const propAddr = [doc.property?.address, doc.property?.district, doc.property?.city].filter(Boolean).join(', ') || '___'
  const stBAuth = `
    <style>
      .auth-table{width:100%;border-collapse:collapse;margin-bottom:0;font-size:12px;}
      .auth-table td{border:1px solid #000;padding:6px 8px;vertical-align:middle;}
      .sec-title{background:#e0e0e0;font-weight:bold;font-size:12px;padding:6px 8px;border:1px solid #000;border-bottom:none;text-transform:uppercase;}
      .clause{font-size:10.5px;line-height:1.65;margin-bottom:5px;text-align:justify;}
      .auth-sigs{display:flex;justify-content:space-between;margin-top:24px;gap:20px;width:100%;}
      .auth-sig{text-align:center;flex:1;}
      .auth-sig-label{font-size:11px;font-weight:bold;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;}
      .auth-sig-box{border-top:2px solid #333;padding-top:8px;min-height:60px;font-size:11px;}
    </style>`

  const templates: Record<string, { title: string; body: string; sigs: string }> = {
    authorization: {
      title: 'ARACILIK SÖZLEŞMESİ',
      body: `
        ${stBAuth}
        <table class="auth-table" style="margin-bottom:0;">
          <tr>
            <td style="width:42%;vertical-align:top;padding:8px;border-right:2px solid #000;">
              <div style="margin-top:6px;font-size:9px;line-height:1.7;color:#222;">
                <strong style="font-size:10px;display:block;margin-bottom:2px;">${officeLegalName || officeName}</strong>
                ${(officeAddress || '').replace(/\n/g, '<br>')}<br>
                <span style="color:#666;">Mersis No: ${officeMersis || '_______________'}</span>
              </div>
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
        <div class="tbl-scroll"><table class="auth-table">
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
          <tr><td style="font-weight:bold;">Mahallesi</td><td colspan="2">${(data.mahalle as string) || '_______________'}</td><td style="font-weight:bold;">İlçesi</td><td>${(data.ilce as string) || doc.property?.district || '___'}</td><td style="font-weight:bold;">İli</td><td>${(data.il as string) || doc.property?.city || '___'}</td></tr>
          <tr><td colspan="2" style="font-weight:bold;">Tapu Kayıt Bilg.</td><td>Pafta: ${data.pafta || '___'}</td><td colspan="2">Ada: ${data.ada || '___'}</td><td colspan="2">Parsel: ${data.parsel || '___'}</td></tr>
          <tr><td colspan="2" style="font-weight:bold;">Diğer Özellikler</td><td colspan="5">${data.ozel_sartlar || ''}</td></tr>
        </table></div>
        <div class="sec-title" style="margin-top:6px;">YAPILACAK İŞLEME AİT BİLGİLER</div>
        <div class="tbl-scroll"><table class="auth-table">
          <tr>
            <td style="font-weight:bold;">${data.yetki_turu === 'Kiralama' ? 'Kira Bedeli' : 'Satış Tutarı'}</td><td>${data.yetki_turu === 'Kiralama' ? (data.kira_bedeli ? money(data.kira_bedeli as string) + ' + KDV' : '___') : (data.satis_tutari ? money(data.satis_tutari as string) : '___')} TL</td>
            <td style="font-weight:bold;">Ödeme Şekli</td><td>${data.odeme_sekli || 'Nakit'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;">Komisyon Oranı</td><td>%${data.komisyon_orani || '2'} + KDV (${data.komisyon_turu || 'Satıcıdan'})</td>
            <td style="font-weight:bold;">Gayrimenkul Danışmanı</td><td>${doc.consultant?.full_name || '___'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;">Yetki Türü</td><td>${data.yetki_turu || 'Satış'}</td>
            <td style="font-weight:bold;">Süre</td><td>${data.yetki_suresi_gun || '90'} gün (${fd(data.baslangic_tarihi as string)} – ${sureSon})</td>
          </tr>
        </table></div>
        <div style="margin-top:8px;">
          <p class="clause"><strong>1. KONU:</strong> Müşteri ile ${officeName}, yukarıda belirtilen gayrimenkulün ${data.yetki_turu || 'satış'}ına aracılık edilmesi işlemi için karşılıklı olarak anlaşılmıştır.</p>
          <p class="clause"><strong>2. TANITIM YETKİSİ:</strong> Müşteri, gayrimenkulü ile ilgili olarak satış işlemi amacıyla internet, basın, yayın ve medyayı da dahil etmek üzere tanıtım faaliyetlerinde bulunmak hakkını ve gayrimenkule giriş imkânı sağlamayı ${officeName}'e kabul ve taahhüt eder.</p>
          <p class="clause"><strong>3. YETKİ:</strong> Müşteri, gayrimenkulü ile ilgili olarak kendisine gelen tüm başvuruları ${officeName}'e bildirmeyi ve sözleşme süresi dolmadan başka bir gayrimenkul şirketi ile çalışmamayı kabul ve taahhüt eder. Sözleşmeyi süresinden önce feshetmesi ya da başka bir şirkete sattırması halinde %${data.komisyon_orani || '2'} + KDV komisyon miktarını ${officeName}'e ödemeyi kabul eder.</p>
          <p class="clause"><strong>4. İŞLEM YETKİSİ:</strong> Müşteri, gayrimenkulünün üzerinde işlem yapma yetkisi bulunmayan üçüncü kişilerin sebep olacağı zararı önlemek amacıyla ${officeName}'in gerekli tedbirleri almasına izin vermeyi kabul eder.</p>
          <p class="clause"><strong>5. SÜRE:</strong> İşbu sözleşme imzalandığı tarihten itibaren <strong>${data.yetki_suresi_gun || '90'} gün</strong> süreyle geçerlidir. Bitiş: <strong>${sureSon}</strong>. Sözleşme süresi içinde taşınmaz satılır/kiralanırsa komisyon tutarı tahsil edilecektir.</p>
          <p class="clause"><strong>6. SÜRENİN BİTİMİ:</strong> Sözleşme süresinin dolmasından sonra ${data.yetki_suresi_gun || '90'} gün içinde ${officeName}'in tanıştırdığı kişiyle işlem yapılması halinde komisyon miktarının 2 katı + KDV hizmet bedeli olarak ödenir.</p>
          <p class="clause"><strong>7. İHTİLAF:</strong> Bu sözleşmenin uygulanmasından doğacak uyuşmazlıklarda ${officeJurisdiction || '_______________'} Mahkemeleri ve İcra Daireleri yetkilidir. Doğacak damga vergisi, resim, pul ve harçların tamamı müşteriye aittir.</p>
          ${data.ek_madde ? `<p class="clause"><strong>EK MADDE:</strong> ${data.ek_madde}</p>` : ''}
        </div>
      `,
      sigs: `
        <div class="auth-sigs">
          <div class="auth-sig">
            <div class="auth-sig-label">MÜŞTERİ<br><small style="font-weight:normal;text-transform:none;letter-spacing:0;">Ad Soyad ve İmza</small></div>
            <div class="auth-sig-box">${sigArea('main', clientName(doc.client))}</div>
            <div style="font-size:11px;margin-top:6px;font-weight:bold;">${clientName(doc.client)}</div>
          </div>
          <div class="auth-sig">
            <div class="auth-sig-label">GAYRİMENKUL DANIŞMANI<br><small style="font-weight:normal;text-transform:none;letter-spacing:0;">${officeName} Adına İmza</small></div>
            <div class="auth-sig-box">${sigArea('consultant', doc.consultant?.full_name || '')}</div>
            <div style="font-size:11px;margin-top:6px;font-weight:bold;">${doc.consultant?.full_name || '___'}</div>
          </div>
        </div>
      `,
    },
    sales_contract: {
      title: 'GAYRİMENKUL SATIŞ SÖZLEŞMESİ',
      body: `
        <table style="margin-bottom:16px;font-size:15px;">
          <tr>
            <td style="font-weight:bold;width:130px;white-space:nowrap;padding:4px 6px;">SATICI</td>
            <td style="padding:4px 6px;">${clientName(doc.client)}${data.main_tc_no ? ' &bull; TC: ' + data.main_tc_no : ''}${doc.client?.phone ? ' &bull; Tel: ' + doc.client.phone : ''}${(data.main_address || doc.client?.address) ? '<br><span style="color:#555;">' + (data.main_address || doc.client?.address) + '</span>' : ''}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;padding:4px 6px;">ALICI</td>
            <td style="padding:4px 6px;">${secondName}${data.second_tc_no ? ' &bull; TC: ' + data.second_tc_no : ''}${data.second_client_phone ? ' &bull; Tel: ' + data.second_client_phone : ''}${data.second_address ? '<br><span style="color:#555;">' + data.second_address + '</span>' : ''}</td>
          </tr>
          ${prop || data.ada ? `<tr><td style="font-weight:bold;padding:4px 6px;">TAŞINMAZ</td><td style="padding:4px 6px;">${prop ? [prop.title, prop.city, prop.district].filter(Boolean).join(' — ') : ''}${data.ada ? ' &bull; Ada: ' + data.ada + (data.parsel ? ' / Parsel: ' + data.parsel : '') + (data.pafta ? ' / Pafta: ' + data.pafta : '') : ''}</td></tr>` : ''}
        </table>
        <div style="line-height:1.9;font-size:15px;">
          <p style="margin-bottom:12px;text-align:justify;">
            <strong>1-</strong> ALICI ile SATICI yukarıda bahsi geçen gayrimenkulün satışı hususunda aşağıdaki şartlarla anlaşmayı kabul eder. SATICI, sahibi bulunduğu veya satmaya yetkili olduğu bu mülkün satışını <strong>${m(data.satis_bedeli as string)} (${numToWords(data.satis_bedeli as string)})</strong> olarak kabul etmiştir. Satış bedeline mahsuben ALICI'dan <strong>${m(data.kapora as string)}</strong> kaparo olarak alınmıştır.${data.hizmet_tapuda ? ` Hizmet bedelinin kalan <strong>${m(data.hizmet_tapuda as string)}</strong> Tapu işlemleri sırasında alınacaktır.` : ''} Satış bedelinin <strong>${m(data.pesin_odenen as string)}</strong> peşinen ödenmiş olup, geri kalanı da <strong>${m(data.tapuda_odenecek as string)}</strong> tapuda ödenecektir.
          </p>
          <p style="margin-bottom:12px;text-align:justify;">
            <strong>2-</strong> Bu anlaşma imzalandıktan sonra, Borçlar Kanununun ilgili maddesine göre taraflardan ALICI gayrimenkulü almaktan vazgeçtiği takdirde verdiği kaporayı geri almayacaktır.
          </p>
          <p style="margin-bottom:12px;text-align:justify;">
            <strong>3-</strong> ALICI ve SATICI kendilerine bu anlaşmayı sağlayan <strong>${officeName}</strong>'e işbu sözleşmenin imzalanmasıyla yukarıdaki satış bedeli üzerinden <strong>(%${data.komisyon_alici || '2'} + %${data.komisyon_satici || '2'}) + KDV</strong> komisyon ücretini hiçbir ihtara ve ihbara gerek kalmadan ödemeyi peşinen kabul ve taahhüt eder.
          </p>
          <p style="margin-bottom:12px;text-align:justify;">
            <strong>4-</strong> ALICI ve SATICI'nın her biri, daha sonra alım ve/veya satımdan vazgeçerlerse veya ${officeName}'in dışında gelişen herhangi bir nedenle tapudaki satışı gerçekleştiremezseler; vazgeçen ve/veya satışa engel çıkartan taraf hem kendi ödeyeceği, hem de diğer tarafın ödeyeceği komisyon ücretinin tamamını <strong>(% ${(parseFloat(String(data.komisyon_alici||2))+parseFloat(String(data.komisyon_satici||2))).toFixed(0)} + KDV)</strong> ${officeName}'a ödemeyi peşinen kabul ve taahhüt eder.
          </p>
          <p style="margin-bottom:12px;text-align:justify;">
            <strong>5-</strong> Satıştan vazgeçen ve/veya satışa engel çıkartan tarafın diğer tarafa ödeyeceği ceza miktarı <strong>${m(data.ceza_miktari as string)}</strong>'dir.
          </p>
          <p style="margin-bottom:12px;text-align:justify;">
            <strong>6-</strong> Dijital olarak tanzim edilen işbu sözleşme yukarıdaki hükümler ve sözleşmeye eklenecek ekleri (var ise) ile birlikte geçerli olmak üzere taraflarca kayıtsız, şartsız kabul edilmiş olup, sözleşmeden doğacak ihtilaflarda merci T.C. ${officeJurisdiction || '_______________'} mahkeme ve icra daireleri yetkilidir.
          </p>
          ${data.ozel_sartlar ? `<p style="margin-bottom:12px;text-align:justify;"><strong>EK MADDE:</strong> ${data.ozel_sartlar}</p>` : ''}
        </div>
      `,
      sigs: `
        <div class="sig">${sigArea('main', clientName(doc.client))}<div class="sig-line">SATICI<br><strong>${clientName(doc.client)}</strong></div></div>
        <div class="sig">${sigArea('second', secondName)}<div class="sig-line">ALICI<br><strong>${secondName}</strong></div></div>
        <div class="sig"><div class="sig-area"></div><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong><br>${officeName}</div></div>
      `,
    },
    rental_contract: {
      title: 'GAYRİMENKUL KİRA SÖZLEŞMESİ',
      body: `
        <h2>1. Kiraya Veren</h2><table>${cRow('Kiraya Veren', doc.client, data.main_tc_no as string, data.main_address as string)}</table>
        <h2>2. Kiracı</h2>
        <table>
          <tr><td>Ad Soyad:</td><td>${secondName}</td></tr>
          <tr><td>TC / Vergi No:</td><td>${data.second_tc_no || '_______________'}</td></tr>
          <tr><td>Adres:</td><td>${data.second_address || '_______________'}</td></tr>
          <tr><td>Telefon:</td><td>${data.second_client_phone || '_______________'}</td></tr>
        </table>
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
        <h2>1. Teklif Eden</h2><table>${cRow('Alıcı', doc.client, data.main_tc_no as string, data.main_address as string)}</table>
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
    showing_agreement: {
      title: 'YER GÖSTERME BELGESİ',
      body: `
        <div style="font-size:14px;line-height:1.7;text-align:justify;margin-bottom:20px;">
          <p style="margin-bottom:12px;">Aşağıda cinsi ve adresi belirtilen gayrimenkulleri (satılık/kiralık) <strong>${officeName}</strong> yetkilisi <strong>${doc.consultant?.full_name || '_______________'}</strong> aracılığıyla, şirket portföyünden bizzat yerinde görerek gezdim.</p>
          <p style="margin-bottom:12px;">Bu gayrimenkulleri satın almam veya kiralamam halinde <strong>${officeName}</strong>'e, satış/kira bedeli üzerinden %2 (Artı KDV) veya bir aylık kira bedeli (Artı KDV) Hizmet Bedeli ödemeyi peşinen kabul ve taahhüt ediyorum.</p>
          <p style="margin-bottom:12px;">Aynı gayrimenkulleri kendim, eşim, çocuklarım, annem, babam, kardeşlerim veya ortağı bulunduğum şirket veya 3. dereceye kadar akrabalarım adına satın almam/kiralamam durumunda da bu sözleşme hükümlerinin aynen geçerli olacağını ve Hizmet Bedelini ödemeyi kabul ediyorum.</p>
          <p style="margin-bottom:12px;">Bu belge, Borçlar Kanunu'nun ilgili maddeleri gereğince her iki tarafın özgür iradesiyle okunup anlaşılarak elektronik olarak imzalanmıştır.</p>
        </div>
        <h2>Yer Gösterilen Gayrimenkuller</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
          <tr>
            <th style="border:1px solid #000;padding:8px;text-align:left;background:#f5f5f5;">Cinsi (Satılık/Kiralık)</th>
            <th style="border:1px solid #000;padding:8px;text-align:left;background:#f5f5f5;">Adres / Konum</th>
            <th style="border:1px solid #000;padding:8px;text-align:left;background:#f5f5f5;">Fiyatı</th>
          </tr>
          <tr>
            <td style="border:1px solid #000;padding:8px;">${doc.property?.property_type === 'rental' ? 'Kiralık' : 'Satılık'} ${propType}</td>
            <td style="border:1px solid #000;padding:8px;">${propAddr}</td>
            <td style="border:1px solid #000;padding:8px;">${doc.property?.price ? money(doc.property.price.toString()) + ' ' + (doc.property.currency || 'TL') : '___'}</td>
          </tr>
        </table>
        <h2>Müşteri Bilgileri</h2>
        <table style="width:100%;font-size:14px;">
          <tr><td style="width:120px;font-weight:bold;">Ad Soyad:</td><td>${clientName(doc.client)}</td></tr>
          <tr><td style="font-weight:bold;">TC No:</td><td>${data.main_tc_no || '_______________'}</td></tr>
          <tr><td style="font-weight:bold;">Telefon:</td><td>${doc.client?.phone || '_______________'}</td></tr>
          <tr><td style="font-weight:bold;">Adres:</td><td>${data.main_address || doc.client?.address || '_______________'}</td></tr>
        </table>
        ${data.ozel_sartlar ? `<div style="margin-top:20px;"><strong>ÖZEL ŞARTLAR:</strong><p>${data.ozel_sartlar}</p></div>` : ''}
      `,
      sigs: `
        <div class="sig">${sigArea('main', clientName(doc.client))}<div class="sig-line">Müşteri<br><strong>${clientName(doc.client)}</strong></div></div>
        <div class="sig"><div class="sig-area"></div><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong><br>${officeName}</div></div>
      `,
    },
  }

  const cfg = templates[doc.doc_type] || templates.authorization

  const logoHtml = _officeLogo
    ? `<img src="${_officeLogo}" style="height:70px;max-width:220px;object-fit:contain;">`
    : `<div style="font-weight:bold;font-size:18px;color:#1a3a6b;">${officeName}</div>`

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>${cfg.title}</title>
  <style>${styles}</style>
  <script>function pdfDownload(t,d){var el=document.createElement('style');el.id='__pdf_fit';el.textContent='@page{size:A4;margin:6mm 4mm}@media print{body{zoom:0.68;padding:10px 8px;max-width:100%;}}';document.head.appendChild(el);document.title=t;window.print();setTimeout(function(){var s=document.getElementById('__pdf_fit');if(s)s.parentNode.removeChild(s);},500);}</script>
</head>
<body>
  <div class="no-print" style="text-align:right;margin-bottom:20px;">
    <button class="print-btn" onclick="window.print()">🖨️ Yazdır</button>
    <button class="pdf-btn" onclick="pdfDownload('${doc.title||'Belge'}','${doc.doc_type}')">⬇️ PDF İndir</button>
  </div>
  ${doc.doc_type === 'authorization' ? `
  <div style="margin-bottom:0;">${logoHtml.replace('max-height:80px', 'max-height:90px').replace('max-width:220px', 'max-width:240px')}</div>
  <h1>${cfg.title}</h1>
  <div style="text-align:right;font-size:13px;color:#333;margin-bottom:2px;">Düzenlenme: ${created}</div>
  <hr class="divider">` : `
  <div class="letterhead">
    ${logoHtml}
    <div class="letterhead-text">
      <strong>${officeName}</strong><br>
      ${officeAddress ? officeAddress.replace(/\n/g, '<br>') : ''}<br>
      <span style="font-size:10px;color:#666;">Mersis No: ${officeMersis || '_______________'}</span>
    </div>
  </div>
  <h1>${cfg.title}</h1>
  ${doc.doc_type === 'sales_contract' ? '<div class="sub" style="font-size:13px;font-weight:bold;letter-spacing:1px;color:#333;">PROTOKOL YAZISI</div>' : ''}
  <div class="sub">Düzenlenme: ${created}</div>
  <hr class="divider">`}
  ${cfg.body}
  <div class="sigs">${cfg.sigs}</div>
</body>
</html>`
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [doc, setDoc] = useState<DocRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [officeName, setOfficeName] = useState('')
  const [officeLegalName, setOfficeLegalName] = useState('')
  const [officeAddress, setOfficeAddress] = useState('')
  const [officeLogo, setOfficeLogo] = useState('')
  const [officeMersis, setOfficeMersis] = useState('')
  const [officeJurisdiction, setOfficeJurisdiction] = useState('')
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
        .select('*, client:clients(id, full_name, salutation, phone, email), property:properties(id, title, city, district), consultant:consultants(id, full_name, phone, wa_instance)')
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
        .in('key', ['office_name', 'office_legal_name', 'office_address', 'office_logo', 'office_mersis', 'office_jurisdiction', 'app_url']),
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
        if (row.key === 'office_legal_name' && v) setOfficeLegalName(v)
        if (row.key === 'office_address' && v) setOfficeAddress(v)
        if (row.key === 'office_logo' && v) setOfficeLogo(v)
        if (row.key === 'office_mersis' && v) setOfficeMersis(v)
        if (row.key === 'office_jurisdiction' && v) setOfficeJurisdiction(v)
        if (row.key === 'office_app_url' && v) setAppUrl(v)
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

  async function handlePrint() {
    if (!doc) return
    const supabase = createClient()
    const { data: freshSigs } = await supabase
      .from('signature_requests')
      .select('*')
      .eq('document_id', doc.id)
      .order('created_at', { ascending: true })
    const sigs = (freshSigs as SigRequest[]) || sigRequests
    const html = buildPrintHTML(doc, officeName, sigs, officeAddress, officeLogo, officeLegalName, officeMersis, officeJurisdiction)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) { w.focus() }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="p-6 text-center">
        <p className="text-on-surface-variant">Belge bulunamadı.</p>
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
          <Link href="/documents" className="text-on-surface-variant hover:text-on-surface-variant">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-on-surface leading-tight">{doc.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">
                {docTypeLabels[doc.doc_type]}
              </span>
              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${sigConf.color}`}>
                <SigIcon size={10} /> {sigConf.label}
              </span>
              <span className="text-xs text-on-surface-variant">{formatDate(doc.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 border border-outline rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-high">
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
          <h2 className="text-sm font-semibold text-on-surface mb-3">Taraflar</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {doc.client && (
              <div className="flex items-start gap-2">
                <User size={15} className="text-on-surface-variant mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-on-surface-variant mb-0.5">
                    {doc.doc_type === 'authorization' ? 'Mülk Sahibi' :
                     doc.doc_type === 'sales_contract' ? 'Satıcı' :
                     doc.doc_type === 'rental_contract' ? 'Kiraya Veren' : 'Alıcı'}
                  </p>
                  <Link href={`/crm/${doc.client.id}`} className="text-sm font-medium text-primary hover:underline">
                    {doc.client.salutation ? doc.client.salutation + ' ' : ''}{doc.client.full_name}
                  </Link>
                  {doc.client.phone && <p className="text-xs text-on-surface-variant">{doc.client.phone}</p>}
                </div>
              </div>
            )}
            {templateData.second_client_name && (
              <div className="flex items-start gap-2">
                <User size={15} className="text-on-surface-variant mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-on-surface-variant mb-0.5">
                    {doc.doc_type === 'sales_contract' ? 'Alıcı' :
                     doc.doc_type === 'rental_contract' ? 'Kiracı' : 'Diğer Taraf'}
                  </p>
                  {templateData.second_client_id ? (
                    <Link href={`/crm/${templateData.second_client_id}`} className="text-sm font-medium text-primary hover:underline">
                      {String(templateData.second_client_name)}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium text-on-surface">{String(templateData.second_client_name)}</p>
                  )}
                </div>
              </div>
            )}
            {doc.property && (
              <div className="flex items-start gap-2">
                <Building2 size={15} className="text-on-surface-variant mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-on-surface-variant mb-0.5">Mülk</p>
                  <Link href={`/portfolio/${doc.property.id}`} className="text-sm font-medium text-primary hover:underline">
                    {doc.property.title}
                  </Link>
                  {(doc.property.city || doc.property.district) && (
                    <p className="text-xs text-on-surface-variant">{[doc.property.city, doc.property.district].filter(Boolean).join(', ')}</p>
                  )}
                </div>
              </div>
            )}
            {doc.consultant && (
              <div className="flex items-start gap-2">
                <Edit3 size={15} className="text-on-surface-variant mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-on-surface-variant mb-0.5">Danışman</p>
                  <p className="text-sm font-medium text-on-surface">{doc.consultant.full_name}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Belge Detayları */}
        <div className="card">
          <h2 className="text-sm font-semibold text-on-surface mb-3">Belge Detayları</h2>
          <TemplateDetails docType={doc.doc_type} data={templateData} />
        </div>

        {/* Dijital İmza */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-on-surface">Dijital İmza</h2>
              {totalCount > 0 && (
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {signedCount}/{totalCount} imzacı tamamladı
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadSigRequests} className="text-on-surface-variant hover:text-on-surface-variant p-1" title="Yenile">
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => setShowAddSigner(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover"
              >
                <Plus size={12} /> İmzacı Ekle
              </button>
            </div>
          </div>

          {sigRequests.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed border-outline rounded-xl">
              <Send size={24} className="mx-auto text-on-surface-variant mb-2" />
              <p className="text-sm text-on-surface-variant">Henüz imzacı eklenmedi</p>
              <p className="text-xs text-on-surface-variant mt-1">
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
          <h2 className="text-sm font-semibold text-on-surface mb-3">İmza Durumu</h2>
          <div className="flex items-center gap-3">
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value as SignatureStatus)}
              className="flex-1 border border-outline rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
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
            <p className="text-xs text-on-surface-variant mt-2">İmzalanma tarihi: {formatDate(doc.signed_at)}</p>
          )}
        </div>

        {/* Notlar */}
        {doc.notes && (
          <div className="card">
            <h2 className="text-sm font-semibold text-on-surface mb-2">İç Notlar</h2>
            <p className="text-sm text-on-surface-variant whitespace-pre-wrap">{doc.notes}</p>
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
          <div className="bg-surface-container rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-on-surface mb-2">Belgeyi Sil</h3>
            <p className="text-sm text-on-surface-variant mb-4">
              <strong>{doc.title}</strong> belgesini kalıcı olarak silmek istediğinize emin misiniz?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 border border-outline rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-high">
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
