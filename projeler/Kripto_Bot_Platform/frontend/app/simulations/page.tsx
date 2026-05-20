"use client"

import { useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"

const fetcher = (path: string) => api.get(path)

export default function SimulationsPage() {
  const [tab, setTab] = useState<"open" | "closed" | "settings">("open")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [triggering, setTriggering] = useState(false)

  // Veri cek
  const { data: statsData } = useSWR("/simulations/stats", fetcher, { refreshInterval: 30000 })
  const { data: statusData } = useSWR("/simulations/status", fetcher, { refreshInterval: 10000 })
  const { data: settingsData, mutate: mutateSettings } = useSWR("/simulations/settings", fetcher)

  const queryStatus = tab === "open" ? "open" : statusFilter || undefined
  const { data: listData, mutate: mutateList } = useSWR(
    `/simulations?limit=50${queryStatus ? `&status=${queryStatus}` : ""}`,
    fetcher,
    { refreshInterval: tab === "open" ? 10000 : 30000 }
  )

  const stats = statsData || {}
  const simStatus = statusData || {}
  const settings = settingsData || {}
  const items: any[] = listData?.items || []

  const toggleSetting = async (key: string, value: any) => {
    try {
      await api.post("/simulations/settings", { [key]: value })
      mutateSettings()
    } catch {}
  }

  const triggerSim = async () => {
    setTriggering(true)
    try {
      await api.post("/simulations/trigger")
      setTimeout(() => { mutateList(); setTriggering(false) }, 3000)
    } catch { setTriggering(false) }
  }

  // AI log'u parse et
  const parseAiLog = (logStr: string | null) => {
    if (!logStr) return null
    try { return JSON.parse(logStr) } catch { return null }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Scanner Simulasyon</h1>
          <p className="text-sm text-slate-400 mt-1">
            Bot acmadan AI secimlerini takip et — basarili ise botu aktif et
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={triggerSim}
            disabled={triggering}
            className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            {triggering ? "Taraniyor..." : "Manuel Tara"}
          </button>
          <span className="text-xs text-slate-400">Simulasyon</span>
          <button
            onClick={() => toggleSetting("enabled", !settings.enabled)}
            className={`w-12 h-6 rounded-full transition-colors relative ${settings.enabled ? "bg-green-500" : "bg-slate-700"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.enabled ? "left-6" : "left-0.5"}`} />
          </button>
          <span className={`text-xs font-medium ${settings.enabled ? "text-green-400" : "text-slate-500"}`}>
            {settings.enabled ? "Aktif" : "Kapali"}
          </span>
        </div>
      </div>

      {/* Ozet Kartlari */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Toplam", value: stats.total || 0, color: "text-white" },
          { label: "Kazanc", value: stats.wins || 0, color: "text-green-400" },
          { label: "Kayip", value: stats.losses || 0, color: "text-red-400" },
          { label: "Basari %", value: `${stats.win_rate || 0}%`, color: (stats.win_rate || 0) >= 50 ? "text-green-400" : "text-red-400" },
          { label: "Toplam P&L", value: `$${(stats.total_pnl_usdt || 0).toFixed(0)}`, color: (stats.total_pnl_usdt || 0) >= 0 ? "text-green-400" : "text-red-400" },
        ].map((s, i) => (
          <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-400">{s.label}</div>
            <div className={`text-xl font-bold ${s.color} mt-1`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Detay Kartlari */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Ort. Kazanc", value: `${(stats.avg_win_pct || 0).toFixed(2)}%`, color: "text-green-400" },
          { label: "Ort. Kayip", value: `${(stats.avg_loss_pct || 0).toFixed(2)}%`, color: "text-red-400" },
          { label: "Profit Factor", value: (stats.profit_factor || 0).toFixed(2), color: (stats.profit_factor || 0) >= 1.5 ? "text-green-400" : "text-yellow-400" },
          { label: "Acik Sim", value: `${stats.open || 0} / ${settings.max_open || 5}`, color: "text-blue-400" },
        ].map((s, i) => (
          <div key={i} className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-3 text-center">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className={`text-lg font-semibold ${s.color} mt-0.5`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Yon Bazli Performans */}
      {stats.direction_stats && Object.keys(stats.direction_stats).length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(stats.direction_stats as Record<string, any>).map(([dir, s]: [string, any]) => (
            <div key={dir} className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">
                  {dir === "long" ? "📈 Long" : "📉 Short"}
                </span>
                <span className={`text-sm font-bold ${s.win_rate >= 50 ? "text-green-400" : "text-red-400"}`}>
                  %{s.win_rate}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {s.wins}W / {s.total - s.wins}L | Ort: {s.avg_pnl > 0 ? "+" : ""}{s.avg_pnl}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* En Iyi Coinler */}
      {stats.coin_performance && stats.coin_performance.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Coin Performansi</h3>
          <div className="flex flex-wrap gap-2">
            {stats.coin_performance.map((c: any) => (
              <span key={c.coin} className={`px-2 py-1 rounded text-xs font-medium border ${
                c.total_pnl >= 0
                  ? "bg-green-500/10 border-green-500/30 text-green-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}>
                {c.coin}: %{c.win_rate} ({c.wins}W/{c.losses}L) ${c.total_pnl}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tab Secici */}
      <div className="flex gap-1 bg-slate-800/60 p-1 rounded-lg w-fit">
        {([
          { id: "open", label: `Acik (${stats.open || 0})` },
          { id: "closed", label: `Kapali (${(stats.wins || 0) + (stats.losses || 0)})` },
          { id: "settings", label: "Ayarlar" },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === t.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Ayarlar */}
      {tab === "settings" && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-medium text-white">Simulasyon Ayarlari</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { key: "mode", label: "Mod", type: "select", options: [["ai","AI (Claude)"],["manual","Manuel"]] },
              { key: "min_leverage", label: "Min Kaldirac", type: "number", min: 1, max: 200 },
              { key: "max_leverage", label: "Max Kaldirac", type: "number", min: 1, max: 500 },
              { key: "tp_pct", label: "TP %", type: "number", min: 0.1, max: 50, step: 0.1 },
              { key: "sl_pct", label: "SL %", type: "number", min: 0.1, max: 50, step: 0.1 },
              { key: "interval", label: "Aralik (sn)", type: "number", min: 60, max: 3600 },
              { key: "min_confidence", label: "Min Guven", type: "number", min: 0, max: 100 },
              { key: "max_open", label: "Max Acik", type: "number", min: 1, max: 20 },
              { key: "expiry_hours", label: "Sure (saat)", type: "number", min: 1, max: 168 },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
                {f.type === "select" ? (
                  <select
                    value={settings[f.key] || ""}
                    onChange={e => toggleSetting(f.key, e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                  >
                    {f.options?.map(([v,l]: string[]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  <input
                    type="number"
                    value={settings[f.key] ?? ""}
                    min={f.min} max={f.max} step={f.step || 1}
                    onChange={e => toggleSetting(f.key, Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kapali filtre */}
      {tab === "closed" && (
        <div className="flex gap-2">
          {["", "win", "loss", "expired"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {s === "" ? "Hepsi" : s === "win" ? "Kazanc" : s === "loss" ? "Kayip" : "Suresi Dolmus"}
            </button>
          ))}
        </div>
      )}

      {/* Simulasyon Listesi */}
      {tab !== "settings" && (
        <div className="space-y-3">
          {items.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              {tab === "open" ? "Acik simulasyon yok — sistem otomatik tarayacak" : "Henuz kapanmis simulasyon yok"}
            </div>
          )}
          {items.map((sim: any) => {
            const isLong = sim.direction === "long"
            const isOpen = sim.status === "open"
            const isWin = sim.status === "win"
            const isExpanded = expandedId === sim.id
            const aiLog = parseAiLog(sim.ai_log)
            const emoji = isOpen ? (isLong ? "🟢" : "🔴") : isWin ? "✅" : sim.status === "expired" ? "⏰" : "❌"

            return (
              <div key={sim.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
                {/* Ana kart */}
                <div
                  className="p-4 cursor-pointer hover:bg-slate-800/80 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : sim.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{emoji}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-lg">{sim.coin}</span>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          }`}>
                            {sim.direction.toUpperCase()}
                          </span>
                          <span className="text-xs text-slate-500 bg-slate-900/50 px-1.5 py-0.5 rounded">{sim.leverage}x</span>
                          {sim.confidence && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              sim.confidence >= 80 ? "bg-green-500/15 text-green-400" :
                              sim.confidence >= 65 ? "bg-blue-500/15 text-blue-400" :
                              "bg-yellow-500/15 text-yellow-400"
                            }`}>
                              %{sim.confidence} guven
                            </span>
                          )}
                          <span className="text-xs text-slate-600">{sim.selection_mode === "ai" ? "AI" : "Manuel"}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Giris: ${sim.entry_price?.toFixed(4)} | TP: ${sim.tp_price?.toFixed(4)} ({sim.tp_pct}%) | SL: ${sim.sl_price?.toFixed(4)} ({sim.sl_pct}%)
                        </div>
                        {/* Gostergeler */}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {[
                            sim.rsi_14 && { label: `RSI:${sim.rsi_14.toFixed(0)}`, hot: sim.rsi_14 < 30 || sim.rsi_14 > 70 },
                            sim.adx && { label: `ADX:${sim.adx.toFixed(0)}`, hot: sim.adx > 25 },
                            sim.volume_ratio && { label: `Vol:${sim.volume_ratio.toFixed(1)}x`, hot: sim.volume_ratio > 2 },
                            sim.funding_rate != null && { label: `Fund:${sim.funding_rate.toFixed(3)}%`, hot: Math.abs(sim.funding_rate) > 0.03 },
                            sim.fear_greed != null && { label: `F&G:${sim.fear_greed}`, hot: sim.fear_greed < 25 || sim.fear_greed > 75 },
                            sim.atr_pct && { label: `ATR:${sim.atr_pct.toFixed(2)}%`, hot: sim.atr_pct > 1 },
                          ].filter(Boolean).map((tag: any, i) => (
                            <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${
                              tag.hot ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" : "bg-slate-900/50 text-slate-400"
                            }`}>
                              {tag.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      {!isOpen && sim.pnl_pct != null && (
                        <div className={`text-lg font-bold ${sim.pnl_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {sim.pnl_pct > 0 ? "+" : ""}{sim.pnl_pct.toFixed(2)}%
                        </div>
                      )}
                      {!isOpen && sim.pnl_usdt != null && (
                        <div className={`text-xs ${sim.pnl_usdt >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {sim.pnl_usdt > 0 ? "+" : ""}${sim.pnl_usdt.toFixed(1)}
                        </div>
                      )}
                      {isOpen && (
                        <div className="text-xs text-slate-400">
                          {sim.max_favorable_pct != null && (
                            <>
                              <span className="text-green-500">+{sim.max_favorable_pct.toFixed(2)}%</span>
                              {" / "}
                              <span className="text-red-500">-{(sim.max_adverse_pct || 0).toFixed(2)}%</span>
                            </>
                          )}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-600 mt-1">
                        {new Date(sim.created_at).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                      </div>
                      <div className="text-[10px] text-slate-700 mt-0.5">
                        {isExpanded ? "▲ Kapat" : "▼ Detay"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Genisletilmis AI Detay Paneli */}
                {isExpanded && (
                  <div className="border-t border-slate-700/50 bg-slate-900/40">
                    {/* AI Secim Gerekcelesi */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">🤖</span>
                        <h4 className="text-sm font-semibold text-purple-400">AI Karar Analizi</h4>
                      </div>

                      {/* Reason — ana gerekce */}
                      {sim.reason && (
                        <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
                          <div className="text-[10px] text-purple-400/70 uppercase tracking-wider mb-1">Secim Gerekcelsi</div>
                          <p className="text-sm text-slate-300 leading-relaxed">{sim.reason}</p>
                        </div>
                      )}

                      {/* AI Yaniti — tam detay */}
                      {aiLog?.ai_response && (
                        <>
                          {/* Piyasa Ozeti */}
                          {aiLog.ai_response.market_summary && (
                            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                              <div className="text-[10px] text-blue-400/70 uppercase tracking-wider mb-1">AI Piyasa Degerlendirmesi</div>
                              <p className="text-sm text-slate-300 leading-relaxed">{aiLog.ai_response.market_summary}</p>
                            </div>
                          )}

                          {/* Tum AI Secimleri */}
                          {aiLog.ai_response.selections && aiLog.ai_response.selections.length > 0 && (
                            <div className="bg-slate-800/60 border border-slate-700/30 rounded-lg p-3">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">AI Tum Secimler (Bu Turda)</div>
                              <div className="space-y-2">
                                {aiLog.ai_response.selections.map((sel: any, idx: number) => (
                                  <div key={idx} className={`flex items-center gap-3 text-xs p-2 rounded ${
                                    sel.coin === sim.coin ? "bg-purple-500/10 border border-purple-500/20" : "bg-slate-800/40"
                                  }`}>
                                    <span className={`font-bold ${sel.direction === "long" ? "text-green-400" : "text-red-400"}`}>
                                      {sel.coin}
                                    </span>
                                    <span className={`px-1 py-0.5 rounded text-[10px] ${
                                      sel.direction === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                    }`}>
                                      {sel.direction?.toUpperCase()}
                                    </span>
                                    <span className="text-blue-400">%{sel.confidence}</span>
                                    <span className="text-slate-500">{sel.leverage_suggestion}x</span>
                                    <span className="text-slate-400 flex-1 truncate">{sel.entry_reason}</span>
                                    {sel.coin === sim.coin && <span className="text-purple-400 text-[10px]">← Bu islem</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Model bilgisi */}
                          <div className="flex items-center gap-4 text-[10px] text-slate-600">
                            {aiLog.model && <span>Model: {aiLog.model}</span>}
                            <span>Mod: {sim.selection_mode === "ai" ? "AI" : "Manuel"}</span>
                          </div>
                        </>
                      )}

                      {/* AI log yoksa sadece reason goster */}
                      {!aiLog && !sim.reason && (
                        <div className="text-xs text-slate-500 italic">AI log verisi mevcut degil</div>
                      )}

                      {/* AI Review (kapanmis islemler icin) */}
                      {sim.ai_review && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                          <div className="text-[10px] text-amber-400/70 uppercase tracking-wider mb-1">AI Sonuc Degerlendirmesi</div>
                          <p className="text-sm text-slate-300 leading-relaxed">{sim.ai_review}</p>
                        </div>
                      )}

                      {/* Detayli Gostergeler */}
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 pt-2 border-t border-slate-700/30">
                        {[
                          { label: "RSI", value: sim.rsi_14?.toFixed(1), warn: sim.rsi_14 && (sim.rsi_14 < 30 || sim.rsi_14 > 70) },
                          { label: "ADX", value: sim.adx?.toFixed(1), warn: sim.adx && sim.adx > 25 },
                          { label: "Volume", value: sim.volume_ratio ? `${sim.volume_ratio.toFixed(1)}x` : null, warn: sim.volume_ratio && sim.volume_ratio > 2 },
                          { label: "ATR%", value: sim.atr_pct?.toFixed(2), warn: sim.atr_pct && sim.atr_pct > 1 },
                          { label: "Funding", value: sim.funding_rate != null ? `${sim.funding_rate.toFixed(4)}%` : null },
                          { label: "F&G", value: sim.fear_greed },
                        ].map((ind, i) => ind.value != null && (
                          <div key={i} className="text-center">
                            <div className="text-[10px] text-slate-500">{ind.label}</div>
                            <div className={`text-xs font-medium ${ind.warn ? "text-amber-400" : "text-slate-300"}`}>{ind.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Simulator Status */}
      {simStatus.ts && (
        <div className="text-xs text-slate-600 text-center space-y-0.5">
          <div>
            Son tarama: {new Date(simStatus.ts).toLocaleString("tr-TR")}
            {simStatus.coins_total && ` | ${simStatus.coins_total} coin tarandı`}
            {simStatus.selections_count != null && ` | ${simStatus.selections_count} secim`}
          </div>
          {simStatus.past_stats?.total > 0 && (
            <div>
              Gecmis: {simStatus.past_stats.total} islem | %{simStatus.past_stats.win_rate} basari
            </div>
          )}
          {simStatus.error && (
            <div className="text-red-400">Hata: {simStatus.error}</div>
          )}
        </div>
      )}
    </div>
  )
}
