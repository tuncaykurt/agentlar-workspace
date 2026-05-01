'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Office, Brand } from '@/lib/types'
import {
  Briefcase, TrendingUp, Tag, Loader2, CheckCircle, Edit2, Save, X, Building2
} from 'lucide-react'

type OfficeWithBrand = Office & { brand?: Brand }

export default function BrokerPanelPage() {
  const supabase = createClient()
  const [offices, setOffices] = useState<OfficeWithBrand[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const [loading, setLoading] = useState(true)

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
    const off = offices.find(o => o.id === selectedOfficeId)
    if (off) setOfficeForm(off)
  }, [selectedOfficeId, offices])

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

  if (loading && offices.length === 0) {
    return <div className="p-6 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Briefcase size={22} className="text-primary" />
            Ofis Yönetimi
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Ofis ayarları ve marka bilgileri</p>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Stat label="Marka" value={selectedOffice?.brand?.name || '—'} icon={Tag} color="purple" />
        <Stat label="HQ Payı" value={`%${selectedOffice?.brand?.hq_share_rate ?? 0}`} icon={TrendingUp} color="orange" />
        <Stat label="Default Komisyon" value={`%${selectedOffice?.default_total_commission_rate ?? 0}`} icon={Building2} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-on-surface">Ofis Ayarları</h2>
            {!editingOffice ? (
              <button onClick={() => setEditingOffice(true)} className="btn-secondary flex items-center gap-1 text-xs">
                <Edit2 size={13} /> Düzenle
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => { setEditingOffice(false); setOfficeForm(selectedOffice || {}) }} className="btn-secondary flex items-center gap-1 text-xs">
                  <X size={13} /> İptal
                </button>
                <button onClick={saveOffice} className="btn-primary flex items-center gap-1 text-xs">
                  <Save size={13} /> Kaydet
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Field label="Ofis Adı">
              <input className="input" value={officeForm.name || ''} onChange={e => setOfficeForm(f => ({ ...f, name: e.target.value }))} disabled={!editingOffice} />
            </Field>

            <Field label="Marka">
              <select className="input" value={officeForm.brand_id || ''} onChange={e => setOfficeForm(f => ({ ...f, brand_id: e.target.value }))} disabled={!editingOffice}>
                <option value="">— Bağımsız —</option>
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

            <h4 className="font-semibold text-on-surface text-sm mt-4 pt-4 border-t border-outline">Varsayılan Komisyon Oranları</h4>
            <Grid cols={2}>
              <Field label="Müşteriden %">
                <input type="number" step="0.5" className="input" value={officeForm.default_total_commission_rate ?? ''} onChange={e => setOfficeForm(f => ({ ...f, default_total_commission_rate: Number(e.target.value) }))} disabled={!editingOffice} />
              </Field>
              <div />
              <Field label="Ofis payı %">
                <input type="number" step="1" className="input" value={officeForm.default_office_share_rate ?? ''} onChange={e => setOfficeForm(f => ({ ...f, default_office_share_rate: Number(e.target.value) }))} disabled={!editingOffice} />
              </Field>
              <Field label="Danışman payı %">
                <input type="number" step="1" className="input" value={officeForm.default_consultant_share_rate ?? ''} onChange={e => setOfficeForm(f => ({ ...f, default_consultant_share_rate: Number(e.target.value) }))} disabled={!editingOffice} />
              </Field>
            </Grid>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-on-surface mb-4">Mevcut Marka Bilgisi</h2>
            {selectedOffice?.brand ? (
              <div className="bg-surface-container-high rounded-lg p-4">
                <h3 className="font-semibold text-on-surface mb-2 flex items-center gap-2">
                  <Tag size={16} className="text-primary" /> {selectedOffice.brand.name}
                </h3>
                <div className="space-y-1 text-sm">
                  <p><span className="text-on-surface-variant">HQ Payı:</span> <strong className="text-orange-600">% {selectedOffice.brand.hq_share_rate}</strong></p>
                  {selectedOffice.brand.hq_contact_name && (
                    <p><span className="text-on-surface-variant">İletişim:</span> {selectedOffice.brand.hq_contact_name}</p>
                  )}
                  {selectedOffice.brand.hq_contact_email && (
                    <p><span className="text-on-surface-variant">E-posta:</span> {selectedOffice.brand.hq_contact_email}</p>
                  )}
                  <p className="text-xs text-on-surface-variant mt-2 pt-2 border-t border-outline">
                    Marka oranlarının değişmesi için sistem yöneticisine başvurun.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-surface-container-high rounded-lg p-6 flex flex-col items-center justify-center text-center">
                <Building2 size={32} className="text-on-surface-variant mb-2 opacity-50" />
                <p className="text-on-surface-variant text-sm">Bu ofis bir markaya bağlı değil (bağımsız).</p>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-on-surface mb-4">Sistemdeki Markalar</h2>
            <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
              {brands.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-lg border border-outline hover:bg-surface-container-high transition-colors">
                  <div>
                    <p className="text-sm font-medium text-on-surface">{b.name}</p>
                    <p className="text-xs text-on-surface-variant">HQ %{b.hq_share_rate}</p>
                  </div>
                  {selectedOffice?.brand_id === b.id && (
                    <span className="text-xs px-2 py-1 rounded-md bg-green-100 text-green-700 flex items-center gap-1 font-medium">
                      <CheckCircle size={12} /> Aktif
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ComponentType<{ size?: number | string; className?: string }>; color: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-on-surface-variant">{label}</p>
        <div className={`w-8 h-8 rounded-lg bg-${color}-50 flex items-center justify-center`}>
          <Icon size={15} className={`text-${color}-600`} />
        </div>
      </div>
      <p className="font-bold text-on-surface text-xl leading-tight truncate">{value}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-on-surface mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return <div className={`grid grid-cols-1 md:grid-cols-${cols} gap-3`}>{children}</div>
}
