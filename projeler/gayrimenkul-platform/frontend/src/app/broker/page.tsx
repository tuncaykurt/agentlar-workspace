'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Office } from '@/lib/types'
import {
  Briefcase, Loader2, Building2,
  Users, FileText, Coins, CheckCircle2, Phone, Mail, AlertCircle,
} from 'lucide-react'

type ConsultantSummary = {
  id: string
  full_name: string
  email: string
  phone?: string
  role: string
  is_active: boolean
  profile_photo_url?: string
  commission_rate: number
  doc_count: number
  commission_total: number
  commission_paid: number
}

function formatTRY(v: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(v)
}

function roleLabel(r: string) {
  return r === 'broker' ? 'Broker' : r === 'manager' ? 'Müdür' : r === 'admin' ? 'Admin' : 'Danışman'
}

export default function BrokerPanelPage() {
  const supabase = createClient()
  const [offices, setOffices] = useState<Office[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [consultants, setConsultants] = useState<ConsultantSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchOffices() }, [])

  async function fetchOffices() {
    const { data } = await supabase.from('offices').select('*').order('name')
    if (data && data.length > 0) {
      setOffices(data as Office[])
      setSelectedOfficeId(data[0].id)
    } else {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedOfficeId) return
    fetchConsultants(selectedOfficeId)
  }, [selectedOfficeId])

  async function fetchConsultants(officeId: string) {
    setLoading(true)
    setError(null)
    try {
      // 1. Ofis üyeliklerini çek
      const { data: memberships, error: memErr } = await supabase
        .from('office_memberships')
        .select('consultant_id, commission_rate_override, consultant:consultants(id, full_name, email, phone, role, is_active, profile_photo_url, commission_rate)')
        .eq('office_id', officeId)
        .is('end_date', null)

      if (memErr) throw memErr

      if (!memberships || memberships.length === 0) {
        setConsultants([])
        return
      }

      const consultantIds = memberships.map((m: any) => m.consultant_id).filter(Boolean)

      // 2. Belge sayıları
      const { data: docs } = await supabase
        .from('documents')
        .select('consultant_id')
        .in('consultant_id', consultantIds)

      // 3. Komisyonlar (office_id filtresi olmadan — bazı kayıtlarda olmayabilir)
      const { data: comms } = await supabase
        .from('commissions')
        .select('consultant_id, consultant_amount, status')
        .in('consultant_id', consultantIds)

      const docCounts: Record<string, number> = {}
      for (const d of docs || []) {
        docCounts[d.consultant_id] = (docCounts[d.consultant_id] || 0) + 1
      }

      const commTotals: Record<string, number> = {}
      const commPaid: Record<string, number> = {}
      for (const c of comms || []) {
        if (!c.consultant_id) continue
        commTotals[c.consultant_id] = (commTotals[c.consultant_id] || 0) + (c.consultant_amount || 0)
        if (c.status === 'paid') {
          commPaid[c.consultant_id] = (commPaid[c.consultant_id] || 0) + (c.consultant_amount || 0)
        }
      }

      const defaultRate = offices.find(o => o.id === officeId)?.default_consultant_share_rate ?? 50
      const summaries: ConsultantSummary[] = (memberships as any[]).map(m => {
        const c = m.consultant || {}
        return {
          id: c.id || m.consultant_id,
          full_name: c.full_name || '',
          email: c.email || '',
          phone: c.phone,
          role: c.role || 'consultant',
          is_active: c.is_active ?? false,
          profile_photo_url: c.profile_photo_url,
          commission_rate: m.commission_rate_override ?? c.commission_rate ?? defaultRate,
          doc_count: docCounts[c.id || m.consultant_id] || 0,
          commission_total: commTotals[c.id || m.consultant_id] || 0,
          commission_paid: commPaid[c.id || m.consultant_id] || 0,
        }
      })

      setConsultants(summaries)
    } catch (e: any) {
      setError(e?.message || 'Danışmanlar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  const selectedOffice = offices.find(o => o.id === selectedOfficeId)

  const activeConsultants = consultants.filter(c => c.is_active && c.full_name)
  const incompleteConsultants = consultants.filter(c => !c.full_name)
  const passiveConsultants = consultants.filter(c => !c.is_active && c.full_name)

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
          <p className="text-on-surface-variant text-sm mt-1">
            {selectedOffice?.name} — danışman ve işlem özeti
          </p>
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
          <p className="text-xs text-on-surface-variant mb-1">Aktif Danışman</p>
          <p className="text-2xl font-bold text-on-surface">{activeConsultants.length}</p>
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

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : consultants.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Building2 size={40} className="text-on-surface-variant opacity-30 mb-3" />
          <p className="text-on-surface-variant">Bu ofiste henüz danışman yok.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Aktif Danışmanlar */}
          {activeConsultants.length > 0 && (
            <ConsultantSection title="Aktif Danışmanlar" consultants={activeConsultants} formatTRY={formatTRY} roleLabel={roleLabel} />
          )}

          {/* Pasif Danışmanlar */}
          {passiveConsultants.length > 0 && (
            <ConsultantSection title="Pasif Danışmanlar" consultants={passiveConsultants} formatTRY={formatTRY} roleLabel={roleLabel} muted />
          )}

          {/* Profil Tamamlanmamış */}
          {incompleteConsultants.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-on-surface-variant mb-3 flex items-center gap-2">
                <AlertCircle size={14} className="text-orange-500" />
                Profil Tamamlanmamış ({incompleteConsultants.length})
              </h3>
              <p className="text-xs text-on-surface-variant">
                Bu danışmanlar sisteme eklenmiş ancak henüz profil bilgilerini doldurmamış. Danışmandan profilini tamamlamasını isteyin.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ConsultantSection({
  title, consultants, formatTRY, roleLabel, muted = false
}: {
  title: string
  consultants: ConsultantSummary[]
  formatTRY: (v: number) => string
  roleLabel: (r: string) => string
  muted?: boolean
}) {
  return (
    <div>
      <h3 className={`text-sm font-semibold mb-3 ${muted ? 'text-on-surface-variant' : 'text-on-surface'}`}>{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {consultants.map(c => (
          <div key={c.id} className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${muted ? 'border-outline opacity-70' : 'border-outline hover:bg-surface-container-high'}`}>
            {c.profile_photo_url ? (
              <img src={c.profile_photo_url} alt={c.full_name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0 text-primary font-bold text-xl">
                {c.full_name.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-on-surface">{c.full_name}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  c.role === 'broker' ? 'bg-purple-100 text-purple-700' :
                  c.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{roleLabel(c.role)}</span>
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

              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <FileText size={11} className="text-primary" />
                  <strong className="text-on-surface">{c.doc_count}</strong> belge
                </span>
                <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <Coins size={11} className="text-green-600" />
                  <strong className="text-green-700">{formatTRY(c.commission_total)}</strong>
                </span>
                <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <CheckCircle2 size={11} className="text-blue-600" />
                  <strong className="text-blue-700">{formatTRY(c.commission_paid)}</strong> tahsil
                </span>
              </div>

              <p className="text-[11px] text-on-surface-variant mt-1">
                Komisyon payı: <strong className="text-primary">%{c.commission_rate}</strong>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
