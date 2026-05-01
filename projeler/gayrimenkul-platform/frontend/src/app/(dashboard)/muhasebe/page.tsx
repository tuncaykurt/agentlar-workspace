'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Commission, Expense, SalesClosing, Property, Office, Brand } from '@/lib/types'
import {
  TrendingUp, Clock, CheckCircle,
  Calculator, Receipt, Plus,
  FileSignature, AlertCircle, ArrowRight, Building2,
} from 'lucide-react'
import { calcCommission, formatTRY } from '@/lib/commission'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const expenseCategoryLabels: Record<string, string> = {
  marketing: 'Pazarlama', transport: 'Ulaşım', office: 'Ofis',
  training: 'Eğitim', meal: 'Yemek', gift: 'Hediye', other: 'Diğer',
}

type ClosingRow = SalesClosing & {
  property?: Pick<Property, 'id' | 'title' | 'price'>
  office?: Pick<Office, 'name'>
  brand?: Pick<Brand, 'name' | 'hq_share_rate'>
}

type Tab = 'closings' | 'commissions' | 'expenses' | 'calculator'

export default function MuhasebePage() {
  const [closings, setClosings] = useState<ClosingRow[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('closings')

  // Hesaplayıcı (HQ paylı)
  const [calcServiceFee, setCalcServiceFee] = useState('')
  const [calcHqRate, setCalcHqRate] = useState('9')
  const [calcOfficeRate, setCalcOfficeRate] = useState('50')
  const [calcConsultantRate, setCalcConsultantRate] = useState('50')
  const [calcCoRate, setCalcCoRate] = useState('0')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const supabase = createClient()
    const [clRes, comRes, expRes] = await Promise.all([
      supabase
        .from('sales_closings')
        .select('*, property:properties(id,title,price), office:offices(name), brand:brands(name,hq_share_rate)')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('commissions').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(50),
    ])
    if (clRes.data) setClosings(clRes.data as ClosingRow[])
    if (comRes.data) setCommissions(comRes.data as Commission[])
    if (expRes.data) setExpenses(expRes.data as Expense[])
    setLoading(false)
  }

  const calcResult = calcServiceFee
    ? calcCommission({
        service_fee: Number(calcServiceFee),
        hq_share_rate: Number(calcHqRate),
        office_share_rate: Number(calcOfficeRate),
        consultant_share_rate: Number(calcConsultantRate),
        co_consultant_share_rate: Number(calcCoRate),
      })
    : null

  const pendingClosings = closings.filter(c => c.status === 'pending').length
  const totalCommissions = commissions.reduce((a, c) => a + (c.consultant_share_amount || 0), 0)
  const paidCommissions = commissions.filter(c => c.status === 'paid').reduce((a, c) => a + (c.consultant_share_amount || 0), 0)
  const pendingCommissions = commissions.filter(c => c.status === 'pending').reduce((a, c) => a + (c.consultant_share_amount || 0), 0)
  const pendingExpenses = expenses.filter(e => e.is_approved === null).length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Muhasebe</h1>
          <p className="text-on-surface-variant text-sm mt-1">Satış kapatma, komisyon ve gider yönetimi</p>
        </div>
        <Link href="/muhasebe/expense/new" className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Gider Ekle
        </Link>
      </div>

      {pendingClosings > 0 && (
        <button
          onClick={() => setActiveTab('closings')}
          className="w-full bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4 flex items-center justify-between hover:bg-orange-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <FileSignature size={18} className="text-orange-700" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-orange-800">
                {pendingClosings} satış kapatma bekleyen işlem
              </p>
              <p className="text-xs text-orange-700">Belge bilgilerini doldurup imzaya gönderin.</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-orange-700" />
        </button>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Bekleyen Kapatma', value: String(pendingClosings), icon: FileSignature, color: 'orange' },
          { label: 'Toplam Komisyon', value: formatTRY(totalCommissions), icon: TrendingUp, color: 'blue' },
          { label: 'Ödenen', value: formatTRY(paidCommissions), icon: CheckCircle, color: 'green' },
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

      {pendingExpenses > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-sm text-orange-700">
          <Clock size={15} />
          <span><strong>{pendingExpenses} gider</strong> onay bekliyor.</span>
        </div>
      )}

      <div className="card p-0">
        <div className="flex border-b border-outline overflow-x-auto">
          {([
            { key: 'closings',    label: 'Satış Kapatma', badge: pendingClosings },
            { key: 'commissions', label: 'Komisyonlar',   badge: commissions.length },
            { key: 'expenses',    label: 'Giderler',      badge: expenses.length },
            { key: 'calculator',  label: 'Hesaplayıcı' },
          ] as { key: Tab; label: string; badge?: number }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  tab.key === 'closings' && activeTab !== tab.key
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-surface-container-highest text-on-surface-variant'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {activeTab === 'closings' && (
            loading ? <Spinner /> : closings.length === 0 ? (
              <Empty icon={FileSignature} text="Henüz satış kapatma yok. Bir mülk 'satıldı' olarak işaretlendiğinde burada açılır." />
            ) : (
              <div className="space-y-2">
                {closings.map(c => (
                  <Link
                    key={c.id}
                    href={`/muhasebe/sales-closing/${c.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      c.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                      c.status === 'signed' ? 'bg-green-100 text-green-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      <FileSignature size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {c.property?.title || 'Mülk silinmiş'}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-2 flex-wrap">
                        {c.office?.name && <><Building2 size={11} /> {c.office.name}</>}
                        {c.brand?.name && <span>· {c.brand.name} (HQ %{c.brand.hq_share_rate ?? c.hq_share_rate ?? 0})</span>}
                        <span>· {formatDate(c.created_at)}</span>
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        {c.service_fee ? (
                          <p className="text-sm font-semibold text-on-surface">{formatTRY(c.service_fee)}</p>
                        ) : (
                          <p className="text-xs text-on-surface-variant italic">tutar girilmedi</p>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                          c.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                          c.status === 'filled'  ? 'bg-blue-100 text-blue-700' :
                          c.status === 'sent'    ? 'bg-purple-100 text-purple-700' :
                          c.status === 'signed'  ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {c.status === 'pending' ? 'Bekliyor' :
                           c.status === 'filled' ? 'Dolduruldu' :
                           c.status === 'sent' ? 'İmzaya Gitti' :
                           c.status === 'signed' ? 'İmzalandı' : 'İptal'}
                        </span>
                      </div>
                      <ArrowRight size={15} className="text-on-surface-variant" />
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}

          {activeTab === 'commissions' && (
            loading ? <Spinner /> : commissions.length === 0 ? (
              <Empty icon={TrendingUp} text="Henüz komisyon kaydı yok" />
            ) : (
              <div className="space-y-2">
                {commissions.map(c => (
                  <div key={c.id} className="flex items-center gap-4 p-3 rounded-lg bg-surface-container-high">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-on-surface">{formatTRY(c.sale_price)} satış</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          c.status === 'paid' ? 'bg-green-100 text-green-700' :
                          c.status === 'confirmed' ? 'bg-primary-container text-primary' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {c.status === 'paid' ? 'Ödendi' : c.status === 'confirmed' ? 'Onaylandı' : 'Bekliyor'}
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        %{c.total_commission_rate} · HQ %{c.hq_share_rate ?? 0} · {formatDate(c.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-700 text-sm">
                        {formatTRY(c.consultant_share_amount || 0)}
                      </p>
                      <p className="text-xs text-on-surface-variant">danışman payı</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'expenses' && (
            <div className="space-y-2">
              {expenses.length === 0 ? (
                <Empty icon={Receipt} text="Gider kaydı yok" />
              ) : expenses.map(e => (
                <div key={e.id} className="flex items-center gap-4 p-3 rounded-lg bg-surface-container-high">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-on-surface">{e.description}</p>
                    <p className="text-xs text-on-surface-variant">
                      {expenseCategoryLabels[e.category] || e.category} · {formatDate(e.expense_date)}
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <p className="font-semibold text-red-600 text-sm">{formatTRY(e.amount)}</p>
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
              ))}
            </div>
          )}

          {activeTab === 'calculator' && (
            <div className="max-w-lg mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <Calculator size={18} className="text-primary" />
                <h3 className="font-semibold text-on-surface">Komisyon Hesaplayıcı</h3>
              </div>
              <div className="space-y-3">
                <Field label="Hizmet Bedeli (₺)" required>
                  <input
                    type="number"
                    value={calcServiceFee}
                    onChange={e => setCalcServiceFee(e.target.value)}
                    placeholder="2.500.000"
                    className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="HQ % (marka)">
                    <input type="number" value={calcHqRate} onChange={e => setCalcHqRate(e.target.value)} step="0.5"
                      className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </Field>
                  <Field label="Ofis %">
                    <input type="number" value={calcOfficeRate} onChange={e => setCalcOfficeRate(e.target.value)} step="1"
                      className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </Field>
                  <Field label="Danışman %">
                    <input type="number" value={calcConsultantRate} onChange={e => setCalcConsultantRate(e.target.value)} step="1"
                      className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </Field>
                </div>
                <Field label="Co-danışman payı % (danışman tutarından)">
                  <input type="number" value={calcCoRate} onChange={e => setCalcCoRate(e.target.value)} step="5"
                    className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </Field>

                {calcResult && (
                  <div className="bg-surface-container-high rounded-xl p-4 space-y-2 border border-outline">
                    <Row label="Hizmet Bedeli" value={formatTRY(calcResult.service_fee)} bold />
                    <Row label={`HQ Payı (Marka %${calcHqRate})`} value={`− ${formatTRY(calcResult.hq_share_amount)}`} />
                    <Row label="Net (HQ sonrası)" value={formatTRY(calcResult.net_after_hq)} muted />
                    <div className="h-px bg-surface-container-highest my-1" />
                    <Row label={`Ofis Payı (%${calcOfficeRate})`} value={formatTRY(calcResult.office_share_amount)} />
                    <Row label={`Danışman Payı (%${calcConsultantRate})`} value={formatTRY(calcResult.consultant_share_amount)} />
                    {Number(calcCoRate) > 0 && (
                      <>
                        <Row label={`Co-danışman (%${calcCoRate})`} value={`− ${formatTRY(calcResult.co_consultant_share_amount)}`} />
                        <Row label="Danışman Net" value={formatTRY(calcResult.consultant_net_amount)} bold green />
                      </>
                    )}
                    {calcResult.warnings.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-outline space-y-1">
                        {calcResult.warnings.map((w, i) => (
                          <p key={i} className="text-xs text-orange-700 flex items-start gap-1">
                            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {w}
                          </p>
                        ))}
                      </div>
                    )}
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

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function Empty({ icon: Icon, text }: { icon: React.ComponentType<{ size?: number | string; className?: string }>; text: string }) {
  return (
    <div className="text-center py-10 text-on-surface-variant text-sm">
      <Icon size={32} className="mx-auto mb-2 opacity-30" />
      {text}
    </div>
  )
}
