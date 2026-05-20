"use client"

import { useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"

const fetcher = (path: string) => api.get(path)

export default function SimulationsPage() {
  const [tab, setTab] = useState<"open" | "closed" | "stats">("open")
  const [statusFilter, setStatusFilter] = useState<string>("")

  // Veri çek
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
      {stats.direction_stats && (
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(stats.direction_stats as Record<string, any>).map(([dir, s]: [string, any]) => (
            <div key={dir} className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">
                  {dir === "long" ? "Long" : "Short"}
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
          { id: "stats", label: "Ayarlar" },
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
      {tab === "stats" && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-medium text-white">Simulasyon Ayarlari</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { key: "mode", label: "Mod", type: "select", options: [["ai","AI (Claude)"],["manual","Manuel"]] },
              { key: "leverage", label: "Kaldirac", type: "number", min: 1, max: 500 },
              { key: "tp_pct", label: "TP %", type: "number", min: 0.1, max: 50, step: 0.1 },
              { key: "sl_pct", label: "SL %", type: "number", min: 0.1, max: 50, step: 0.1 },
              { key: "interval", label: "Aralık (sn)", type: "number", min: 60, max: 3600 },
              { key: "min_confidence", label: "Min Guven", type: "number", min: 0, max: 100 },
              { key: "max_open", label: "Max Acik", type: "number", min: 1, max: 20 },
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
      {tab !== "stats" && (
        <div className="space-y-2">
          {items.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              {tab === "open" ? "Acik simulasyon yok — sistem otomatik tarayacak" : "Henuz kapanmis simulasyon yok"}
            </div>
          )}
          {items.map((sim: any) => {
            const isLong = sim.direction === "long"
            const isOpen = sim.status === "open"
            const isWin = sim.status === "win"
            const emoji = isOpen ? (isLong ? "🟢" : "🔴") : isWin ? "✅" : sim.status === "expired" ? "⏰" : "❌"

            return (
              <div key={sim.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{emoji}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{sim.coin}</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        }`}>
                          {sim.direction.toUpperCase()}
                        </span>
                        <span className="text-xs text-slate-500">{sim.leverage}x</span>
                        {sim.confidence && (
                          <span className="text-xs text-blue-400">%{sim.confidence} guven</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Giris: ${sim.entry_price?.toFixed(4)} | TP: ${sim.tp_price?.toFixed(4)} | SL: ${sim.sl_price?.toFixed(4)}
                      </div>
                      {sim.reason && (
                        <div className="text-xs text-slate-500 mt-0.5 max-w-md truncate">{sim.reason}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
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
                    {isOpen && sim.max_favorable_pct != null && (
                      <div className="text-xs text-slate-400">
                        <span className="text-green-500">+{sim.max_favorable_pct.toFixed(2)}%</span>
                        {" / "}
                        <span className="text-red-500">-{(sim.max_adverse_pct || 0).toFixed(2)}%</span>
                      </div>
                    )}
                    <div className="text-[10px] text-slate-600 mt-1">
                      {new Date(sim.created_at).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                    </div>
                  </div>
                </div>
                {/* Gostergeler */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {[
                    sim.rsi_14 && `RSI:${sim.rsi_14.toFixed(0)}`,
                    sim.adx && `ADX:${sim.adx.toFixed(0)}`,
                    sim.volume_ratio && `Vol:${sim.volume_ratio.toFixed(1)}x`,
                    sim.funding_rate != null && `Fund:${sim.funding_rate.toFixed(3)}%`,
                    sim.fear_greed != null && `F&G:${sim.fear_greed}`,
                    sim.atr_pct && `ATR:${sim.atr_pct.toFixed(2)}%`,
                  ].filter(Boolean).map((tag, i) => (
                    <span key={i} className="text-[10px] bg-slate-900/50 text-slate-400 px-1.5 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Simulator Status */}
      {simStatus.ts && (
        <div className="text-xs text-slate-600 text-center">
          Son tarama: {new Date(simStatus.ts).toLocaleString("tr-TR")}
          {simStatus.past_stats && ` | Toplam: ${simStatus.past_stats.total} islem, %${simStatus.past_stats.win_rate} basari`}
        </div>
      )}
    </div>
  )
}
