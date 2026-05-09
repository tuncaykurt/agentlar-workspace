"use client"

import { useState } from "react"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function AnalyticsPage() {
  const { data, error, isLoading } = useSWR('http://localhost:8000/api/analytics/dashboard', fetcher, {
    refreshInterval: 15000 // Her 15 saniyede bir güncelle
  })

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 md:p-8">
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl">
          Analiz verileri yüklenirken bir hata oluştu.
        </div>
      </div>
    )
  }

  const overview = data?.overview || { total_trades: 0, win_rate: 0, total_pnl: 0, winning_trades: 0, losing_trades: 0 }
  const sessions = data?.session_performance || []
  const signals = data?.signal_stats || { received: 0, executed: 0, filtered: 0, rejected: 0 }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Analiz ve Performans Paneli
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Botların genel performansı, seans analizi ve akıllı filtre metrikleri
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm">
          <div className="text-slate-400 text-sm font-medium mb-1">Toplam İşlem</div>
          <div className="text-3xl font-bold text-white">{overview.total_trades}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent pointer-events-none"></div>
          <div className="text-slate-400 text-sm font-medium mb-1">Kazanma Oranı (Win Rate)</div>
          <div className="text-3xl font-bold text-green-400">%{overview.win_rate}</div>
          <div className="text-xs text-slate-500 mt-1">
            {overview.winning_trades} Kâr / {overview.losing_trades} Zarar
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-br ${overview.total_pnl >= 0 ? 'from-blue-500/10' : 'from-red-500/10'} to-transparent pointer-events-none`}></div>
          <div className="text-slate-400 text-sm font-medium mb-1">Toplam PnL</div>
          <div className={`text-3xl font-bold ${overview.total_pnl >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
            ${overview.total_pnl}
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm">
          <div className="text-slate-400 text-sm font-medium mb-1">Filtrelenen Sinyal</div>
          <div className="text-3xl font-bold text-yellow-400">{signals.filtered || 0}</div>
          <div className="text-xs text-slate-500 mt-1">Akıllı Filtre Koruması</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Session Performance */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Market Seansı Performansı
          </h2>
          
          <div className="space-y-6">
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">Henüz yeterli işlem verisi yok</div>
            ) : (
              sessions.map((sess: any) => (
                <div key={sess.session}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium text-slate-300 capitalize">{sess.session || "Belirsiz"} Seansı</span>
                    <span className={sess.pnl >= 0 ? "text-green-400" : "text-red-400"}>
                      ${sess.pnl} (Win: %{sess.win_rate.toFixed(1)})
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div 
                      className="bg-green-500 h-full transition-all duration-1000" 
                      style={{ width: `${sess.win_rate}%` }}
                    ></div>
                    <div 
                      className="bg-red-500 h-full transition-all duration-1000" 
                      style={{ width: `${100 - sess.win_rate}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 text-right">{sess.trades} İşlem</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Signal Funnel */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Sinyal İşleme Hunisi (Funnel)
          </h2>
          
          <div className="space-y-4">
            <div className="relative">
              <div className="flex justify-between text-sm mb-1 z-10 relative">
                <span className="text-slate-300">Gelen Toplam Sinyal</span>
                <span className="font-bold text-white">{signals.received || 0}</span>
              </div>
              <div className="h-8 w-full bg-slate-800 rounded-lg overflow-hidden relative">
                <div className="absolute top-0 left-0 h-full bg-slate-700 w-full"></div>
              </div>
            </div>

            <div className="relative pl-4">
              <div className="flex justify-between text-sm mb-1 z-10 relative">
                <span className="text-slate-300">Filtrelenen (Akıllı Koruma)</span>
                <span className="font-bold text-yellow-400">{signals.filtered || 0}</span>
              </div>
              <div className="h-8 w-full bg-slate-800 rounded-lg overflow-hidden relative">
                <div 
                  className="absolute top-0 left-0 h-full bg-yellow-500/20 border border-yellow-500/50 rounded-lg transition-all duration-1000"
                  style={{ width: `${signals.received ? ((signals.filtered || 0) / signals.received) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="relative pl-8">
              <div className="flex justify-between text-sm mb-1 z-10 relative">
                <span className="text-slate-300">Reddedilen (AI/Risk/Kural)</span>
                <span className="font-bold text-red-400">{signals.rejected || 0}</span>
              </div>
              <div className="h-8 w-full bg-slate-800 rounded-lg overflow-hidden relative">
                <div 
                  className="absolute top-0 left-0 h-full bg-red-500/20 border border-red-500/50 rounded-lg transition-all duration-1000"
                  style={{ width: `${signals.received ? ((signals.rejected || 0) / signals.received) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="relative pl-12">
              <div className="flex justify-between text-sm mb-1 z-10 relative">
                <span className="text-slate-300">İşleme Alınan (Executed)</span>
                <span className="font-bold text-green-400">{signals.executed || 0}</span>
              </div>
              <div className="h-8 w-full bg-slate-800 rounded-lg overflow-hidden relative">
                <div 
                  className="absolute top-0 left-0 h-full bg-green-500/20 border border-green-500/50 rounded-lg transition-all duration-1000"
                  style={{ width: `${signals.received ? ((signals.executed || 0) / signals.received) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
