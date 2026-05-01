'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Commission, Expense, SalesClosing, Office, Brand, ExpenseCategory } from '@/lib/types'
import {
  TrendingUp, Clock, CheckCircle, Calculator, Receipt, FileSignature,
  Building2, Loader2, Plus, Repeat, X, RefreshCw, ChevronDown, ChevronUp,
  AlertCircle,
} from 'lucide-react'

function formatTRY(val: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(val)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function currentMonthTag() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  marketing: 'Pazarlama',
  transport: 'Ulaşım',
  office: 'Ofis',
  training: 'Eğitim',
  meal: 'Yemek',
  gift: 'Hediye',
  other: 'Diğer',
}

type OfficeWithBrand = Office & { brand?: Brand }

type ExpenseForm = {
  description: string
  amount: string
  category: ExpenseCategory
  expense_date: string
  is_recurring: boolean
  recurring_day: number
}

const EMPTY_FORM: ExpenseForm = {
  description: '',
  amount: '',
  category: 'office',
  expense_date: new Date().toISOString().slice(0, 10),
  is_recurring: false,
  recurring_day: 1,
}

export default function BrokerMuhasebePage() {
  const supabase = createClient()
  const [offices, setOffices] = useState<OfficeWithBrand[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const [closings, setClosings] = useState<SalesClosing[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])

  // Gider ekleme formu
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [form, setForm] = useState<ExpenseForm>(EMPTY_FORM)
  const [savingExpense, setSavingExpense] = useState(false)
  const [expenseError, setExpenseError] = useState<string | null>(null)

  // Gider listesi filtresi
  const [showOnlyRecurring, setShowOnlyRecurring] = useState(false)
  const [showExpenses, setShowExpenses] = useState(true)

  useEffect(() => {
    supabase
      .from('offices')
      .select('*, brand:brands(*)')
      .order('name')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setOffices(data as OfficeWithBrand[])
          setSelectedOfficeId(data[0].id)
        } else {
          setLoading(false)
        }
      })
  }, [])

  useEffect(() => {
    if (!selectedOfficeId) return
    fetchData(selectedOfficeId)
  }, [selectedOfficeId])

  async function fetchData(officeId: string) {
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
      supabase
        .from('expenses')
        .select('*')
        .eq('office_id', officeId)
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    if (clRes.data) setClosings(clRes.data as SalesClosing[])
    if (comRes.data) setCommissions(comRes.data as Commission[])
    if (expRes.data) setExpenses(expRes.data as Expense[])
    setLoading(false)
  }

  async function handleAddExpense() {
    if (!form.description || !form.amount || !selectedOfficeId) {
      setExpenseError('Açıklama ve tutar zorunludur.')
      return
    }
    setSavingExpense(true)
    setExpenseError(null)

    // Mevcut danışman ID'sini al
    const { data: { user } } = await supabase.auth.getUser()
    const { data: consultant } = await supabase
      .from('consultants')
      .select('id')
      .eq('user_id', user?.id)
      .single()

    const payload: Record<string, unknown> = {
      description: form.description,
      amount: parseFloat(form.amount),
      category: form.category,
      expense_date: form.expense_date,
      office_id: selectedOfficeId,
      consultant_id: consultant?.id ?? null,
      is_recurring: form.is_recurring,
      recurring_day: form.is_recurring ? form.recurring_day : null,
      month_tag: currentMonthTag(),
    }

    const { error } = await supabase.from('expenses').insert(payload)
    setSavingExpense(false)
    if (error) {
      setExpenseError('Kayıt hatası: ' + error.message)
    } else {
      setForm(EMPTY_FORM)
      setShowExpenseForm(false)
      fetchData(selectedOfficeId)
    }
  }

  async function handleDeleteExpense(id: string) {
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  // Bu ay için sabit giderlerin kopyalandığını işaretle (idempotent)
  async function handleGenerateRecurring() {
    const tag = currentMonthTag()
    const recurringExpenses = expenses.filter(e => e.is_recurring)

    for (const exp of recurringExpenses) {
      // Bu ay için zaten kopyalandı mı?
      const alreadyExists = expenses.some(
        e => e.parent_expense_id === exp.id && e.month_tag === tag
      )
      if (alreadyExists) continue

      const day = exp.recurring_day ?? 1
      const [year, month] = tag.split('-')
      const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`

      await supabase.from('expenses').insert({
        description: exp.description,
        amount: exp.amount,
        category: exp.category,
        expense_date: dateStr,
        office_id: selectedOfficeId,
        consultant_id: exp.consultant_id,
        is_recurring: false,
        parent_expense_id: exp.id,
        month_tag: tag,
      })
    }
    fetchData(selectedOfficeId)
  }

  // Hesaplamalar
  const selectedOffice = offices.find(o => o.id === selectedOfficeId) as OfficeWithBrand | undefined
  const brand = selectedOffice?.brand

  const totalCommissions = commissions.reduce((a, c) => a + (c.office_share_amount || 0), 0)
  const paidCommissions = commissions.filter(c => c.status === 'paid').reduce((a, c) => a + (c.office_share_amount || 0), 0)
  const pendingCommissions = commissions.filter(c => c.status === 'pending').reduce((a, c) => a + (c.office_share_amount || 0), 0)

  const thisMonthTag = currentMonthTag()
  const thisMonthExpenses = expenses.filter(e => {
    const d = e.expense_date || e.created_at
    return d.startsWith(thisMonthTag.replace('-', '-')) || e.month_tag === thisMonthTag
  })
  const totalExpenses = thisMonthExpenses.reduce((a, e) => a + e.amount, 0)

  const recurringExpenses = expenses.filter(e => e.is_recurring)
  const recurringMonthlyTotal = recurringExpenses.reduce((a, e) => a + e.amount, 0)

  // Royalty gideri (ayarlardan girilen manuel oran üzerinden)
  const royaltyRate = selectedOffice?.royalty_rate ?? 0
  const royaltyEstimate = commissions
    .filter(c => (c.created_at || '').startsWith(thisMonthTag))
    .reduce((a, c) => {
      const gross = (c.total_commission_amount || 0)
      return a + gross * (royaltyRate / 100)
    }, 0)

  const displayedExpenses = showOnlyRecurring ? recurringExpenses : expenses

  if (loading && offices.length === 0) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Calculator size={22} className="text-primary" />
            Ofis Muhasebesi
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Satış gelirleri, giderler ve sabit maliyetler
          </p>
        </div>
        {offices.length > 1 && (
          <select
            value={selectedOfficeId}
            onChange={e => setSelectedOfficeId(e.target.value)}
            className="input max-w-xs"
          >
            {offices.map(o => (
              <option key={o.id} value={o.id}>
                {o.name}{o.brand?.name ? ` · ${o.brand.name}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Satış Kapatma', value: String(closings.length), icon: FileSignature, color: 'blue' },
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

      {/* Sabit Giderler Özet Bandı */}
      <div className="card mb-6 bg-surface-container">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-on-surface-variant">Bu ay sabit giderler</p>
              <p className="text-lg font-bold text-red-600">{formatTRY(recurringMonthlyTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">Bu ay toplam gider</p>
              <p className="text-lg font-bold text-on-surface">{formatTRY(totalExpenses)}</p>
            </div>
            {royaltyRate > 0 && (
              <div>
                <p className="text-xs text-on-surface-variant">
                  {brand?.name ? `${brand.name} ` : ''}royalty gideri (%{royaltyRate})
                </p>
                <p className="text-lg font-bold text-orange-600">{formatTRY(royaltyEstimate)}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-on-surface-variant">Net (Gelir − Gider)</p>
              <p className={`text-lg font-bold ${paidCommissions - totalExpenses >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatTRY(paidCommissions - totalExpenses)}
              </p>
            </div>
          </div>

          {/* Sabit giderleri bu aya kopyala */}
          {recurringExpenses.length > 0 && (
            <button
              onClick={handleGenerateRecurring}
              className="btn-secondary flex items-center gap-2 text-sm"
              title="Tanımlı sabit giderleri bu aya kopyalar (zaten varsa atlar)"
            >
              <RefreshCw size={14} />
              Bu ay için sabit giderleri ekle
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Giderler ─────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <button
              className="text-lg font-semibold text-on-surface flex items-center gap-2"
              onClick={() => setShowExpenses(v => !v)}
            >
              <Receipt size={18} />
              Giderler
              {showExpenses ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-on-surface-variant cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnlyRecurring}
                  onChange={e => setShowOnlyRecurring(e.target.checked)}
                  className="rounded"
                />
                Sadece sabit
              </label>
              <button
                onClick={() => setShowExpenseForm(v => !v)}
                className="btn-primary flex items-center gap-1 text-xs"
              >
                <Plus size={13} /> Ekle
              </button>
            </div>
          </div>

          {/* Gider ekleme formu */}
          {showExpenseForm && (
            <div className="mb-4 p-4 rounded-lg bg-surface-container border border-outline space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">Açıklama</label>
                  <input
                    className="input text-sm"
                    placeholder="Kira, royalty, reklam..."
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">Tutar (₺)</label>
                  <input
                    type="number"
                    className="input text-sm"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">Kategori</label>
                  <select
                    className="input text-sm"
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}
                  >
                    {(Object.entries(CATEGORY_LABELS) as [ExpenseCategory, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface mb-1">Tarih</label>
                  <input
                    type="date"
                    className="input text-sm"
                    value={form.expense_date}
                    onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                  />
                </div>
              </div>

              {/* Sabit gider toggle */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
                <input
                  type="checkbox"
                  id="is_recurring"
                  className="mt-0.5 rounded"
                  checked={form.is_recurring}
                  onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))}
                />
                <div className="flex-1">
                  <label htmlFor="is_recurring" className="text-sm font-medium text-orange-800 cursor-pointer flex items-center gap-1">
                    <Repeat size={13} /> Sabit gider (her ay tekrarlar)
                  </label>
                  <p className="text-xs text-orange-600 mt-0.5">
                    Kira, royalty bedeli, internet gibi aylık sabit maliyetler için işaretleyin.
                    Her ay "Bu ay için sabit giderleri ekle" butonu ile otomatik kopyalanır.
                  </p>
                  {form.is_recurring && (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-xs text-orange-700">Ayın kaçında?</label>
                      <input
                        type="number"
                        min={1}
                        max={28}
                        className="input text-xs w-20"
                        value={form.recurring_day}
                        onChange={e => setForm(f => ({ ...f, recurring_day: Number(e.target.value) }))}
                      />
                    </div>
                  )}
                </div>
              </div>

              {expenseError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle size={12} /> {expenseError}
                </p>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowExpenseForm(false); setForm(EMPTY_FORM); setExpenseError(null) }}
                  className="btn-secondary text-sm"
                >
                  İptal
                </button>
                <button
                  onClick={handleAddExpense}
                  disabled={savingExpense}
                  className="btn-primary text-sm flex items-center gap-1"
                >
                  {savingExpense ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Kaydet
                </button>
              </div>
            </div>
          )}

          {/* Gider listesi */}
          {showExpenses && (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {displayedExpenses.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center py-6">
                  {showOnlyRecurring ? 'Henüz sabit gider tanımlanmamış.' : 'Bu ofise ait gider kaydı yok.'}
                </p>
              ) : (
                displayedExpenses.map(exp => (
                  <div
                    key={exp.id}
                    className={`flex justify-between items-center p-3 rounded-lg border transition-colors hover:bg-surface-container-high ${
                      exp.is_recurring ? 'border-orange-200 bg-orange-50/40' : 'border-outline'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {exp.is_recurring && (
                          <Repeat size={12} className="text-orange-500 flex-shrink-0" />
                        )}
                        <p className="text-sm font-medium text-on-surface truncate">{exp.description}</p>
                      </div>
                      <p className="text-xs text-on-surface-variant">
                        {CATEGORY_LABELS[exp.category] ?? exp.category}
                        {exp.is_recurring && exp.recurring_day
                          ? ` · Her ayın ${exp.recurring_day}. günü`
                          : ` · ${exp.expense_date ? formatDate(exp.expense_date) : ''}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <p className="text-sm font-bold text-red-600 whitespace-nowrap">{formatTRY(exp.amount)}</p>
                      <button
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="text-on-surface-variant hover:text-red-500 transition-colors"
                        title="Sil"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ─── Sağ kolon: Komisyonlar + Satış Kapatmalar ─── */}
        <div className="space-y-6">
          {/* Son Komisyonlar */}
          <div className="card">
            <h2 className="text-lg font-semibold text-on-surface mb-4 flex items-center gap-2">
              <TrendingUp size={18} /> Son Komisyonlar
            </h2>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-primary" /></div>
            ) : commissions.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-8">Kayıt bulunamadı</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
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

          {/* Son Satış Kapatmalar */}
          <div className="card">
            <h2 className="text-lg font-semibold text-on-surface mb-4 flex items-center gap-2">
              <FileSignature size={18} /> Son Satış Kapatmalar
            </h2>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-primary" /></div>
            ) : closings.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-8">Kayıt bulunamadı</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
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
    </div>
  )
}
