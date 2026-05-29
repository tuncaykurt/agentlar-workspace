"use client"
import React, { useState } from "react"
import { useAuth } from "@/components/AuthProvider"

export default function BillingPage() {
  const { user, isLoading } = useAuth()
  const [copied, setCopied] = useState(false)

  // Bu adresi siz kendi gercek USDT TRC20 adresinizle degistirin
  const USDT_TRC20_ADDRESS = "TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" 

  const handleCopy = () => {
    navigator.clipboard.writeText(USDT_TRC20_ADDRESS)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) return <div className="p-8 text-slate-400">Yükleniyor...</div>
  if (!user) return null

  return (
    <div className="p-6 max-w-4xl mx-auto mt-8">
      <h1 className="text-3xl font-bold text-white mb-2">Abonelik ve Ödeme</h1>
      <p className="text-slate-400 mb-8">KriptoBot kullanım ücretleri ve hesap bilgileri</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Fee Info Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Mevcut Planınız</h2>
          </div>
          
          <div className="space-y-4 mt-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <span className="text-slate-400">Ücretlendirme Modeli</span>
              <span className="text-white font-medium">
                {user.fee_type === "fixed" ? "Aylık Sabit Ücret" : "Kâr / Bakiye Payı"}
              </span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <span className="text-slate-400">Belirlenen Tutar</span>
              <span className="text-xl font-bold text-emerald-400">
                {user.fee_type === "fixed" ? `$${user.fee_amount}` : `%${user.fee_amount}`}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Ödeme Durumu</span>
              {user.fee_active ? (
                <span className="px-3 py-1 bg-amber-500/10 text-amber-400 rounded-full text-sm font-medium">Tahsilat Bekleniyor</span>
              ) : (
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-sm font-medium">Ücretsiz Kullanım</span>
              )}
            </div>
          </div>
        </div>

        {/* Payment Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <svg className="w-32 h-32 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          </div>
          
          <div className="relative z-10">
            <h2 className="text-xl font-bold text-white mb-2">USDT (TRC20) ile Ödeme</h2>
            <p className="text-slate-400 text-sm mb-6">Lütfen ödemenizi sadece Tron (TRC20) ağı üzerinden aşağıdaki adrese gönderin.</p>
            
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-4">
              <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Cüzdan Adresi (TRC20)</div>
              <div className="font-mono text-emerald-400 break-all text-sm sm:text-base">
                {USDT_TRC20_ADDRESS}
              </div>
            </div>

            <button 
              onClick={handleCopy}
              className={`w-full py-3 rounded-xl font-medium transition-all ${
                copied 
                  ? "bg-emerald-500 text-white" 
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {copied ? "✓ Adres Kopyalandı" : "Adresi Kopyala"}
            </button>
            
            <p className="text-xs text-slate-500 text-center mt-4">
              Ödemenizi yaptıktan sonra hesabınızın aktifleştirilmesi veya süresinin uzatılması için lütfen yönetici ile iletişime geçin.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
