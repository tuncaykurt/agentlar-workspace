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

  const numToWords = (v: string | null | undefined): string => {
    if (!v) return '___'
    const n = parseInt(String(v).replace(/[^0-9]/g, ''))
    if (isNaN(n) || n === 0) return 'sıfır'
    const ones = ['','bir','iki','üç','dört','beş','altı','yedi','sekiz','dokuz']
    const tens = ['','on','yirmi','otuz','kırk','elli','altmış','yetmiş','seksen','doksan']
    const cvt3 = (x: number): string => {
      let r = ''
      if (x >= 100) { r += (x>=200?ones[Math.floor(x/100)]:'')+'yüz'; x%=100 }
      if (x >= 10) { r += tens[Math.floor(x/10)]; x%=10 }
      return r + ones[x]
    }
    let r = '', x = n
    if (x >= 1000000000) { r += cvt3(Math.floor(x/1000000000))+'milyar'; x%=1000000000 }
    if (x >= 1000000) { r += cvt3(Math.floor(x/1000000))+'milyon'; x%=1000000 }
    if (x >= 1000) { const t=Math.floor(x/1000); r+=(t===1?'':cvt3(t))+'bin'; x%=1000 }
    return r + cvt3(x)
  }

  // CB Ambiance logo — sabit SVG, settings gerekmez
  const CB_LOGO_SVG = `<img src="data:image/png;base64,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" style="height:70px;max-width:220px;object-fit:contain;">`

  const styles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { overflow-x: hidden; }
    body { font-family: 'Times New Roman', Times, serif; max-width: 860px; margin: 0 auto; padding: 32px 28px; color: #111; font-size: 16px; line-height: 1.9; overflow-x: hidden; word-break: break-word; }
    h1 { font-size: 21px; text-align: center; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 8px; }
    .sub { text-align: center; font-size: 15px; color: #555; margin-bottom: 6px; }
    .divider { border: none; border-top: 2px solid #111; margin: 14px 0 22px; }
    h2 { font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 20px 0 10px; }
    .tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; width: 100%; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; min-width: 0; }
    td { padding: 5px 8px; vertical-align: top; font-size: 15px; word-break: break-word; }
    td:first-child { font-weight: bold; width: 170px; }
    p { margin-bottom: 10px; text-align: justify; font-size: 16px; }
    .sigs { display: flex; justify-content: space-around; margin-top: 52px; gap: 16px; flex-wrap: wrap; }
    .sig { text-align: center; flex: 1; min-width: 120px; }
    .sig-line { border-top: 1px solid #000; padding-top: 8px; font-size: 14px; min-height: 64px; }
    .footer { margin-top: 40px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 10px; }
    .print-btn { background: #2563eb; color: #fff; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; margin: 0 8px 0 0; }
    .pdf-btn { background: #16a34a; color: #fff; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; }
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
      @page { size: A4; margin: 15mm; }
      body { padding: 0; font-size: 13px; }
      td { font-size: 12px; }
      h1 { font-size: 16px; }
    }
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
  const propType = (templateData.mulk_tipi as string) || property?.property_type || ''
  const propAddress = [property?.address, property?.district, property?.city].filter(Boolean).join(', ') || '_______________'
  const propIlce = (templateData.ilce as string) || property?.district || '_______________'
  const propIl = (templateData.il as string) || property?.city || '_______________'
  const propMahalle = (templateData.mahalle as string) || ''
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
      .auth-sigs { display:flex; justify-content:space-between; margin-top:36px; gap:20px; width:100%; }
      .auth-sig { text-align:center; flex:1; }
      .auth-sig-label { font-size:11px; font-weight:bold; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px; }
      .auth-sig-box { border-top:2px solid #333; padding-top:8px; min-height:75px; font-size:11px; }
    </style>`

  const docTypeConfigs: Record<string, { title: string; body: string; sigs: string }> = {
    authorization: {
      title: 'ARACILIK SÖZLEŞMESİ',
      body: `
        ${stB}
        <!-- HEADER -->
        <table class="auth-table" style="margin-bottom:0;">
          <tr>
            <td style="width:42%;vertical-align:top;padding:10px 12px;border-right:2px solid #000;">
              <div style="margin-bottom:4px;"><img src="data:image/png;base64,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" style="height:46px;max-width:160px;object-fit:contain;"></div>
              <div style="margin-top:6px;font-size:9px;line-height:1.7;color:#222;">
                <strong style="font-size:10px;display:block;margin-bottom:2px;">Ambiance Gayrimenkul Yatırım Ortaklığı İnşaat San. Tic. Ltd. Şti.</strong>
                ${(officeAddress || '').replace(/\n/g, '<br>')}<br>
                <span style="color:#666;">Mersis No: 0068090568900012</span>
              </div>
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
        <div class="tbl-wrap"><table class="auth-table">
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
            <td style="font-weight:bold;">Mahallesi</td>
            <td colspan="2">${propMahalle || '_______________'}</td>
            <td style="font-weight:bold;">İlçesi</td>
            <td>${propIlce}</td>
            <td style="font-weight:bold;">İli</td>
            <td>${propIl}</td>
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
        </table></div>

        <!-- YAPILACAK İŞLEME AİT BİLGİLER -->
        <div class="sec-title" style="margin-top:6px;">YAPILACAK İŞLEME AİT BİLGİLER</div>
        <div class="tbl-wrap"><table class="auth-table">
          <tr>
            <td style="font-weight:bold;">${templateData.yetki_turu === 'Kiralama' ? 'Kira Bedeli' : 'Satış Tutarı'}</td>
            <td>${templateData.yetki_turu === 'Kiralama'
              ? (templateData.kira_bedeli ? money(templateData.kira_bedeli as string) + ' + KDV' : '_______________')
              : (templateData.satis_tutari ? money(templateData.satis_tutari as string) : '_______________')} TL</td>
            <td style="font-weight:bold;">Ödeme Şekli</td>
            <td>${templateData.odeme_sekli || 'Nakit'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;">Komisyon Oranı</td>
            <td>%${templateData.komisyon_orani || '2'} + KDV (${templateData.komisyon_turu || 'Satıcıdan'})</td>
            <td style="font-weight:bold;">Gayrimenkul Danışmanı</td>
            <td>${consultant?.full_name || '_______________'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;">Yetki Türü</td>
            <td>${templateData.yetki_turu || 'Satış'}</td>
            <td style="font-weight:bold;">Süre</td>
            <td>${templateData.yetki_suresi_gun || '90'} gün (${fmtDate(templateData.baslangic_tarihi as string)} – ${sureSon})</td>
          </tr>
        </table></div>

        <!-- MADDELER -->
        <div style="margin-top:8px;">
          <p class="clause"><strong>1. KONU:</strong> Müşteri ile ${officeName}, yukarıda belirtilen gayrimenkulün ${templateData.yetki_turu || 'satış'}ına aracılık edilmesi işlemi için karşılıklı olarak anlaşılmıştır.</p>
          <p class="clause"><strong>2. TANITIM YETKİSİ:</strong> Müşteri, gayrimenkulü ile ilgili olarak satış işlemi amacıyla internet, basın, yayın ve medyayı da dahil etmek üzere tanıtım faaliyetlerinde bulunmak hakkını ve gayrimenkule giriş imkânı sağlamayı ${officeName}'e kabul ve taahhüt eder.</p>
          <p class="clause"><strong>3. YETKİ:</strong> Müşteri, gayrimenkulü ile ilgili olarak kendisine gelen tüm başvuruları ${officeName}'e bildirmeyi ve sözleşme süresi dolmadan başka bir gayrimenkul şirketi ile çalışmamayı kabul ve taahhüt eder. Müşteri, sözleşmeyi süresinden önce feshetmesi ya da başka bir şirkete sattırması/kiralaması halinde yukarıdaki satış tutarı üzerinden %${templateData.komisyon_orani || '2'} + KDV komisyon miktarını ${officeName}'e ödemeyi kabul eder.</p>
          <p class="clause"><strong>4. İŞLEM YETKİSİ:</strong> Müşteri, gayrimenkulünün üzerinde işlem yapma yetkisi bulunmayan üçüncü kişilerin sebep olacağı zararı önlemek amacıyla ${officeName}'in gerekli tedbirleri almasına izin vermeyi kabul eder.</p>
          <p class="clause"><strong>5. SÜRE:</strong> İşbu sözleşme, taraflarca imzalandığı tarihten itibaren <strong>${templateData.yetki_suresi_gun || '90'} gün</strong> süreyle geçerlidir. Bitiş tarihi: <strong>${sureSon}</strong>. Sözleşme süresi içinde taşınmaz satılır/kiralanırsa komisyon tutarı tahsil edilecektir.</p>
          <p class="clause"><strong>6. SÜRENİN BİTİMİ:</strong> Sözleşme süresinin dolmasından veya herhangi bir şekilde sona ermesinden sonra ${templateData.yetki_suresi_gun || '90'} gün içinde ${officeName}'in tanıştırdığı/gösterdiği kişi veya kuruluşlarla işlem yapılması halinde, ${officeName}'e yukarıda belirtilen komisyon miktarının 2 katı + KDV'si hizmet bedeli olarak ödenir.</p>
          <p class="clause"><strong>7. İHTİLAF:</strong> Bu sözleşmenin uygulanmasından doğacak her türlü uyuşmazlıkta Bursa (Merkez) Mahkemeleri ve İcra Daireleri yetkilidir. Doğacak damga vergisi, resim, pul ve harçların tamamı müşteriye aittir.</p>
          ${templateData.ozel_sartlar ? `<p class="clause"><strong>ÖZEL ŞARTLAR:</strong> ${templateData.ozel_sartlar}</p>` : ''}
          ${templateData.ek_madde ? `<p class="clause"><strong>EK MADDE:</strong> ${templateData.ek_madde}</p>` : ''}
        </div>
      `,
      sigs: `
        <div class="auth-sigs">
          <div class="auth-sig">
            <div class="auth-sig-label">MÜŞTERİ<br><small style="font-weight:normal;text-transform:none;letter-spacing:0;">Ad Soyad ve İmza</small></div>
            <div class="auth-sig-box"></div>
            <div style="font-size:11px;margin-top:6px;font-weight:bold;">${clientName(mainClient)}</div>
          </div>
          <div class="auth-sig">
            <div class="auth-sig-label">GAYRİMENKUL DANIŞMANI<br><small style="font-weight:normal;text-transform:none;letter-spacing:0;">Ambiance Adına İmza</small></div>
            <div class="auth-sig-box"></div>
            <div style="font-size:11px;margin-top:6px;font-weight:bold;">${consultant?.full_name || '_______________'}</div>
          </div>
          <div class="auth-sig" style="max-width:130px;">
            <div class="auth-sig-label">TARİH</div>
            <div class="auth-sig-box" style="padding-top:12px;">${today}</div>
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
            <td style="padding:4px 6px;">${clientName(mainClient)}${templateData.main_tc_no ? ' &bull; TC: ' + templateData.main_tc_no : ''}${mainClient?.phone ? ' &bull; Tel: ' + mainClient.phone : ''}${(templateData.main_address || mainClient?.address) ? '<br><span style="color:#555;">' + (templateData.main_address || mainClient?.address) + '</span>' : ''}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;padding:4px 6px;">ALICI</td>
            <td style="padding:4px 6px;">${clientName(secondClient)}${templateData.second_tc_no ? ' &bull; TC: ' + templateData.second_tc_no : ''}${secondClient?.phone ? ' &bull; Tel: ' + secondClient.phone : ''}${(templateData.second_address || secondClient?.address) ? '<br><span style="color:#555;">' + (templateData.second_address || secondClient?.address) + '</span>' : ''}</td>
          </tr>
          ${property || templateData.ada ? `<tr><td style="font-weight:bold;padding:4px 6px;">TAŞINMAZ</td><td style="padding:4px 6px;">${property ? [property.title, property.address, property.district, property.city].filter(Boolean).join(' — ') : ''}${templateData.ada ? ' &bull; Ada: ' + templateData.ada + (templateData.parsel ? ' / Parsel: ' + templateData.parsel : '') + (templateData.pafta ? ' / Pafta: ' + templateData.pafta : '') : ''}</td></tr>` : ''}
        </table>
        <div style="line-height:1.9;font-size:15px;">
          <p style="margin-bottom:12px;text-align:justify;">
            <strong>1-</strong> ALICI ile SATICI yukarıda bahsi geçen gayrimenkulün satışı hususunda aşağıdaki şartlarla anlaşmayı kabul eder. SATICI, sahibi bulunduğu veya satmaya yetkili olduğu bu mülkün satışını <strong>${money(templateData.satis_bedeli as string)} (${numToWords(templateData.satis_bedeli as string)})</strong> olarak kabul etmiştir. Satış bedeline mahsuben ALICI'dan <strong>${money(templateData.kapora as string)}</strong> kaparo olarak alınmıştır.${templateData.hizmet_tapuda ? ` Hizmet bedelinin kalan <strong>${money(templateData.hizmet_tapuda as string)}</strong> Tapu işlemleri sırasında alınacaktır.` : ''} Satış bedelinin <strong>${money(templateData.pesin_odenen as string)}</strong> peşinen ödenmiş olup, geri kalanı da <strong>${money(templateData.tapuda_odenecek as string)}</strong> tapuda ödenecektir.
          </p>
          <p style="margin-bottom:12px;text-align:justify;">
            <strong>2-</strong> Bu anlaşma imzalandıktan sonra, Borçlar Kanununun ilgili maddesine göre taraflardan ALICI gayrimenkulü almaktan vazgeçtiği takdirde verdiği kaporayı geri almayacaktır.
          </p>
          <p style="margin-bottom:12px;text-align:justify;">
            <strong>3-</strong> ALICI ve SATICI kendilerine bu anlaşmayı sağlayan <strong>Coldwell Banker Ambiance Gayrimenkul</strong>'e işbu sözleşmenin imzalanmasıyla yukarıdaki satış bedeli üzerinden <strong>(%${templateData.komisyon_alici || '2'} + %${templateData.komisyon_satici || '2'}) + KDV</strong> komisyon ücretini hiçbir ihtara ve ihbara gerek kalmadan ödemeyi peşinen kabul ve taahhüt eder.
          </p>
          <p style="margin-bottom:12px;text-align:justify;">
            <strong>4-</strong> ALICI ve SATICI'nın her biri, daha sonra alım ve/veya satımdan vazgeçerlerse veya Coldwell Banker Ambiance Gayrimenkul'ün dışında gelişen herhangi bir nedenle tapudaki satışı gerçekleştiremezseler; vazgeçen ve/veya satışa engel çıkartan taraf hem kendi ödeyeceği, hem de diğer tarafın ödeyeceği komisyon ücretinin tamamını <strong>(% ${(parseFloat(String(templateData.komisyon_alici||2))+parseFloat(String(templateData.komisyon_satici||2))).toFixed(0)} + KDV)</strong> Coldwell Banker Ambiance Gayrimenkul'a ödemeyi peşinen kabul ve taahhüt eder.
          </p>
          <p style="margin-bottom:12px;text-align:justify;">
            <strong>5-</strong> Satıştan vazgeçen ve/veya satışa engel çıkartan tarafın diğer tarafa ödeyeceği ceza miktarı <strong>${money(templateData.ceza_miktari as string)}</strong>'dir.
          </p>
          <p style="margin-bottom:12px;text-align:justify;">
            <strong>6-</strong> Dijital olarak tanzim edilen işbu sözleşme yukarıdaki hükümler ve sözleşmeye eklenecek ekleri (var ise) ile birlikte geçerli olmak üzere taraflarca kayıtsız, şartsız kabul edilmiş olup, sözleşmeden doğacak ihtilaflarda merci T.C. Bursa mahkeme ve icra daireleri yetkilidir.
          </p>
          ${templateData.ozel_sartlar ? `<p style="margin-bottom:12px;text-align:justify;"><strong>EK MADDE:</strong> ${templateData.ozel_sartlar}</p>` : ''}
        </div>
      `,
      sigs: `
        <div class="sig"><div class="sig-line">SATICI<br><strong>${clientName(mainClient)}</strong></div></div>
        <div class="sig"><div class="sig-line">ALICI<br><strong>${clientName(secondClient)}</strong></div></div>
        <div class="sig"><div class="sig-line">Danışman<br><strong>${consultant?.full_name || '_______________'}</strong><br>Ambiance Gayrimenkul</div></div>
      `,
    },
    rental_contract: {
      title: 'GAYRİMENKUL KİRA SÖZLEŞMESİ',
      body: `
        <style>
          .kira-tbl { width:100%; border-collapse:collapse; font-size:11px; margin-bottom:0; }
          .kira-tbl td { border:1px solid #000; padding:4px 8px; vertical-align:top; }
          .kira-tbl td:first-child { font-weight:bold; white-space:nowrap; width:220px; background:#f5f5f5; }
        </style>
        <div class="tbl-wrap"><table class="kira-tbl">
          <tr><td>KİRALANANIN ADRESİ</td><td>${templateData.kiralanan_adres || (property ? [property.address, property.district, property.city].filter(Boolean).join(', ') : '_______________')}</td></tr>
          <tr><td>CİNSİ</td><td>${templateData.kullanim_amaci || 'KONUT'}</td></tr>
          <tr><td>KİRAYA VERENİN ADI SOYADI</td><td>${clientName(mainClient)}${templateData.main_tc_no ? '\nT.C. ' + templateData.main_tc_no : ''}${mainClient?.phone ? '\nTEL: ' + mainClient.phone : ''}</td></tr>
          <tr><td>KİRACININ AD SOYADI ADRESİ</td><td>${clientName(secondClient)}${templateData.second_tc_no ? '\nT.C: ' + templateData.second_tc_no : ''}${secondClient?.phone ? '\nTEL: ' + secondClient.phone : ''}${templateData.kontrat_adres ? '\nKONTRAT ADRESİ: ' + templateData.kontrat_adres : ''}</td></tr>
          <tr><td>AYLIK KİRA TUTARI</td><td>${money(templateData.aylik_kira as string)} (${numToWords(templateData.aylik_kira as string)} türk lirası)</td></tr>
          <tr><td>YILLIK KİRA TUTARI</td><td>${templateData.aylik_kira ? money(String(parseFloat(String(templateData.aylik_kira).replace(/[^0-9.]/g,''))*12)) + ' (' + numToWords(String(parseFloat(String(templateData.aylik_kira).replace(/[^0-9.]/g,''))*12)) + ' türk lirası)' : '_______________'}</td></tr>
          <tr><td>ÖDEME ŞEKLİ VE BANKA BİLGİLERİ</td><td>${templateData.banka_adi ? 'BANKA ADI: ' + templateData.banka_adi + (templateData.hesap_adi ? '\nHESAP ADI: ' + templateData.hesap_adi : '') + (templateData.iban ? '\nIBAN: ' + templateData.iban : '') + '\nTAKİP EDEN HER AYIN ' + (templateData.odeme_gunu || '15') + ".'İNDE PEŞİN OLARAK YATIRILACAKTIR." : 'Her ayın ' + (templateData.odeme_gunu || '15') + '. günü peşin ödenecektir.'}</td></tr>
          <tr><td>DEPOZİTO</td><td>${money(templateData.depozito as string)}</td></tr>
          <tr><td>KİRANIN BAŞLANGICI</td><td>${fmtDate(templateData.kira_baslangic as string)}</td></tr>
          <tr><td>KİRANIN MÜDDETİ</td><td>${templateData.kira_suresi_ay || '12'} AY (${Math.round((parseInt(String(templateData.kira_suresi_ay||12)))/12)} YIL)</td></tr>
          <tr><td>YILLIK KİRA ARTIŞ ORANI</td><td>${templateData.artis_orani || 'YILLIK TÜFE ORANINA GÖRE YAPILACAKTIR.'}</td></tr>
          <tr><td>KİRALANANIN KULLANIM AMACI</td><td>${templateData.kullanim_amaci || 'KONUT'}</td></tr>
          <tr><td>TESLİM ALINAN DEMİRBAŞ LİSTESİ</td><td>${templateData.demirbas_listesi || '---'}</td></tr>
        </table></div>
        <div style="display:flex;justify-content:space-around;margin:28px 0 20px;font-size:11px;font-weight:bold;text-align:center;">
          <div>KİRACI<br><br><br>${clientName(secondClient)}</div>
          <div>KİRAYA VEREN<br><br><br>${clientName(mainClient)}</div>
        </div>
        
          <div style="margin-top:24px;"><h2 style="font-size:12px;text-align:center;letter-spacing:2px;border:none;margin-bottom:12px;">GENEL ŞARTLAR</h2>
          <ol style="font-size:11px;line-height:1.8;padding-left:20px;">
            <li>Kiracı, kiraladığı gayrimenkulü kendi malı gibi kullanacak ve bozulmamasına, evsaf ve şöhret itibarını kaybetmesine sebep olmayacaktır.</li>
            <li>Kiracı, kiralananı başkasına devredemez, kullandıramaz, ortak alamaz, başka amaçla kullanamaz. Aksi durum tahliye sebebi olup, zarar vukuunda meydana gelen zarar ve ziyanı, protesto çekmeye ve hüküm altına almaya gerek kalmaksızın kiracı tazmine mecburdur.</li>
            <li>Kiralanan şeyin tamiri lazım gelirse kiracı hemen mal sahibine haber vermeye mecburdur. Kiracının zamanında haber vermemesinden ötürü bir zarar meydana gelmesi durumunda kiracı bu zarardan mesul olacaktır. Kiracı, zaruri tamiratın icrasına müsaade etmeye mecburdur. Kiralanan şeyin alelade kullanılması için menteşelemek, cam taktırmak, reze koymak, kilit ve sürgü yerleştirmek, badana gibi ufak tefek ve kullanımdan kaynaklı onarımlar mal sahibine haber vermeden kiracı tarafından yaptırılır ve bu türden onarımlara ilişkin masraflar kiracıya aittir. Sahipliğin gerektirdiği vergi vb. masraflar mal sahibine aittir.</li>
            <li>Kiralananın içi ve dışına yapılan dekorlar ve eklentiler aksi kararlaştırılmadıkça tahliye anında sökülerek eski haline getirilir. Ancak sökülmemesine karar verilmişse bedeli mülk sahibinden istenemez.</li>
            <li>Kiracı, kiraladığı gayrimenkulü nasıl teslim aldıysa yine o şekilde hasarsız ve borçsuz teslim etmeye mecburdur. Kiracı kiralanan gayrimenkul içinde bulunan demirbaş eşya ve aletleri kontrat müddetinin bitiminde tamamen iadeyle mükelleftir. Gerek bu demirbaşlar ve gerek kiralanan şeyin teferruatı zayi edilir veya kötü ve mutadın dışında kullanımdan dolayı eskirse kiracı bunları kıymetleri ile tazmine ve mal sahibi talep eylediği halde ödemeye mecburdur.</li>
            <li>Kiracı, mukavele müddetinin son 2 (iki) ayı içinde veya kira müddetinin bitiminden önce kiralananı boşaltacağını kiralayana bildirmişse bu ihbar süresi içerisinde kiralanan şeyi görmek için gelen taliplilerin gezip görmesine ve vasıflarının tetkik edilmesine karşı koymaz.</li>
            <li>Kiracı, kira müddeti bittiği halde kiralananı boşaltmadığı takdirde, mal sahibinin bundan doğacak zarar ve ziyanını kiracı tazmin edecektir.</li>
            <li>Kiracı, mal sahibinin rızasını almadan masrafı kâmilen kendisine ait olmak üzere şehir suyu ve elektrik alabilecek ve meskende umumi anten tesisatı yoksa hususi televizyon anteni yaptırabilecektir. Bu teçhizatın sarfiyat bedelleri, radyo televizyon abonesi gibi hizmet mukabili alınan resimler, demirbaş telefon varsa bunun abone ücreti kiracıya ait olacaktır.</li>
            <li>Kiracının teslim aldığı gayrimenkulü sağlam, kullanıma uygun şekilde alması asıldır.</li>
            <li>Peyzajlı, çimlendirilmiş bir bahçesi varsa, kiracı bakımını üstlenir veya aidatına katılır.</li>
            <li>Kiralanan yere yapılan ihtar ve tebliğler kiracı tarafından tebellüğ edilmiş sayılır.</li>
            <li>Bu sözleşmede yazılı bulunmayan hükümlere ihtiyaç duyulduğunda 6570 sayılı Kira Kanunu, Medeni Kanun, Borçlar Kanunu, 634 sayılı Kat Mülkiyeti Kanunu ve yürürlükteki alakalı diğer kanun, yönetmelik, tüzük, tebliğ ve Yargıtay kararları uygulanır.</li>
          </ol></div>
        <div style="display:flex;justify-content:space-around;margin:28px 0 20px;font-size:11px;font-weight:bold;text-align:center;">
          <div>KİRACI<br><br><br>${clientName(secondClient)}</div>
          <div>KİRAYA VEREN<br><br><br>${clientName(mainClient)}</div>
        </div>
        
          <div style="margin-top:20px;"><h2 style="font-size:12px;text-align:center;letter-spacing:2px;border:none;margin-bottom:12px;">HUSUSİ ŞARTLAR</h2>
          <ol style="font-size:11px;line-height:1.8;padding-left:20px;">
            <li>Kiracı, kat mülkiyeti kanunu ve site yönetim planına aynen uymayı kabul ve taahhüt eder.</li>
            <li>Kiracı, kiralarını kısmen veya devren başkasına devir ve ciro edemez.</li>
            <li>Kiracı, kiralananı ${templateData.kullanim_amaci || 'mesken ve ikametgâh'} adresi olarak kullanacaktır.</li>
            <li>Kiracı, kiralananda mal sahibinin haberi, izin ve rızası olmadan genel şartlarda sayılan küçük onarımlar dışında tadilat yapamaz.</li>
            <li>Kiracı, kira bedelini en geç ait olduğu ayın ${templateData.odeme_gunu || '5'}. gününde ve her ay peşin ödemeyi taahhüt eder.</li>
            <li>Kiracı, kontrat bitiminde kira rayiç bedelinin yıllık ${templateData.artis_orani || 'TÜFE'} artışının ortalaması alınarak eklenmek suretiyle artışını şimdiden kabul ve taahhüt eder. Kiralanan yerin su, elektrik, doğalgaz, ısınma masrafları, telefon, internet, güvenlik, kapıcı, site aidatları, bakım aidatları ile diğer mevzuattan gelecek yönetim giderleri kiracıya aittir.</li>
            <li>Kiracı, mal sahibine verdiği peşinattan faiz isteyemez.</li>
            <li>Kiracının daireyi boşaltması sırasında herhangi bir zarar ve ziyan doğması durumunda, mal sahibi bu zarar ve ziyanı kiracıdan talep eder.</li>
            <li>Mal sahibi kontrat tarihinden sonra ve kontrat tarihi süresine tekabül eden elektrik, su varsa doğalgaz, telefon, internet, aidat, bahçe bakımı vs. gibi ücretlerden sorumluluk kabul etmez.</li>
            <li>Kontrat öncesi elektrik, su, telefon doğalgaz, aidat, bahçe bakımı vs. borcu varsa mal sahibine aittir.</li>
            <li>Kiralama dönemi boyunca iki kira bedeli zamanında ödenmediği takdirde herhangi bir ihtar ve ihbara gerek kalmaksızın diğer aylara ait kira bedelleri de muaccel hale gelecek olup, muacceliyetin gerçekleşmesi halinde kiralayan tarafından talep edilmesi durumunda kiracı, tüm kira bedellerini ödemekle yükümlüdür. Bu durumun gerçekleşmesi aynı zamanda tahliye sebebidir.</li>
            <li>Kira bedellerinin her ay için belirlenen günde ödenmemesi halinde kiracı, gecikilen her ay için kira bedelinin %5'i oranında gecikme cezası ödemeyi taahhüt eder.</li>
            <li>Kiracı, kontrat bitiminden önce kiralananı boşaltmaya karar verirse, 2 (iki) ay önceden haber vermelidir. Aksi takdirde 2 (iki) aylık kira bedelini ödemek zorundadır.</li>
            <li>İşbu sözleşmeye konu mesken boş olarak teslim edilmiştir.</li>
            <li>Kiracı, her yıl, varsa doğalgaz kombisinin ve klimanın bakımını yaptırmakla yükümlüdür.</li>
            <li>İş bu kira sözleşmesinden doğacak ihtilaflarda Bursa Mahkemeleri ve Bursa İcra Daireleri yetkilidir.</li>
            <li>Aşağıda imzaları bulunan, kiraya veren mal sahibi, kiracı ve kefili iş bu sözleşmeyi hiçbir baskı altında kalmadan kendi özgür iradeleriyle okuyup imza ve kabul etmişlerdir. 3 (üç) sayfadan ibaret, 12 (oniki) genel ve 17 (onyedi) hususi maddeden müteşekkil bu kira sözleşmesi iki tarafın rızasıyla düzenlenmiş ve imzalanmış, 1 (bir) sureti kiracıya, 1 (bir) sureti kiralayana bırakılarak imzalandığı tarihte yürürlüğe girmiştir.</li>
          </ol></div>
        
          <div style="margin-top:32px;page-break-before:auto;">
            <h2 style="font-size:14px;text-align:center;letter-spacing:3px;border:none;margin-bottom:20px;">TAHLİYE TAAHHÜTNAMESİ</h2>
            <table style="width:100%;font-size:11px;border-collapse:collapse;margin-bottom:16px;">
              <tr><td style="font-weight:bold;width:220px;padding:4px 0;">TAAHHÜT EDEN (KİRACI)</td><td>${clientName(secondClient)}${templateData.second_tc_no ? ' — TC: ' + templateData.second_tc_no : ''}</td></tr>
              <tr><td style="font-weight:bold;padding:4px 0;">MAL SAHİBİ (KİRALAYAN)</td><td>${clientName(mainClient)}${templateData.main_tc_no ? ' — TC: ' + templateData.main_tc_no : ''}</td></tr>
              <tr><td style="font-weight:bold;padding:4px 0;">TAHLİYE EDİLECEK ADRES</td><td>${templateData.kontrat_adres || templateData.kiralanan_adres || '_______________'}</td></tr>
              <tr><td style="font-weight:bold;padding:4px 0;">TAHLİYE TARİHİ</td><td>${templateData.tahliye_tarihi ? fmtDate(templateData.tahliye_tarihi as string) : '_______________'}</td></tr>
            </table>
            <p style="font-size:11px;line-height:1.9;text-align:justify;margin-bottom:16px;">
              Halen kiracı olarak kullanmakta olduğum, yukarıda yazılı adresteki taşınmazı hiçbir ihtar ve ihbara gerek kalmadan kayıtsız ve şartsız olarak 6570 sayılı gayrimenkul kiraları hakkındaki kanunun 7. Maddesi A bendi gereğince yukarıda belirtilen tarihte tahliye edeceğimi sağlam olarak ve kiracısı olduğum bu mecuru kira sözleşmesinde belirtilen koşullarda kullanırken kira kontratında belirtilen 1 (bir) dönem ödenmemesi halinde tahliye taahhütnamesi devreye girer. Adı geçen mal sahibinin icrai takibata geçerek yapacağı bilumum masrafları ve tahliye geciktirmemden dolayı uğrayacağı zarar ve ziyanları hiçbir ihtar ve hükme gerek kalmadan derhal ve peşinen ödeyeceğimi beyan kabul ve taahhüt ederim.
            </p>
            <div style="display:flex;justify-content:space-between;margin-top:32px;">
              <div style="text-align:center;">
                <div style="font-size:11px;font-weight:bold;margin-bottom:40px;">TAAHHÜT TARİHİ</div>
                <div style="border-top:1px solid #333;padding-top:6px;font-size:11px;">${templateData.taahhut_tarihi ? fmtDate(templateData.taahhut_tarihi as string) : today}</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:11px;font-weight:bold;margin-bottom:40px;">TAAHHÜT EDEN (KİRACI)</div>
                <div style="border-top:1px solid #333;padding-top:6px;font-size:11px;">${clientName(secondClient)}</div>
              </div>
            </div>
          </div>
        ${templateData.ozel_sartlar ? `<div style="margin-top:16px;font-size:11px;"><strong>ÖZEL ŞARTLAR:</strong> ${templateData.ozel_sartlar}</div>` : ''}
      `,
      sigs: `
        <div class="sig"><div class="sig-line">KİRAYA VEREN<br><strong>${clientName(mainClient)}</strong></div></div>
        <div class="sig"><div class="sig-line">KİRACI<br><strong>${clientName(secondClient)}</strong></div></div>
        <div class="sig"><div class="sig-line">Danışman<br><strong>${consultant?.full_name || '_______________'}</strong><br>Ambiance Gayrimenkul</div></div>
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
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
    <button class="print-btn" onclick="window.print()">🖨️ Yazdır</button>
    <button class="pdf-btn" onclick="document.title='Belge Ön İzleme';window.print()">⬇️ PDF İndir</button>
  </div>
  ${docType !== 'authorization' ? `  <div class="letterhead">
    ${CB_LOGO_SVG}
        <div class="letterhead-text">
      <strong>Ambiance Gayrimenkul Yatırım Ortaklığı İnşaat San. Tic. Ltd. Şti.</strong><br>
      ${officeAddress ? officeAddress.replace(/\n/g, '<br>') : ''}<br>
      <span style="font-size:10px;color:#666;">Mersis No: 0068090568900012</span>
    </div>
  </div>` : ''}
  <h1>${cfg.title}</h1>
  ${docType === 'sales_contract' ? `<div class="sub" style="font-size:13px;font-weight:bold;letter-spacing:1px;color:#333;">PROTOKOL YAZISI</div>` : ''}
  <div class="sub">${today}</div>
  <hr class="divider">
  ${cfg.body}
  <div class="sigs">${cfg.sigs}</div>
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
  const [komisyonOrani, setKomisyonOrani] = useState('2')
  const [komisyonTuru, setKomisyonTuru] = useState('Satıcıdan')
  const [baslangicTarihi, setBaslangicTarihi] = useState(new Date().toISOString().slice(0, 10))
  const [yetkiSuresiGun, setYetkiSuresiGun] = useState('90')
  const [satisTutari, setSatisTutari] = useState('')
  const [odemeSekli, setOdemeSekli] = useState('Nakit')
  const [yAda, setYAda] = useState('')
  const [yParsel, setYParsel] = useState('')
  const [yPafta, setYPafta] = useState('')
  const [yIl, setYIl] = useState('')
  const [yIlce, setYIlce] = useState('')
  const [yMahalle, setYMahalle] = useState('')

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
  const cezaUserEdited = useRef(false)
  // Ada/Parsel/Pafta ayrı alanlar
  const [ada, setAda] = useState('')
  const [parsel, setParsel] = useState('')
  const [pafta, setPafta] = useState('')

  const [ozelSartlar, setOzelSartlar] = useState('')
  const [ekMadde, setEkMadde] = useState('')
  const [mulkTipi, setMulkTipi] = useState('')
  const [kiraBedeli, setKiraBedeli] = useState('')
  // Sales contract extra
  const [pesinOdenen, setPesinOdenen] = useState('')
  const [hizmetTapuda, setHizmetTapuda] = useState('')
  // Rental contract extra
  const [bankaAdi, setBankaAdi] = useState('')
  const [hesapAdi, setHesapAdi] = useState('')
  const [ibanNo, setIbanNo] = useState('')
  const [artisOrani, setArtisOrani] = useState('YILLIK TÜFE ORANINA GÖRE')
  const [kullanimAmaci, setKullanimAmaci] = useState('KONUT')
  const [demirbasListesi, setDemirbasListesi] = useState('')
  const [tahliyeTarihi, setTahliyeTarihi] = useState('')
  const [taahhutTarihi, setTaahhutTarihi] = useState('')
  const [kontratAdres, setKontratAdres] = useState('')
  const [kiralananAdres, setKiralananAdres] = useState('')
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

  // Ceza miktarı: satış bedelinin %10'u (kullanıcı manuel değiştirmediyse)
  useEffect(() => {
    if (cezaUserEdited.current) return
    const satis = parseFloat(satisBedeli) || 0
    if (satis > 0) {
      setCezaMiktari(String(Math.round(satis * 0.10)))
    } else {
      setCezaMiktari('')
    }
  }, [satisBedeli])

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
    if (docType === 'authorization') return { ...base, yetki_turu: yetkiTuru, komisyon_orani: komisyonOrani, komisyon_turu: komisyonTuru, ek_madde: ekMadde, mulk_tipi: mulkTipi, kira_bedeli: kiraBedeli, baslangic_tarihi: baslangicTarihi, yetki_suresi_gun: yetkiSuresiGun, satis_tutari: satisTutari, odeme_sekli: odemeSekli, ada: yAda, parsel: yParsel, pafta: yPafta, il: yIl, ilce: yIlce, mahalle: yMahalle }
    if (docType === 'sales_contract') return { ...base, satis_bedeli: satisBedeli, kapora, kapora_tarihi: kaporaTarihi, teslim_tarihi: teslimTarihi, tapuda_odenecek: tapudaOdenecek, pesin_odenen: pesinOdenen, hizmet_tapuda: hizmetTapuda, komisyon_alici: komisyonAlici, komisyon_satici: komisyonSatici, hizmet_bedeli_alici: hizmetBedeliAlici, hizmet_bedeli_satici: hizmetBedeliSatici, hizmet_bedeli: hizmetBedeli, ceza_miktari: cezaMiktari, ada: ada, parsel: parsel, pafta: pafta }
    if (docType === 'rental_contract') return { ...base, aylik_kira: aylikKira, depozito, kira_baslangic: kiraBaslangic, kira_suresi_ay: kiraSuresiAy, odeme_gunu: odemeGunu, banka_adi: bankaAdi, hesap_adi: hesapAdi, iban: ibanNo, artis_orani: artisOrani, kullanim_amaci: kullanimAmaci, demirbas_listesi: demirbasListesi, tahliye_tarihi: tahliyeTarihi, taahhut_tarihi: taahhutTarihi, kontrat_adres: kontratAdres, kiralanan_adres: kiralananAdres }
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
        second_client_phone: secondClient?.phone || null,
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
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank', 'width=900,height=750,scrollbars=yes')
    if (w) { w.focus() }
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
              <div>
                <label className={lbl}>Yetki Türü</label>
                <select value={yetkiTuru} onChange={e => setYetkiTuru(e.target.value)} className={inp}>
                  <option>Satış</option>
                  <option>Kiralama</option>
                  <option>Satış ve Kiralama</option>
                </select>
              </div>
              {/* Mülk Tipi Seçimi */}
              <div>
                <label className={lbl}>Mülk Tipi</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {[
                    { val: 'apartment', label: 'Apt. Dairesi' },
                    { val: 'detached_house', label: 'Ev' },
                    { val: 'villa', label: 'Villa' },
                    { val: 'commercial', label: 'İşyeri' },
                    { val: 'office', label: 'Ofis' },
                    { val: 'shop', label: 'Dükkan' },
                    { val: 'land', label: 'Arsa' },
                    { val: 'field', label: 'Tarla' },
                    { val: 'other', label: 'Diğer' },
                  ].map(o => (
                    <button
                      key={o.val}
                      type="button"
                      onClick={() => setMulkTipi(mulkTipi === o.val ? '' : o.val)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        (mulkTipi || property?.property_type) === o.val
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-slate-300 text-slate-600 hover:border-blue-300'
                      }`}
                    >{o.label}</button>
                  ))}
                </div>
              </div>
              {yetkiTuru !== 'Kiralama' && (
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
              )}
              {yetkiTuru !== 'Kiralama' && (
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
              )}
              {yetkiTuru === 'Kiralama' && (
                <div className={row2}>
                  <div>
                    <label className={lbl}>Kira Bedeli (₺) <span className="text-slate-400">+ KDV otomatik eklenir</span></label>
                    <MoneyInput value={kiraBedeli} onChange={setKiraBedeli} className={inp} placeholder="0" />
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
              )}
              <div>
                <label className={lbl}>Tapu Kayıt Bilgileri</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">İl</label>
                    <input type="text" value={yIl} onChange={e => setYIl(e.target.value)} className={inp} placeholder="Bursa" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">İlçe</label>
                    <input type="text" value={yIlce} onChange={e => setYIlce(e.target.value)} className={inp} placeholder="Nilüfer" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Mahalle</label>
                    <input type="text" value={yMahalle} onChange={e => setYMahalle(e.target.value)} className={inp} placeholder="Beşevler" />
                  </div>
                </div>
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
              <div className={row2}>
                <div>
                  <label className={lbl}>Başlangıç Tarihi</label>
                  <input type="date" value={baslangicTarihi} onChange={e => setBaslangicTarihi(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Yetki Süresi (gün)</label>
                  <input type="number" value={yetkiSuresiGun} onChange={e => setYetkiSuresiGun(e.target.value)} className={inp} min="1" />
                </div>
              </div>
              <div>
                <label className={lbl}>Ek Madde <span className="text-slate-400">(sözleşmeye özel eklenti)</span></label>
                <textarea
                  value={ekMadde}
                  onChange={e => setEkMadde(e.target.value)}
                  className={`${inp} min-h-[80px] resize-y`}
                  placeholder="Eklemek istediğiniz ek madde..."
                />
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

              {/* Peşin Ödenen + Hizmet Tapuda */}
              <div className={row2}>
                <div>
                  <label className={lbl}>Peşin Ödenen (₺) <span className="text-slate-400">satış bedelinden</span></label>
                  <MoneyInput value={pesinOdenen} onChange={setPesinOdenen} className={inp} placeholder="0" />
                </div>
                <div>
                  <label className={lbl}>Kalan Hizmet Bedeli - Tapuda (₺)</label>
                  <MoneyInput value={hizmetTapuda} onChange={setHizmetTapuda} className={inp} placeholder="0" />
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
                    <MoneyInput value={cezaMiktari} onChange={v => { cezaUserEdited.current = true; setCezaMiktari(v) }} className={inp} placeholder="0" />
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
              <div className={row2}>
                <div>
                  <label className={lbl}>Banka Adı</label>
                  <input type="text" value={bankaAdi} onChange={e => setBankaAdi(e.target.value)} className={inp} placeholder="İş Bankası" />
                </div>
                <div>
                  <label className={lbl}>Hesap Sahibi</label>
                  <input type="text" value={hesapAdi} onChange={e => setHesapAdi(e.target.value)} className={inp} placeholder="Ad Soyad" />
                </div>
              </div>
              <div>
                <label className={lbl}>IBAN</label>
                <input type="text" value={ibanNo} onChange={e => setIbanNo(e.target.value)} className={inp} placeholder="TR00 0000 0000 0000 0000 0000 00" />
              </div>
              <div className={row2}>
                <div>
                  <label className={lbl}>Kullanım Amacı</label>
                  <select value={kullanimAmaci} onChange={e => setKullanimAmaci(e.target.value)} className={inp}>
                    <option>KONUT</option><option>İŞYERİ</option><option>DEPO</option><option>DİĞER</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>Yıllık Artış Oranı</label>
                  <input type="text" value={artisOrani} onChange={e => setArtisOrani(e.target.value)} className={inp} />
                </div>
              </div>
              <div>
                <label className={lbl}>Kiralanan Tam Adresi (tapu bilgisi dahil)</label>
                <textarea value={kiralananAdres} onChange={e => setKiralananAdres(e.target.value)} className={`${inp} min-h-[60px] resize-y`} placeholder="Ada/Pafta bilgisi dahil tam adres..." />
              </div>
              <div>
                <label className={lbl}>Kiracının Kontrat Adresi</label>
                <input type="text" value={kontratAdres} onChange={e => setKontratAdres(e.target.value)} className={inp} placeholder="Kiracının ikametgah / kontrat adresi" />
              </div>
              <div>
                <label className={lbl}>Demirbaş Listesi</label>
                <textarea value={demirbasListesi} onChange={e => setDemirbasListesi(e.target.value)} className={`${inp} min-h-[60px] resize-y`} placeholder="Kombi, dolap, klima..." />
              </div>
              <div className={row2}>
                <div>
                  <label className={lbl}>Tahliye Taahhüt Tarihi</label>
                  <input type="date" value={tahliyeTarihi} onChange={e => setTahliyeTarihi(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={lbl}>Taahhütname İmza Tarihi</label>
                  <input type="date" value={taahhutTarihi} onChange={e => setTaahhutTarihi(e.target.value)} className={inp} />
                </div>
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
