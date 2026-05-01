'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { OfficeMembership, Consultant, Office } from '@/lib/types'
import { Users, ArrowRightLeft, ArrowRight, Loader2 } from 'lucide-react'

type MembershipRow = OfficeMembership & {
  consultant?: Pick<Consultant, 'id' | 'full_name' | 'email' | 'phone' | 'role' | 'is_active'>
}

export default function ConsultantsPage() {
  const supabase = createClient()
  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [offices, setOffices] = useState<Office[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Transfer modal state
  const [transferConsultantId, setTransferConsultantId] = useState<string | null>(null)
  const [transferTargetOfficeId, setTransferTargetOfficeId] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [transferring, setTransferring] = useState(false)

  const [rateChangeMembershipId, setRateChangeMembershipId] = useState<string | null>(null)
  const [proposedRate, setProposedRate] = useState<number | ''>('')
  const [rateChanging, setRateChanging] = useState(false)
  const [rateRequests, setRateRequests] = useState<Record<string, any[]>>({})

  useEffect(() => {
    fetchOffices()
  }, [])

  async function fetchOffices() {
    setLoading(true)
    const { data: oRes } = await supabase.from('offices').select('*').order('name')
    if (oRes && oRes.length > 0) {
      setOffices(oRes as Office[])
      setSelectedOfficeId(oRes[0].id)
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
      .select('*, consultant:consultants(id,full_name,email,phone,role,is_active)')
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

  async function handleRateChangeRequest() {
    if (!rateChangeMembershipId || proposedRate === '') return
    setRateChanging(true)

    const membership = memberships.find(m => m.id === rateChangeMembershipId)
    if (!membership) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: currentConsultant } = await supabase
      .from('consultants')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!currentConsultant) return

    await supabase.from('commission_rate_requests').insert({
      membership_id: membership.id,
      office_id: membership.office_id,
      consultant_id: membership.consultant_id,
      requested_by_id: currentConsultant.id,
      proposed_rate: proposedRate,
      status: 'pending'
    })

    setRateChanging(false)
    setRateChangeMembershipId(null)
    setProposedRate('')
    fetchRateRequests(selectedOfficeId)
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

  const otherOffices = offices.filter(o => o.id !== selectedOfficeId)

  if (loading && offices.length === 0) {
    return <div className="p-6 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Users size={22} className="text-primary" />
            Danışmanlar
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Ofisteki danışmanları yönetin ve komisyon oranlarını ayarlayın.</p>
        </div>

        {offices.length > 1 && (
          <select
            value={selectedOfficeId}
            onChange={e => setSelectedOfficeId(e.target.value)}
            className="input max-w-xs"
          >
            {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      <div className="card p-4">
        {loading && memberships.length === 0 ? (
          <div className="p-6 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
        ) : memberships.length === 0 ? (
          <div className="text-center py-10 text-on-surface-variant text-sm">
            <Users size={32} className="mx-auto mb-2 opacity-30" />
            Bu ofiste aktif danışman yok
          </div>
        ) : (
          <div className="space-y-2">
            {memberships.map(m => {
              const defaultOfficeRate = offices.find(o => o.id === selectedOfficeId)?.default_consultant_share_rate || 50
              const currentRate = m.commission_rate_override || defaultOfficeRate
              const pendingRequest = rateRequests[m.id]?.[0]

              return (
              <div key={m.id} className="flex flex-col md:flex-row items-center gap-4 p-3 rounded-lg bg-surface-container-high">
                <div className="flex items-center gap-4 flex-1 w-full">
                  <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center text-primary font-semibold text-sm shrink-0">
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
                    <p className="text-xs text-on-surface-variant truncate mt-1">
                      Komisyon Oranı: <strong className="text-primary">% {currentRate}</strong>
                      {pendingRequest && (
                        <span className="ml-2 text-orange-600 bg-orange-100 px-2 py-0.5 rounded text-[10px] font-semibold">
                          Onay Bekliyor: %{pendingRequest.proposed_rate}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Üyelik: {new Date(m.start_date).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
                  {pendingRequest ? (
                    <button 
                      onClick={async () => {
                        if(!confirm('Bu talebi iptal etmek istediğinize emin misiniz?')) return;
                        await supabase.from('commission_rate_requests').update({status: 'rejected', resolved_at: new Date().toISOString()}).eq('id', pendingRequest.id);
                        fetchRateRequests(selectedOfficeId);
                      }}
                      className="btn-secondary text-xs flex-1 md:flex-none border-red-200 text-red-600 hover:bg-red-50"
                    >
                      Talebi İptal Et
                    </button>
                  ) : (
                    <button 
                      onClick={() => setRateChangeMembershipId(m.id)}
                      className="btn-secondary text-xs flex-1 md:flex-none"
                    >
                      Komisyon Değiştir
                    </button>
                  )}
                  {otherOffices.length > 0 && m.consultant?.id && (
                    <button
                      onClick={() => setTransferConsultantId(m.consultant!.id)}
                      className="btn-secondary flex items-center justify-center gap-1 text-xs flex-1 md:flex-none"
                    >
                      <ArrowRightLeft size={13} /> Transfer
                    </button>
                  )}
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

      {/* Komisyon Oranı Değiştirme Modal */}
      {rateChangeMembershipId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'var(--backdrop)' }}
          onClick={() => setRateChangeMembershipId(null)}
        >
          <div
            className="card max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
              <Users size={16} className="text-primary" />
              Komisyon Oranı Güncelleme
            </h3>
            <p className="text-xs text-on-surface-variant mb-4">
              Yeni oranı danışmana onaylaması için göndereceksiniz. Danışman kendi panelinden onayladığında oran otomatik olarak güncellenecektir.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Yeni Danışman Payı (%) <span className="text-red-500">*</span></label>
                <input 
                  type="number" 
                  className="input" 
                  value={proposedRate} 
                  onChange={e => setProposedRate(Number(e.target.value))} 
                  placeholder="örn. 60" 
                  min="0"
                  max="100"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setRateChangeMembershipId(null)} className="btn-secondary flex-1">İptal</button>
              <button
                onClick={handleRateChangeRequest}
                disabled={proposedRate === '' || rateChanging}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {rateChanging ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                Onaya Gönder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer modal */}
      {transferConsultantId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
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

function roleLabel(r?: string): string {
  switch (r) {
    case 'admin':      return 'Admin'
    case 'broker':     return 'Broker'
    case 'manager':    return 'Müdür'
    case 'consultant': return 'Danışman'
    default:           return r || '—'
  }
}
