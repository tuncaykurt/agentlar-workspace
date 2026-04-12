'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Client, Property, Consultant, DocumentType } from '@/lib/types'
import { ArrowLeft, Search, Printer, Save, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateData = Record<string, string | null>

const DOC_TYPES: { value: DocumentType; label: string; desc: string; color: string }[] = [
  { value: 'authorization',   label: 'Yetki Belgesi',     desc: 'Satış veya kiralama yetkisi',      color: 'blue' },
  { value: 'sales_contract',  label: 'Satış Sözleşmesi',  desc: 'Gayrimenkul satış sözleşmesi',     color: 'green' },
  { value: 'rental_contract', label: 'Kira Sözleşmesi',   desc: 'Gayrimenkul kira sözleşmesi',      color: 'purple' },
  { value: 'offer_letter',    label: 'Teklif Mektubu',    desc: 'Alım teklifi mektubu',             color: 'orange' },
]

// ─── Client Search ────────────────────────────────────────────────────────────

function ClientSearch({
  label, value, onChange,
}: { label: string; value: Client | null; onChange: (c: Client | null) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Client[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleSearch(term: string) {
    setQ(term)
    if (term.length < 2) { setResults([]); setOpen(false); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, salutation, phone, email, client_type')
      .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`)
      .eq('is_active', true)
      .limit(8)
    setResults((data as Client[]) || [])
    setOpen(true)
  }

  if (value) {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">
              {value.salutation ? value.salutation + ' ' : ''}{value.full_name}
            </p>
            {value.phone && <p className="text-xs text-slate-500">{value.phone}</p>}
          </div>
          <button onClick={() => onChange(null)} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref}>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={q}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => q.length >= 2 && setOpen(true)}
          placeholder="İsim veya telefon ara..."
          className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {open && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-20 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-52 overflow-auto">
            {results.map(c => (
              <button
                key={c.id}
                onMouseDown={() => { onChange(c); setQ(''); setOpen(false) }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-0"
              >
                <span className="font-medium text-slate-900">
                  {c.salutation ? c.salutation + ' ' : ''}{c.full_name}
                </span>
                {c.phone && <span className="text-slate-400 ml-2 text-xs">{c.phone}</span>}
              </button>
            ))}
          </div>
        )}
        {open && results.length === 0 && q.length >= 2 && (
          <div className="absolute top-full left-0 right-0 z-20 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 px-3 py-2 text-sm text-slate-400">
            Sonuç bulunamadı
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Property Search ──────────────────────────────────────────────────────────

function PropertySearch({ value, onChange }: { value: Property | null; onChange: (p: Property | null) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Property[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function fetchProperties(term = '') {
    const supabase = createClient()
    let q = supabase
      .from('properties')
      .select('id, title, city, district, address, price, m2_gross, room_count, property_type')
      .neq('status', 'sold')
      .neq('status', 'rented')
      .limit(10)
    if (term.length >= 2) q = q.ilike('title', `%${term}%`)
    const { data } = await q
    setResults((data as Property[]) || [])
    setOpen(true)
  }

  async function handleSearch(term: string) {
    setQ(term)
    await fetchProperties(term)
  }

  if (value) {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Mülk <span className="text-slate-400">(opsiyonel)</span></label>
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">{value.title}</p>
            {(value.city || value.district) && (
              <p className="text-xs text-slate-500">{[value.city, value.district].filter(Boolean).join(', ')}</p>
            )}
          </div>
          <button onClick={() => onChange(null)} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref}>
      <label className="block text-sm font-medium text-slate-700 mb-1">Mülk <span className="text-slate-400">(opsiyonel)</span></label>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={q}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => fetchProperties(q)}
          placeholder="Mülk adı ara..."
          className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {open && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-20 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-52 overflow-auto">
            {results.map(p => (
              <button
                key={p.id}
                onMouseDown={() => { onChange(p); setQ(''); setOpen(false) }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-0"
              >
                <span className="font-medium text-slate-900">{p.title}</span>
                {(p.city || p.district) && (
                  <span className="text-slate-400 ml-2 text-xs">{[p.city, p.district].filter(Boolean).join(', ')}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Print HTML Generator ─────────────────────────────────────────────────────

function generatePrintHTML(params: {
  docType: DocumentType
  title: string
  mainClient: Client | null
  secondClient: Client | null
  property: Property | null
  consultant: Pick<Consultant, 'id' | 'full_name'> | null
  templateData: TemplateData
  officeName: string
}) {
  const { docType, mainClient, secondClient, property, consultant, templateData, officeName } = params

  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })

  const money = (v: string | null | undefined) =>
    v
      ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(parseFloat(v.replace(',', '.')))
      : '_______________'

  const fmtDate = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '_______________'

  const clientName = (c: Client | null) =>
    c ? `${c.salutation ? c.salutation + ' ' : ''}${c.full_name}` : '_______________'

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

  // Reusable party block
  const partyRows = (label: string, c: Client | null) => `
    <tr><td>${label}:</td><td>${clientName(c)}</td></tr>
    <tr><td>Telefon:</td><td>${c?.phone || '_______________'}</td></tr>
    <tr><td>E-posta:</td><td>${c?.email || '_______________'}</td></tr>
    <tr><td>TC / Vergi No:</td><td>_______________</td></tr>
    <tr><td>Adres:</td><td>_______________</td></tr>
  `

  const propRows = property ? `
    <tr><td>Mülk Adı:</td><td>${property.title}</td></tr>
    ${property.city || property.district ? `<tr><td>Konum:</td><td>${[property.city, property.district].filter(Boolean).join(' / ')}</td></tr>` : ''}
    ${property.address ? `<tr><td>Adres:</td><td>${property.address}</td></tr>` : ''}
    ${property.m2_gross ? `<tr><td>Brüt m²:</td><td>${property.m2_gross} m²</td></tr>` : ''}
    ${property.room_count ? `<tr><td>Oda Sayısı:</td><td>${property.room_count}</td></tr>` : ''}
  ` : `
    <tr><td>Taşınmaz:</td><td>Ada: ___ Parsel: ___ Pafta: ___</td></tr>
    <tr><td>Adres:</td><td>_______________</td></tr>
    <tr><td>m²:</td><td>_______________</td></tr>
  `

  const docTypeConfigs: Record<string, { title: string; body: string; sigs: string }> = {
    authorization: {
      title: 'GAYRİMENKUL YETKİ BELGESİ',
      body: `
        <h2>1. Taraflar</h2>
        <table>
          ${partyRows('Mülk Sahibi', mainClient)}
          <tr><td colspan="2" style="padding-top:10px;font-weight:bold;">Yetkili Danışman / Ofis</td></tr>
          <tr><td>Danışman:</td><td>${consultant?.full_name || '_______________'}</td></tr>
          <tr><td>Ofis:</td><td>${officeName}</td></tr>
        </table>
        <h2>2. Taşınmaz Bilgileri</h2>
        <table>${propRows}</table>
        <h2>3. Yetki Kapsamı</h2>
        <table>
          <tr><td>Yetki Türü:</td><td>${templateData.yetki_turu || 'Satış'}</td></tr>
          <tr><td>Başlangıç Tarihi:</td><td>${fmtDate(templateData.baslangic_tarihi as string)}</td></tr>
          <tr><td>Yetki Süresi:</td><td>${templateData.yetki_suresi_gun || '90'} gün</td></tr>
          <tr><td>Bitiş Tarihi:</td><td>${(() => { const d = new Date(templateData.baslangic_tarihi as string || new Date()); d.setDate(d.getDate() + parseInt(String(templateData.yetki_suresi_gun || '90'))); return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) })()} </td></tr>
          <tr><td>Komisyon Oranı:</td><td>%${templateData.komisyon_orani || '3'} + KDV</td></tr>
          <tr><td>Komisyon Kime Ait:</td><td>${templateData.komisyon_turu || 'Satıcıdan'}</td></tr>
        </table>
        <h2>4. Özel Şartlar</h2>
        <p>${templateData.ozel_sartlar || 'Bu yetki belgesi, yukarıda belirtilen şartlar dahilinde düzenlenmiş olup taraflar arasında mutabık kalınan hususları içermektedir.'}</p>
        <h2>5. Genel Hükümler</h2>
        <p>Mülk sahibi, yetki süresi boyunca taşınmazı başka bir aracı aracılığıyla satamaz/kiralayamaz. Taşınmazın satış/kiralanması halinde komisyon tutarı belirtilen oranda tahsil edilecektir.</p>
      `,
      sigs: `
        <div class="sig"><div class="sig-line">Mülk Sahibi<br><strong>${clientName(mainClient)}</strong></div></div>
        <div class="sig"><div class="sig-line">Danışman<br><strong>${consultant?.full_name || '_______________'}</strong><br>${officeName}</div></div>
      `,
    },
    sales_contract: {
      title: 'GAYRİMENKUL SATIŞ SÖZLEŞMESİ',
      body: `
        <h2>1. Satıcı Bilgileri</h2>
        <table>${partyRows('Satıcı', mainClient)}</table>
        <h2>2. Alıcı Bilgileri</h2>
        <table>${partyRows('Alıcı', secondClient)}</table>
        <h2>3. Taşınmaz Bilgileri</h2>
        <table>${propRows}</table>
        <h2>4. Satış Şartları</h2>
        <table>
          <tr><td>Satış Bedeli:</td><td>${money(templateData.satis_bedeli as string)}</td></tr>
          <tr><td>Kapora Tutarı:</td><td>${money(templateData.kapora as string)}</td></tr>
          <tr><td>Kapora Tarihi:</td><td>${fmtDate(templateData.kapora_tarihi as string)}</td></tr>
          <tr><td>Teslim Tarihi:</td><td>${fmtDate(templateData.teslim_tarihi as string)}</td></tr>
          <tr><td>Danışman / Ofis:</td><td>${consultant?.full_name || '_______________'} / ${officeName}</td></tr>
        </table>
        <h2>5. Özel Şartlar</h2>
        <p>${templateData.ozel_sartlar || 'Yoktur.'}</p>
        <h2>6. Genel Hükümler</h2>
        <p>İş bu sözleşme taraflarca serbestçe imzalanmıştır. Uyuşmazlıklarda taşınmazın bulunduğu yerin mahkemeleri yetkilidir.</p>
      `,
      sigs: `
        <div class="sig"><div class="sig-line">Satıcı<br><strong>${clientName(mainClient)}</strong></div></div>
        <div class="sig"><div class="sig-line">Alıcı<br><strong>${clientName(secondClient)}</strong></div></div>
        <div class="sig"><div class="sig-line">Danışman<br><strong>${consultant?.full_name || '_______________'}</strong><br>${officeName}</div></div>
      `,
    },
    rental_contract: {
      title: 'GAYRİMENKUL KİRA SÖZLEŞMESİ',
      body: `
        <h2>1. Kiraya Veren</h2>
        <table>${partyRows('Kiraya Veren', mainClient)}</table>
        <h2>2. Kiracı</h2>
        <table>${partyRows('Kiracı', secondClient)}</table>
        <h2>3. Kiralanan Taşınmaz</h2>
        <table>${propRows}</table>
        <h2>4. Kira Şartları</h2>
        <table>
          <tr><td>Aylık Kira:</td><td>${money(templateData.aylik_kira as string)}</td></tr>
          <tr><td>Depozito:</td><td>${money(templateData.depozito as string)}</td></tr>
          <tr><td>Kira Başlangıcı:</td><td>${fmtDate(templateData.kira_baslangic as string)}</td></tr>
          <tr><td>Kira Süresi:</td><td>${templateData.kira_suresi_ay || '12'} ay</td></tr>
          <tr><td>Kira Bitişi:</td><td>${(() => { const d = new Date(templateData.kira_baslangic as string || new Date()); d.setMonth(d.getMonth() + parseInt(String(templateData.kira_suresi_ay || '12'))); return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) })()} </td></tr>
          <tr><td>Ödeme Günü:</td><td>Her ayın ${templateData.odeme_gunu || '1'}. günü</td></tr>
          <tr><td>Danışman / Ofis:</td><td>${consultant?.full_name || '_______________'} / ${officeName}</td></tr>
        </table>
        <h2>5. Özel Şartlar</h2>
        <p>${templateData.ozel_sartlar || 'Yoktur.'}</p>
        <h2>6. Genel Hükümler</h2>
        <p>Kiracı taşınmazı belirlenen amaç dışında kullanamaz, kiraya verenin yazılı izni olmaksızın alt kiraya veremez. Depozito, sözleşme bitiminde taşınmazın hasarsız iadesi halinde iade edilir.</p>
      `,
      sigs: `
        <div class="sig"><div class="sig-line">Kiraya Veren<br><strong>${clientName(mainClient)}</strong></div></div>
        <div class="sig"><div class="sig-line">Kiracı<br><strong>${clientName(secondClient)}</strong></div></div>
        <div class="sig"><div class="sig-line">Danışman<br><strong>${consultant?.full_name || '_______________'}</strong><br>${officeName}</div></div>
      `,
    },
    offer_letter: {
      title: 'GAYRİMENKUL ALIM TEKLİF MEKTUBU',
      body: `
        <h2>1. Teklif Eden</h2>
        <table>${partyRows('Alıcı', mainClient)}</table>
        <h2>2. Satıcı / Mülk Bilgileri</h2>
        <table>${partyRows('Satıcı', secondClient)}</table>
        <table>${propRows}</table>
        <h2>3. Teklif Detayları</h2>
        <table>
          <tr><td>Teklif Bedeli:</td><td>${money(templateData.teklif_bedeli as string)}</td></tr>
          <tr><td>Teklif Tarihi:</td><td>${today}</td></tr>
          <tr><td>Geçerlilik Tarihi:</td><td>${fmtDate(templateData.gecerlilik_tarihi as string)}</td></tr>
          <tr><td>Danışman / Ofis:</td><td>${consultant?.full_name || '_______________'} / ${officeName}</td></tr>
        </table>
        <h2>4. Özel Şartlar</h2>
        <p>${templateData.ozel_sartlar || 'Yoktur.'}</p>
        <p>Bu teklif mektubu bağlayıcı nitelik taşımamakta olup taraflarca kabul edilmesi halinde satış sözleşmesi düzenlenecektir.</p>
      `,
      sigs: `
        <div class="sig"><div class="sig-line">Teklif Eden (Alıcı)<br><strong>${clientName(mainClient)}</strong></div></div>
        <div class="sig"><div class="sig-line">Danışman<br><strong>${consultant?.full_name || '_______________'}</strong><br>${officeName}</div></div>
      `,
    },
  }

  const cfg = docTypeConfigs[docType] || docTypeConfigs.authorization

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
  <div class="sub">${officeName} &bull; ${today}</div>
  <hr class="divider">
  ${cfg.body}
  <div class="sigs">${cfg.sigs}</div>
  <div class="footer">Bu belge ${officeName} tarafından ${today} tarihinde düzenlenmiştir.</div>
</body>
</html>`
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewDocumentPage() {
  const router = useRouter()

  const [docType, setDocType] = useState<DocumentType>('authorization')
  const [title, setTitle] = useState('')
  const [officeName, setOfficeName] = useState('Gayrimenkul Ofisi')
  const [consultants, setConsultants] = useState<Pick<Consultant, 'id' | 'full_name'>[]>([])
  const [consultantId, setConsultantId] = useState('')

  const [mainClient, setMainClient] = useState<Client | null>(null)
  const [secondClient, setSecondClient] = useState<Client | null>(null)
  const [property, setProperty] = useState<Property | null>(null)

  // Authorization fields
  const [yetkiTuru, setYetkiTuru] = useState('Satış')
  const [komisyonOrani, setKomisyonOrani] = useState('3')
  const [komisyonTuru, setKomisyonTuru] = useState('Satıcıdan')
  const [baslangicTarihi, setBaslangicTarihi] = useState(new Date().toISOString().slice(0, 10))
  const [yetkiSuresiGun, setYetkiSuresiGun] = useState('90')

  // Sales fields
  const [satisBedeli, setSatisBedeli] = useState('')
  const [kapora, setKapora] = useState('')
  const [kaporaTarihi, setKaporaTarihi] = useState('')
  const [teslimTarihi, setTeslimTarihi] = useState('')

  // Rental fields
  const [aylikKira, setAylikKira] = useState('')
  const [depozito, setDepozito] = useState('')
  const [kiraBaslangic, setKiraBaslangic] = useState(new Date().toISOString().slice(0, 10))
  const [kiraSuresiAy, setKiraSuresiAy] = useState('12')
  const [odemeGunu, setOdemeGunu] = useState('1')

  // Offer fields
  const [teklifBedeli, setTeklifBedeli] = useState('')
  const [gecerlilikTarihi, setGecerlilikTarihi] = useState('')

  const [ozelSartlar, setOzelSartlar] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('consultants').select('id, full_name').eq('is_active', true)
      .then(({ data }) => {
        if (data) {
          setConsultants(data as typeof consultants)
          if (data[0]) setConsultantId(data[0].id)
        }
      })
    supabase.from('settings').select('value').eq('key', 'office_name').single()
      .then(({ data }) => {
        if (data?.value) {
          const v = typeof data.value === 'string' ? data.value.replace(/^"|"$/g, '') : String(data.value)
          setOfficeName(v)
        }
      })
  }, [])

  // Auto-generate title
  useEffect(() => {
    const typeLabel = DOC_TYPES.find(t => t.value === docType)?.label || ''
    const cn = mainClient?.full_name || ''
    const now = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
    setTitle(`${typeLabel}${cn ? ' — ' + cn : ''} (${now})`)
  }, [docType, mainClient])

  function getTemplateData(): TemplateData {
    const base: TemplateData = { ozel_sartlar: ozelSartlar }
    if (docType === 'authorization') return { ...base, yetki_turu: yetkiTuru, komisyon_orani: komisyonOrani, komisyon_turu: komisyonTuru, baslangic_tarihi: baslangicTarihi, yetki_suresi_gun: yetkiSuresiGun }
    if (docType === 'sales_contract') return { ...base, satis_bedeli: satisBedeli, kapora, kapora_tarihi: kaporaTarihi, teslim_tarihi: teslimTarihi }
    if (docType === 'rental_contract') return { ...base, aylik_kira: aylikKira, depozito, kira_baslangic: kiraBaslangic, kira_suresi_ay: kiraSuresiAy, odeme_gunu: odemeGunu }
    return { ...base, teklif_bedeli: teklifBedeli, gecerlilik_tarihi: gecerlilikTarihi }
  }

  async function handleSave() {
    if (!title) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('documents').insert({
      doc_type: docType,
      title,
      client_id: mainClient?.id || null,
      property_id: property?.id || null,
      consultant_id: consultantId || null,
      template_name: docType,
      template_data: {
        ...getTemplateData(),
        second_client_id: secondClient?.id || null,
        second_client_name: secondClient
          ? `${secondClient.salutation ? secondClient.salutation + ' ' : ''}${secondClient.full_name}`.trim()
          : null,
      },
      notes,
      signature_status: 'draft',
    })
    setSaving(false)
    if (!error) router.push('/documents')
  }

  function handlePrint() {
    const consultant = consultants.find(c => c.id === consultantId) || null
    const html = generatePrintHTML({
      docType, title,
      mainClient, secondClient, property,
      consultant: consultant as Pick<Consultant, 'id' | 'full_name'> | null,
      templateData: getTemplateData(),
      officeName,
    })
    const w = window.open('', '_blank', 'width=900,height=750,scrollbars=yes')
    if (w) { w.document.write(html); w.document.close(); w.focus() }
  }

  const inp = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-sm font-medium text-slate-700 mb-1'
  const row2 = 'grid grid-cols-1 sm:grid-cols-2 gap-4'

  const mainClientLabel =
    docType === 'authorization' ? 'Mülk Sahibi' :
    docType === 'sales_contract' ? 'Satıcı' :
    docType === 'rental_contract' ? 'Kiraya Veren' : 'Alıcı'

  const secondClientLabel =
    docType === 'sales_contract' ? 'Alıcı' :
    docType === 'rental_contract' ? 'Kiracı' : 'Diğer Taraf'

  const showSecondClient = docType !== 'authorization'

  const typeColorMap: Record<string, string> = {
    blue:   'border-blue-400 bg-blue-50',
    green:  'border-green-400 bg-green-50',
    purple: 'border-purple-400 bg-purple-50',
    orange: 'border-orange-400 bg-orange-50',
  }
  const typeColorMapOff: Record<string, string> = {
    blue:   'border-slate-200 hover:border-blue-200 hover:bg-blue-50/40',
    green:  'border-slate-200 hover:border-green-200 hover:bg-green-50/40',
    purple: 'border-slate-200 hover:border-purple-200 hover:bg-purple-50/40',
    orange: 'border-slate-200 hover:border-orange-200 hover:bg-orange-50/40',
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/documents" className="text-slate-400 hover:text-slate-600">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Belge Oluştur</h1>
          <p className="text-slate-500 text-sm mt-0.5">Sözleşme veya yetki belgesi hazırla</p>
        </div>
      </div>

      <div className="space-y-5">

        {/* Belge Tipi */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Belge Tipi</h2>
          <div className="grid grid-cols-2 gap-3">
            {DOC_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setDocType(t.value)}
                className={`flex flex-col p-3 border-2 rounded-xl text-left transition-all ${
                  docType === t.value ? typeColorMap[t.color] : typeColorMapOff[t.color]
                }`}
              >
                <span className="font-semibold text-sm text-slate-900">{t.label}</span>
                <span className="text-xs text-slate-500 mt-0.5">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Genel Bilgiler */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Genel Bilgiler</h2>
          <div>
            <label className={lbl}>Belge Başlığı</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Danışman</label>
            <select value={consultantId} onChange={e => setConsultantId(e.target.value)} className={inp}>
              {consultants.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              {consultants.length === 0 && <option value="">Danışman bulunamadı</option>}
            </select>
          </div>
        </div>

        {/* Taraflar */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Taraflar</h2>
          <ClientSearch label={mainClientLabel} value={mainClient} onChange={setMainClient} />
          {showSecondClient && (
            <ClientSearch label={secondClientLabel} value={secondClient} onChange={setSecondClient} />
          )}
          <PropertySearch value={property} onChange={setProperty} />
        </div>

        {/* Tip-spesifik alanlar */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">
            {DOC_TYPES.find(t => t.value === docType)?.label} Detayları
          </h2>

          {docType === 'authorization' && (
            <>
              <div className={row2}>
                <div>
                  <label className={lbl}>Yetki Türü</label>
                  <select value={yetkiTuru} onChange={e => setYetkiTuru(e.target.value)} className={inp}>
                    <option>Satış</option>
                    <option>Kiralama</option>
                    <option>Satış ve Kiralama</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Yetki Süresi (gün)</label>
                  <input type="number" value={yetkiSuresiGun} onChange={e => setYetkiSuresiGun(e.target.value)} className={inp} min="1" />
                </div>
              </div>
              <div className={row2}>
                <div>
                  <label className={lbl}>Komisyon Oranı (%)</label>
                  <input type="number" value={komisyonOrani} onChange={e => setKomisyonOrani(e.target.value)} className={inp} step="0.5" min="0" max="10" />
                </div>
                <div>
                  <label className={lbl}>Komisyon Kime Ait</label>
                  <select value={komisyonTuru} onChange={e => setKomisyonTuru(e.target.value)} className={inp}>
                    <option>Satıcıdan</option>
                    <option>Alıcıdan</option>
                    <option>Her İkisinden Eşit</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Başlangıç Tarihi</label>
                <input type="date" value={baslangicTarihi} onChange={e => setBaslangicTarihi(e.target.value)} className={inp} />
              </div>
            </>
          )}

          {docType === 'sales_contract' && (
            <>
              <div className={row2}>
                <div>
                  <label className={lbl}>Satış Bedeli (₺)</label>
                  <input type="number" value={satisBedeli} onChange={e => setSatisBedeli(e.target.value)} className={inp} placeholder="0" />
                </div>
                <div>
                  <label className={lbl}>Kapora Tutarı (₺)</label>
                  <input type="number" value={kapora} onChange={e => setKapora(e.target.value)} className={inp} placeholder="0" />
                </div>
              </div>
              <div className={row2}>
                <div>
                  <label className={lbl}>Kapora Tarihi</label>
                  <input type="date" value={kaporaTarihi} onChange={e => setKaporaTarihi(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Teslim Tarihi</label>
                  <input type="date" value={teslimTarihi} onChange={e => setTeslimTarihi(e.target.value)} className={inp} />
                </div>
              </div>
            </>
          )}

          {docType === 'rental_contract' && (
            <>
              <div className={row2}>
                <div>
                  <label className={lbl}>Aylık Kira (₺)</label>
                  <input type="number" value={aylikKira} onChange={e => setAylikKira(e.target.value)} className={inp} placeholder="0" />
                </div>
                <div>
                  <label className={lbl}>Depozito (₺)</label>
                  <input type="number" value={depozito} onChange={e => setDepozito(e.target.value)} className={inp} placeholder="0" />
                </div>
              </div>
              <div className={row2}>
                <div>
                  <label className={lbl}>Kira Başlangıcı</label>
                  <input type="date" value={kiraBaslangic} onChange={e => setKiraBaslangic(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Kira Süresi (ay)</label>
                  <input type="number" value={kiraSuresiAy} onChange={e => setKiraSuresiAy(e.target.value)} className={inp} min="1" />
                </div>
              </div>
              <div>
                <label className={lbl}>Ödeme Günü (ayın kaçında)</label>
                <input type="number" value={odemeGunu} onChange={e => setOdemeGunu(e.target.value)} className={inp} min="1" max="31" />
              </div>
            </>
          )}

          {docType === 'offer_letter' && (
            <div className={row2}>
              <div>
                <label className={lbl}>Teklif Bedeli (₺)</label>
                <input type="number" value={teklifBedeli} onChange={e => setTeklifBedeli(e.target.value)} className={inp} placeholder="0" />
              </div>
              <div>
                <label className={lbl}>Geçerlilik Tarihi</label>
                <input type="date" value={gecerlilikTarihi} onChange={e => setGecerlilikTarihi(e.target.value)} className={inp} />
              </div>
            </div>
          )}

          <div>
            <label className={lbl}>Özel Şartlar <span className="text-slate-400">(belgede görünür)</span></label>
            <textarea
              value={ozelSartlar}
              onChange={e => setOzelSartlar(e.target.value)}
              className={`${inp} min-h-[80px] resize-y`}
              placeholder="Eklemek istediğiniz özel şartlar..."
            />
          </div>
        </div>

        {/* İç Notlar */}
        <div className="card">
          <label className={lbl}>İç Notlar <span className="text-slate-400">(belgede görünmez)</span></label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className={`${inp} min-h-[60px] resize-y`}
            placeholder="Dahili notlar..."
          />
        </div>

        {/* Aksiyonlar */}
        <div className="flex gap-3 justify-end pb-6">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Printer size={15} /> Önizle &amp; Yazdır
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title}
            className="flex items-center gap-2 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={15} /> {saving ? 'Kaydediliyor...' : 'Taslak Kaydet'}
          </button>
        </div>

      </div>
    </div>
  )
}
