"use client"
import React, { useEffect, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { useRouter } from "next/navigation"

interface UserRow {
  id: number
  email: string
  role: string
  is_active: boolean
  fee_type: string
  fee_amount: number
  fee_active: boolean
  balance: number
  has_api_key: boolean
  created_at: string
  allowed_pages: string[]
}

const AVAILABLE_PAGES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "bots", label: "Botlar" },
  { id: "trades", label: "İşlemler" },
  { id: "strategy-view", label: "Strateji Backtest" },
  { id: "analytics", label: "Analiz" },
  { id: "scanner", label: "Tarayıcı" },
  { id: "simulations", label: "Simülasyon" },
  { id: "hft", label: "HFT Grid" },
  { id: "ai-chat", label: "AI Chat" },
  { id: "news", label: "Haberler" },
  { id: "freqtrade", label: "Freqtrade" },
  { id: "calculator", label: "Hesaplama" },
  { id: "settings", label: "Borsa Bağlantısı" },
  { id: "billing", label: "Abonelik" }
]

export default function AdminUsersPage() {
  const { user, token, isLoading } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<UserRow>>({})

  useEffect(() => {
    if (isLoading) return
    if (!user || user.role !== "admin") {
      router.push("/dashboard")
      return
    }

    fetchUsers()
  }, [user, isLoading, router])

  const fetchUsers = async () => {
    try {
      const res = await fetch(`/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error("Veriler çekilemedi")
      const data = await res.json()
      setUsers(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEditClick = (u: UserRow) => {
    setEditingId(u.id)
    setEditForm({
      is_active: u.is_active,
      fee_type: u.fee_type,
      fee_amount: u.fee_amount,
      fee_active: u.fee_active,
      allowed_pages: u.allowed_pages || [],
    })
  }

  const togglePage = (pageId: string) => {
    const pages = editForm.allowed_pages || []
    if (pages.includes(pageId)) {
      setEditForm({ ...editForm, allowed_pages: pages.filter(p => p !== pageId) })
    } else {
      setEditForm({ ...editForm, allowed_pages: [...pages, pageId] })
    }
  }

  const handleSave = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editForm)
      })
      if (!res.ok) throw new Error("Güncelleme başarısız")
      
      setEditingId(null)
      fetchUsers() // Refresh list
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleApprove = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: true })
      })
      if (!res.ok) throw new Error("Onay başarısız")
      fetchUsers()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const pendingUsers = users.filter(u => !u.is_active && u.role !== "admin")

  if (isLoading || loading) return <div className="p-8 text-slate-400">Yükleniyor...</div>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Müşteri ve Ücret Yönetimi</h1>

      {error && <div className="bg-red-500/10 text-red-400 p-4 rounded-lg mb-6">{error}</div>}

      {pendingUsers.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-6">
          <h2 className="text-amber-400 font-semibold mb-3 flex items-center gap-2">
            <span>⏳</span> Onay Bekleyen Kullanıcılar ({pendingUsers.length})
          </h2>
          <div className="space-y-2">
            {pendingUsers.map(u => (
              <div key={u.id} className="flex items-center justify-between bg-slate-900/50 rounded-xl px-4 py-3">
                <div>
                  <span className="text-white font-medium">{u.email}</span>
                  <span className="text-slate-500 text-xs ml-2">{new Date(u.created_at).toLocaleDateString("tr-TR")}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(u.id)}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg font-medium transition-colors"
                  >
                    Onayla
                  </button>
                  <button
                    onClick={() => handleEditClick(u)}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
                  >
                    Düzenle
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-sm">
                <th className="p-4 font-medium">Kullanıcı (E-posta)</th>
                <th className="p-4 font-medium">Canlı Bakiye</th>
                <th className="p-4 font-medium">Üyelik Durumu</th>
                <th className="p-4 font-medium">Ücret Tipi</th>
                <th className="p-4 font-medium">Ücret Miktarı / Oranı</th>
                <th className="p-4 font-medium">Erişim İzinleri (Sayfalar)</th>
                <th className="p-4 font-medium">Kayıt Tarihi</th>
                <th className="p-4 font-medium text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((u) => {
                const isEditing = editingId === u.id
                return (
                  <tr key={u.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
                          {u.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-slate-200 font-medium">{u.email}</div>
                          <div className="text-xs text-slate-500">{u.role === 'admin' ? 'Süper Admin' : 'Müşteri'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-emerald-400">
                      {u.has_api_key ? `$${u.balance.toFixed(2)}` : <span className="text-slate-500">API Yok</span>}
                    </td>
                    <td className="p-4">
                      {isEditing ? (
                        <select
                          className="bg-slate-950 border border-slate-700 rounded p-1 text-sm text-slate-300"
                          value={editForm.is_active ? "true" : "false"}
                          onChange={(e) => setEditForm({...editForm, is_active: e.target.value === "true"})}
                        >
                          <option value="true">Aktif</option>
                          <option value="false">Pasif (Banlı)</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                          {u.is_active ? 'Aktif' : 'Pasif'}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {isEditing ? (
                        <select
                          className="bg-slate-950 border border-slate-700 rounded p-1 text-sm text-slate-300"
                          value={editForm.fee_type || "fixed"}
                          onChange={(e) => setEditForm({...editForm, fee_type: e.target.value})}
                        >
                          <option value="fixed">Sabit Ücret ($)</option>
                          <option value="percentage">Kâr Payı (%)</option>
                        </select>
                      ) : (
                        <span className="text-slate-300">{u.fee_type === 'fixed' ? 'Sabit ($)' : 'Kâr Payı (%)'}</span>
                      )}
                    </td>
                    <td className="p-4">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            className="bg-slate-950 border border-slate-700 rounded p-1 text-sm w-20 text-slate-300"
                            value={editForm.fee_amount || 0}
                            onChange={(e) => setEditForm({...editForm, fee_amount: parseFloat(e.target.value)})}
                          />
                          <label className="flex items-center gap-1 text-xs text-slate-400">
                            <input
                              type="checkbox"
                              checked={editForm.fee_active}
                              onChange={(e) => setEditForm({...editForm, fee_active: e.target.checked})}
                            />
                            Tahsil Et
                          </label>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-slate-300 font-medium">
                            {u.fee_type === 'fixed' ? `$${u.fee_amount}` : `%${u.fee_amount}`}
                          </span>
                          <span className={`text-xs ${u.fee_active ? 'text-amber-400' : 'text-slate-500'}`}>
                            {u.fee_active ? 'Tahsilat Açık' : 'Ücretsiz'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-1 max-w-[250px]">
                          {AVAILABLE_PAGES.map(page => (
                            <label key={page.id} className="flex items-center gap-1 text-xs bg-slate-950 border border-slate-700 rounded px-2 py-1 cursor-pointer hover:bg-slate-800">
                              <input 
                                type="checkbox" 
                                checked={(editForm.allowed_pages || []).includes(page.id)}
                                onChange={() => togglePage(page.id)}
                                className="w-3 h-3"
                              />
                              {page.label}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(u.allowed_pages || []).slice(0, 3).map(p => (
                            <span key={p} className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">{p}</span>
                          ))}
                          {(u.allowed_pages || []).length > 3 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">+{u.allowed_pages.length - 3}</span>
                          )}
                          {(u.allowed_pages || []).length === 0 && <span className="text-xs text-slate-500">Sayfa Yok</span>}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-slate-400 text-sm">
                      {new Date(u.created_at).toLocaleDateString("tr-TR")}
                    </td>
                    <td className="p-4 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleSave(u.id)} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded">Kaydet</button>
                          <button onClick={() => setEditingId(null)} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded">İptal</button>
                        </div>
                      ) : (
                        <button onClick={() => handleEditClick(u)} className="text-blue-400 hover:text-blue-300 text-sm font-medium">
                          Düzenle
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Henüz kayıtlı kullanıcı bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
