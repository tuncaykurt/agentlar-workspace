'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Office, Brand, OfficeMembership, Consultant } from '@/lib/types'
import {
  Briefcase, Building2, Users, ArrowRightLeft, Plus, Edit2, Save, X,
  TrendingUp, Tag, Loader2, CheckCircle, ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

type MembershipRow = OfficeMembership & {
  consultant?: Pick<Consultant, 'id' | 'full_name' | 'email' | 'phone' | 'role' | 'is_active'>
}

type OfficeWithBrand = Office & { brand?: Brand }

export default function BrokerPanelPage() {
  const supabase = createClient()
  const [offices, setOffices] = useState<OfficeWithBrand[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'consultants' | 'office' | 'brand'>('consultants')

  // Transfer modal state
  const [transferConsultantId, setTransferConsultantId] = useState<string | null>(null)
  const [transferTargetOfficeId, setTransferTargetOfficeId] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [transferring, setTransferring] = useState(false)

  // Office edit
  const [editingOffice, setEditingOffice] = useState(false)
  const [officeForm, setOfficeForm] = useState<Partial<OfficeWithBrand>>({})

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [oRes, bRes] = await Promise.all([
      supabase.from('offices').select('*, brand:brands(*)').order('name'),
      supabase.from('brands').select('*').order('name'),
    ])
    if (oRes.data) {
      setOffices(oRes.data as OfficeWithBrand[])
      if (!selectedOfficeId && oRes.data.length > 0) {
        setSelectedOfficeId(oRes.data[0].id)
      }
    }
    if (bRes.data) setBrands(bRes.data as Brand[])
    setLoading(false)
  }

  useEffect(() => {
    if (!selectedOfficeId) return
    fetchMemberships(selectedOfficeId)
    const off = offices.find(o => o.id === selectedOfficeId)
    if (off) setOfficeForm(off)
  }, [selectedOfficeId, offices])

  async function fetchMemberships(officeId: string) {
    const { data } = await supabase
      .from('office_memberships')
      .select('*, consultant:consultants(id,full_name,email,phone,role,is_active)')
      .eq('office_id', officeId)
      .is('end_date', null)
      .order('start_date', { ascending: false })
    if (data) setMemberships(data as MembershipRow[])
  }

  async function transferConsultant() {
    if (!transferConsultantId || !transferTargetOfficeId) return
    setTransferring(true)

    // 1) Mevcut aktif membership(leri) kapat
    await supabase
      .from('office_memberships')
      .update({
        end_date: new Date().toISOString(),
        end_reason: transferReason || 'Ofis transferi',
      })
      .eq('consultant_id', transferConsultantId)
      .is('end_date', null)

    // 2) Yeni ofiste aktif membership aç
    const { data: cons } = await supabase
      .from('consultants')
      .select('role')
      .eq('id', transferConsultantId)
      .single()

    await supabase
      .from('office_memberships')
      .insert({
        consultant_id: transferConsultantId,
        office_id: transferTargetOfficeId,
        role: cons?.role || 'consultant',
        start_date: new Date().toISOString(),
        notes: transferReason || null,
      })

    setTransferring(false)
    setTransferConsultantId(null)
    setTransferTargetOfficeId('')
    setTransferReason('')
    fetchMemberships(selectedOfficeId)
  }

  async function saveOffice() {
    if (!selectedOfficeId) return
    const { error: err } = await supabase
      .from('offices')
      .update({
        name: officeForm.name,
        address: officeForm.address,
        phone: officeForm.phone,
        email: officeForm.email,
        tax_no: officeForm.tax_no,
        brand_id: officeForm.brand_id || null,
        default_office_share_rate: officeForm.default_office_share_rate,
        default_consultant_share_rate: officeForm.default_consultant_share_rate,
        default_total_commission_rate: officeForm.default_total_commission_rate,
      })
      .eq('id', selectedOfficeId)
    if (!err) {
      setEditingOffice(false)
      fetchData()
    }
  }

  const selectedOffice = offices.find(o => o.id === selectedOfficeId)
  const otherOffices = offices.filter(o => o.id !== selectedOfficeId)

  if (loading) {
    return <div className="p-6 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Briefcase size={22} className="text-primary" />
            Broker Paneli
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Ofis, danışman ve marka yönetimi</p>
        </div>

        {offices.length > 1 && (
          <select
            value={selectedOfficeId}
            onChange={e => setSelectedOfficeId(e.target.value)}
            className="input max-w-xs"
          >
            {offices.map(o => <option key={o.id} value={o.id}>{o.name}{o.brand?.name && ` · ${o.brand.name}`}</option>)}
          </select>
        )}
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Aktif Danışman" value={String(memberships.length)} icon={Users} color="blue" />
        <Stat label="Marka" value={selectedOffice?.brand?.name || '—'} icon={Tag} color="purple" />
        <Stat label="HQ Payı" value={`%${selectedOffice?.brand?.hq_share_rate ?? 0}`} icon={TrendingUp} color="orange" />
        <Stat label="Default Komisyon" value={`%${selectedOffice?.default_total_commission_rate ?? 0}`} icon={Building2} color="green" />
      </div>

      {/* Sekmeler */}
      <div className="card p-0">
        <div className="flex border-b border-outline">
          {([
            { k: 'consultants', l: 'Danışmanlar' },
            { k: 'office',      l: 'Ofis Ayarları' },
            { k: 'brand',       l: 'Marka' },
          ] as const).map(t => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                tab === t.k ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >{t.l}</button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'consultants' && (
            <div className="space-y-2">
              {memberships.length === 0 ? (
                <div className="text-center py-10 text-on-surface-variant text-sm">
                  <Users size={32} className="mx-auto mb-2 opacity-30" />
                  Bu ofiste aktif danışman yok
                </div>
              ) : memberships.map(m => (
                <div key={m.id} className="flex items-center gap-4 p-3 rounded-lg bg-surface-container-high">
                  <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-primary font-semibold text-sm">
                    {(m.consultant?.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-on-surface truncate">{m.consultant?.full_name || '—'}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        m.role === 'broker' ? 'bg-purple-100 text-purple-700' :
                        m.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{roleLabel(m.role)}</span>
                      {!m.consultant?.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Pasif</span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant truncate">
                      {m.consultant?.email} {m.consultant?.phone && `· ${m.consultant.phone}`}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Üyelik: {new Date(m.start_date).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                  {otherOffices.length > 0 && m.consultant?.id && (
                    <button
                      onClick={() => setTransferConsultantId(m.consultant!.id)}
                      className="btn-secondary flex items-center gap-1 text-xs"
                    >
                      <ArrowRightLeft size={13} /> Transfer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'office' && selectedOffice && (
            <div className="space-y-3 max-w-2xl">
              <div className="flex justify-end">
                {!editingOffice ? (
                  <button onClick={() => setEditingOffice(true)} className="btn-secondary flex items-center gap-1 text-xs">
                    <Edit2 size={13} /> Düzenle
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingOffice(false); setOfficeForm(selectedOffice) }} className="btn-secondary flex items-center gap-1 text-xs">
                      <X size={13} /> İptal
                    </button>
                    <button onClick={saveOffice} className="btn-primary flex items-center gap-1 text-xs">
                      <Save size={13} /> Kaydet
                    </button>
                  </div>
                )}
              </div>

              <Field label="Ofis Adı">
                <input className="input" value={officeForm.name || ''} onChange={e => setOfficeForm(f => ({ ...f, name: e.target.value }))} disabled={!editingOffice} />
              </Field>

              <Field label="Marka">
                <select className="input" value={officeForm.brand_id || ''} onChange={e => setOfficeForm(f => ({ ...f, brand_id: e.target.value }))} disabled={!editingOffice}>
                  <option value="">— bağımsız —</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name} (HQ %{b.hq_share_rate})</option>)}
                </select>
              </Field>

              <Field label="Adres">
                <textarea className="input" rows={2} value={officeForm.address || ''} onChange={e => setOfficeForm(f => ({ ...f, address: e.target.value }))} disabled={!editingOffice} />
              </Field>

              <Grid cols={2}>
                <Field label="Telefon">
                  <input className="input" value={officeForm.phone || ''} onChange={e => setOfficeForm(f => ({ ...f, phone: e.target.value }))} disabled={!editingOffice} />
                </Field>
                <Field label="E-posta">
                  <input className="input" value={officeForm.email || ''} onChange={e => setOfficeForm(f => ({ ...f, email: e.target.value }))} disabled={!editingOffice} />
                </Field>
                <Field label="Vergi No">
                  <input className="input" value={officeForm.tax_no || ''} onChange={e => setOfficeForm(f => ({ ...f, tax_no: e.target.value }))} disabled={!editingOffice} />
                </Field>
              </Grid>

              <h4 className="font-semibold text-on-surface text-sm mt-4 pb-1 border-b border-outline">Default Komisyon Oranları</h4>
              <Grid cols={3}>
                <Field label="Müşteriden alınacak %">
                  <input type="number" step="0.5" className="input" value={officeForm.default_total_commission_rate ?? ''} onChange={e => setOfficeForm(f => ({ ...f, default_total_commission_rate: Number(e.target.value) }))} disabled={!editingOffice} />
                </Field>
                <Field label="Ofis payı %">
                  <input type="number" step="1" className="input" value={officeForm.default_office_share_rate ?? ''} onChange={e => setOfficeForm(f => ({ ...f, default_office_share_rate: Number(e.target.value) }))} disabled={!editingOffice} />
                </Field>
                <Field label="Danışman payı %">
                  <input type="number" step="1" className="input" value={officeForm.default_consultant_share_rate ?? ''} onChange={e => setOfficeForm(f => ({ ...f, default_consultant_share_rate: Number(e.target.value) }))} disabled={!editingOffice} />
                </Field>
              </Grid>
            </div>
          )}

          {tab === 'brand' && (
            <div className="max-w-2xl space-y-3">
              {selectedOffice?.brand ? (
                <>
                  <div className="bg-surface-container-high rounded-lg p-4">
                    <h3 className="font-semibold text-on-surface mb-2 flex items-center gap-2">
                      <Tag size={16} className="text-primary" /> {selectedOffice.brand.name}
                    </h3>
                    <div className="space-y-1 text-sm">
                      <p><span className="text-on-surface-variant">HQ Payı:</span> <strong>%{selectedOffice.brand.hq_share_rate}</strong></p>
                      {selectedOffice.brand.hq_contact_name && (
                        <p><span className="text-on-surface-variant">İletişim:</span> {selectedOffice.brand.hq_contact_name}</p>
                      )}
                      {selectedOffice.brand.hq_contact_email && (
                        <p><span className="text-on-surface-variant">E-posta:</span> {selectedOffice.brand.hq_contact_email}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    Marka oranlarının değişmesi için sistem yöneticisine başvurun.
                  </p>
                </>
              ) : (
                <p className="text-on-surface-variant text-sm">Bu ofis bir markaya bağlı değil (bağımsız).</p>
              )}

              <h4 className="font-semibold text-on-surface text-sm pt-4 mt-4 border-t border-outline">Tüm Markalar</h4>
              <div className="grid gap-2">
                {brands.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-container-high">
                    <div>
                      <p className="text-sm font-medium text-on-surface">{b.name}</p>
                      <p className="text-xs text-on-surface-variant">HQ %{b.hq_share_rate}</p>
                    </div>
                    {selectedOffice?.brand_id === b.id && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                        <CheckCircle size={11} /> Aktif
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transfer modal */}
      {transferConsultantId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'var(--backdrop)' }}
          onClick={() => setTransferConsultantId(null)}
        >
          <div
            className="card max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
              <ArrowRightLeft size={16} className="text-primary" />
              Danışmanı Transfer Et
            </h3>
            <p className="text-xs text-on-surface-variant mb-4">
              Mevcut ofisteki üyelik kapatılır, yeni ofiste başlatılır. <strong>Bu ofis broker paneli, transfer öncesi kayıtları görmeye devam edecektir; yeni ofisin broker&apos;ı yalnızca transfer sonrası kayıtları görür.</strong>
            </p>

            <div className="space-y-3">
              <Field label="Hedef Ofis" required>
                <select className="input" value={transferTargetOfficeId} onChange={e => setTransferTargetOfficeId(e.target.value)}>
                  <option value="">Seçin...</option>
                  {otherOffices.map(o => <option key={o.id} value={o.id}>{o.name}{o.brand?.name && ` · ${o.brand.name}`}</option>)}
                </select>
              </Field>

              <Field label="Transfer Sebebi (opsiyonel)">
                <input className="input" value={transferReason} onChange={e => setTransferReason(e.target.value)} placeholder="örn. ofis taşındı, terfi..." />
              </Field>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setTransferConsultantId(null)} className="btn-secondary flex-1">İptal</button>
              <button
                onClick={transferConsultant}
                disabled={!transferTargetOfficeId || transferring}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {transferring ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                Transfer Et
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ComponentType<{ size?: number | string; className?: string }>; color: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-on-surface-variant">{label}</p>
        <div className={`w-8 h-8 rounded-lg bg-${color}-50 flex items-center justify-center`}>
          <Icon size={15} className={`text-${color}-600`} />
        </div>
      </div>
      <p className="font-bold text-on-surface text-base leading-tight truncate">{value}</p>
    </div>
  )
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

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return <div className={`grid grid-cols-1 md:grid-cols-${cols} gap-3`}>{children}</div>
}

function roleLabel(r?: string): string {
  switch (r) {
    case 'admin':      return 'Admin'
    case 'broker':     return 'Broker'
    case 'manager':    return 'Müdür'
    case 'consultant': return 'Danışman'
    default:           return r || '—'
  }
}
