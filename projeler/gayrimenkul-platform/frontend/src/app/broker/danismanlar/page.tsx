'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { OfficeMembership, Consultant, Office } from '@/lib/types'
import {
  Users, ArrowRightLeft, ArrowRight, Loader2, LayoutGrid, List,
  Phone, Mail, Percent, Check, Edit2, AlertCircle,
} from 'lucide-react'

type MembershipRow = OfficeMembership & {
  consultant?: Pick<Consultant, 'id' | 'full_name' | 'email' | 'phone' | 'role' | 'is_active' | 'profile_photo_url' | 'commission_rate'>
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

function Avatar({ name, photoUrl, size = 'md' }: { name: string; photoUrl?: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'w-20 h-20 text-2xl' : size === 'sm' ? 'w-9 h-9 text-sm' : 'w-12 h-12 text-lg'
  if (photoUrl) return <img src={photoUrl} alt={name} className={`${cls} rounded-full object-cover flex-shrink-0`} />
  return (
    <div className={`${cls} rounded-full bg-primary-container flex items-center justify-center text-primary font-bold flex-shrink-0`}>
      {name ? name.charAt(0).toUpperCase() : '?'}
    </div>
  )
}

export default function ConsultantsPage() {
  const supabase = createClient()
  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [offices, setOffices] = useState<Office[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid')
  const [showIncomplete, setShowIncomplete] = useState(false)

  const [transferConsultantId, setTransferConsultantId] = useState<string | null>(null)
  const [transferTargetOfficeId, setTransferTargetOfficeId] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [transferring, setTransferring] = useState(false)

  // Inline komisyon düzenleme
  const [editingRateMembershipId, setEditingRateMembershipId] = useState<string | null>(null)
  const [editingRateValue, setEditingRateValue] = useState<number>(50)
  const [savingRate, setSavingRate] = useState(false)

  const [rateRequests, setRateRequests] = useState<Record<string, any[]>>({})

  useEffect(() => { fetchOffices() }, [])

  async function fetchOffices() {
    setLoading(true)
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
    fetchMemberships(selectedOfficeId)
    fetchRateRequests(selectedOfficeId)
  }, [selectedOfficeId])

  async function fetchMemberships(officeId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('office_memberships')
      .select('*, consultant:consultants(id,full_name,email,phone,role,is_active,profile_photo_url,commission_rate)')
      .eq('office_id', officeId)
      .is('end_date', null)
      .order('start_date', { ascending: false })
    if (data) setMemberships(data as MembershipRow[])
    setLoading(false)
  }

  async function fetchRateRequests(officeId: string) {
    const { data } = await supabase
      .from('commission_rate_requests')
      .select('*')
      .eq('office_id', officeId)
      .eq('status', 'pending')
    if (data) {
      const grouped: Record<string, any[]> = {}
      data.forEach(req => {
        if (!grouped[req.membership_id]) grouped[req.membership_id] = []
        grouped[req.membership_id].push(req)
      })
      setRateRequests(grouped)
    }
  }

  async function saveRateDirect(membershipId: string, rate: number) {
    setSavingRate(true)
    await supabase
      .from('office_memberships')
      .update({ commission_rate_override: rate })
      .eq('id', membershipId)
    setSavingRate(false)
    setEditingRateMembershipId(null)
    fetchMemberships(selectedOfficeId)
  }

  async function transferConsultant() {
    if (!transferConsultantId || !transferTargetOfficeId) return
    setTransferring(true)
    await supabase.from('office_memberships')
      .update({ end_date: new Date().toISOString(), end_reason: transferReason || 'Ofis transferi' })
      .eq('consultant_id', transferConsultantId).is('end_date', null)
    const { data: cons } = await supabase.from('consultants').select('role').eq('id', transferConsultantId).single()
    await supabase.from('office_memberships').insert({
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

  const otherOffices = offices.filter(o => o.id !== selectedOfficeId)
  const defaultRate = offices.find(o => o.id === selectedOfficeId)?.default_consultant_share_rate ?? 50

  // Kümelendirme: tam profilli aktif / pasif / tamamlanmamış
  const activeMemberships = memberships.filter(m => m.consultant?.is_active && m.consultant?.full_name)
  const passiveMemberships = memberships.filter(m => !m.consultant?.is_active && m.consultant?.full_name)
  const incompleteMemberships = memberships.filter(m => !m.consultant?.full_name)

  if (loading && offices.length === 0) {
    return <div className="p-6 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
  }

  function renderCard(m: MembershipRow) {
    const currentRate = m.commission_rate_override ?? m.consultant?.commission_rate ?? defaultRate
    const pendingRequest = rateRequests[m.id]?.[0]
    const isEditingRate = editingRateMembershipId === m.id

    return (
      <div key={m.id} className="card flex flex-col items-center text-center gap-3 p-5">
        <Avatar name={m.consultant?.full_name || ''} photoUrl={m.consultant?.profile_photo_url} size="lg" />

        <div>
          <p className="font-semibold text-on-surface">{m.consultant?.full_name || '—'}</p>
          <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              m.role === 'broker' ? 'bg-purple-100 text-purple-700' :
              m.role === 'manager' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-600'
            }`}>{roleLabel(m.role)}</span>
            {!m.consultant?.is_active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600">Pasif</span>}
          </div>
        </div>

        {m.consultant?.phone && <p className="text-xs text-on-surface-variant flex items-center gap-1"><Phone size={11} />{m.consultant.phone}</p>}
        {m.consultant?.email && <p className="text-xs text-on-surface-variant flex items-center gap-1"><Mail size={11} />{m.consultant.email}</p>}

        {/* Inline komisyon düzenleme */}
        <div className="w-full">
          {isEditingRate ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-1 border border-primary rounded-lg px-2 py-1">
                <Percent size={12} className="text-primary" />
                <input
                  type="number"
                  min={0} max={100} step={1}
                  value={editingRateValue}
                  onChange={e => setEditingRateValue(Number(e.target.value))}
                  className="flex-1 text-sm text-center outline-none bg-transparent w-12"
                  autoFocus
                />
              </div>
              <button onClick={() => saveRateDirect(m.id, editingRateValue)} disabled={savingRate} className="btn-primary p-1.5 rounded-lg">
                <Check size={14} />
              </button>
              <button onClick={() => setEditingRateMembershipId(null)} className="btn-secondary p-1.5 rounded-lg text-xs">✕</button>
            </div>
          ) : (
            <button
              onClick={() => { setEditingRateMembershipId(m.id); setEditingRateValue(currentRate) }}
              className="flex items-center justify-center gap-1 text-sm font-semibold text-primary hover:bg-primary-container rounded-lg px-3 py-1.5 w-full transition-colors"
            >
              <Percent size={13} />
              {currentRate} komisyon payı
              <Edit2 size={11} className="ml-1 opacity-50" />
              {pendingRequest && (
                <span className="ml-1 text-orange-600 bg-orange-100 px-2 py-0.5 rounded text-[10px]">
                  → %{pendingRequest.proposed_rate} bekliyor
                </span>
              )}
            </button>
          )}
        </div>

        <p className="text-[11px] text-on-surface-variant">
          Üyelik: {new Date(m.start_date).toLocaleDateString('tr-TR')}
        </p>

        {otherOffices.length > 0 && m.consultant?.id && (
          <button onClick={() => setTransferConsultantId(m.consultant!.id)} className="btn-secondary text-xs w-full">
            <ArrowRightLeft size={12} className="inline mr-1" />Transfer Et
          </button>
        )}
      </div>
    )
  }

  function renderListRow(m: MembershipRow) {
    const currentRate = m.commission_rate_override ?? m.consultant?.commission_rate ?? defaultRate
    const isEditingRate = editingRateMembershipId === m.id

    return (
      <div key={m.id} className="flex flex-col md:flex-row items-center gap-4 p-3 rounded-lg bg-surface-container-high">
        <div className="flex items-center gap-4 flex-1 w-full">
          <Avatar name={m.consultant?.full_name || ''} photoUrl={m.consultant?.profile_photo_url} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-on-surface truncate">{m.consultant?.full_name || '—'}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                m.role === 'broker' ? 'bg-purple-100 text-purple-700' :
                m.role === 'manager' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
              }`}>{roleLabel(m.role)}</span>
              {!m.consultant?.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Pasif</span>}
            </div>
            {isEditingRate ? (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center gap-1 border border-primary rounded px-2 py-0.5">
                  <Percent size={10} className="text-primary" />
                  <input type="number" min={0} max={100} value={editingRateValue} onChange={e => setEditingRateValue(Number(e.target.value))}
                    className="w-10 text-xs outline-none bg-transparent" autoFocus />
                </div>
                <button onClick={() => saveRateDirect(m.id, editingRateValue)} disabled={savingRate} className="text-xs bg-primary text-white px-2 py-0.5 rounded">Kaydet</button>
                <button onClick={() => setEditingRateMembershipId(null)} className="text-xs text-on-surface-variant">İptal</button>
              </div>
            ) : (
              <button onClick={() => { setEditingRateMembershipId(m.id); setEditingRateValue(currentRate) }}
                className="text-xs text-primary flex items-center gap-1 hover:underline mt-0.5">
                %{currentRate} komisyon <Edit2 size={10} />
              </button>
            )}
          </div>
        </div>
        {otherOffices.length > 0 && m.consultant?.id && (
          <button onClick={() => setTransferConsultantId(m.consultant!.id)} className="btn-secondary text-xs">
            <ArrowRightLeft size={13} className="inline mr-1" />Transfer
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Users size={22} className="text-primary" />
            Danışmanlar
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Komisyon oranına tıklayarak direkt düzenleme yapabilirsiniz.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {offices.length > 1 && (
            <select value={selectedOfficeId} onChange={e => setSelectedOfficeId(e.target.value)} className="input max-w-xs">
              {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <div className="flex rounded-lg border border-outline overflow-hidden">
            <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-surface text-on-surface-variant hover:bg-surface-container-high'}`} title="Liste">
              <List size={16} />
            </button>
            <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-primary text-white' : 'bg-surface text-on-surface-variant hover:bg-surface-container-high'}`} title="Kart">
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {loading && memberships.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-primary" /></div>
      ) : memberships.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Users size={32} className="text-on-surface-variant opacity-30 mb-2" />
          <p className="text-on-surface-variant text-sm">Bu ofiste aktif danışman yok</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Aktif Danışmanlar */}
          {activeMemberships.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-on-surface mb-3">Aktif Danışmanlar ({activeMemberships.length})</h3>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeMemberships.map(m => renderCard(m))}
                </div>
              ) : (
                <div className="card p-4 space-y-2">
                  {activeMemberships.map(m => renderListRow(m))}
                </div>
              )}
            </section>
          )}

          {/* Pasif Danışmanlar */}
          {passiveMemberships.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-on-surface-variant mb-3">Pasif Danışmanlar ({passiveMemberships.length})</h3>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                  {passiveMemberships.map(m => renderCard(m))}
                </div>
              ) : (
                <div className="card p-4 space-y-2 opacity-60">
                  {passiveMemberships.map(m => renderListRow(m))}
                </div>
              )}
            </section>
          )}

          {/* Profil Tamamlanmamış */}
          {incompleteMemberships.length > 0 && (
            <section>
              <button
                onClick={() => setShowIncomplete(v => !v)}
                className="text-sm font-semibold text-orange-600 flex items-center gap-2 mb-3"
              >
                <AlertCircle size={15} />
                Profil Tamamlanmamış ({incompleteMemberships.length})
                <span className="text-xs text-on-surface-variant font-normal">{showIncomplete ? '▲ gizle' : '▼ göster'}</span>
              </button>
              {showIncomplete && (
                <div className="card p-4 space-y-2 border-orange-200">
                  {incompleteMemberships.map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-2 rounded bg-orange-50">
                      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                        <span className="text-orange-500 text-xs font-bold">?</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-orange-700 font-medium">Profil doldurulmamış</p>
                        <p className="text-[10px] text-orange-500">Üyelik: {new Date(m.start_date).toLocaleDateString('tr-TR')} · ID: {m.consultant_id?.slice(0, 8)}...</p>
                      </div>
                      {m.consultant?.id && otherOffices.length > 0 && (
                        <button onClick={() => setTransferConsultantId(m.consultant!.id!)} className="text-xs text-orange-600 underline">Transfer</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Transfer Modal */}
      {transferConsultantId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'var(--backdrop)' }} onClick={() => setTransferConsultantId(null)}>
          <div className="card max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
              <ArrowRightLeft size={16} className="text-primary" />
              Danışmanı Transfer Et
            </h3>
            <p className="text-xs text-on-surface-variant mb-4">Mevcut ofisteki üyelik kapatılır, yeni ofiste başlatılır.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Hedef Ofis <span className="text-red-500">*</span></label>
                <select className="input" value={transferTargetOfficeId} onChange={e => setTransferTargetOfficeId(e.target.value)}>
                  <option value="">Seçin...</option>
                  {otherOffices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Transfer Sebebi (opsiyonel)</label>
                <input className="input" value={transferReason} onChange={e => setTransferReason(e.target.value)} placeholder="örn. ofis taşındı, terfi..." />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setTransferConsultantId(null)} className="btn-secondary flex-1">İptal</button>
              <button onClick={transferConsultant} disabled={!transferTargetOfficeId || transferring} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
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
