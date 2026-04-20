'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Commission, Expense } from '@/lib/types'
import {
  DollarSign, TrendingUp, Clock, CheckCircle,
  Calculator, Receipt, Plus,
} from 'lucide-react'

function formatMoney(n: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const expenseCategoryLabels: Record<string, string> = {
  marketing: 'Pazarlama', transport: 'Ulaşım', office: 'Ofis',
  training: 'Eğitim', meal: 'Yemek', gift: 'Hediye', other: 'Diğer',
}

export default function FinancePage() {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'commissions' | 'expenses' | 'calculator'>('commissions')

  // Komisyon hesaplayıcı
  const [salePrice, setSalePrice] = useState('')
  const [commissionRate, setCommissionRate] = useState('2')
  const [consultantRate, setConsultantRate] = useState('50')
  const [calcResult, setCalcResult] = useState<{
    total: number; office: number; consultant: number
  } | null>(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const supabase = createClient()
    const [comRes, expRes] = await Promise.all([
      supabase.from('commissions').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(50),
    ])
    if (comRes.data) setCommissions(comRes.data as Commission[])
    if (expRes.data) setExpenses(expRes.data as Expense[])
    setLoading(false)
  }

  function calculate() {
    const sale = Number(salePrice)
    const comRate = Number(commissionRate) / 100
    const conRate = Number(consultantRate) / 100
    if (!sale || !comRate) return
    const total = sale * comRate
    const consultant = total * conRate
    const office = total - consultant
    setCalcResult({ total, office, consultant })
  }

  // Özet metrikler
  const totalCommissions = commissions.reduce((a, c) => a + (c.consultant_share_amount || 0), 0)
  const paidCommissions = commissions.filter(c => c.status === 'paid').reduce((a, c) => a + (c.consultant_share_amount || 0), 0)
  const pendingCommissions = commissions.filter(c => c.status === 'pending').reduce((a, c) => a + (c.consultant_share_amount || 0), 0)
  const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0)
  const pendingExpenses = expenses.filter(e => e.is_approved === null).length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Finans</h1>
          <p className="text-on-surface-variant text-sm mt-1">Komisyon ve gider yönetimi</p>
        </div>
        <Link href="/finance/expense/new" className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Gider Ekle
        </Link>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Toplam Komisyon', value: formatMoney(totalCommissions), icon: TrendingUp, color: 'blue' },
          { label: 'Ödenen', value: formatMoney(paidCommissions), icon: CheckCircle, color: 'green' },
          { label: 'Bekleyen', value: formatMoney(pendingCommissions), icon: Clock, color: 'orange' },
          { label: 'Toplam Gider', value: formatMoney(totalExpenses), icon: Receipt, color: 'red' },
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

      {/* Onay Bekleyen Gider Uyarısı */}
      {pendingExpenses > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-sm text-orange-700">
          <Clock size={15} />
          <span><strong>{pendingExpenses} gider</strong> onay bekliyor.</span>
        </div>
      )}

      {/* Sekmeler */}
      <div className="card p-0">
        <div className="flex border-b border-outline">
          {[
            { key: 'commissions', label: `Komisyonlar (${commissions.length})` },
            { key: 'expenses', label: `Giderler (${expenses.length})` },
            { key: 'calculator', label: '🧮 Hesaplayıcı' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* Komisyonlar */}
          {activeTab === 'commissions' && (
            loading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : commissions.length === 0 ? (
              <div className="text-center py-10 text-on-surface-variant text-sm">
                <DollarSign size={32} className="mx-auto mb-2 opacity-30" />
                Henüz komisyon kaydı yok
              </div>
            ) : (
              <div className="space-y-2">
                {commissions.map(c => (
                  <div key={c.id} className="flex items-center gap-4 p-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-on-surface">
                          {formatMoney(c.sale_price)} satış
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          c.status === 'paid' ? 'bg-green-100 text-green-700' :
                          c.status === 'confirmed' ? 'bg-primary-container text-primary' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {c.status === 'paid' ? 'Ödendi' : c.status === 'confirmed' ? 'Onaylandı' : 'Bekliyor'}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        %{c.total_commission_rate} komisyon · {formatDate(c.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-700 text-sm">
                        {formatMoney(c.consultant_share_amount || 0)}
                      </p>
                      <p className="text-xs text-on-surface-variant">payınız</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Giderler */}
          {activeTab === 'expenses' && (
            <div className="space-y-2">
              {expenses.length === 0 ? (
                <div className="text-center py-10 text-on-surface-variant text-sm">
                  <Receipt size={32} className="mx-auto mb-2 opacity-30" />
                  Gider kaydı yok
                </div>
              ) : (
                expenses.map(e => (
                  <div key={e.id} className="flex items-center gap-4 p-3 rounded-lg bg-surface-container-high">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-on-surface">{e.description}</p>
                      <p className="text-xs text-on-surface-variant">
                        {expenseCategoryLabels[e.category] || e.category} · {formatDate(e.expense_date)}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <p className="font-semibold text-red-600 text-sm">{formatMoney(e.amount)}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        e.is_approved === true ? 'bg-green-100 text-green-700' :
                        e.is_approved === false ? 'bg-red-100 text-red-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {e.is_approved === true ? 'Onaylı' : e.is_approved === false ? 'Reddedildi' : 'Bekliyor'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Komisyon Hesaplayıcı */}
          {activeTab === 'calculator' && (
            <div className="max-w-md mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <Calculator size={18} className="text-primary" />
                <h3 className="font-semibold text-on-surface">Komisyon Hesaplayıcı</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1">Satış Fiyatı (₺)</label>
                  <input
                    type="number"
                    value={salePrice}
                    onChange={e => setSalePrice(e.target.value)}
                    placeholder="2.500.000"
                    className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-on-surface mb-1">Ofis Komisyon Oranı (%)</label>
                    <input
                      type="number"
                      value={commissionRate}
                      onChange={e => setCommissionRate(e.target.value)}
                      placeholder="3"
                      step="0.5"
                      className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-on-surface mb-1">Danışman Payı (%)</label>
                    <input
                      type="number"
                      value={consultantRate}
                      onChange={e => setConsultantRate(e.target.value)}
                      placeholder="50"
                      className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <button onClick={calculate} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Calculator size={15} /> Hesapla
                </button>

                {calcResult && (
                  <div className="bg-surface-container-high rounded-xl p-4 space-y-3 border border-outline">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-on-surface-variant">Toplam Komisyon</span>
                      <span className="font-bold text-on-surface">{formatMoney(calcResult.total)}</span>
                    </div>
                    <div className="h-px bg-surface-container-highest" />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-on-surface-variant">Ofis Payı</span>
                      <span className="font-semibold text-on-surface">{formatMoney(calcResult.office)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-green-700 font-medium">Danışman Payı (Siz)</span>
                      <span className="font-bold text-green-700 text-lg">{formatMoney(calcResult.consultant)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
