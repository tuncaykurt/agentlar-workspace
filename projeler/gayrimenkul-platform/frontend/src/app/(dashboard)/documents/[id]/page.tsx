'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Document, SignatureStatus } from '@/lib/types'
import {
  ArrowLeft, Printer, Trash2, CheckCircle, Clock,
  XCircle, AlertCircle, FileText, User, Building2, Edit3,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type DocRow = Document & {
  client?: { id: string; full_name: string; salutation?: string; phone?: string; email?: string } | null
  property?: { id: string; title: string; city?: string; district?: string } | null
  consultant?: { id: string; full_name: string } | null
}

type TemplateData = Record<string, string | null | undefined>

// ─── Config ───────────────────────────────────────────────────────────────────

const sigStatusConfig: Record<SignatureStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft:    { label: 'Taslak',         color: 'bg-slate-100 text-slate-600',   icon: FileText },
  sent:     { label: 'Gönderildi',     color: 'bg-blue-100 text-blue-700',     icon: Clock },
  viewed:   { label: 'Görüldü',        color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  signed:   { label: 'İmzalandı',      color: 'bg-green-100 text-green-700',   icon: CheckCircle },
  declined: { label: 'Reddedildi',     color: 'bg-red-100 text-red-700',       icon: XCircle },
  expired:  { label: 'Süresi Doldu',   color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
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

  if (docType === 'authorization') return (
    <div>
      {row('Yetki Türü', data.yetki_turu)}
      {row('Başlangıç Tarihi', formatDate(data.baslangic_tarihi as string))}
      {row('Yetki Süresi', data.yetki_suresi_gun ? data.yetki_suresi_gun + ' gün' : null)}
      {row('Komisyon Oranı', data.komisyon_orani ? '%' + data.komisyon_orani + ' + KDV' : null)}
      {row('Komisyon Kime Ait', data.komisyon_turu)}
      {row('Özel Şartlar', data.ozel_sartlar)}
    </div>
  )

  if (docType === 'sales_contract') return (
    <div>
      {row('Satış Bedeli', money(data.satis_bedeli as string))}
      {row('Kapora Tutarı', money(data.kapora as string))}
      {row('Kapora Tarihi', formatDate(data.kapora_tarihi as string))}
      {row('Teslim Tarihi', formatDate(data.teslim_tarihi as string))}
      {data.second_client_name && row('Alıcı', data.second_client_name)}
      {row('Özel Şartlar', data.ozel_sartlar)}
    </div>
  )

  if (docType === 'rental_contract') return (
    <div>
      {row('Aylık Kira', money(data.aylik_kira as string))}
      {row('Depozito', money(data.depozito as string))}
      {row('Kira Başlangıcı', formatDate(data.kira_baslangic as string))}
      {row('Kira Süresi', data.kira_suresi_ay ? data.kira_suresi_ay + ' ay' : null)}
      {row('Ödeme Günü', data.odeme_gunu ? 'Her ayın ' + data.odeme_gunu + '. günü' : null)}
      {data.second_client_name && row('Kiracı', data.second_client_name)}
      {row('Özel Şartlar', data.ozel_sartlar)}
    </div>
  )

  if (docType === 'offer_letter') return (
    <div>
      {row('Teklif Bedeli', money(data.teklif_bedeli as string))}
      {row('Geçerlilik Tarihi', formatDate(data.gecerlilik_tarihi as string))}
      {data.second_client_name && row('Satıcı', data.second_client_name)}
      {row('Özel Şartlar', data.ozel_sartlar)}
    </div>
  )

  return null
}

// ─── Print HTML (re-generates from stored data) ───────────────────────────────

function buildPrintHTML(doc: DocRow, officeName: string) {
  const data = (doc.template_data || {}) as TemplateData
  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
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
  ` : `
    <tr><td>Taşınmaz:</td><td>Ada: ___ Parsel: ___ Pafta: ___</td></tr>
    <tr><td>Adres:</td><td>_______________</td></tr>
  `

  const secondName = data.second_client_name || '_______________'

  let title2 = ''
  let body = ''
  let sigs = ''

  if (doc.doc_type === 'authorization') {
    title2 = 'GAYRİMENKUL YETKİ BELGESİ'
    const bitis = (() => {
      const d = new Date(data.baslangic_tarihi as string || doc.created_at)
      d.setDate(d.getDate() + parseInt(String(data.yetki_suresi_gun || '90')))
      return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
    })()
    body = `
      <h2>1. Taraflar</h2>
      <table>${cRow('Mülk Sahibi', doc.client)}
        <tr><td colspan="2" style="padding-top:8px;font-weight:bold;">Yetkili Danışman / Ofis</td></tr>
        <tr><td>Danışman:</td><td>${doc.consultant?.full_name || '_______________'}</td></tr>
        <tr><td>Ofis:</td><td>${officeName}</td></tr>
      </table>
      <h2>2. Taşınmaz Bilgileri</h2><table>${propRows}</table>
      <h2>3. Yetki Kapsamı</h2>
      <table>
        <tr><td>Yetki Türü:</td><td>${data.yetki_turu || 'Satış'}</td></tr>
        <tr><td>Başlangıç:</td><td>${fd(data.baslangic_tarihi as string)}</td></tr>
        <tr><td>Bitiş:</td><td>${bitis}</td></tr>
        <tr><td>Süre:</td><td>${data.yetki_suresi_gun || '90'} gün</td></tr>
        <tr><td>Komisyon:</td><td>%${data.komisyon_orani || '3'} + KDV (${data.komisyon_turu || 'Satıcıdan'})</td></tr>
      </table>
      <h2>4. Özel Şartlar</h2>
      <p>${data.ozel_sartlar || 'Yoktur.'}</p>
      <h2>5. Genel Hükümler</h2>
      <p>Mülk sahibi, yetki süresi boyunca taşınmazı başka aracı aracılığıyla satamaz/kiralayamaz.</p>
    `
    sigs = `
      <div class="sig"><div class="sig-line">Mülk Sahibi<br><strong>${clientName(doc.client)}</strong></div></div>
      <div class="sig"><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong><br>${officeName}</div></div>
    `
  } else if (doc.doc_type === 'sales_contract') {
    title2 = 'GAYRİMENKUL SATIŞ SÖZLEŞMESİ'
    body = `
      <h2>1. Satıcı</h2><table>${cRow('Satıcı', doc.client)}</table>
      <h2>2. Alıcı</h2>
      <table>
        <tr><td>Alıcı:</td><td>${secondName}</td></tr>
        <tr><td>Telefon:</td><td>_______________</td></tr>
        <tr><td>TC / Vergi No:</td><td>_______________</td></tr>
      </table>
      <h2>3. Taşınmaz</h2><table>${propRows}</table>
      <h2>4. Satış Şartları</h2>
      <table>
        <tr><td>Satış Bedeli:</td><td>${m(data.satis_bedeli as string)}</td></tr>
        <tr><td>Kapora:</td><td>${m(data.kapora as string)}</td></tr>
        <tr><td>Kapora Tarihi:</td><td>${fd(data.kapora_tarihi as string)}</td></tr>
        <tr><td>Teslim Tarihi:</td><td>${fd(data.teslim_tarihi as string)}</td></tr>
      </table>
      <h2>5. Özel Şartlar</h2><p>${data.ozel_sartlar || 'Yoktur.'}</p>
      <h2>6. Genel Hükümler</h2>
      <p>İş bu sözleşme taraflarca serbestçe imzalanmıştır. Uyuşmazlıklarda taşınmazın bulunduğu yerin mahkemeleri yetkilidir.</p>
    `
    sigs = `
      <div class="sig"><div class="sig-line">Satıcı<br><strong>${clientName(doc.client)}</strong></div></div>
      <div class="sig"><div class="sig-line">Alıcı<br><strong>${secondName}</strong></div></div>
      <div class="sig"><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong></div></div>
    `
  } else if (doc.doc_type === 'rental_contract') {
    title2 = 'GAYRİMENKUL KİRA SÖZLEŞMESİ'
    const kiraBitis = (() => {
      const d = new Date(data.kira_baslangic as string || doc.created_at)
      d.setMonth(d.getMonth() + parseInt(String(data.kira_suresi_ay || '12')))
      return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
    })()
    body = `
      <h2>1. Kiraya Veren</h2><table>${cRow('Kiraya Veren', doc.client)}</table>
      <h2>2. Kiracı</h2>
      <table>
        <tr><td>Kiracı:</td><td>${secondName}</td></tr>
        <tr><td>Telefon:</td><td>_______________</td></tr>
        <tr><td>TC / Vergi No:</td><td>_______________</td></tr>
      </table>
      <h2>3. Taşınmaz</h2><table>${propRows}</table>
      <h2>4. Kira Şartları</h2>
      <table>
        <tr><td>Aylık Kira:</td><td>${m(data.aylik_kira as string)}</td></tr>
        <tr><td>Depozito:</td><td>${m(data.depozito as string)}</td></tr>
        <tr><td>Kira Başlangıcı:</td><td>${fd(data.kira_baslangic as string)}</td></tr>
        <tr><td>Kira Bitişi:</td><td>${kiraBitis}</td></tr>
        <tr><td>Süre:</td><td>${data.kira_suresi_ay || '12'} ay</td></tr>
        <tr><td>Ödeme Günü:</td><td>Her ayın ${data.odeme_gunu || '1'}. günü</td></tr>
      </table>
      <h2>5. Özel Şartlar</h2><p>${data.ozel_sartlar || 'Yoktur.'}</p>
      <h2>6. Genel Hükümler</h2>
      <p>Kiracı taşınmazı belirlenen amaç dışında kullanamaz. Depozito, sözleşme bitiminde hasarsız iade halinde geri verilir.</p>
    `
    sigs = `
      <div class="sig"><div class="sig-line">Kiraya Veren<br><strong>${clientName(doc.client)}</strong></div></div>
      <div class="sig"><div class="sig-line">Kiracı<br><strong>${secondName}</strong></div></div>
      <div class="sig"><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong></div></div>
    `
  } else {
    title2 = 'GAYRİMENKUL ALIM TEKLİF MEKTUBU'
    body = `
      <h2>1. Teklif Eden</h2><table>${cRow('Alıcı', doc.client)}</table>
      <h2>2. Mülk Bilgileri</h2><table>${propRows}</table>
      <h2>3. Teklif</h2>
      <table>
        <tr><td>Teklif Bedeli:</td><td>${m(data.teklif_bedeli as string)}</td></tr>
        <tr><td>Teklif Tarihi:</td><td>${created}</td></tr>
        <tr><td>Geçerlilik:</td><td>${fd(data.gecerlilik_tarihi as string)}</td></tr>
      </table>
      <h2>4. Özel Şartlar</h2><p>${data.ozel_sartlar || 'Yoktur.'}</p>
      <p>Bu mektup bağlayıcı değildir; kabul halinde satış sözleşmesi düzenlenecektir.</p>
    `
    sigs = `
      <div class="sig"><div class="sig-line">Teklif Eden<br><strong>${clientName(doc.client)}</strong></div></div>
      <div class="sig"><div class="sig-line">Danışman<br><strong>${doc.consultant?.full_name || '_______________'}</strong></div></div>
    `
  }

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>${title2}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="no-print" style="text-align:right;margin-bottom:20px;">
    <button class="print-btn" onclick="window.print()">🖨️ Yazdır / PDF Kaydet</button>
  </div>
  <h1>${title2}</h1>
  <div class="sub">${officeName} &bull; Düzenlenme: ${created}</div>
  <hr class="divider">
  ${body}
  <div class="sigs">${sigs}</div>
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
  const [newStatus, setNewStatus] = useState<SignatureStatus>('draft')
  const [updating, setUpdating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => {
    loadDoc()
    createClient().from('settings').select('value').eq('key', 'office_name').single()
      .then(({ data }) => {
        if (data?.value) setOfficeName(String(data.value).replace(/^"|"$/g, ''))
      })
  }, [id])

  async function loadDoc() {
    const supabase = createClient()
    const { data } = await supabase
      .from('documents')
      .select(`
        *,
        client:clients(id, full_name, salutation, phone, email),
        property:properties(id, title, city, district),
        consultant:consultants(id, full_name)
      `)
      .eq('id', id)
      .single()
    if (data) {
      setDoc(data as DocRow)
      setNewStatus(data.signature_status)
    }
    setLoading(false)
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
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {docTypeLabels[doc.doc_type]}
              </span>
              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${sigConf.color}`}>
                <SigIcon size={10} />{sigConf.label}
              </span>
              <span className="text-xs text-slate-400">{formatDate(doc.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Printer size={14} /> Yazdır
          </button>
          <button
            onClick={() => setDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
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

      {/* Silme Onayı */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-slate-900 mb-2">Belgeyi Sil</h3>
            <p className="text-sm text-slate-500 mb-4">
              <strong>{doc.title}</strong> belgesini kalıcı olarak silmek istediğinize emin misiniz?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                İptal
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
