"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"

const fetcher = (path: string) => api.get(path)

// ─────── Trade Satırı (DataTable) ───────
function TradeRow({ t }: { t: any }) {
  const isProfit = (t.pnl || 0) > 0
  const isOpen   = t.status === "open"

  const PnlBadge = () => {
    if (t.pnl == null) return <span className="pnl-neu">—</span>
    if (isOpen)        return <span className="pnl-neu">Açık</span>
    return (
      <span className={isProfit ? "pnl-up" : "pnl-down"}>
        {isProfit ? "+" : ""}${t.pnl.toFixed(2)}
        {t.pnl_pct != null && (
          <span className="ml-1 opacity-70">({t.pnl_pct > 0 ? "+" : ""}{t.pnl_pct.toFixed(1)}%)</span>
        )}
      </span>
    )
  }

  return (
    <tr className="border-b border-slate-800/30 hover:bg-blue-500/[0.03] transition-colors">
      {/* Sembol */}
      <td className="px-3 py-2.5">
        <div>
          <span className="text-sm font-semibold text-white">{t.symbol?.replace("/USDT:USDT","").replace("/USDT","")}</span>
          <span className="text-slate-600 text-xs">/USDT</span>
          {t.paper && <span className="badge badge-paper ml-2 text-[9px]">PAPER</span>}
        </div>
        {t.leverage_used && (
          <span className="text-[10px] text-amber-400 font-mono">{t.leverage_used}× kaldıraç</span>
        )}
      </td>
      {/* Yön */}
      <td className="px-3 py-2.5">
        <span className={t.side === "buy" ? "badge badge-buy" : "badge badge-sell"}>
          {t.side === "buy" ? "▲" : "▼"} {t.side?.toUpperCase()}
        </span>
      </td>
      {/* Durum */}
      <td className="px-3 py-2.5">
        {isOpen ? (
          <span className="badge badge-open">
            <span className="badge-dot badge-dot-blue pulse-dot" />
            Açık
          </span>
        ) : t.status === "cancelled" ? (
          <span className="badge badge-closed">
            <span className="badge-dot badge-dot-gray" />
            İptal
          </span>
        ) : (
          <span className="badge badge-closed">
            <span className="badge-dot badge-dot-gray" />
            Kapandı
          </span>
        )}
      </td>
      {/* Giriş */}
      <td className="px-3 py-2.5">
        <span className="mono-val text-white">${t.entry_price?.toFixed(2)}</span>
      </td>
      {/* Çıkış */}
      <td className="px-3 py-2.5">
        <span className="mono-val text-slate-400">{t.exit_price ? `$${t.exit_price.toFixed(2)}` : "—"}</span>
      </td>
      {/* PnL */}
      <td className="px-3 py-2.5"><PnlBadge /></td>
      {/* Çıkış sbb */}
      <td className="px-3 py-2.5">
        {t.exit_reason === "tp" && <span className="badge badge-tp">✓ TP</span>}
        {t.exit_reason === "sl" && <span className="badge badge-sl">✕ SL</span>}
        {!t.exit_reason && <span className="text-slate-600 text-xs">—</span>}
      </td>
      {/* Süre */}
      <td className="px-3 py-2.5">
        <span className="text-xs text-slate-500">
          {t.duration_minutes ? `${t.duration_minutes}dk` : "—"}
        </span>
      </td>
      {/* Tarih */}
      <td className="px-3 py-2.5">
        <span className="text-[10px] text-slate-600 mono-val">
          {t.opened_at ? new Date(t.opened_at).toLocaleString("tr-TR", { day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—"}
        </span>
      </td>
    </tr>
  )
}

// ─────── Bot Kart ───────
function BotCard({ bot, isSelected, onSelect }: { bot: any; isSelected: boolean; onSelect: () => void }) {
  const isProfit = (bot.total_pnl || 0) > 0

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        isSelected
          ? "border-blue-500/50 bg-blue-500/8 shadow-sm shadow-blue-500/10"
          : "border-slate-800/60 bg-slate-900/40 hover:border-slate-700/70 hover:bg-slate-800/30"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-white truncate">{bot.bot_name}</span>
        <span className={`badge text-[9px] ${
          bot.status === "running" ? "badge-running" :
          bot.status === "error"   ? "badge-error"   : "badge-stopped"
        }`}>
          {bot.status === "running" && <span className="badge-dot badge-dot-green pulse-dot" />}
          {bot.status === "running" ? "Aktif" : bot.status === "error" ? "Hata" : "Durdu"}
        </span>
      </div>
      <div className="text-[11px] text-slate-500 mb-2">{bot.symbol?.replace(":USDT","").replace("/USDT","")}/USDT · {bot.strategy}</div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          { l: "İşlem", v: bot.trade_count, c: "text-white" },
          { l: "Kazanma", v: `%${bot.win_rate}`, c: "text-blue-400" },
          { l: "PnL", v: `$${bot.total_pnl?.toFixed(2)}`, c: isProfit ? "text-emerald-400" : bot.total_pnl < 0 ? "text-red-400" : "text-slate-400" },
        ].map(item => (
          <div key={item.l} className="bg-slate-800/40 rounded-lg py-1.5">
            <div className="text-[9px] text-slate-600 uppercase tracking-wide">{item.l}</div>
            <div className={`text-xs font-bold mono-val ${item.c}`}>{item.v}</div>
          </div>
        ))}
      </div>
    </button>
  )
}

