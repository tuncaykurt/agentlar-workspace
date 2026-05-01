'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Office } from '@/lib/types'
import {
  Briefcase, TrendingUp, Loader2, Edit2, Save, X, Building2,
  Users, FileText, Coins, CheckCircle2, Phone, Mail,
} from 'lucide-react'

type ConsultantSummary = {
  id: string
  full_name: string
  email: string
  phone?: string
  role: string
  is_active: boolean
  profile_photo_url?: string
  commission_rate_override?: number
  doc_count: number
  commission_total: number
  commission_paid: number
}

export default function BrokerPanelPage() {
  const supabase = createClient()
  const [offices, setOffices] = useState<Office[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [consultants, setConsultants] = useState<ConsultantSummary[]>([])

  const [editingOffice, setEditingOffice] = useState(false)
  const [officeForm, setOfficeForm] = useState<Partial<Office>>({})

  useEffect(() => { fetchOffices() }, [])

  async function fetchOffices() {
    setLoading(true)
    const { data } = await supabase.from('offices').select('*').order('name')
    if (data && data.length > 0) {
      setOffices(data as Office[])
      if (!selectedOfficeId) setSelectedOfficeId(data[0].id)
    } else {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedOfficeId) return
    const off = offices.find(o => o.id === selectedOfficeId)
    if (off) setOfficeForm(off)
    fetchConsultants(selectedOfficeId)
  }, [selectedOfficeId, offices])

  async function fetchConsultants(officeId: string) {
    setLoading(true)

    const { data: memberships } = await supabase
      .from('office_memberships')
      .select('consultant_id, commission_rate_override, consultant:consultants(id, full_name, email, phone, role, is_active, profile_photo_url)')
      .eq('office_id', officeId)
      .is('end_date', null)

    if (!memberships || memberships.length === 0) {
      setConsultants([])
      setLoading(false)
      return
    }

    const consultantIds = memberships.map((m: any) => m.consultant_id)

    const [docRes, commRes] = await Promise.all([
      supabase
        .from('documents')
        .select('consultant_id')
        .in('consultant_id', consultantIds)
        .eq('office_id', officeId),
      supabase
        .from('commissions')
        .select('consultant_id, consultant_amount, status')
        .in('consultant_id', consultantIds)
        .eq('office_id', officeId),
    ])

    const docCounts: Record<string, number> = {}
    for (const d of docRes.data || []) {
      docCounts[d.consultant_id] = (docCounts[d.consultant_id] || 0) + 1
    }

    const commTotals: Record<string, number> = {}
    const commPaid: Record<string, number> = {}
    for (const c of commRes.data || []) {
      commTotals[c.consultant_id] = (commTotals[c.consultant_id] || 0) + (c.consultant_amount || 0)
      if (c.status === 'paid') {
        commPaid[c.consultant_id] = (commPaid[c.consultant_id] || 0) + (c.consultant_amount || 0)
      }
    }

    const summaries: ConsultantSummary[] = memberships.map((m: any) => {
      const c = m.consultant
      return {
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        phone: c.phone,
        role: c.role,
        is_active: c.is_active,
        profile_photo_url: c.profile_photo_url,
        commission_rate_override: m.commission_rate_override,
        doc_count: docCounts[c.id] || 0,
        commission_total: commTotals[c.id] || 0,
        commission_paid: commPaid[c.id] || 0,
      }
    })

    setConsultants(summaries)
    setLoading(false)
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
        default_office_share_rate: officeForm.default_office_share_rate,
        default_consultant_share_rate: officeForm.default_consultant_share_rate,
        default_total_commission_rate: officeForm.default_total_commission_rate,
      })
      .eq('id', selectedOfficeId)
    if (!err) {
      setEditingOffice(false)
      fetchOffices()
    }
  }

  const selectedOffice = offices.find(o => o.id === selectedOfficeId)

  function formatTRY(v: number) {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(v)
  }

  function roleLabel(r: string) {
    return r === 'broker' ? 'Broker' : r === 'manager' ? 'Müdür' : r === 'admin' ? 'Admin' : 'Danışman'
  }

  if (loading && offices.length === 0) {
    return <div className="p-6 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Briefcase size={22} className="text-primary" />
            Ofis Yönetimi
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Ofis bilgileri ve danışman özeti</p>
        </div>
        {offices.length > 1 && (
          <select value={selectedOfficeId} onChange={e => setSelectedOfficeId(e.target.value)} className="input max-w-xs">
            {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      {/* Özet stat kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="stat-card">
          <p className="text-xs text-on-surface-variant mb-1">Danışman Sayısı</p>
          <p className="text-2xl font-bold text-on-surface">{consultants.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-on-surface-variant mb-1">Toplam Belge</p>
          <p className="text-2xl font-bold text-on-surface">{consultants.reduce((a, c) => a + c.doc_count, 0)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-on-surface-variant mb-1">Toplam Komisyon</p>
          <p className="text-xl font-bold text-on-surface">{formatTRY(consultants.reduce((a, c) => a + c.commission_total, 0))}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-on-surface-variant mb-1">Default Komisyon</p>
          <p className="text-2xl font-bold text-primary">%{selectedOffice?.default_total_commission_rate ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ofis Ayarları formu */}
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
            <Field label="Adres">
              <textarea className="input" rows={2} value={officeForm.address || ''} onChange={e => setOfficeForm(f => ({ ...f, address: e.target.value }))} disabled={!editingOffice} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefon">
                <input className="input" value={officeForm.phone || ''} onChange={e => setOfficeForm(f => ({ ...f, phone: e.target.value }))} disabled={!editingOffice} />
              </Field>
              <Field label="E-posta">
                <input className="input" value={officeForm.email || ''} onChange={e => setOfficeForm(f => ({ ...f, email: e.target.value }))} disabled={!editingOffice} />
              </Field>
              <Field label="Vergi No">
                <input className="input" value={officeForm.tax_no || ''} onChange={e => setOfficeForm(f => ({ ...f, tax_no: e.target.value }))} disabled={!editingOffice} />
              </Field>
            </div>
            <div className="pt-3 border-t border-outline">
              <p className="text-sm font-semibold text-on-surface mb-3">Varsayılan Komisyon Oranları</p>
              <div className="grid grid-cols-2 gap-3">
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
              </div>
            </div>
          </div>
        </div>

        {/* Danışman Kartları */}
        <div className="card">
          <h2 className="text-lg font-semibold text-on-surface mb-4 flex items-center gap-2">
            <Users size={18} className="text-primary" />
            Danışmanlar
          </h2>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-primary" /></div>
          ) : consultants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Building2 size={32} className="text-on-surface-variant opacity-30 mb-2" />
              <p className="text-on-surface-variant text-sm">Bu ofiste aktif danışman yok</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {consultants.map(c => (
                <div key={c.id} className="flex items-start gap-3 p-3 rounded-xl border border-outline hover:bg-surface-container-high transition-colors">
                  {/* Avatar */}
                  {c.profile_photo_url ? (
                    <img src={c.profile_photo_url} alt={c.full_name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0 text-primary font-bold text-lg">
                      {c.full_name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-on-surface truncate">{c.full_name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        c.role === 'broker' ? 'bg-purple-100 text-purple-700' :
                        c.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{roleLabel(c.role)}</span>
                      {!c.is_active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600">Pasif</span>}
                    </div>

                    {c.phone && (
                      <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                        <Phone size={10} /> {c.phone}
                      </p>
                    )}
                    {c.email && (
                      <p className="text-xs text-on-surface-variant flex items-center gap-1">
                        <Mail size={10} /> {c.email}
                      </p>
                    )}

                    {/* Özet istatistikler */}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                        <FileText size={11} className="text-primary" />
                        <strong className="text-on-surface">{c.doc_count}</strong> belge
                      </span>
                      <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                        <Coins size={11} className="text-green-600" />
                        <strong className="text-green-700">{formatTRY(c.commission_total)}</strong> komisyon
                      </span>
                      <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                        <CheckCircle2 size={11} className="text-blue-600" />
                        <strong className="text-blue-700">{formatTRY(c.commission_paid)}</strong> tahsil
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-on-surface mb-1">{label}</label>
      {children}
    </div>
  )
}
