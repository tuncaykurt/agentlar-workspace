'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { calcCommission, formatTRY } from '@/lib/commission'
import type {
  SalesClosing, SalesClosingPropertyKind, Property, Office, Brand, Consultant, Client,
} from '@/lib/types'
import {
  ArrowLeft, FileSignature, Save, Send, Loader2, AlertCircle, Printer, Trash2,
} from 'lucide-react'

type ClosingFull = SalesClosing & {
  property?: Property
  office?: Office
  brand?: Brand
  consultant?: Consultant
  co_consultant?: Consultant
  buyer?: Client
  seller?: Client
}

const PROPERTY_KINDS: { v: SalesClosingPropertyKind; l: string }[] = [
  { v: 'ev_villa', l: 'Ev/Villa' },
  { v: 'apt',      l: 'Apt.Dairesi' },
  { v: 'ofis',     l: 'Ofis' },
  { v: 'dukkan',   l: 'Dükkan' },
  { v: 'bina',     l: 'Bina' },
  { v: 'arazi',    l: 'Arazi' },
]

export default function SalesClosingDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/muhasebe'
  const supabase = createClient()

  const [closing, setClosing] = useState<ClosingFull | null>(null)
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ─── Form state ─────────────────────────────────────────────────────────────
  // Aracılık + ilan
  const [agencyContractNo, setAgencyContractNo] = useState('')
  const [agencyContractDate, setAgencyContractDate] = useState('')
  const [systemListingNo, setSystemListingNo] = useState('')
  const [externalListingNo, setExternalListingNo] = useState('')

  // Gayrimenkul
  const [propertyKind, setPropertyKind] = useState<SalesClosingPropertyKind | ''>('')
  const [propertyAddress, setPropertyAddress] = useState('')
  const [propertyDistrict, setPropertyDistrict] = useState('')
  const [propertyCity, setPropertyCity] = useState('')
  const [tapuPafta, setTapuPafta] = useState('')
  const [tapuAda, setTapuAda] = useState('')
  const [tapuParsel, setTapuParsel] = useState('')

  // Satıcı
  const [sellerClientId, setSellerClientId] = useState('')
  const [sellerName, setSellerName] = useState('')
  const [sellerTc, setSellerTc] = useState('')
  const [sellerAddress, setSellerAddress] = useState('')
  const [sellerPhone, setSellerPhone] = useState('')

  // Alıcı
  const [buyerClientId, setBuyerClientId] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [buyerTc, setBuyerTc] = useState('')
  const [buyerAddress, setBuyerAddress] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')

  // Satış işlemine ait bilgiler
  const [transactionDate, setTransactionDate] = useState('')
  const [saleAmount, setSaleAmount] = useState('')
  const [sellerFeeAmount, setSellerFeeAmount] = useState('')
  const [sellerFeeRate, setSellerFeeRate] = useState('')
  const [buyerFeeAmount, setBuyerFeeAmount] = useState('')
  const [buyerFeeRate, setBuyerFeeRate] = useState('')

  // Dağılım
  const [hqRate, setHqRate] = useState('9')
  const [officeRate, setOfficeRate] = useState('50')
  const [consultantRate, setConsultantRate] = useState('50')
  const [coConsultantId, setCoConsultantId] = useState('')
  const [coRate, setCoRate] = useState('0')
  const [notes, setNotes] = useState('')

  useEffect(() => { fetchData() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true)
    const [closeRes, consRes, clientsRes] = await Promise.all([
      supabase
        .from('sales_closings')
        .select(`
          *,
          property:properties(*),
          office:offices(*),
          brand:brands(*),
          consultant:consultants!sales_closings_consultant_id_fkey(id,full_name,email,phone),
          co_consultant:consultants!sales_closings_co_consultant_id_fkey(id,full_name,email),
          buyer:clients!sales_closings_buyer_client_id_fkey(*),
          seller:clients!sales_closings_seller_client_id_fkey(*)
        `)
        .eq('id', id)
        .single(),
      supabase.from('consultants').select('id,full_name,email,role').order('full_name'),
      supabase.from('clients').select('id,full_name,phone,email,tc_no,address').order('full_name').limit(200),
    ])
    if (closeRes.error) {
      setError('Kayıt bulunamadı: ' + closeRes.error.message)
      setLoading(false)
      return
    }
    const c = closeRes.data as ClosingFull
    setClosing(c)

    // Aracılık + ilan
    setAgencyContractNo(c.agency_contract_no || '')
    setAgencyContractDate(c.agency_contract_date || '')
    setSystemListingNo(c.system_listing_no || c.property?.source_listing_id || '')
    setExternalListingNo(c.external_listing_no || (c.property?.source === 'sahibinden' ? c.property?.source_listing_id || '' : ''))

    // Gayrimenkul (mülk varsa snapshot doldur)
    setPropertyKind(c.property_kind || mapPropertyKind(c.property?.property_type))
    setPropertyAddress(c.property_address || c.property?.address || '')
    setPropertyDistrict(c.property_district || c.property?.district || '')
    setPropertyCity(c.property_city || c.property?.city || '')
    setTapuPafta(c.tapu_pafta || '')
    setTapuAda(c.tapu_ada || '')
    setTapuParsel(c.tapu_parsel || '')

    // Satıcı (önce kaydedilmiş snapshot, yoksa property.seller_client'ten doldur)
    setSellerClientId(c.seller_client_id || c.property?.seller_client_id || '')
    setSellerName(c.seller_name || c.seller?.full_name || '')
    setSellerTc(c.seller_tc || c.seller?.tc_no || '')
    setSellerAddress(c.seller_address || c.seller?.address || '')
    setSellerPhone(c.seller_phone || c.seller?.phone || '')

    // Alıcı (mevcut client_id eski kayıtlar için)
    setBuyerClientId(c.buyer_client_id || c.client_id || '')
    setBuyerName(c.buyer_name || c.buyer?.full_name || '')
    setBuyerTc(c.buyer_tc || c.buyer?.tc_no || '')
    setBuyerAddress(c.buyer_address || c.buyer?.address || '')
    setBuyerPhone(c.buyer_phone || c.buyer?.phone || '')

    // Satış işlemi
    setTransactionDate(c.transaction_date || '')
    setSaleAmount(String(c.sale_amount || c.property?.price || ''))
    setSellerFeeAmount(String(c.seller_fee_amount || ''))
    setSellerFeeRate(String(c.seller_fee_rate || ''))
    setBuyerFeeAmount(String(c.buyer_fee_amount || ''))
    setBuyerFeeRate(String(c.buyer_fee_rate || ''))

    // Dağılım
    setHqRate(String(c.hq_share_rate ?? c.brand?.hq_share_rate ?? 9))
    setOfficeRate(String(c.office_share_rate ?? c.office?.default_office_share_rate ?? 50))
    setConsultantRate(String(c.consultant_share_rate ?? c.office?.default_consultant_share_rate ?? 50))
    setCoConsultantId(c.co_consultant_id || '')
    setCoRate(String(c.co_consultant_share_rate || 0))
    setNotes(c.notes || '')

    if (consRes.data) setConsultants(consRes.data as Consultant[])
    if (clientsRes.data) setClients(clientsRes.data as Client[])
    setLoading(false)
  }

  // Müşteri seçildiğinde snapshot'ı otomatik doldur
  function applyClientToSeller(cid: string) {
    setSellerClientId(cid)
    if (!cid) return
    const c = clients.find(x => x.id === cid)
    if (c) {
      setSellerName(c.full_name || '')
      setSellerTc(c.tc_no || '')
      setSellerAddress(c.address || '')
      setSellerPhone(c.phone || '')
    }
  }
  function applyClientToBuyer(cid: string) {
    setBuyerClientId(cid)
    if (!cid) return
    const c = clients.find(x => x.id === cid)
    if (c) {
      setBuyerName(c.full_name || '')
      setBuyerTc(c.tc_no || '')
      setBuyerAddress(c.address || '')
      setBuyerPhone(c.phone || '')
    }
  }

  // Toplam hizmet bedeli = satıcı + alıcı
  const totalFee = (Number(sellerFeeAmount) || 0) + (Number(buyerFeeAmount) || 0)

  const calc = totalFee > 0
    ? calcCommission({
        service_fee: totalFee,
        hq_share_rate: Number(hqRate),
        office_share_rate: Number(officeRate),
        consultant_share_rate: Number(consultantRate),
        co_consultant_share_rate: coConsultantId ? Number(coRate) : 0,
      })
    : null

  // Otomatik oran hesaplama (hizmet bedeli / satış tutarı)
  function autoCalcSellerRate() {
    const sa = Number(saleAmount), sf = Number(sellerFeeAmount)
    if (sa > 0 && sf > 0) setSellerFeeRate(((sf / sa) * 100).toFixed(2))
  }
  function autoCalcBuyerRate() {
    const sa = Number(saleAmount), bf = Number(buyerFeeAmount)
    if (sa > 0 && bf > 0) setBuyerFeeRate(((bf / sa) * 100).toFixed(2))
  }

  async function handleSave(sendForSignature: boolean) {
    if (!closing) return
    if (totalFee <= 0) {
      setError('Hizmet bedeli (satıcı/alıcı) girilmeli.')
      return
    }
    setSaving(true)
    setError('')

    const newStatus = sendForSignature ? 'sent' : 'filled'

    const payload = {
      // Aracılık & ilan
      agency_contract_no: agencyContractNo.trim() || null,
      agency_contract_date: agencyContractDate || null,
      system_listing_no: systemListingNo.trim() || null,
      external_listing_no: externalListingNo.trim() || null,

      // Gayrimenkul
      property_kind: propertyKind || null,
      property_address: propertyAddress.trim() || null,
      property_district: propertyDistrict.trim() || null,
      property_city: propertyCity.trim() || null,
      tapu_pafta: tapuPafta.trim() || null,
      tapu_ada: tapuAda.trim() || null,
      tapu_parsel: tapuParsel.trim() || null,

      // Satıcı
      seller_client_id: sellerClientId || null,
      seller_name: sellerName.trim() || null,
      seller_tc: sellerTc.trim() || null,
      seller_address: sellerAddress.trim() || null,
      seller_phone: sellerPhone.trim() || null,

      // Alıcı
      buyer_client_id: buyerClientId || null,
      buyer_name: buyerName.trim() || null,
      buyer_tc: buyerTc.trim() || null,
      buyer_address: buyerAddress.trim() || null,
      buyer_phone: buyerPhone.trim() || null,
      client_id: buyerClientId || null, // backward-compat

      // İşlem bilgileri
      transaction_date: transactionDate || null,
      sale_amount: Number(saleAmount) || null,
      seller_fee_amount: Number(sellerFeeAmount) || null,
      seller_fee_rate: Number(sellerFeeRate) || null,
      buyer_fee_amount: Number(buyerFeeAmount) || null,
      buyer_fee_rate: Number(buyerFeeRate) || null,
      service_fee: totalFee,
      consultant_name_snapshot: closing.consultant?.full_name || null,

      // Dağılım
      hq_share_rate: Number(hqRate),
      hq_share_amount: calc?.hq_share_amount,
      office_share_rate: Number(officeRate),
      office_share_amount: calc?.office_share_amount,
      consultant_share_rate: Number(consultantRate),
      consultant_share_amount: calc?.consultant_share_amount,
      co_consultant_id: coConsultantId || null,
      co_consultant_share_rate: coConsultantId ? Number(coRate) : null,
      co_consultant_share_amount: coConsultantId && calc ? calc.co_consultant_share_amount : null,

      notes: notes.trim() || null,
      status: newStatus,
      filled_at: new Date().toISOString(),
    }

    const { error: clErr } = await supabase
      .from('sales_closings')
      .update(payload)
      .eq('id', closing.id)

    if (clErr) { setError('Kaydedilemedi: ' + clErr.message); setSaving(false); return }

    // commissions kaydı (varsa update, yoksa insert)
    const commissionPayload = {
      property_id: closing.property_id,
      consultant_id: closing.consultant_id,
      co_consultant_id: coConsultantId || null,
      office_id: closing.office_id,
      brand_id: closing.brand_id,
      sale_price: Number(saleAmount) || totalFee,
      total_commission_rate: 100,
      total_commission_amount: totalFee,
      hq_share_rate: Number(hqRate),
      hq_share_amount: calc?.hq_share_amount,
      office_share_rate: Number(officeRate),
      office_share_amount: calc?.office_share_amount,
      consultant_share_rate: Number(consultantRate),
      consultant_share_amount: calc ? calc.consultant_share_amount - (coConsultantId ? calc.co_consultant_share_amount : 0) : 0,
      co_consultant_share_rate: coConsultantId ? Number(coRate) : null,
      co_consultant_share_amount: coConsultantId && calc ? calc.co_consultant_share_amount : null,
      status: 'pending' as const,
      notes: `Satış Kapatma #${closing.id.slice(0, 8)}`,
    }

    if (closing.commission_id) {
      await supabase.from('commissions').update(commissionPayload).eq('id', closing.commission_id)
    } else {
      const { data: comIns } = await supabase.from('commissions').insert(commissionPayload).select('id').single()
      if (comIns) {
        await supabase.from('sales_closings').update({ commission_id: comIns.id }).eq('id', closing.id)
      }
    }

    if (sendForSignature) {
      const { data: docIns } = await supabase
        .from('documents')
        .insert({
          doc_type: 'sales_closing',
          title: `Satış Sonrası Portföy Kapama — ${closing.property?.title || propertyAddress || 'Mülk'}`,
          property_id: closing.property_id,
          client_id: buyerClientId || null,
          consultant_id: closing.consultant_id,
          office_id: closing.office_id,
          template_name: 'sales_closing_v1',
          template_data: payload,
          signature_status: 'draft',
        })
        .select('id')
        .single()
      if (docIns) {
        await supabase.from('sales_closings').update({ document_id: docIns.id }).eq('id', closing.id)
      }
    }

    setSaving(false)
    router.push(returnTo)
  }

  async function handleDelete() {
    if (!closing) return
    setDeleting(true)
    const supabase = createClient()
    if (closing.commission_id) {
      await supabase.from('commissions').delete().eq('id', closing.commission_id)
    }
    if ((closing as any).document_id) {
      await supabase.from('documents').delete().eq('id', (closing as any).document_id)
    }
    await supabase.from('sales_closings').delete().eq('id', closing.id)
    setDeleting(false)
    router.push(returnTo)
  }

  if (loading) {
    return <div className="p-6 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
  }
  if (!closing) {
    return (
      <div className="p-6">
        <p className="text-red-600">{error || 'Kayıt bulunamadı'}</p>
        <Link href={returnTo} className="text-primary text-sm mt-2 inline-block">← Muhasebe&apos;ye dön</Link>
      </div>
    )
  }

  const readOnly = closing.status === 'signed' || closing.status === 'cancelled'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6 print:hidden">
        <Link href={returnTo} className="text-on-surface-variant hover:text-on-surface">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-on-surface">Satış Sonrası Portföy Kapama Formu</h1>
            <StatusBadge status={closing.status} />
          </div>
          <p className="text-on-surface-variant text-sm">
            {closing.brand?.name && <span>{closing.brand.name} · </span>}
            {closing.office?.name || '—'} · Danışman: {closing.consultant?.full_name || '—'}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="btn-secondary flex items-center gap-2"
          type="button"
        >
          <Printer size={15} /> Yazdır
        </button>
        {!readOnly && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors print:hidden"
            type="button"
          >
            <Trash2 size={15} /> Sil
          </button>
        )}
      </div>

      {confirmDelete && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between print:hidden">
          <p className="text-sm text-red-700 font-medium">Bu kapatma kaydını silmek istediğinizden emin misiniz?</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="btn-secondary text-sm" disabled={deleting}>İptal</button>
            <button onClick={handleDelete} disabled={deleting}
              className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-700 flex items-center gap-1 disabled:opacity-50">
              {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Evet, Sil
            </button>
          </div>
        </div>
      )}

      {/* ─── Form: gerçek kapama formuna birebir uygun düzen ─────────────────── */}
      <div className="card space-y-6">
        {/* 1) Aracılık ve İlan */}
        <Section title="Aracılık ve İlan Bilgileri">
          <Grid cols={2}>
            <Field label="Aracılık Sözleşme No.">
              <input className="input" value={agencyContractNo} onChange={e => setAgencyContractNo(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label="Aracılık Sözleşme Tarihi">
              <input type="date" className="input" value={agencyContractDate} onChange={e => setAgencyContractDate(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label={`${closing.brand?.name || 'Sistem'} İlan No.`}>
              <input className="input" value={systemListingNo} onChange={e => setSystemListingNo(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label="Sahibinden İlan No.">
              <input className="input" value={externalListingNo} onChange={e => setExternalListingNo(e.target.value)} disabled={readOnly} />
            </Field>
          </Grid>
        </Section>

        {/* 2) Gayrimenkule Ait Bilgiler */}
        <Section title="Gayrimenkule Ait Bilgiler">
          <div className="flex flex-wrap gap-2 mb-3">
            {PROPERTY_KINDS.map(k => (
              <button
                key={k.v}
                type="button"
                disabled={readOnly}
                onClick={() => setPropertyKind(k.v)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  propertyKind === k.v
                    ? 'bg-primary text-on-primary border-primary'
                    : 'border-outline text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {k.l}
              </button>
            ))}
          </div>
          <Field label="Adresi">
            <input className="input" value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} disabled={readOnly} />
          </Field>
          <Grid cols={2}>
            <Field label="İlçesi"><input className="input" value={propertyDistrict} onChange={e => setPropertyDistrict(e.target.value)} disabled={readOnly} /></Field>
            <Field label="İli"><input className="input" value={propertyCity} onChange={e => setPropertyCity(e.target.value)} disabled={readOnly} /></Field>
          </Grid>
          <Grid cols={3}>
            <Field label="Tapu — Pafta"><input className="input" value={tapuPafta} onChange={e => setTapuPafta(e.target.value)} disabled={readOnly} /></Field>
            <Field label="Tapu — Ada"><input className="input" value={tapuAda} onChange={e => setTapuAda(e.target.value)} disabled={readOnly} /></Field>
            <Field label="Tapu — Parsel"><input className="input" value={tapuParsel} onChange={e => setTapuParsel(e.target.value)} disabled={readOnly} /></Field>
          </Grid>
        </Section>

        {/* 3) Satıcı Bilgileri */}
        <Section title="Satıcı Bilgileri">
          <Field label="CRM müşterisinden seç (opsiyonel)">
            <select className="input" value={sellerClientId} onChange={e => applyClientToSeller(e.target.value)} disabled={readOnly}>
              <option value="">— manuel doldur —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
          </Field>
          <Grid cols={2}>
            <Field label="Adı Soyadı" required><input className="input" value={sellerName} onChange={e => setSellerName(e.target.value)} disabled={readOnly} /></Field>
            <Field label="T.C."><input className="input" value={sellerTc} onChange={e => setSellerTc(e.target.value)} disabled={readOnly} maxLength={11} /></Field>
            <Field label="Adres"><input className="input" value={sellerAddress} onChange={e => setSellerAddress(e.target.value)} disabled={readOnly} /></Field>
            <Field label="Telefon"><input className="input" value={sellerPhone} onChange={e => setSellerPhone(e.target.value)} disabled={readOnly} /></Field>
          </Grid>
        </Section>

        {/* 4) Alıcı Bilgileri */}
        <Section title="Alıcı Bilgileri">
          <Field label="CRM müşterisinden seç (opsiyonel)">
            <select className="input" value={buyerClientId} onChange={e => applyClientToBuyer(e.target.value)} disabled={readOnly}>
              <option value="">— manuel doldur —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
          </Field>
          <Grid cols={2}>
            <Field label="Adı Soyadı" required><input className="input" value={buyerName} onChange={e => setBuyerName(e.target.value)} disabled={readOnly} /></Field>
            <Field label="T.C."><input className="input" value={buyerTc} onChange={e => setBuyerTc(e.target.value)} disabled={readOnly} maxLength={11} /></Field>
            <Field label="Adres"><input className="input" value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} disabled={readOnly} /></Field>
            <Field label="Telefon"><input className="input" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} disabled={readOnly} /></Field>
          </Grid>
        </Section>

        {/* 5) Satış İşlemine Ait Bilgiler */}
        <Section title="Satış İşlemine Ait Bilgiler">
          <Grid cols={2}>
            <Field label="İşlem Tarihi"><input type="date" className="input" value={transactionDate} onChange={e => setTransactionDate(e.target.value)} disabled={readOnly} /></Field>
            <Field label="Satış Tutarı (₺)"><input type="number" className="input" value={saleAmount} onChange={e => setSaleAmount(e.target.value)} disabled={readOnly} /></Field>
          </Grid>

          <Grid cols={2}>
            <Field label="Satıcıdan alınan hizmet bedeli (₺)">
              <input type="number" className="input" value={sellerFeeAmount} onChange={e => setSellerFeeAmount(e.target.value)} onBlur={autoCalcSellerRate} disabled={readOnly} />
            </Field>
            <Field label="Satıcıdan alınan hizmet bedeli oranı (%)">
              <input type="number" step="0.1" className="input" value={sellerFeeRate} onChange={e => setSellerFeeRate(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label="Alıcıdan alınan hizmet bedeli (₺)">
              <input type="number" className="input" value={buyerFeeAmount} onChange={e => setBuyerFeeAmount(e.target.value)} onBlur={autoCalcBuyerRate} disabled={readOnly} />
            </Field>
            <Field label="Alıcıdan alınan hizmet bedeli oranı (%)">
              <input type="number" step="0.1" className="input" value={buyerFeeRate} onChange={e => setBuyerFeeRate(e.target.value)} disabled={readOnly} />
            </Field>
          </Grid>

          <div className="bg-surface-container-high rounded-lg p-3 mt-2 text-sm flex items-center justify-between">
            <span className="text-on-surface-variant">Toplam alınan hizmet bedeli</span>
            <span className="font-bold text-on-surface text-base">{formatTRY(totalFee)}</span>
          </div>

          <Field label="Gayrimenkul Danışmanı">
            <input className="input" value={closing.consultant?.full_name || ''} disabled />
          </Field>
        </Section>

        {/* 6) Dağılım (HQ + Ofis + Danışman) */}
        <Section title="Dağılım — HQ / Ofis / Danışman">
          <Grid cols={3}>
            <Field label={`HQ Payı % ${closing.brand?.name ? `(${closing.brand.name})` : ''}`}>
              <input type="number" step="0.5" className="input" value={hqRate} onChange={e => setHqRate(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label="Ofis Payı %">
              <input type="number" step="1" className="input" value={officeRate} onChange={e => setOfficeRate(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label="Danışman Payı %">
              <input type="number" step="1" className="input" value={consultantRate} onChange={e => setConsultantRate(e.target.value)} disabled={readOnly} />
            </Field>
          </Grid>

          <Grid cols={2}>
            <Field label="Co-danışman (opsiyonel)">
              <select className="input" value={coConsultantId} onChange={e => setCoConsultantId(e.target.value)} disabled={readOnly}>
                <option value="">— yok —</option>
                {consultants.filter(c => c.id !== closing.consultant_id).map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </Field>
            {coConsultantId && (
              <Field label="Co-danışman payı % (danışman tutarından)">
                <input type="number" step="5" className="input" value={coRate} onChange={e => setCoRate(e.target.value)} disabled={readOnly} />
              </Field>
            )}
          </Grid>

          {calc && (
            <div className="bg-surface-container-high rounded-xl p-4 space-y-2 border border-outline mt-3">
              <Row label="Toplam Hizmet Bedeli" value={formatTRY(calc.service_fee)} bold />
              <Row label={`HQ Payı (Marka %${hqRate})`} value={`− ${formatTRY(calc.hq_share_amount)}`} />
              <Row label="Net (HQ sonrası)" value={formatTRY(calc.net_after_hq)} muted />
              <div className="h-px bg-surface-container-highest my-1" />
              <Row label={`Ofis Payı (%${officeRate})`} value={formatTRY(calc.office_share_amount)} />
              <Row label={`Danışman Payı (%${consultantRate})`} value={formatTRY(calc.consultant_share_amount)} green />
              {coConsultantId && Number(coRate) > 0 && (
                <>
                  <Row label={`Co-danışman (%${coRate} · ${consultants.find(c => c.id === coConsultantId)?.full_name || ''})`} value={`− ${formatTRY(calc.co_consultant_share_amount)}`} />
                  <Row label="Danışman Net" value={formatTRY(calc.consultant_net_amount)} bold green />
                </>
              )}
              {calc.warnings.length > 0 && (
                <div className="mt-2 pt-2 border-t border-outline space-y-1">
                  {calc.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-orange-700 flex items-start gap-1">
                      <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Notlar */}
        <Field label="Notlar">
          <textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} disabled={readOnly} />
        </Field>

        {/* İmza alanı (yazdırma için görünür) */}
        <div className="grid grid-cols-2 gap-12 pt-8 mt-4 border-t border-outline">
          <div className="text-center">
            <div className="border-b border-on-surface h-16 mb-2" />
            <p className="text-sm text-on-surface-variant">İMZA</p>
          </div>
          <div className="text-center">
            <div className="border-b border-on-surface h-16 mb-2" />
            <p className="text-sm text-on-surface-variant">TARİH</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {!readOnly && (
          <div className="flex gap-3 pt-2 print:hidden">
            <Link href={returnTo} className="btn-secondary flex-1 text-center">İptal</Link>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="btn-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Hesabı Kaydet
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Belge Oluştur ve İmzala
            </button>
          </div>
        )}

        {readOnly && (
          <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2 rounded-lg flex items-center gap-2">
            <FileSignature size={15} />
            Bu kapatma {closing.status === 'signed' ? 'imzalandı' : 'iptal edildi'} — düzenlemeye kapalı.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Helpers / sub-components ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-semibold text-on-surface text-sm uppercase tracking-wide mb-3 pb-1 border-b border-outline">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return <div className={`grid grid-cols-1 md:grid-cols-${cols} gap-3`}>{children}</div>
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-on-surface mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function Row({ label, value, bold, muted, green }: { label: string; value: string; bold?: boolean; muted?: boolean; green?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className={muted ? 'text-on-surface-variant' : 'text-on-surface'}>{label}</span>
      <span className={`${bold ? 'font-bold' : 'font-medium'} ${green ? 'text-green-700' : 'text-on-surface'}`}>{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { c: string; l: string }> = {
    pending:   { c: 'bg-orange-100 text-orange-700',  l: 'Bekliyor' },
    filled:    { c: 'bg-blue-100 text-blue-700',      l: 'Dolduruldu' },
    sent:      { c: 'bg-purple-100 text-purple-700',  l: 'İmzaya Gitti' },
    signed:    { c: 'bg-green-100 text-green-700',    l: 'İmzalandı' },
    cancelled: { c: 'bg-gray-100 text-gray-700',      l: 'İptal' },
  }
  const s = map[status] || map.pending
  return <span className={`text-xs px-2 py-0.5 rounded-full ${s.c}`}>{s.l}</span>
}

function mapPropertyKind(t?: string): SalesClosingPropertyKind | '' {
  switch (t) {
    case 'apartment': return 'apt'
    case 'villa':
    case 'detached_house': return 'ev_villa'
    case 'office':    return 'ofis'
    case 'shop':      return 'dukkan'
    case 'commercial':
    case 'warehouse': return 'bina'
    case 'land':
    case 'field':     return 'arazi'
    default:          return ''
  }
}
