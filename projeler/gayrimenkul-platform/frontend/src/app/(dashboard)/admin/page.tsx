'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Consultant } from '@/lib/types'
import {
  Settings, Users, Plus, Edit2, CheckCircle,
  XCircle, Shield, Loader2, TrendingUp,
} from 'lucide-react'

const roleLabels: Record<string, string> = {
  admin: 'Yönetici',
  manager: 'Müdür',
  consultant: 'Danışman',
}

const roleColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-purple-100 text-purple-700',
  consultant: 'bg-blue-100 text-blue-700',
}

export default function AdminPage() {
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editRate, setEditRate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchConsultants() }, [])

  async function fetchConsultants() {
    const supabase = createClient()
    const { data } = await supabase
      .from('consultants')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setConsultants(data as Consultant[])
    setLoading(false)
  }

  async function updateRate(id: string) {
    if (!editRate) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('consultants')
      .update({ commission_rate: Number(editRate) })
      .eq('id', id)
    setEditId(null)
    setEditRate('')
    setSaving(false)
    fetchConsultants()
  }

  async function toggleActive(id: string, current: boolean) {
    const supabase = createClient()
    await supabase.from('consultants').update({ is_active: !current }).eq('id', id)
    fetchConsultants()
  }

  const activeCount = consultants.filter(c => c.is_active).length

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Yönetim Paneli</h1>
        <p className="text-slate-500 text-sm mt-1">Danışman yönetimi ve sistem ayarları</p>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Toplam Danışman', value: consultants.length, icon: Users, color: 'blue' },
          { label: 'Aktif', value: activeCount, icon: CheckCircle, color: 'green' },
          { label: 'Pasif', value: consultants.length - activeCount, icon: XCircle, color: 'red' },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="stat-card">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-slate-500">{s.label}</p>
                <div className={`w-8 h-8 rounded-lg bg-${s.color}-50 flex items-center justify-center`}>
                  <Icon size={15} className={`text-${s.color}-600`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            </div>
          )
        })}
      </div>

      {/* Danışman Listesi */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Shield size={16} className="text-blue-600" /> Danışmanlar
          </h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : consultants.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Users size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Danışman bulunamadı</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {consultants.map(c => (
              <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-700 font-semibold text-sm">
                  {c.full_name.charAt(0).toUpperCase()}
                </div>

                {/* Bilgi */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900 text-sm">{c.full_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${roleColors[c.role] || 'bg-slate-100 text-slate-600'}`}>
                      {roleLabels[c.role] || c.role}
                    </span>
                    {!c.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Pasif</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{c.email}</p>
                  {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                </div>

                {/* Komisyon Oranı */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <TrendingUp size={12} className="text-slate-400" />
                    {editId === c.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={editRate}
                          onChange={e => setEditRate(e.target.value)}
                          className="w-16 border border-blue-300 rounded px-2 py-0.5 text-xs focus:outline-none"
                          placeholder={String(c.commission_rate)}
                        />
                        <span className="text-xs text-slate-500">%</span>
                        <button
                          onClick={() => updateRate(c.id)}
                          disabled={saving}
                          className="text-xs text-green-600 hover:text-green-700 font-medium"
                        >
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={14} />}
                        </button>
                        <button onClick={() => setEditId(null)} className="text-xs text-slate-400">
                          <XCircle size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditId(c.id); setEditRate(String(c.commission_rate)) }}
                        className="text-xs text-slate-600 hover:text-blue-600 flex items-center gap-1"
                      >
                        %{c.commission_rate} <Edit2 size={10} />
                      </button>
                    )}
                  </div>

                  {/* Aktif/Pasif toggle */}
                  <button
                    onClick={() => toggleActive(c.id, c.is_active)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      c.is_active
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-slate-400 hover:bg-slate-100'
                    }`}
                    title={c.is_active ? 'Pasife Al' : 'Aktif Et'}
                  >
                    {c.is_active ? <CheckCircle size={16} /> : <XCircle size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sistem Bilgisi */}
      <div className="card mt-4 bg-slate-50 border-slate-200">
        <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Settings size={15} /> Sistem Bilgisi
        </h3>
        <div className="space-y-2 text-sm text-slate-600">
          <div className="flex justify-between">
            <span>Platform</span>
            <span className="font-medium">Gayrimenkul Danışman Platformu</span>
          </div>
          <div className="flex justify-between">
            <span>Supabase</span>
            <span className="font-medium text-green-600">Bağlı ✓</span>
          </div>
          <div className="flex justify-between">
            <span>Scraping (Browserless)</span>
            <span className="font-medium text-green-600">Aktif ✓</span>
          </div>
          <div className="flex justify-between">
            <span>AI (OpenRouter)</span>
            <span className="font-medium text-green-600">Aktif ✓</span>
          </div>
        </div>
      </div>
    </div>
  )
}