export default function TradesPage() {
  const [selectedBot, setSelectedBot] = useState<number | null>(null)
  const [deleting,   setDeleting]   = useState(false)
  const [analyzing,  setAnalyzing]  = useState(false)
  const [analysis,   setAnalysis]   = useState<string | null>(null)
  const [sideFilter, setSideFilter] = useState<"" | "buy" | "sell">("")
  const [search,     setSearch]     = useState("")

  const { data: botsData,   mutate: mutateBots } = useSWR("/trades/bots-summary", fetcher, { refreshInterval: 30000 })
  const { data: tradesData, mutate: mutateTrades, isLoading: tradesLoading } = useSWR(
    selectedBot != null ? `/trades/bot/${selectedBot}?limit=200` : null,
    fetcher, { refreshInterval: 30000 }
  )

  const bots   = botsData?.bots  || []
  const trades = (tradesData?.trades || []).filter((t: any) => {
    if (sideFilter && t.side !== sideFilter) return false
    if (search && !t.symbol?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleDelete = useCallback(async () => {
    if (selectedBot == null) return
    const botName = bots.find((b: any) => b.bot_id === selectedBot)?.bot_name || `#${selectedBot}`
    if (!confirm(`"${botName}" botunun tüm işlem kayıtlarını silmek istiyor musunuz?`)) return
    setDeleting(true)
    try { await api.delete(`/trades/bot/${selectedBot}`); mutateTrades(); mutateBots() }
    catch (e: any) { alert(e.message || "Silme hatası") }
    finally { setDeleting(false) }
  }, [selectedBot, bots, mutateTrades, mutateBots])

  const handleAiAnalysis = useCallback(async () => {
    if (selectedBot == null) return
    setAnalyzing(true); setAnalysis(null)
    try { const res = await api.get(`/trades/bot/${selectedBot}/ai-analysis`); setAnalysis(res.analysis) }
    catch (e: any) { setAnalysis(`Analiz hatası: ${e.message}`) }
    finally { setAnalyzing(false) }
  }, [selectedBot])

  // Toplamlar
  const totalTrades  = bots.reduce((s: number, b: any) => s + b.trade_count, 0)
  const totalPnl     = bots.reduce((s: number, b: any) => s + (b.total_pnl || 0), 0)
  const totalWins    = bots.reduce((s: number, b: any) => s + (b.wins || 0), 0)
  const totalClosed  = bots.reduce((s: number, b: any) => s + (b.closed_count || 0), 0)
  const winRate      = totalClosed > 0 ? (totalWins / totalClosed * 100).toFixed(1) : "0"
  const activeBots   = bots.filter((b: any) => b.status === "running").length

  const stats = [
    { icon: "📊", label: "Toplam İşlem", value: totalTrades, color: "text-white",       delta: null },
    { icon: "💰", label: "Toplam PnL",   value: `$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? "text-emerald-400" : "text-red-400", delta: totalPnl >= 0 ? "up" : "down" },
    { icon: "🎯", label: "Başarı Oranı", value: `%${winRate}`, color: "text-blue-400",  delta: "up" },
    { icon: "🤖", label: "Aktif Bot",    value: activeBots,   color: "text-amber-400",  delta: "neu" },
  ]

  return (
    <div className="page-container min-h-screen">
      {/* Header */}
      <div className="section-header mb-6">
        <div className="section-header-icon">📋</div>
        <div>
          <h1 className="section-title">Bot İşlem Kayıtları</h1>
          <p className="section-subtitle">Her botun trade geçmişi, analizi ve istatistikleri</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="stat-card fade-in-up">
            <div className="stat-card-icon">{s.icon}</div>
            <div className="stat-card-label">{s.label}</div>
            <div className={`stat-card-value ${s.color}`}>{s.value}</div>
            {s.delta === "up"  && <div className="stat-card-delta stat-card-delta-up">↑  Güncelleniyor</div>}
            {s.delta === "down"&& <div className="stat-card-delta stat-card-delta-down">↓ Dikkat</div>}
            {s.delta === "neu" && <div className="stat-card-delta stat-card-delta-neu">● Canlı</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sol — Bot Listesi */}
        <div className="lg:col-span-1 space-y-2">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Botlar ({bots.length})</h2>

          <button
            onClick={() => { setSelectedBot(null); setAnalysis(null) }}
            className={`w-full text-left p-3 rounded-xl border transition-all ${
              selectedBot === null
                ? "border-blue-500/50 bg-blue-500/8 shadow-sm shadow-blue-500/10"
                : "border-slate-800/60 bg-slate-900/40 hover:border-slate-700/70"
            }`}
          >
            <div className="text-sm font-semibold text-white">Tüm Botlar</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{totalTrades} işlem · ${totalPnl.toFixed(2)} PnL</div>
          </button>

          {bots.map((bot: any) => (
            <BotCard
              key={bot.bot_id} bot={bot}
              isSelected={selectedBot === bot.bot_id}
              onSelect={() => { setSelectedBot(bot.bot_id); setAnalysis(null) }}
            />
          ))}

          {bots.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🤖</div>
              <div className="empty-state-title">Henüz bot yok</div>
            </div>
          )}
        </div>

        {/* Sağ — Trade Listesi */}
        <div className="lg:col-span-3">
          {selectedBot != null && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <h2 className="text-sm font-semibold text-white flex-1">
                {bots.find((b: any) => b.bot_id === selectedBot)?.bot_name || `Bot #${selectedBot}`}
                <span className="text-slate-500 font-normal ml-2">({tradesData?.total || 0} işlem)</span>
              </h2>
              <button onClick={handleAiAnalysis} disabled={analyzing}
                className="text-xs px-3 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/35 disabled:opacity-50 transition-all">
                {analyzing ? "Analiz ediliyor..." : "🤖 AI Analiz"}
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-600/15 border border-red-500/25 text-red-400 hover:bg-red-600/30 disabled:opacity-50 transition-all">
                {deleting ? "Siliniyor..." : "🗑 Kayıtları Sil"}
              </button>
            </div>
          )}

          {!selectedBot && (
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
              Özet — Tüm Botlar
            </h2>
          )}

          {/* AI Analiz Sonucu */}
          {analysis && (
            <div className="glass-card p-4 mb-4 border-violet-500/20 fade-in-up">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-violet-400 font-semibold text-sm">🤖 AI Analiz Raporu</span>
                <button onClick={() => setAnalysis(null)} className="text-slate-500 hover:text-white ml-auto text-xs">× Kapat</button>
              </div>
              <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{analysis}</div>
            </div>
          )}

          {/* Trade DataTable */}
          {selectedBot != null ? (
            tradesLoading ? (
              <div className="empty-state">
                <div className="spinner mb-4" />
                <div className="empty-state-title">Yükleniyor...</div>
              </div>
            ) : (tradesData?.trades || []).length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <div className="empty-state-title">Bu botta henüz işlem yok</div>
              </div>
            ) : (
              <div className="dt-wrapper fade-in-up">
                {/* Toolbar */}
                <div className="dt-toolbar flex-wrap gap-2">
                  <input
                    className="dt-search"
                    placeholder="🔍  Sembol ara..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  <div className="flex gap-1.5">
                    {(["", "buy", "sell"] as const).map(f => (
                      <button key={f} onClick={() => setSideFilter(f)}
                        className={`filter-pill ${sideFilter === f ? (f === "buy" ? "active-green" : f === "sell" ? "active-red" : "active-all") : ""}`}>
                        {f === "" ? "Tümü" : f === "buy" ? "▲ BUY" : "▼ SELL"}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-600 ml-auto">{trades.length} kayıt</span>
                </div>
                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="dt-table">
                    <thead>
                      <tr>
                        <th>Sembol</th>
                        <th>Yön</th>
                        <th>Durum</th>
                        <th>Giriş</th>
                        <th>Çıkış</th>
                        <th>PnL</th>
                        <th>Çıkış Sbb.</th>
                        <th>Süre</th>
                        <th>Tarih</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t: any) => <TradeRow key={t.id} t={t} />)}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : (
            /* Tüm botlar özet */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {bots.map((bot: any) => {
                const p = bot.total_pnl || 0
                return (
                  <div key={bot.bot_id} className="glass-card p-4 fade-in-up">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-white text-sm">{bot.bot_name}</span>
                      <span className={`badge text-[9px] ${
                        bot.status === "running" ? "badge-running" :
                        bot.status === "error"   ? "badge-error"   : "badge-stopped"
                      }`}>
                        {bot.status === "running" && <span className="badge-dot badge-dot-green pulse-dot" />}
                        {bot.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mb-3">{bot.symbol?.replace(":USDT","").replace("/USDT","")}/USDT · {bot.strategy}</div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { l: "Trade",   v: bot.trade_count, c: "text-white" },
                        { l: "W/L",     v: `${bot.wins}/${bot.losses}`, c: "text-white" },
                        { l: "Başarı",  v: `%${bot.win_rate}`, c: "text-blue-400" },
                        { l: "PnL",     v: `$${p.toFixed(2)}`, c: p >= 0 ? "text-emerald-400" : "text-red-400" },
                      ].map(item => (
                        <div key={item.l} className="bg-slate-800/40 rounded-lg py-2">
                          <div className="text-[9px] text-slate-600 uppercase tracking-wide">{item.l}</div>
                          <div className={`text-xs font-bold mono-val ${item.c}`}>{item.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
