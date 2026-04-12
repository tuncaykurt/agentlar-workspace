'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Client, Property, Consultant, DocumentType } from '@/lib/types'
import { ArrowLeft, Search, Printer, Save, X, ChevronDown } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateData = Record<string, string | null>

const DOC_TYPES: { value: DocumentType; label: string; desc: string; color: string }[] = [
  { value: 'authorization',   label: 'Yetki Belgesi',     desc: 'Satış veya kiralama yetkisi',      color: 'blue' },
  { value: 'sales_contract',  label: 'Satış Sözleşmesi',  desc: 'Gayrimenkul satış sözleşmesi',     color: 'green' },
  { value: 'rental_contract', label: 'Kira Sözleşmesi',   desc: 'Gayrimenkul kira sözleşmesi',      color: 'purple' },
  { value: 'offer_letter',    label: 'Teklif Mektubu',    desc: 'Alım teklifi mektubu',             color: 'orange' },
]

// ─── Client Search ────────────────────────────────────────────────────────────

// ─── Client Extra Fields ──────────────────────────────────────────────────────

function ClientExtraFields({
  client,
  extraData,
  onChange,
  onSaveToContact,
}: {
  client: Client
  extraData: { tc_no: string; address: string; email: string }
  onChange: (d: { tc_no: string; address: string; email: string }) => void
  onSaveToContact: () => void
}) {
  const missing = !client.tc_no || !client.address || !client.email
  const [open, setOpen] = useState(missing)
  const inp = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-600 bg-slate-50 hover:bg-slate-100"
      >
        <span>{missing ? '⚠️ Eksik bilgiler var — tıkla' : 'Belge için ek bilgiler'}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="p-3 space-y-2 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">TC / Vergi No</label>
              <input
                type="text"
                value={extraData.tc_no}
                onChange={e => onChange({ ...extraData, tc_no: e.target.value })}
                className={inp}
                placeholder="11 haneli TC"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">E-posta</label>
              <input
                type="email"
                value={extraData.email}
                onChange={e => onChange({ ...extraData, email: e.target.value })}
                className={inp}
                placeholder="ornek@mail.com"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Adres</label>
              <input
                type="text"
                value={extraData.address}
                onChange={e => onChange({ ...extraData, address: e.target.value })}
                className={inp}
                placeholder="Mahalle, sokak, şehir"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onSaveToContact}
            className="text-xs text-blue-600 hover:underline"
          >
            💾 Rehbere kaydet
          </button>
        </div>
      )}
    </div>
  )
}

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
      .select('id, full_name, salutation, phone, email, tc_no, address, client_type')
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
      .eq('is_active', true)
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

// ─── Money Input ─────────────────────────────────────────────────────────────

function MoneyInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string
  onChange: (raw: string) => void
  className?: string
  placeholder?: string
}) {
  // Format: raw number string → "1.200.000"
  const format = (raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return ''
    return parseInt(digits, 10).toLocaleString('tr-TR')
  }

  const [display, setDisplay] = useState(format(value))

  // Sync when value changes from outside (auto-calculation)
  useEffect(() => {
    setDisplay(format(value))
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\./g, '').replace(/,/g, '').replace(/\D/g, '')
    setDisplay(format(raw))
    onChange(raw)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      className={className}
      placeholder={placeholder}
    />
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
  officeAddress?: string
  officeLogo?: string
}) {
  const { docType, mainClient, secondClient, property, consultant, templateData, officeName, officeAddress, officeLogo } = params

  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })

  const money = (v: string | null | undefined) =>
    v
      ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(parseFloat(v.replace(',', '.')))
      : '_______________'

  const fmtDate = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '_______________'

  const clientName = (c: Client | null) =>
    c ? `${c.salutation ? c.salutation + ' ' : ''}${c.full_name}` : '_______________'

  // CB Ambiance logo — sabit SVG, settings gerekmez
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

  // Reusable party block — uses template_data for extra fields if available
  const partyRows = (label: string, c: Client | null, prefix: 'main' | 'second') => `
    <tr><td>${label}:</td><td>${clientName(c)}</td></tr>
    <tr><td>Telefon:</td><td>${c?.phone || '_______________'}</td></tr>
    <tr><td>E-posta:</td><td>${templateData[`${prefix}_email`] || c?.email || '_______________'}</td></tr>
    <tr><td>TC / Vergi No:</td><td>${templateData[`${prefix}_tc_no`] || c?.tc_no || '_______________'}</td></tr>
    <tr><td>Adres:</td><td>${templateData[`${prefix}_address`] || c?.address || '_______________'}</td></tr>
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

  // Authorization doc helpers
  const chk = (c: boolean) => c ? '&#9745;' : '&#9744;'
  const sureSon = (() => {
    try {
      const d = new Date(templateData.baslangic_tarihi as string || new Date())
      d.setDate(d.getDate() + parseInt(String(templateData.yetki_suresi_gun || '90')))
      return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
    } catch { return '_______________' }
  })()
  const propType = property?.property_type || ''
  const propAddress = [property?.address, property?.district, property?.city].filter(Boolean).join(', ') || '_______________'
  const propIlce = property?.district || '_______________'
  const propIl = property?.city || '_______________'
  const propAda = templateData.ada || '___'
  const propParsel = templateData.parsel || '___'
  const propPafta = templateData.pafta || '___'
  const propM2 = property?.m2_gross ? `${property.m2_gross} m²` : '_______________'
  const propOzellik = [
    property?.room_count ? `${property.room_count} oda` : '',
    property?.floor ? `${property.floor}. kat` : '',
    property?.m2_net ? `Net ${property.m2_net} m²` : '',
  ].filter(Boolean).join(' — ') || (templateData.ozel_sartlar as string || '')
  const mainAddr = (templateData.main_address as string) || mainClient?.address || ''
  const mainPhone = mainClient?.phone || ''
  const mainEmail = (templateData.main_email as string) || mainClient?.email || ''
  const mainTc = (templateData.main_tc_no as string) || mainClient?.tc_no || ''
  const stB = `
    <style>
      .auth-table { width:100%; border-collapse:collapse; margin-bottom:0; font-size:11px; }
      .auth-table td, .auth-table th { border:1px solid #000; padding:3px 6px; vertical-align:middle; }
      .auth-table th { background:#ddd; font-weight:bold; text-align:center; }
      .sec-title { background:#e0e0e0; font-weight:bold; font-size:11px; padding:3px 6px; border:1px solid #000; border-bottom:none; text-transform:uppercase; letter-spacing:0.5px; }
      .clause { font-size:10.5px; line-height:1.65; margin-bottom:5px; text-align:justify; }
      .clause strong { font-weight:bold; }
      .auth-sigs { display:flex; justify-content:space-between; margin-top:24px; gap:20px; }
      .auth-sig { text-align:center; flex:1; }
      .auth-sig-label { font-size:10px; font-weight:bold; margin-bottom:4px; }
      .auth-sig-box { border-top:1px solid #000; padding-top:4px; min-height:50px; font-size:10px; }
    </style>`

  const docTypeConfigs: Record<string, { title: string; body: string; sigs: string }> = {
    authorization: {
      title: 'ARACILIK SÖZLEŞMESİ',
      body: `
        ${stB}
        <!-- HEADER -->
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
                  <tr><td style="font-weight:bold;width:85px;padding:2px 0;">AD SOYAD</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${clientName(mainClient)}</td></tr>
                  <tr><td style="font-weight:bold;padding:2px 0;">ADRESİ</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${mainAddr}</td></tr>
                  <tr><td style="font-weight:bold;padding:2px 0;">TELEFON</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${mainPhone}</td></tr>
                  <tr><td style="font-weight:bold;padding:2px 0;">TC No</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${mainTc}</td></tr>
                  <tr><td style="font-weight:bold;padding:2px 0;">e-mail</td><td style="border-bottom:1px solid #bbb;padding:2px 4px;">${mainEmail}</td></tr>
                </table>
              </div>
            </td>
          </tr>
        </table>

        <!-- GAYRİMENKULE AİT BİLGİLER -->
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
          <tr>
            <td colspan="2" style="font-weight:bold;">Adresi</td>
            <td colspan="5">${propAddress}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;">İlçesi</td>
            <td colspan="2">${propIlce}</td>
            <td style="font-weight:bold;">İli</td>
            <td colspan="3">${propIl}</td>
          </tr>
          <tr>
            <td colspan="2" style="font-weight:bold;">Tapu Kayıt Bilg.</td>
            <td>Pafta: ${propPafta}</td>
            <td colspan="2">Ada: ${propAda}</td>
            <td colspan="2">Parsel: ${propParsel}</td>
          </tr>
          <tr>
            <td colspan="2" style="font-weight:bold;">Diğer Özellikler</td>
            <td colspan="5">${propOzellik}</td>
          </tr>
        </table>

        <!-- YAPILACAK İŞLEME AİT BİLGİLER -->
        <div class="sec-title" style="margin-top:6px;">YAPILACAK İŞLEME AİT BİLGİLER</div>
        <table class="auth-table">
          <tr>
            <td style="font-weight:bold;">Satış Tutarı</td>
            <td>${templateData.satis_tutari ? money(templateData.satis_tutari as string) : '_______________'} TL</td>
            <td style="font-weight:bold;">Ödeme Şekli</td>
            <td>${templateData.odeme_sekli || 'Nakit'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;">Komisyon Oranı</td>
            <td>%${templateData.komisyon_orani || '3'} + KDV (${templateData.komisyon_turu || 'Satıcıdan'})</td>
            <td style="font-weight:bold;">Gayrimenkul Danışmanı</td>
            <td>${consultant?.full_name || '_______________'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;">Yetki Türü</td>
            <td>${templateData.yetki_turu || 'Satış'}</td>
            <td style="font-weight:bold;">Süre</td>
            <td>${templateData.yetki_suresi_gun || '90'} gün (${fmtDate(templateData.baslangic_tarihi as string)} – ${sureSon})</td>
          </tr>
        </table>

        <!-- MADDELER -->
        <div style="margin-top:8px;">
          <p class="clause"><strong>1. KONU:</strong> Müşteri ile ${officeName}, yukarıda belirtilen gayrimenkulün ${templateData.yetki_turu || 'satış'}ına aracılık edilmesi işlemi için karşılıklı olarak anlaşılmıştır.</p>
          <p class="clause"><strong>2. TANITIM YETKİSİ:</strong> Müşteri, gayrimenkulü ile ilgili olarak satış işlemi amacıyla internet, basın, yayın ve medyayı da dahil etmek üzere tanıtım faaliyetlerinde bulunmak hakkını ve gayrimenkule giriş imkânı sağlamayı ${officeName}'e kabul ve taahhüt eder.</p>
          <p class="clause"><strong>3. YETKİ:</strong> Müşteri, gayrimenkulü ile ilgili olarak kendisine gelen tüm başvuruları ${officeName}'e bildirmeyi ve sözleşme süresi dolmadan başka bir gayrimenkul şirketi ile çalışmamayı kabul ve taahhüt eder. Müşteri, sözleşmeyi süresinden önce feshetmesi ya da başka bir şirkete sattırması/kiralaması halinde yukarıdaki satış tutarı üzerinden komisyon miktarını ${officeName}'e ödemeyi kabul eder.</p>
          <p class="clause"><strong>4. İŞLEM YETKİSİ:</strong> Müşteri, gayrimenkulünün üzerinde işlem yapma yetkisi bulunmayan üçüncü kişilerin sebep olacağı zararı önlemek amacıyla ${officeName}'in gerekli tedbirleri almasına izin vermeyi kabul eder.</p>
          <p class="clause"><strong>5. SÜRE:</strong> İşbu sözleşme, taraflarca imzalandığı tarihten itibaren <strong>${templateData.yetki_suresi_gun || '90'} gün</strong> süreyle geçerlidir. Bitiş tarihi: <strong>${sureSon}</strong>. Sözleşme süresi içinde taşınmaz satılır/kiralanırsa komisyon tutarı tahsil edilecektir.</p>
          <p class="clause"><strong>6. SÜRENİN BİTİMİ:</strong> Sözleşme süresinin dolmasından veya herhangi bir şekilde sona ermesinden sonra 90 gün içinde ${officeName}'in tanıştırdığı/gösterdiği kişi veya kuruluşlarla işlem yapılması halinde, ${officeName}'e yukarıda belirtilen komisyon miktarının 2 katı + KDV'si hizmet bedeli olarak ödenir.</p>
          <p class="clause"><strong>7. İHTİLAF:</strong> Bu sözleşmenin uygulanmasından doğacak her türlü uyuşmazlıkta Bursa (Merkez) Mahkemeleri ve İcra Daireleri yetkilidir. Doğacak damga vergisi, resim, pul ve harçların tamamı müşteriye aittir.</p>
          ${templateData.ozel_sartlar ? `<p class="clause"><strong>ÖZEL ŞARTLAR:</strong> ${templateData.ozel_sartlar}</p>` : ''}
        </div>
      `,
      sigs: `
        <div class="auth-sigs">
          <div class="auth-sig">
            <div class="auth-sig-label">Müşteri<br>Ad Soyad ve İmza</div>
            <div class="auth-sig-box" style="min-height:60px;"></div>
            <div style="font-size:10px;margin-top:4px;">${clientName(mainClient)}</div>
          </div>
          <div class="auth-sig">
            <div class="auth-sig-label">${officeName} Adına<br>İsim ve İmza</div>
            <div class="auth-sig-box" style="min-height:60px;"></div>
            <div style="font-size:10px;margin-top:4px;">${consultant?.full_name || '_______________'}</div>
          </div>
          <div class="auth-sig" style="flex:0.5;text-align:left;">
            <div class="auth-sig-label">Tarih</div>
            <div class="auth-sig-box">${today}</div>
          </div>
        </div>
      `,
    },
    sales_contract: {
      title: 'GAYRİMENKUL SATIŞ SÖZLEŞMESİ',
      body: `
        <h2>1. Satıcı Bilgileri</h2>
        <table>${partyRows('Satıcı', mainClient, 'main')}</table>
        <h2>2. Alıcı Bilgileri</h2>
        <table>${partyRows('Alıcı', secondClient, 'second')}</table>
        <h2>3. Taşınmaz Bilgileri</h2>
        <table>${propRows}</table>
        <h2>4. Satış Şartları</h2>
        <table>
          <tr><td>Satış Bedeli:</td><td><strong>${money(templateData.satis_bedeli as string)}</strong></td></tr>
          <tr><td>Peşinat / Kapora:</td><td>${money(templateData.kapora as string)}</td></tr>
          <tr><td>Kapora Tarihi:</td><td>${fmtDate(templateData.kapora_tarihi as string)}</td></tr>
          ${templateData.tapuda_odenecek ? `<tr><td>Tapuda Ödenecek:</td><td><strong>${money(templateData.tapuda_odenecek as string)}</strong></td></tr>` : ''}
          ${templateData.teslim_tarihi ? `<tr><td>Tapu Tescil Tarihi:</td><td>${fmtDate(templateData.teslim_tarihi as string)}</td></tr>` : ''}
        </table>
        ${(templateData.ada || templateData.parsel) ? `
        <h2>5. Taşınmaz Bilgileri</h2>
        <table>
          ${templateData.ada ? `<tr><td>Ada:</td><td>${templateData.ada}</td></tr>` : ''}
          ${templateData.parsel ? `<tr><td>Parsel:</td><td>${templateData.parsel}</td></tr>` : ''}
          ${templateData.pafta ? `<tr><td>Pafta:</td><td>${templateData.pafta}</td></tr>` : ''}
        </table>` : ''}
        <h2>6. Hizmet Bedeli (Komisyon)</h2>
        <p>ALICI ve SATICI, ${officeName}'e işbu sözleşmenin imzalanmasıyla birlikte aşağıdaki hizmet bedelini hiçbir ihtara ve ihbara gerek kalmadan ödemeyi kabul ve taahhüt eder:</p>
        <table>
          <tr><td>Alıcıdan (%${templateData.komisyon_alici || '2'} + KDV):</td><td>${templateData.hizmet_bedeli_alici ? money(templateData.hizmet_bedeli_alici as string) : '%' + (templateData.komisyon_alici || '2') + ' + KDV'}</td></tr>
          <tr><td>Satıcıdan (%${templateData.komisyon_satici || '2'} + KDV):</td><td>${templateData.hizmet_bedeli_satici ? money(templateData.hizmet_bedeli_satici as string) : '%' + (templateData.komisyon_satici || '2') + ' + KDV'}</td></tr>
          ${templateData.hizmet_bedeli ? `<tr><td><strong>Toplam Hizmet Bedeli:</strong></td><td><strong>${money(templateData.hizmet_bedeli as string)}</strong></td></tr>` : ''}
        </table>
        ${templateData.ceza_miktari && templateData.ceza_miktari !== '0' ? `
        <h2>7. Cayma Cezası</h2>
        <p>Sözleşmeden cayılması halinde, cayma bedeli <strong>${money(templateData.ceza_miktari as string)}</strong> olarak belirlenmiştir. Cayma durumunda hem kendi hem de karşı tarafın ödeyeceği komisyon tutarının tamamını ${officeName}'e ödemeyi kabul eder.</p>` : ''}
        <h2>8. Özel Şartlar</h2>
        <p>${templateData.ozel_sartlar || 'Yoktur.'}</p>
        <h2>9. Genel Hükümler</h2>
        <p>İş bu sözleşme taraflarca serbestçe imzalanmıştır. Uyuşmazlıklarda taşınmazın bulunduğu yerin mahkeme ve icra daireleri yetkilidir.</p>
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
        <table>${partyRows('Kiraya Veren', mainClient, 'main')}</table>
        <h2>2. Kiracı</h2>
        <table>${partyRows('Kiracı', secondClient, 'second')}</table>
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
        <table>${partyRows('Alıcı', mainClient, 'main')}</table>
        <h2>2. Satıcı / Mülk Bilgileri</h2>
        <table>${partyRows('Satıcı', secondClient, 'second')}</table>
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
  <style>${styles}
    .letterhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .letterhead img { max-height: 70px; max-width: 220px; object-fit: contain; }
    .letterhead-text { text-align: right; font-size: 11px; color: #444; line-height: 1.6; }
    @media print { .no-print { display: none !important; } body { padding: 20px; } }
  </style>
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
  ${docType === 'sales_contract' ? `<div class="sub" style="font-size:13px;font-weight:bold;letter-spacing:1px;color:#333;">PROTOKOL YAZISI</div>` : ''}
  <div class="sub">${today}</div>
  <hr class="divider">
  ${cfg.body}
  <div class="sigs">${cfg.sigs}</div>
  <div class="footer">${officeName}${officeAddress ? ' &bull; ' + officeAddress.split('\n')[0] : ''} &bull; ${today}</div>
</body>
</html>`
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewDocumentPage() {
  const router = useRouter()

  const [docType, setDocType] = useState<DocumentType>('authorization')
  const [title, setTitle] = useState('')
  const [officeName, setOfficeName] = useState('Ambiance Gayrimenkul')
  const [officeAddress, setOfficeAddress] = useState('Ahmet Yesevi Mah. Hudut Sok. Central Balat Sitesi 1/C\nNilüfer / BURSA')
  const [officeLogo, setOfficeLogo] = useState('')
  const [consultants, setConsultants] = useState<Pick<Consultant, 'id' | 'full_name'>[]>([])
  const [consultantId, setConsultantId] = useState('')

  const [mainClient, setMainClient] = useState<Client | null>(null)
  const [secondClient, setSecondClient] = useState<Client | null>(null)
  const [property, setProperty] = useState<Property | null>(null)

  type ExtraFields = { tc_no: string; address: string; email: string }
  const emptyExtra = (): ExtraFields => ({ tc_no: '', address: '', email: '' })
  const [mainExtra, setMainExtra] = useState<ExtraFields>(emptyExtra())
  const [secondExtra, setSecondExtra] = useState<ExtraFields>(emptyExtra())

  // Authorization fields
  const [yetkiTuru, setYetkiTuru] = useState('Satış')
  const [komisyonOrani, setKomisyonOrani] = useState('3')
  const [komisyonTuru, setKomisyonTuru] = useState('Satıcıdan')
  const [baslangicTarihi, setBaslangicTarihi] = useState(new Date().toISOString().slice(0, 10))
  const [yetkiSuresiGun, setYetkiSuresiGun] = useState('90')
  const [satisTutari, setSatisTutari] = useState('')
  const [odemeSekli, setOdemeSekli] = useState('Nakit')
  const [yAda, setYAda] = useState('')
  const [yParsel, setYParsel] = useState('')
  const [yPafta, setYPafta] = useState('')

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

  // Sales commission fields
  const [komisyonAlici, setKomisyonAlici] = useState('2')
  const [komisyonSatici, setKomisyonSatici] = useState('2')
  const [hizmetBedeliAlici, setHizmetBedeliAlici] = useState('')   // auto: satis × alici% × 1.20
  const [hizmetBedeliSatici, setHizmetBedeliSatici] = useState('') // auto: satis × satici% × 1.20
  const [hizmetBedeli, setHizmetBedeli] = useState('')             // auto: alici + satici
  const [tapudaOdenecek, setTapudaOdenecek] = useState('')         // auto: satis - kapora
  const [cezaMiktari, setCezaMiktari] = useState('')
  // Ada/Parsel/Pafta ayrı alanlar
  const [ada, setAda] = useState('')
  const [parsel, setParsel] = useState('')
  const [pafta, setPafta] = useState('')

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
    const settingsKeys = ['office_name', 'office_address', 'office_logo']
    supabase.from('settings').select('key, value').in('key', settingsKeys)
      .then(({ data }) => {
        data?.forEach(row => {
          const v = typeof row.value === 'string' ? row.value.replace(/^"|"$/g, '') : String(row.value)
          if (row.key === 'office_name' && v) setOfficeName(v)
          if (row.key === 'office_address' && v) setOfficeAddress(v)
          if (row.key === 'office_logo' && v) setOfficeLogo(v)
        })
      })
  }, [])

  // Auto-generate title
  useEffect(() => {
    const typeLabel = DOC_TYPES.find(t => t.value === docType)?.label || ''
    const cn = mainClient?.full_name || ''
    const now = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
    setTitle(`${typeLabel}${cn ? ' — ' + cn : ''} (${now})`)
  }, [docType, mainClient])

  // Pre-fill extra fields when client is selected
  useEffect(() => {
    if (mainClient) {
      setMainExtra({ tc_no: mainClient.tc_no || '', address: mainClient.address || '', email: mainClient.email || '' })
    } else {
      setMainExtra(emptyExtra())
    }
  }, [mainClient])

  useEffect(() => {
    if (secondClient) {
      setSecondExtra({ tc_no: secondClient.tc_no || '', address: secondClient.address || '', email: secondClient.email || '' })
    } else {
      setSecondExtra(emptyExtra())
    }
  }, [secondClient])

  const KDV = 1.20

  // Auto-calculate hizmet bedeli breakdown (alıcı/satıcı) from commission rates
  useEffect(() => {
    const satis = parseFloat(satisBedeli) || 0
    const aliciRate = parseFloat(komisyonAlici) || 0
    const saticiRate = parseFloat(komisyonSatici) || 0
    if (satis > 0) {
      const alici = Math.round(satis * (aliciRate / 100) * KDV)
      const satici = Math.round(satis * (saticiRate / 100) * KDV)
      setHizmetBedeliAlici(alici > 0 ? String(alici) : '')
      setHizmetBedeliSatici(satici > 0 ? String(satici) : '')
    }
  }, [satisBedeli, komisyonAlici, komisyonSatici])

  // Toplam hizmet bedeli = kapora (alınan kapora bizim hizmet bedelimiz)
  useEffect(() => {
    const kap = parseFloat(kapora) || 0
    if (kap > 0) setHizmetBedeli(String(kap))
    else setHizmetBedeli('')
  }, [kapora])

  // Auto-calculate tapuda ödenecek: satış bedeli − satıcıdan hizmet bedeli (%satici+KDV)
  useEffect(() => {
    const satis = parseFloat(satisBedeli) || 0
    const saticiHizmet = parseFloat(hizmetBedeliSatici) || 0
    if (satis > 0) {
      setTapudaOdenecek(saticiHizmet > 0 ? String(satis - saticiHizmet) : String(satis))
    }
  }, [satisBedeli, hizmetBedeliSatici])

  async function saveExtraToClient(clientId: string, extra: ExtraFields) {
    const supabase = createClient()
    const update: Record<string, string> = {}
    if (extra.tc_no) update.tc_no = extra.tc_no
    if (extra.address) update.address = extra.address
    if (extra.email) update.email = extra.email
    if (Object.keys(update).length > 0) {
      await supabase.from('clients').update(update).eq('id', clientId)
    }
  }

  function getTemplateData(): TemplateData {
    const mainInfo = { main_tc_no: mainExtra.tc_no, main_address: mainExtra.address, main_email: mainExtra.email }
    const secondInfo = { second_tc_no: secondExtra.tc_no, second_address: secondExtra.address, second_email: secondExtra.email }
    const base: TemplateData = { ozel_sartlar: ozelSartlar, ...mainInfo, ...secondInfo }
    if (docType === 'authorization') return { ...base, yetki_turu: yetkiTuru, komisyon_orani: komisyonOrani, komisyon_turu: komisyonTuru, baslangic_tarihi: baslangicTarihi, yetki_suresi_gun: yetkiSuresiGun, satis_tutari: satisTutari, odeme_sekli: odemeSekli, ada: yAda, parsel: yParsel, pafta: yPafta }
    if (docType === 'sales_contract') return { ...base, satis_bedeli: satisBedeli, kapora, kapora_tarihi: kaporaTarihi, teslim_tarihi: teslimTarihi, tapuda_odenecek: tapudaOdenecek, komisyon_alici: komisyonAlici, komisyon_satici: komisyonSatici, hizmet_bedeli_alici: hizmetBedeliAlici, hizmet_bedeli_satici: hizmetBedeliSatici, hizmet_bedeli: hizmetBedeli, ceza_miktari: cezaMiktari, ada: ada, parsel: parsel, pafta: pafta }
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
    if (!error) {
      // Silently save filled extra fields to contacts
      if (mainClient) await saveExtraToClient(mainClient.id, mainExtra)
      if (secondClient) await saveExtraToClient(secondClient.id, secondExtra)
      router.push('/documents')
    }
  }

  function handlePrint() {
    const consultant = consultants.find(c => c.id === consultantId) || null
    const html = generatePrintHTML({
      docType, title,
      mainClient, secondClient, property,
      consultant: consultant as Pick<Consultant, 'id' | 'full_name'> | null,
      templateData: getTemplateData(),
      officeName,
      officeAddress,
      officeLogo,
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
          <div>
            <ClientSearch label={mainClientLabel} value={mainClient} onChange={setMainClient} />
            {mainClient && (
              <ClientExtraFields
                client={mainClient}
                extraData={mainExtra}
                onChange={setMainExtra}
                onSaveToContact={() => saveExtraToClient(mainClient.id, mainExtra)}
              />
            )}
          </div>
          {showSecondClient && (
            <div>
              <ClientSearch label={secondClientLabel} value={secondClient} onChange={setSecondClient} />
              {secondClient && (
                <ClientExtraFields
                  client={secondClient}
                  extraData={secondExtra}
                  onChange={setSecondExtra}
                  onSaveToContact={() => saveExtraToClient(secondClient.id, secondExtra)}
                />
              )}
            </div>
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
              <div className={row2}>
                <div>
                  <label className={lbl}>Satış Tutarı (₺)</label>
                  <MoneyInput value={satisTutari} onChange={setSatisTutari} className={inp} placeholder="0" />
                </div>
                <div>
                  <label className={lbl}>Ödeme Şekli</label>
                  <select value={odemeSekli} onChange={e => setOdemeSekli(e.target.value)} className={inp}>
                    <option>Nakit</option>
                    <option>Banka Transferi</option>
                    <option>Senet</option>
                    <option>Karma</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Tapu Kayıt Bilgileri</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Ada</label>
                    <input type="text" value={yAda} onChange={e => setYAda(e.target.value)} className={inp} placeholder="103" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Parsel</label>
                    <input type="text" value={yParsel} onChange={e => setYParsel(e.target.value)} className={inp} placeholder="1" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Pafta</label>
                    <input type="text" value={yPafta} onChange={e => setYPafta(e.target.value)} className={inp} placeholder="—" />
                  </div>
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
                  <MoneyInput value={satisBedeli} onChange={setSatisBedeli} className={inp} placeholder="0" />
                </div>
                <div>
                  <label className={lbl}>Kapora Tutarı (₺)</label>
                  <MoneyInput value={kapora} onChange={setKapora} className={inp} placeholder="0" />
                </div>
              </div>
              <div className={row2}>
                <div>
                  <label className={lbl}>Kapora Tarihi</label>
                  <input type="date" value={kaporaTarihi} onChange={e => setKaporaTarihi(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Tapu Tescil Tarihi</label>
                  <input type="date" value={teslimTarihi} onChange={e => setTeslimTarihi(e.target.value)} className={inp} />
                </div>
              </div>
              {/* Ada / Parsel / Pafta — ayrı kutular */}
              <div>
                <label className={lbl}>Taşınmaz Bilgileri</label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Ada</label>
                    <input type="text" value={ada} onChange={e => setAda(e.target.value)} className={inp} placeholder="103" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Parsel</label>
                    <input type="text" value={parsel} onChange={e => setParsel(e.target.value)} className={inp} placeholder="58" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Pafta</label>
                    <input type="text" value={pafta} onChange={e => setPafta(e.target.value)} className={inp} placeholder="—" />
                  </div>
                </div>
              </div>

              {/* Tapuda ödenecek */}
              <div>
                <label className={lbl}>Tapuda Ödenecek (₺) <span className="text-xs font-normal text-slate-400">— otomatik: satış − satıcıdan hizmet bedeli</span></label>
                <MoneyInput value={tapudaOdenecek} onChange={setTapudaOdenecek} className={inp} placeholder="0" />
              </div>

              {/* Hizmet bedeli */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Hizmet Bedeli (Komisyon) <span className="text-xs font-normal text-slate-400">— Toplam: kapora otomatik doldurulur, elle değiştirilebilir</span></p>
                <div className={row2}>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Alıcı Komisyon Oranı (%)</label>
                    <input type="number" value={komisyonAlici} onChange={e => setKomisyonAlici(e.target.value)} className={inp} step="0.5" min="0" max="10" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Satıcı Komisyon Oranı (%)</label>
                    <input type="number" value={komisyonSatici} onChange={e => setKomisyonSatici(e.target.value)} className={inp} step="0.5" min="0" max="10" />
                  </div>
                </div>
                <div className={row2}>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Alıcıdan Hizmet Bedeli (₺ +KDV)</label>
                    <MoneyInput value={hizmetBedeliAlici} onChange={setHizmetBedeliAlici} className={inp} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Satıcıdan Hizmet Bedeli (₺ +KDV)</label>
                    <MoneyInput value={hizmetBedeliSatici} onChange={setHizmetBedeliSatici} className={inp} placeholder="0" />
                  </div>
                </div>
                <div className={row2}>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Toplam Hizmet Bedeli (₺) — kapora = hizmet bedeli</label>
                    <MoneyInput value={hizmetBedeli} onChange={setHizmetBedeli} className={`${inp} font-semibold`} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Ceza Miktarı (₺) — vazgeçme</label>
                    <MoneyInput value={cezaMiktari} onChange={setCezaMiktari} className={inp} placeholder="0" />
                  </div>
                </div>
              </div>
            </>
          )}

          {docType === 'rental_contract' && (
            <>
              <div className={row2}>
                <div>
                  <label className={lbl}>Aylık Kira (₺)</label>
                  <MoneyInput value={aylikKira} onChange={setAylikKira} className={inp} placeholder="0" />
                </div>
                <div>
                  <label className={lbl}>Depozito (₺)</label>
                  <MoneyInput value={depozito} onChange={setDepozito} className={inp} placeholder="0" />
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
                <MoneyInput value={teklifBedeli} onChange={setTeklifBedeli} className={inp} placeholder="0" />
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
