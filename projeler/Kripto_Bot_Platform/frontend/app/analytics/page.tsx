"use client"

import { useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"

const fetcher = (path: string) => api.get(path)

const COLOR_MAP: Record<string, string> = {
  orange: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  purple: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  blue:   "bg-blue-500/20   text-blue-300   border-blue-500/40",
  red:    "bg-red-500/20    text-red-300    border-red-500/40",
  yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  indigo: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
  gray:   "bg-slate-700/50  text-slate-300  border-slate-600/40",
}

export default function AnalyticsPage() {
  const [filterAction, setFilterAction] = useState<"filtered" | "rejected" | "all">("filtered")
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const { data, error, isLoading } = useSWR('/analytics/dashboard', fetcher, {
    refreshInterval: 15000
  })

  const { data: filteredData, isLoading: filteredLoading } = useSWR(
    `/analytics/filtered-signals?action=${filterAction}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
    fetcher,
    { refreshInterval: 20000 }
  )

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

  const filteredItems: any[] = filteredData?.items || []
  const filteredTotal: number = filteredData?.total || 0
  const totalPages = Math.ceil(filteredTotal / PAGE_SIZE)

  const formatTime = (iso: string | null) => {
    if (!iso) return "—"
    const d = new Date(iso)
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }) +
      " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
  }

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
                    <div className="bg-green-500 h-full transition-all duration-1000" style={{ width: `${sess.win_rate}%` }}></div>
                    <div className="bg-red-500 h-full transition-all duration-1000" style={{ width: `${100 - sess.win_rate}%` }}></div>
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
            {[
              { label: "Gelen Toplam Sinyal",       val: signals.received || 0, color: "bg-slate-700",              indent: "" },
              { label: "Filtrelenen (Akıllı Koruma)", val: signals.filtered || 0, color: "bg-yellow-500/30 border border-yellow-500/50", indent: "pl-4" },
              { label: "Reddedilen (AI/Risk/Kural)", val: signals.rejected || 0, color: "bg-red-500/30 border border-red-500/50",       indent: "pl-8" },
              { label: "İşleme Alınan (Executed)",  val: signals.executed || 0, color: "bg-green-500/30 border border-green-500/50",    indent: "pl-12" },
            ].map(row => (
              <div key={row.label} className={`relative ${row.indent}`}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300">{row.label}</span>
                  <span className="font-bold text-white">{row.val}</span>
                </div>
                <div className="h-8 w-full bg-slate-800 rounded-lg overflow-hidden relative">
                  <div
                    className={`absolute top-0 left-0 h-full rounded-lg transition-all duration-1000 ${row.color}`}
                    style={{ width: `${signals.received ? (row.val / signals.received) * 100 : 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Filtrelenen Sinyaller Tablosu ─── */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="text-yellow-400">🚫</span>
            Filtrelenen Sinyaller
            <span className="ml-2 text-sm font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
              {filteredTotal} kayıt
            </span>
          </h2>

          {/* Tab filtreleri */}
          <div className="flex gap-2 text-sm">
            {([
              { key: "filtered", label: "Filtrelenen", color: "text-yellow-400 border-yellow-500/60 bg-yellow-500/10" },
              { key: "rejected", label: "Reddedilen",  color: "text-red-400    border-red-500/60    bg-red-500/10" },
              { key: "all",      label: "Tümü",        color: "text-slate-300  border-slate-600     bg-slate-800" },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => { setFilterAction(tab.key); setPage(0) }}
                className={`px-3 py-1.5 rounded-lg border font-medium transition-all ${
                  filterAction === tab.key ? tab.color : "text-slate-500 border-slate-700 bg-slate-900 hover:text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-yellow-400"></div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-sm">Bu kategoride filtrelenen sinyal yok.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left pb-3 pr-4">Zaman</th>
                    <th className="text-left pb-3 pr-4">Sembol</th>
                    <th className="text-left pb-3 pr-4">Yön</th>
                    <th className="text-left pb-3 pr-4">Durum</th>
                    <th className="text-left pb-3 pr-4 min-w-[220px]">Filtre Sebebi</th>
                    <th className="text-right pb-3 pr-4">RSI</th>
                    <th className="text-right pb-3 pr-4">ATR</th>
                    <th className="text-right pb-3 pr-4">Hacim</th>
                    <th className="text-right pb-3">EMA200 %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredItems.map((item: any) => (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition-colors group">
                      {/* Zaman */}
                      <td className="py-3 pr-4 text-slate-500 whitespace-nowrap text-xs">
                        {formatTime(item.created_at)}
                      </td>

                      {/* Sembol */}
                      <td className="py-3 pr-4 font-mono font-bold text-white">
                        {item.symbol}
                      </td>

                      {/* Yön */}
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${
                          item.signal_type === "buy"
                            ? "bg-green-500/10 text-green-400 border-green-500/30"
                            : "bg-red-500/10 text-red-400 border-red-500/30"
                        }`}>
                          {item.signal_type === "buy" ? "▲ LONG" : "▼ SHORT"}
                        </span>
                      </td>

                      {/* Durum */}
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${
                          item.action === "filtered"
                            ? "bg-yellow-500/10 text-yellow-300 border-yellow-500/30"
                            : "bg-red-500/10 text-red-300 border-red-500/30"
                        }`}>
                          {item.action === "filtered" ? "🚧 Filtrelendi" : "❌ Reddedildi"}
                        </span>
                      </td>

                      {/* Sebep badge'leri */}
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {item.reason_labels && item.reason_labels.length > 0 ? (
                            item.reason_labels.map((lbl: any, i: number) => (
                              <span
                                key={i}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border font-medium ${COLOR_MAP[lbl.color] || COLOR_MAP.gray}`}
                                title={item.reject_reason || ""}
                              >
                                {lbl.icon} {lbl.label}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-600 italic text-xs">
                              {item.reject_reason ? item.reject_reason.slice(0, 60) : "Sebep belirtilmemiş"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* RSI */}
                      <td className="py-3 pr-4 text-right font-mono">
                        {item.rsi_14 != null ? (
                          <span className={`${
                            item.rsi_14 > 70 ? "text-red-400" :
                            item.rsi_14 < 30 ? "text-green-400" :
                            "text-slate-300"
                          }`}>
                            {item.rsi_14.toFixed(1)}
                          </span>
                        ) : <span className="text-slate-700">—</span>}
                      </td>

                      {/* ATR */}
                      <td className="py-3 pr-4 text-right font-mono text-slate-400">
                        {item.volatility_atr != null ? item.volatility_atr.toFixed(2) : <span className="text-slate-700">—</span>}
                      </td>

                      {/* Hacim */}
                      <td className="py-3 pr-4 text-right font-mono text-slate-400">
                        {item.volume_ratio != null ? `${item.volume_ratio.toFixed(1)}x` : <span className="text-slate-700">—</span>}
                      </td>

                      {/* EMA200 % */}
                      <td className="py-3 text-right font-mono">
                        {item.ema200_dist != null ? (
                          <span className={item.ema200_dist >= 0 ? "text-green-400" : "text-red-400"}>
                            {item.ema200_dist >= 0 ? "+" : ""}{item.ema200_dist.toFixed(2)}%
                          </span>
                        ) : <span className="text-slate-700">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
                <span className="text-xs text-slate-500">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredTotal)} / {filteredTotal} kayıt
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    ← Önceki
                  </button>
                  <span className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-400">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Sonraki →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
