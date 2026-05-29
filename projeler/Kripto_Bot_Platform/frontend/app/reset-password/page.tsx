"use client"
import { Suspense } from "react"
import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")
  
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!token) {
      setStatus("error")
      setMessage("Geçersiz veya eksik sıfırlama bağlantısı.")
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setStatus("loading")
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Şifre sıfırlanamadı")
      
      setStatus("success")
      setMessage(data.message || "Şifreniz başarıyla sıfırlandı.")
      
      setTimeout(() => {
        router.push("/login")
      }, 3000)
    } catch (err: any) {
      setStatus("error")
      setMessage(err.message)
    }
  }

  if (status === "success") {
    return (
      <div className="text-center space-y-6">
        <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-2xl">
          ✓
        </div>
        <p className="text-emerald-400">{message}</p>
        <p className="text-sm text-slate-400">Giriş sayfasına yönlendiriliyorsunuz...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {status === "error" && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm text-center">
          {message}
        </div>
      )}
      
      <div>
        <label className="block text-sm font-medium text-slate-400 mb-1">Yeni Şifre</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!token || status === "loading"}
          minLength={6}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          placeholder="••••••••"
          required
        />
      </div>

      <button
        type="submit"
        disabled={!token || status === "loading"}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20"
      >
        {status === "loading" ? "Güncelleniyor..." : "Şifreyi Güncelle"}
      </button>
      
      <div className="text-center pt-2">
        <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors">
          Giriş sayfasına dön
        </Link>
      </div>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B1120] p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">Yeni Şifre Belirle</h1>
            <p className="text-slate-400 text-sm">
              Lütfen hesabınız için yeni bir şifre girin.
            </p>
          </div>

          <Suspense fallback={<div className="text-center text-slate-400">Yükleniyor...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
