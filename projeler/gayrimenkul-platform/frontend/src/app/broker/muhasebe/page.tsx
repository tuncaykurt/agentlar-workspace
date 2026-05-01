'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Commission, Expense, SalesClosing, Office } from '@/lib/types'
import {
  TrendingUp, Clock, CheckCircle, Calculator, Receipt, FileSignature, Building2, Loader2
} from 'lucide-react'

function formatTRY(val: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(val)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function BrokerMuhasebePage() {
  const [closings, setClosings] = useState<SalesClosing[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [offices, setOffices] = useState<Office[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchOffices() }, [])

  async function fetchOffices() {
    const supabase = createClient()
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
    fetchData(selectedOfficeId)
  }, [selectedOfficeId])

  async function fetchData(officeId: string) {
    const supabase = createClient()
    setLoading(true)
    const [clRes, comRes, expRes] = await Promise.all([
      supabase
        .from('sales_closings')
        .select('*, property:properties(id,title,price), consultant:consultants(full_name)')
        .eq('office_id', officeId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('commissions')
        .select('*, consultant:consultants(full_name)')
        .eq('office_id', officeId)
        .order('created_at', { ascending: false })
        .limit(50),
      // Ofise bağlı giderleri çekmek için join gerekecek ama şimdilik sadece limitliyoruz (RLS ofise göre filtrelenmeli)
      supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(50),
    ])
    if (clRes.data) setClosings(clRes.data as SalesClosing[])
    if (comRes.data) setCommissions(comRes.data as Commission[])
    if (expRes.data) setExpenses(expRes.data as Expense[])
    setLoading(false)
  }

  const totalCommissions = commissions.reduce((a, c) => a + (c.office_share_amount || 0), 0)
  const paidCommissions = commissions.filter(c => c.status === 'paid').reduce((a, c) => a + (c.office_share_amount || 0), 0)
  const pendingCommissions = commissions.filter(c => c.status === 'pending').reduce((a, c) => a + (c.office_share_amount || 0), 0)

  if (loading && offices.length === 0) {
    return <div className="p-6 flex justify-center"><Loader2 size={24} className="animate-spin text-primary" /></div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Calculator size={22} className="text-primary" />
            Ofis Muhasebesi
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Ofis genelindeki satış kapatma ve komisyon gelirleri</p>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Satış Kapatma Sayısı', value: String(closings.length), icon: FileSignature, color: 'blue' },
          { label: 'Toplam Ofis Payı', value: formatTRY(totalCommissions), icon: TrendingUp, color: 'purple' },
          { label: 'Tahsil Edilen', value: formatTRY(paidCommissions), icon: CheckCircle, color: 'green' },
          { label: 'Bekleyen', value: formatTRY(pendingCommissions), icon: Clock, color: 'orange' },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="stat-card">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-on-surface-variant">{s.label}</p>
                <div className={`w-8 h-8 rounded-lg bg-${s.color}-50 flex items-center justify-center`}>
                  <Icon size={15} className={`text-${s.color}-600`} />
                </div>
              </div>
              <p className="font-bold text-on-surface text-lg leading-tight">{s.value}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-on-surface mb-4 flex items-center gap-2">
            <TrendingUp size={18} />
            Son Komisyonlar
          </h2>
          {commissions.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-8">Kayıt bulunamadı</p>
          ) : (
            <div className="space-y-3">
              {commissions.map(c => (
                <div key={c.id} className="flex justify-between items-center p-3 rounded-lg border border-outline hover:bg-surface-container-high transition-colors">
                  <div>
                    <p className="text-sm font-medium text-on-surface">{(c as any).consultant?.full_name || 'Bilinmiyor'}</p>
                    <p className="text-xs text-on-surface-variant">{formatDate(c.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-on-surface">{formatTRY(c.office_share_amount || 0)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.status === 'paid' ? 'bg-green-100 text-green-700' :
                      c.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {c.status === 'paid' ? 'Ödendi' : c.status === 'pending' ? 'Bekliyor' : c.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-on-surface mb-4 flex items-center gap-2">
            <FileSignature size={18} />
            Son Satış Kapatmalar
          </h2>
          {closings.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-8">Kayıt bulunamadı</p>
          ) : (
            <div className="space-y-3">
              {closings.map(c => (
                <div key={c.id} className="flex justify-between items-center p-3 rounded-lg border border-outline hover:bg-surface-container-high transition-colors">
                  <div>
                    <p className="text-sm font-medium text-on-surface">{(c as any).property?.title || 'Gayrimenkul'}</p>
                    <p className="text-xs text-on-surface-variant">Danışman: {(c as any).consultant?.full_name || '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-on-surface">{formatTRY(c.sale_amount || 0)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.status === 'signed' ? 'bg-green-100 text-green-700' :
                      c.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {c.status === 'signed' ? 'İmzalandı' : c.status === 'pending' ? 'Bekliyor' : c.status}
                    </span>
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
