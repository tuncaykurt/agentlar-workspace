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
}

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
    })
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

  if (isLoading || loading) return <div className="p-8 text-slate-400">Yükleniyor...</div>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Müşteri ve Ücret Yönetimi</h1>
      
      {error && <div className="bg-red-500/10 text-red-400 p-4 rounded-lg mb-6">{error}</div>}

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
