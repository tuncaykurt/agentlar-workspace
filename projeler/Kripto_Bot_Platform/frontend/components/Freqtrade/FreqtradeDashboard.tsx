"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"

export default function FreqtradeDashboard() {
  const [status, setStatus] = useState<any>(null)
  const [trades, setTrades] = useState<any[]>([])
  const [balance, setBalance] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      const [statusRes, tradesRes, balanceRes] = await Promise.all([
        api.get("/freqtrade/status"),
        api.get("/freqtrade/trades"),
        api.get("/freqtrade/balance"),
      ])
      setStatus(statusRes)
      setTrades(tradesRes)
      setBalance(balanceRes)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 10000)
    return () => clearInterval(timer)
  }, [])

  if (loading && !status) return <div className="p-8 text-center text-slate-400">Yükleniyor...</div>

  return (
    <div className="space-y-6">
      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-md">
          <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Bot Durumu</div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status?.state === 'running' ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]' : 'bg-red-400'}`} />
            <div className="text-xl font-bold text-white capitalize">{status?.state || 'Unknown'}</div>
          </div>
          <div className="text-xs text-slate-400 mt-2">Strateji: {status?.strategy || 'AntigravityStrategy'}</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-md">
          <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Toplam Bakiye</div>
          <div className="text-xl font-bold text-white">
            {balance?.total?.toFixed(2) || '0.00'} <span className="text-slate-500 text-sm">{balance?.symbol || 'USDT'}</span>
          </div>
          <div className="text-xs text-green-400 mt-2">Serbest: {balance?.free?.toFixed(2)}</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-md">
          <div className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Açık İşlemler</div>
          <div className="text-xl font-bold text-white">{trades.length}</div>
          <div className="text-xs text-slate-400 mt-2">Max Open Trades: {status?.max_open_trades || 3}</div>
        </div>
      </div>

      {/* Trades Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-md">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-white">Aktif İşlemler</h3>
          <button 
            onClick={fetchData}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Yenile
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-950/50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-medium">Sembol</th>
                <th className="px-6 py-3 font-medium">Giriş Fiyatı</th>
                <th className="px-6 py-3 font-medium">Miktar</th>
                <th className="px-6 py-3 font-medium">Kâr/Zarar</th>
                <th className="px-6 py-3 font-medium">Süre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">Açık işlem bulunmuyor.</td>
                </tr>
              ) : (
                trades.map((t: any) => (
                  <tr key={t.trade_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-bold text-white">{t.pair}</td>
                    <td className="px-6 py-4 text-slate-300">{t.open_rate.toFixed(4)}</td>
                    <td className="px-6 py-4 text-slate-300">{t.amount.toFixed(2)}</td>
                    <td className={`px-6 py-4 font-bold ${t.current_profit_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {t.current_profit_pct.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm">{t.open_date_human}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm">
          <strong>Hata:</strong> Freqtrade API'sine erişilemiyor. Lütfen Docker servisinin çalıştığından ve .env ayarlarının doğruluğundan emin olun.
        </div>
      )}
    </div>
  )
}
