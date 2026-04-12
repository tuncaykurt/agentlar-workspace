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
    {row('Teslim Tarihi', formatDate(data.teslim_tarihi as string))}
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
}: {
  req: SigRequest
  appUrl: string
  officeName: string
  docTitle: string
  consultantInstance?: string | null
  onRefresh: () => void
}) {
  const supabase = createClient()
  const signingLink = `${appUrl}/sign/${req.token}`
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sendResult, setSendResult] = useState<'idle' | 'ok' | 'error'>('idle')

  const statusConf = reqStatusConfig[req.status] || reqStatusConfig.pending
  const StatusIcon = statusConf.icon

  async function sendWhatsApp() {
    setSending(true)
    setSendResult('idle')
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
        setSendResult('error')
      }
    } catch {
      setSendResult('error')
    }
    setSending(false)
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
        <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${statusConf.color}`}>
          <StatusIcon size={10} />
          {statusConf.label}
        </span>
      </div>

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
        <p className="text-xs text-red-600">⚠️ Gönderilemedi. Evolution API ayarlarını kontrol edin.</p>
      )}
    </div>
  )
}

// ─── Print HTML ───────────────────────────────────────────────────────────────

function buildPrintHTML(doc: DocRow, officeName: string) {
  const data = (doc.template_data || {}) as TemplateData
  const created = formatDate(doc.created_at)

  const clientName = (c?: { full_name: string; salutation?: string } | null) =>
    c ? `${c.salutation ? c.salutation + ' ' : ''}${c.full_name}` : '_______________'

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
    .sig-line { border-top: 1px solid #333; padding-top: 8px; margin-top: 48px; font-size: 12px; }
    .footer { margin-top: 40px; font-size: 10px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 10px; }
    .print-btn { background: #2563eb; color: #fff; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; margin-bottom: 24px; }
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

  const templates: Record<string, { title: string; body: string; sigs: string }> = {
    authorization: {
      title: 'GAYRİMENKUL YETKİ BELGESİ',
      body: `
        <h2>1. Taraflar</h2><table>${cRow('Mülk Sahibi', doc.client)}
          <tr><td colspan="2" style="padding-top:8px;font-weight:bold;">Yetkili Danışman / Ofis</td></tr>
          <tr><td>Danışman:</td><td>${doc.consultant?.full_name || '_______________'}</td></tr>
          <tr><td>Ofis:</td><td>${officeName}</td></tr>
        </table>
        <h2>2. Taşınmaz</h2><table>${propRows}</table>
        <h2>3. Yetki Kapsamı</h2>
        <table>
          <tr><td>Yetki Türü:</td><td>${data.yetki_turu || 'Satış'}</td></tr>
          <tr><td>Başlangıç:</td><td>${fd(data.baslangic_tarihi as string)}</td></tr>
          <tr><td>Süre:</td><td>${data.yetki_suresi_gun || '90'} gün</td></tr>
          <tr><td>Komisyon:</td><td>%${data.komisyon_orani || '3'} + KDV (${data.komisyon_turu || 'Satıcıdan'})</td></tr>
        </table>
        <h2>4. Özel Şartlar</h2><p>${data.ozel_sartlar || 'Yoktur.'}</p>
        <h2>5. Genel Hükümler</h2><p>Mülk sahibi, yetki süresi boyunca taşınmazı başka aracı aracılığıyla satamaz/kiralayamaz.</p>
      `,
      sigs: `
        <div class="sig"><div class="sig-line">Mülk Sahibi<br><strong>${clientName(doc.client)}</strong></div></div>
        <div class="sig"><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong><br>${officeName}</div></div>
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
          <tr><td>Teslim Tarihi:</td><td>${fd(data.teslim_tarihi as string)}</td></tr>
        </table>
        <h2>5. Özel Şartlar</h2><p>${data.ozel_sartlar || 'Yoktur.'}</p>
        <h2>6. Genel Hükümler</h2><p>İş bu sözleşme taraflarca serbestçe imzalanmıştır.</p>
      `,
      sigs: `
        <div class="sig"><div class="sig-line">Satıcı<br><strong>${clientName(doc.client)}</strong></div></div>
        <div class="sig"><div class="sig-line">Alıcı<br><strong>${secondName}</strong></div></div>
        <div class="sig"><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong></div></div>
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
        <div class="sig"><div class="sig-line">Kiraya Veren<br><strong>${clientName(doc.client)}</strong></div></div>
        <div class="sig"><div class="sig-line">Kiracı<br><strong>${secondName}</strong></div></div>
        <div class="sig"><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong></div></div>
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
        <div class="sig"><div class="sig-line">Teklif Eden<br><strong>${clientName(doc.client)}</strong></div></div>
        <div class="sig"><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong></div></div>
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
  <h1>${cfg.title}</h1>
  <div class="sub">${officeName} &bull; Düzenlenme: ${created}</div>
  <hr class="divider">
  ${cfg.body}
  <div class="sigs">${cfg.sigs}</div>
  <div class="footer">Bu belge ${officeName} tarafından ${created} tarihinde düzenlenmiştir. Referans: ${doc.id.slice(0, 8).toUpperCase()}</div>
</body>
</html>`
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [doc, setDoc] = useState<DocRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [officeName, setOfficeName] = useState('Gayrimenkul Ofisi')
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
        .in('key', ['office_name', 'app_url']),
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
        if (row.key === 'office_name') setOfficeName(v)
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
    const { data } = await supabase
      .from('signature_requests')
      .select('*')
      .eq('document_id', id)
      .order('created_at', { ascending: true })
    if (data) setSigRequests(data as SigRequest[])
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
    const html = buildPrintHTML(doc, officeName)
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
