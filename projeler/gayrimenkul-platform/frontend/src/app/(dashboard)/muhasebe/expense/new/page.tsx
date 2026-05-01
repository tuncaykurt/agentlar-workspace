'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ArrowLeft, Save, Loader2, Receipt } from 'lucide-react'
import type { ExpenseCategory } from '@/lib/types'

const categories: { value: ExpenseCategory; label: string }[] = [
  { value: 'marketing', label: 'Pazarlama' },
  { value: 'transport', label: 'Ulaşım' },
  { value: 'office', label: 'Ofis' },
  { value: 'training', label: 'Eğitim' },
  { value: 'meal', label: 'Yemek' },
  { value: 'gift', label: 'Hediye' },
  { value: 'other', label: 'Diğer' },
]

export default function NewExpensePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    amount: '',
    category: 'other' as ExpenseCategory,
    description: '',
    expense_date: new Date().toISOString().split('T')[0],
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.amount || !form.description.trim()) {
      setError('Tutar ve açıklama zorunludur.')
      return
    }
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: consultant } = await supabase
      .from('consultants').select('id').eq('user_id', user?.id).single()

    const { error: err } = await supabase.from('expenses').insert({
      consultant_id: consultant?.id,
      amount: Number(form.amount),
      category: form.category,
      description: form.description.trim(),
      expense_date: form.expense_date,
    })

    if (err) { setError('Kaydedilemedi: ' + err.message); setSaving(false); return }
    router.push('/muhasebe')
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/muhasebe" className="text-on-surface-variant hover:text-on-surface-variant">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-on-surface">Gider Ekle</h1>
          <p className="text-on-surface-variant text-sm">Yeni gider kaydı oluştur</p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-outline">
          <Receipt size={16} className="text-primary" />
          <h2 className="font-semibold text-on-surface">Gider Bilgileri</h2>
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">
            Tutar (₺) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            placeholder="0"
            className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Kategori</label>
          <select
            value={form.category}
            onChange={e => set('category', e.target.value)}
            className="w-full border border-outline rounded-lg px-3 py-2 text-sm bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">
            Açıklama <span className="text-red-500">*</span>
          </label>
          <input
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Gider detayı..."
            className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-on-surface mb-1">Tarih</label>
          <input
            type="date"
            value={form.expense_date}
            onChange={e => set('expense_date', e.target.value)}
            className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Link href="/muhasebe" className="btn-secondary flex-1 text-center">İptal</Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <><Loader2 size={15} className="animate-spin" /> Kaydediliyor...</> : <><Save size={15} /> Kaydet</>}
          </button>
        </div>
      </div>
    </div>
  )
}
