"use client"

import { useEffect, useState } from "react"
import { createBotWS, api } from "@/lib/api"
import clsx from "clsx"

interface Bot {
  id: number
  name: string
  symbol: string
  strategy: string
  paper_mode: boolean
  running: boolean
  exchange?: string
  initial_balance?: number
  params?: Record<string, any> | null
}

interface Position {
  side: string
  size: number
  entry_price: number
  notional: number
  pnl_usdt: number
  pnl_pct: number
  leverage: number
}

interface BotStatus {
  signal: string | null
  price: number
  risk: {
    balance: number
    daily_pnl: number
    daily_pnl_pct: number
    killed: boolean
  }
  position?: Position | null
  last_reject?: { reason: string; analysis?: string; ts: string } | null
  last_error?: string | null
}

interface Filters {
  smart_hours_enabled: boolean
  news_protection_enabled: boolean
  self_learning_enabled: boolean
  trend_filter_enabled: boolean
  volatility_filter_enabled: boolean
}

const FILTER_DEFS = [
  { key: "smart_hours_enabled",      label: "Akilli Saat Filtresi",  icon: "clock" },
  { key: "news_protection_enabled",  label: "Haber Korumasi",        icon: "shield" },
  { key: "self_learning_enabled",    label: "Oz-Ogrenme Modu",       icon: "brain" },
  { key: "trend_filter_enabled",     label: "Trend Filtresi (EMA200)", icon: "trend" },
  { key: "volatility_filter_enabled", label: "Volatilite Limiti",    icon: "zap" },
] as const

// "BTC/USDT:USDT" → "BTCUSDT.P"
function fmtSymbol(s: string) {
  return s.replace("/USDT:USDT", "USDT.P").replace("/", "")
}

function fmtDuration(start: string | null, end: string | null): string {
  if (!start) return ""
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const diff = Math.round((e - s) / 60000)
  if (diff < 1) return "<1dk"
  if (diff < 60) return `${diff}dk`
  const h = Math.floor(diff / 60)
  const m = diff % 60
  return m > 0 ? `${h}s ${m}dk` : `${h}s`
}

function fmtPrice(p: number | null | undefined): string {
  if (p == null) return "—"
  return `$${p.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`
}

function FilterIcon({ type }: { type: string }) {
  const cls = "w-3 h-3"
  switch (type) {
    case "clock":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
    case "shield":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    case "brain":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z"/><path d="M9 21h6M10 17v4M14 17v4"/></svg>
    case "trend":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
    case "zap":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    default:
      return null
  }
}

export default function BotCard({
  bot,
  onEdit,
  onDelete,
}: {
  bot: Bot
  onEdit?: () => void
  onDelete?: () => void
}) {
  const [status,  setStatus]  = useState<BotStatus | null>(null)
  const [running, setRunning] = useState(bot.running)
  const [loading, setLoading] = useState(false)
  const [exchBalance, setExchBalance] = useState<number | null>(null)
  const [filters, setFilters] = useState<Filters>({
    smart_hours_enabled: false,
    news_protection_enabled: false,
    self_learning_enabled: false,
    trend_filter_enabled: false,
    volatility_filter_enabled: false,
  })
  const [showFilters, setShowFilters] = useState(false)
  const [showTrades, setShowTrades] = useState(false)
  const [filterStats, setFilterStats] = useState<Record<string, any>>({})
  const [showPerf, setShowPerf] = useState(false)
  const [perf, setPerf] = useState<{
    total_signals: number
    open: number
    tp_hit: number
    sl_hit: number
    expired: number
    win_rate: number
    avg_pnl_pct: number
    total_pnl_pct: number
    trades?: {
      total: number
      open: number
      closed: number
      winning: number
      losing: number
      win_rate: number
      total_pnl: number
      total_pnl_pct: number
    }
    trade_history?: Array<{
      id: number
      side: string
      entry_price: number
      exit_price: number | null
      quantity: number
      pnl: number | null
      pnl_pct: number | null
      status: string
      exit_reason: string | null
      leverage: number | null
      duration_min: number | null
      opened_at: string | null
      closed_at: string | null
    }>
    last_signals: Array<{
      id: number
      signal_type: string
      price: number
      tp_price: number | null
      sl_price: number | null
      outcome: string
      outcome_price: number | null
      outcome_pnl_pct: number | null
      outcome_at: string | null
      created_at: string | null
    }>
  } | null>(null)

  const [livePos, setLivePos] = useState<{ price: number; position: Position | null } | null>(null)

  // Canlı pozisyon & fiyat bilgisi (engine status yoksa bile çalışır)
  useEffect(() => {
    if (!running) { setLivePos(null); return }
    let cancelled = false
    const fetch = () => {
      api.get(`/bots/${bot.id}/position`)
        .then((data: any) => { if (!cancelled && data && !data.error) setLivePos(data) })
        .catch(() => {})
    }
    fetch()
    const iv = setInterval(fetch, 30_000)
    return () => { cancelled = true; clearInterval(iv) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id, running])

  // Sinyal performansını çek
  useEffect(() => {
    api.get(`/bots/${bot.id}/performance`)
      .then((data: any) => { if (data && !data.error) setPerf(data) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id])

  useEffect(() => {
    if (!running) { setStatus(null); return }
    let ws: WebSocket | null = null
    try {
      ws = createBotWS(bot.id, (data) => setStatus(data as BotStatus))
      ws.onerror = () => {}
      ws.onclose = () => {}
    } catch { /* WS bağlantı hatası — sessizce geç */ }
    return () => { try { ws?.close() } catch {} }
  }, [bot.id, running])

  // Borsa bakiyesini çek (mount'ta bir kez)
  useEffect(() => {
    if (!bot.exchange) return
    let cancelled = false
    api.get(`/exchanges/${bot.exchange}/balance`)
      .then((data: any) => {
        if (cancelled) return
        const usdt = data?.total ?? data?.free ?? null
        if (usdt != null) setExchBalance(Number(usdt))
      })
      .catch(() => {})
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id])

  // Filtreleri çek
  useEffect(() => {
    api.get(`/bots/${bot.id}/filters`)
      .then((data: any) => {
        if (data && !data.error) {
          setFilters({
            smart_hours_enabled: data.smart_hours_enabled ?? false,
            news_protection_enabled: data.news_protection_enabled ?? false,
            self_learning_enabled: data.self_learning_enabled ?? false,
            trend_filter_enabled: data.trend_filter_enabled ?? false,
            volatility_filter_enabled: data.volatility_filter_enabled ?? false,
          })
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.id])

  // Filtre istatistiklerini çek (panel açıldığında)
  useEffect(() => {
    if (!showFilters) return
    api.get(`/analytics/filter-stats?bot_id=${bot.id}`)
      .then((data: any) => {
        if (data?.filter_stats) {
          const map: Record<string, any> = {}
          for (const fs of data.filter_stats) {
            map[fs.field] = fs
          }
          setFilterStats(map)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFilters, bot.id])

  const toggle = async () => {
    setLoading(true)
    try {
      const action = running ? "stop" : "start"
      await api.post(`/bots/${bot.id}/${action}`, {})
      if (running) setStatus(null)
      setRunning(r => !r)
    } finally { setLoading(false) }
  }

  const toggleFilter = async (key: string) => {
    const newVal = !filters[key as keyof Filters]
    setFilters(prev => ({ ...prev, [key]: newVal }))
    try {
      await api.post(`/bots/${bot.id}/filters`, { [key]: newVal })
    } catch {
      // Geri al
      setFilters(prev => ({ ...prev, [key]: !newVal }))
    }
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  const pnlPct  = status?.risk?.daily_pnl_pct ?? 0
  const pnlUsdt = status?.risk?.daily_pnl ?? 0
  const pnlColor = pnlPct >= 0 ? "text-green-400" : "text-red-400"

  // Engine status veya livePos'tan pozisyon bilgisi
  const activePos = status?.position ?? livePos?.position ?? null
  const livePrice = status?.price ?? livePos?.price ?? null

  return (
    <div className={clsx(
      "rounded-xl border p-4 space-y-3 transition-all duration-300",
      running
        ? "border-green-500/30 bg-[#0d1117] shadow-[0_0_15px_rgba(34,197,94,0.08)]"
        : "border-slate-800 bg-[#0d1117]/70 opacity-75"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-white truncate">{bot.name}</h3>
            {(() => {
              const sm = bot.params?.signal_mode
              if (sm === "buy_only") return (
                <span className="text-[10px] bg-green-500/15 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded font-bold shrink-0">LONG</span>
              )
              if (sm === "sell_only") return (
                <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-bold shrink-0">SHORT</span>
              )
              if (sm === "normal" || sm === "both" || sm == null) return null
              return null
            })()}
            {bot.paper_mode && (
              <span className="text-[10px] bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 px-1.5 py-0.5 rounded shrink-0">
                Paper
              </span>
            )}
            {running && (
              <span className="flex items-center gap-1 text-[10px] text-green-400 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Calisiyor
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            <span className="text-slate-400 font-medium">{fmtSymbol(bot.symbol)}</span>
            <span className="mx-1">&middot;</span>
            {bot.strategy}
            {bot.exchange && (
              <>
                <span className="mx-1">&middot;</span>
                <span className="text-slate-400">{bot.exchange.toUpperCase()}</span>
              </>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
              title="Duzenle"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Sil"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          {/* Toggle Switch */}
          <button
            onClick={toggle}
            disabled={loading}
            title={running ? "Durdur" : "Baslat"}
            className="relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 focus:outline-none disabled:opacity-50"
            style={{ backgroundColor: running ? "#22c55e" : "#334155" }}
          >
            <span
              className={clsx(
                "inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform duration-300",
                running ? "translate-x-6" : "translate-x-1"
              )}
            />
            {loading && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-3 h-3 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Stats */}
      {(() => {
        const exchLabel = bot.exchange ? bot.exchange.toUpperCase() : ""
        const balanceVal = status?.risk?.balance
          ? `$${status.risk.balance.toLocaleString("tr-TR", {maximumFractionDigits: 0})}`
          : exchBalance != null
            ? `$${exchBalance.toLocaleString("tr-TR", {maximumFractionDigits: 2})}`
            : bot.initial_balance
              ? `$${bot.initial_balance.toLocaleString()}`
              : "—"

        const priceDisplay = status?.price ?? livePrice
        const hasPnl = status?.risk != null

        return (
          <div className="grid grid-cols-3 gap-2">
            {/* Fiyat */}
            <div className={clsx(
              "rounded-lg p-2 border",
              priceDisplay
                ? "bg-slate-900/80 border-slate-700/60"
                : "bg-slate-900/30 border-slate-800 opacity-40"
            )}>
              <div className="flex items-center gap-1 mb-0.5">
                <svg className="w-2.5 h-2.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <p className="text-[10px] text-slate-500">Fiyat</p>
              </div>
              <p className="text-sm font-bold text-white tabular-nums">
                {priceDisplay ? `$${priceDisplay.toLocaleString("tr-TR", {maximumFractionDigits: 2})}` : "—"}
              </p>
            </div>

            {/* PnL — günlük + pozisyon aynı anda göster */}
            {(hasPnl || activePos) ? (
              <div className={clsx(
                "rounded-lg p-2 border",
                (hasPnl ? pnlUsdt : (activePos?.pnl_usdt ?? 0)) >= 0
                  ? "bg-green-500/5 border-green-500/20"
                  : "bg-red-500/5 border-red-500/20"
              )}>
                <div className="flex items-center gap-1 mb-0.5">
                  <svg className="w-2.5 h-2.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[10px] text-slate-500">PnL</p>
                </div>
                {hasPnl && (
                  <div>
                    <p className={clsx("text-[10px] text-slate-500")}>Günlük</p>
                    <p className={clsx("text-sm font-bold tabular-nums", pnlColor)}>
                      {pnlUsdt >= 0 ? "+" : ""}{pnlUsdt.toFixed(2)}$
                    </p>
                    <p className={clsx("text-[10px] tabular-nums", pnlColor)}>
                      {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                    </p>
                  </div>
                )}
                {activePos && (
                  <div className={clsx(hasPnl && "mt-1 pt-1 border-t border-white/5")}>
                    {hasPnl && <p className="text-[10px] text-slate-500">Pozisyon</p>}
                    <p className={clsx("text-sm font-bold tabular-nums", activePos.pnl_usdt >= 0 ? "text-green-400" : "text-red-400")}>
                      {activePos.pnl_usdt >= 0 ? "+" : ""}{activePos.pnl_usdt.toFixed(2)}$
                    </p>
                    <p className={clsx("text-[10px] tabular-nums", activePos.pnl_pct >= 0 ? "text-green-400" : "text-red-400")}>
                      {activePos.pnl_pct >= 0 ? "+" : ""}{activePos.pnl_pct.toFixed(2)}%
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900/30 rounded-lg p-2 border border-slate-800 opacity-40">
                <div className="flex items-center gap-1 mb-0.5">
                  <svg className="w-2.5 h-2.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-[10px] text-slate-500">PnL</p>
                </div>
                <p className="text-sm font-bold text-white">—</p>
              </div>
            )}

            {/* Bakiye */}
            <div className="bg-slate-900/80 rounded-lg p-2 border border-slate-700/60">
              <div className="flex items-center gap-1 mb-0.5">
                <svg className="w-2.5 h-2.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <p className="text-[10px] text-slate-500">Bakiye{exchLabel ? ` (${exchLabel})` : ""}</p>
              </div>
              <p className="text-sm font-bold text-white tabular-nums">{balanceVal}</p>
            </div>
          </div>
        )
      })()}

      {/* Açık Pozisyon */}
      {activePos && (
        <div className={clsx(
          "rounded-lg border p-2.5 space-y-1.5",
          activePos.side === "long"
            ? "bg-green-500/5 border-green-500/20"
            : "bg-red-500/5 border-red-500/20"
        )}>
          <div className="flex items-center justify-between">
            <span className={clsx(
              "text-xs font-bold px-2 py-0.5 rounded",
              activePos.side === "long"
                ? "bg-green-500/15 text-green-400"
                : "bg-red-500/15 text-red-400"
            )}>
              {activePos.side === "long" ? "LONG" : "SHORT"} {activePos.leverage}x
            </span>
            <span className={clsx(
              "text-sm font-bold",
              activePos.pnl_usdt >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {activePos.pnl_usdt >= 0 ? "+" : ""}{activePos.pnl_usdt.toFixed(2)} USDT
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <span className="text-slate-500">Giris</span>
              <p className="text-slate-300 font-medium">${activePos.entry_price.toLocaleString("tr-TR", {maximumFractionDigits: 2})}</p>
            </div>
            <div>
              <span className="text-slate-500">Miktar</span>
              <p className="text-slate-300 font-medium">${activePos.notional.toLocaleString("tr-TR", {maximumFractionDigits: 2})}</p>
            </div>
            <div>
              <span className="text-slate-500">PnL %</span>
              <p className={clsx("font-medium", activePos.pnl_pct >= 0 ? "text-green-400" : "text-red-400")}>
                {activePos.pnl_pct >= 0 ? "+" : ""}{activePos.pnl_pct.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {status?.risk?.killed && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">
          Kill switch aktif — gunluk limit asildi
        </div>
      )}

      {status?.signal && (
        <div className={clsx(
          "text-xs rounded-lg px-2.5 py-1.5 border",
          status.signal === "buy"
            ? "text-green-400 bg-green-500/10 border-green-500/20"
            : "text-red-400 bg-red-500/10 border-red-500/20"
        )}>
          {status.signal === "buy" ? "AL sinyali tespit edildi" : "SAT sinyali tespit edildi"}
        </div>
      )}

      {/* Son sinyal red nedeni */}
      {status?.last_reject && (
        <div className="text-xs rounded-lg px-2.5 py-1.5 border border-yellow-500/30 bg-yellow-500/5 text-yellow-400/90">
          <span className="font-semibold">⚠ Sinyal Engellendi: </span>
          <span>{status.last_reject.reason}</span>
        </div>
      )}

      {/* Order / engine hatası */}
      {status?.last_error && (
        <div className="text-xs rounded-lg px-2.5 py-1.5 border border-red-500/30 bg-red-500/5 text-red-400/90 break-all">
          <span className="font-semibold">✗ Son Hata: </span>
          <span>{status.last_error.split(" | ").slice(1).join(" | ") || status.last_error}</span>
        </div>
      )}

      {/* Sinyal Performansı — her zaman göster */}
      {perf && (
        <div className="border-t border-slate-800 pt-2">
          <button
            onClick={() => setShowPerf(p => !p)}
            className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Sinyal Performansi
              {perf.total_signals > 0 ? (
                <span className={clsx(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                  perf.win_rate >= 50
                    ? "bg-green-500/20 text-green-400"
                    : perf.win_rate > 0
                      ? "bg-red-500/20 text-red-400"
                      : "bg-slate-700/50 text-slate-400"
                )}>
                  {perf.tp_hit + perf.sl_hit > 0 ? `%${perf.win_rate} basari` : `${perf.total_signals} sinyal`}
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-700/50 text-slate-500">
                  sinyal yok
                </span>
              )}
            </span>
            <svg
              className={clsx("w-3.5 h-3.5 transition-transform", showPerf && "rotate-180")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showPerf && (
            <div className="mt-2 space-y-2">
              {perf.total_signals === 0 ? (
                <p className="text-[10px] text-slate-500 text-center py-3">Henuz sinyal gelmedi. TradingView webhook aktif oldugunda sinyaller burada gorunecek.</p>
              ) : (
              <>
              {/* Özet istatistikler */}
              <div className="grid grid-cols-4 gap-1.5">
                <div className="bg-slate-900/60 rounded-lg p-1.5 text-center border border-slate-800">
                  <p className="text-[9px] text-slate-500">Toplam</p>
                  <p className="text-xs font-bold text-white">{perf.total_signals}</p>
                </div>
                <div className="bg-green-500/5 rounded-lg p-1.5 text-center border border-green-500/20">
                  <p className="text-[9px] text-green-400/70">TP</p>
                  <p className="text-xs font-bold text-green-400">{perf.tp_hit}</p>
                </div>
                <div className="bg-red-500/5 rounded-lg p-1.5 text-center border border-red-500/20">
                  <p className="text-[9px] text-red-400/70">SL</p>
                  <p className="text-xs font-bold text-red-400">{perf.sl_hit}</p>
                </div>
                <div className="bg-yellow-500/5 rounded-lg p-1.5 text-center border border-yellow-500/20">
                  <p className="text-[9px] text-yellow-400/70">Takipte</p>
                  <p className="text-xs font-bold text-yellow-400">{perf.open}</p>
                </div>
              </div>

              {/* Kâr/Zarar özeti */}
              {(perf.tp_hit + perf.sl_hit > 0) && (
                <div className="flex items-center justify-between bg-slate-900/60 rounded-lg p-2 border border-slate-800">
                  <div>
                    <p className="text-[9px] text-slate-500">Toplam PnL</p>
                    <p className={clsx("text-sm font-bold", perf.total_pnl_pct >= 0 ? "text-green-400" : "text-red-400")}>
                      {perf.total_pnl_pct >= 0 ? "+" : ""}{perf.total_pnl_pct}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-500">Ort. PnL</p>
                    <p className={clsx("text-sm font-bold", perf.avg_pnl_pct >= 0 ? "text-green-400" : "text-red-400")}>
                      {perf.avg_pnl_pct >= 0 ? "+" : ""}{perf.avg_pnl_pct}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-500">Basari</p>
                    <p className={clsx("text-sm font-bold", perf.win_rate >= 50 ? "text-green-400" : "text-red-400")}>
                      %{perf.win_rate}
                    </p>
                  </div>
                </div>
              )}

              {/* Son sinyaller */}
              {perf.last_signals.length > 0 && (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                  {perf.last_signals.map(s => {
                    const isLong = s.signal_type === "buy"
                    const outcomeColor =
                      s.outcome === "tp_hit" ? "text-green-400"
                      : s.outcome === "sl_hit" ? "text-red-400"
                      : s.outcome === "open" ? "text-yellow-400"
                      : "text-slate-500"
                    const borderColor =
                      s.outcome === "tp_hit" ? "border-green-500/20"
                      : s.outcome === "sl_hit" ? "border-red-500/20"
                      : s.outcome === "open" ? "border-yellow-500/20"
                      : "border-slate-800"
                    const bgColor =
                      s.outcome === "tp_hit" ? "bg-green-500/5"
                      : s.outcome === "sl_hit" ? "bg-red-500/5"
                      : s.outcome === "open" ? "bg-yellow-500/5"
                      : "bg-slate-900/40"
                    const outcomeLabel =
                      s.outcome === "tp_hit" ? "✓ TP Vurdu"
                      : s.outcome === "sl_hit" ? "✕ SL Vurdu"
                      : s.outcome === "open" ? "● Takipte"
                      : "○ Suresi doldu"
                    const dur = fmtDuration(s.created_at, s.outcome_at)
                    return (
                      <div key={s.id} className={clsx("rounded-lg border text-[10px]", bgColor, borderColor)}>
                        {/* Satır 1: yön + giriş + TP/SL hedefleri */}
                        <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 border-b border-white/5 flex-wrap">
                          <span className={clsx(
                            "font-bold px-1.5 py-0.5 rounded text-[9px]",
                            isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          )}>
                            {isLong ? "LONG" : "SHORT"}
                          </span>
                          <span className="text-slate-300 font-medium">
                            Giris: {fmtPrice(s.price)}
                          </span>
                          <span className="text-slate-600">|</span>
                          <span className="text-green-400/80">
                            TP: {fmtPrice(s.tp_price)}
                          </span>
                          <span className="text-red-400/80">
                            SL: {fmtPrice(s.sl_price)}
                          </span>
                        </div>
                        {/* Satır 2: sonuç + çıkış fiyatı + süre + tarih */}
                        <div className="flex items-center justify-between px-2 py-1 flex-wrap gap-x-2">
                          <span className={clsx("font-semibold", outcomeColor)}>
                            {outcomeLabel}
                            {s.outcome_pnl_pct != null && (
                              <span className="ml-1">
                                {s.outcome_pnl_pct >= 0 ? "+" : ""}{s.outcome_pnl_pct}%
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-2 text-slate-600 ml-auto">
                            {s.outcome_price != null && s.outcome !== "open" && (
                              <span>→ {fmtPrice(s.outcome_price)}</span>
                            )}
                            {dur && <span>⏱ {dur}</span>}
                            <span>
                              {s.created_at ? new Date(s.created_at).toLocaleString("tr-TR", {day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"}) : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hedge Trade Gecmisi */}
      {perf && perf.trades && perf.trades.total > 0 && (
        <div className="border-t border-slate-800 pt-2">
          <button
            onClick={() => setShowTrades(p => !p)}
            className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Trade Gecmisi
              <span className={clsx(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                perf.trades.total_pnl >= 0
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              )}>
                {perf.trades.closed > 0
                  ? `${perf.trades.total_pnl >= 0 ? "+" : ""}$${perf.trades.total_pnl.toFixed(2)}`
                  : `${perf.trades.open} acik`}
              </span>
            </span>
            <svg
              className={clsx("w-3.5 h-3.5 transition-transform", showTrades && "rotate-180")}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showTrades && (
            <div className="mt-2 space-y-2">
              {/* Ozet kutuları */}
              <div className="grid grid-cols-4 gap-1.5">
                <div className="bg-slate-900/60 rounded-lg p-1.5 text-center border border-slate-800">
                  <p className="text-[9px] text-slate-500">Toplam</p>
                  <p className="text-xs font-bold text-white">{perf.trades.total}</p>
                </div>
                <div className="bg-green-500/5 rounded-lg p-1.5 text-center border border-green-500/20">
                  <p className="text-[9px] text-green-400/70">Kazanan</p>
                  <p className="text-xs font-bold text-green-400">{perf.trades.winning}</p>
                </div>
                <div className="bg-red-500/5 rounded-lg p-1.5 text-center border border-red-500/20">
                  <p className="text-[9px] text-red-400/70">Kaybeden</p>
                  <p className="text-xs font-bold text-red-400">{perf.trades.losing}</p>
                </div>
                <div className="bg-blue-500/5 rounded-lg p-1.5 text-center border border-blue-500/20">
                  <p className="text-[9px] text-blue-400/70">Basari</p>
                  <p className="text-xs font-bold text-blue-400">%{perf.trades.win_rate}</p>
                </div>
              </div>

              {/* PnL ozet */}
              {perf.trades.closed > 0 && (
                <div className="flex items-center justify-between bg-slate-900/60 rounded-lg p-2 border border-slate-800">
                  <div>
                    <p className="text-[9px] text-slate-500">Toplam PnL</p>
                    <p className={clsx("text-sm font-bold", perf.trades.total_pnl >= 0 ? "text-green-400" : "text-red-400")}>
                      {perf.trades.total_pnl >= 0 ? "+" : ""}${perf.trades.total_pnl.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-500">PnL %</p>
                    <p className={clsx("text-sm font-bold", perf.trades.total_pnl_pct >= 0 ? "text-green-400" : "text-red-400")}>
                      {perf.trades.total_pnl_pct >= 0 ? "+" : ""}{perf.trades.total_pnl_pct.toFixed(2)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-500">Acik</p>
                    <p className="text-sm font-bold text-yellow-400">{perf.trades.open}</p>
                  </div>
                </div>
              )}

              {/* Trade listesi */}
              {perf.trade_history && perf.trade_history.length > 0 && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                  {perf.trade_history.map(t => {
                    const isLong = t.side === "long"
                    const isClosed = t.status === "CLOSED"
                    const pnlPositive = (t.pnl ?? 0) >= 0
                    const borderColor = !isClosed
                      ? "border-yellow-500/20"
                      : pnlPositive ? "border-green-500/20" : "border-red-500/20"
                    const bgColor = !isClosed
                      ? "bg-yellow-500/5"
                      : pnlPositive ? "bg-green-500/5" : "bg-red-500/5"
                    const exitLabel: Record<string, string> = {
                      tp: "TP Vurdu",
                      exchange_sl: "SL Vurdu",
                      close_both: "Kapandi",
                      breakeven: "Basabasina",
                      trailing: "Trailing",
                    }
                    return (
                      <div key={t.id} className={clsx("rounded-lg border text-[10px]", bgColor, borderColor)}>
                        <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 border-b border-white/5 flex-wrap">
                          <span className={clsx(
                            "font-bold px-1.5 py-0.5 rounded text-[9px]",
                            isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          )}>
                            {isLong ? "LONG" : "SHORT"}
                          </span>
                          <span className="text-slate-300 font-medium">
                            Giris: {fmtPrice(t.entry_price)}
                          </span>
                          {isClosed && t.exit_price && (
                            <>
                              <span className="text-slate-600">→</span>
                              <span className="text-slate-300">
                                Cikis: {fmtPrice(t.exit_price)}
                              </span>
                            </>
                          )}
                          {t.leverage && (
                            <span className="text-slate-600 text-[9px]">{t.leverage}x</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between px-2 py-1 flex-wrap gap-x-2">
                          {isClosed ? (
                            <span className={clsx("font-semibold", pnlPositive ? "text-green-400" : "text-red-400")}>
                              {t.exit_reason ? (exitLabel[t.exit_reason] ?? t.exit_reason) : "Kapandi"}
                              {t.pnl != null && (
                                <span className="ml-1">
                                  {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                                  {t.pnl_pct != null && (
                                    <span className="ml-0.5 text-slate-500">
                                      ({t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct.toFixed(2)}%)
                                    </span>
                                  )}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="font-semibold text-yellow-400">● Acik</span>
                          )}
                          <div className="flex items-center gap-2 text-slate-600 ml-auto">
                            {t.duration_min != null && t.duration_min > 0 && (
                              <span>⏱ {t.duration_min < 60 ? `${t.duration_min}dk` : `${Math.floor(t.duration_min / 60)}s ${t.duration_min % 60}dk`}</span>
                            )}
                            <span>
                              {t.opened_at ? new Date(t.opened_at).toLocaleString("tr-TR", {day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"}) : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Akıllı Filtreler */}
      <div className="border-t border-slate-800 pt-2">
        <button
          onClick={() => setShowFilters(p => !p)}
          className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Akilli Filtreler
            {activeFilterCount > 0 && (
              <span className="bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                {activeFilterCount}/{FILTER_DEFS.length}
              </span>
            )}
          </span>
          <svg
            className={clsx("w-3.5 h-3.5 transition-transform", showFilters && "rotate-180")}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showFilters && (
          <div className="mt-2 space-y-1">
            {FILTER_DEFS.map(f => {
              const enabled = filters[f.key as keyof Filters]
              const stat = filterStats[f.key]
              return (
                <div key={f.key} className="space-y-0.5">
                  <button
                    onClick={() => toggleFilter(f.key)}
                    className={clsx(
                      "flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs transition-all",
                      enabled
                        ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        : "bg-slate-900/40 text-slate-500 border border-slate-800 hover:text-slate-300 hover:border-slate-700"
                    )}
                  >
                    {/* Mini toggle */}
                    <div
                      className={clsx(
                        "relative w-7 h-4 rounded-full transition-colors shrink-0",
                        enabled ? "bg-blue-500" : "bg-slate-700"
                      )}
                    >
                      <div
                        className={clsx(
                          "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform",
                          enabled ? "translate-x-3.5" : "translate-x-0.5"
                        )}
                      />
                    </div>
                    <FilterIcon type={f.icon} />
                    <span className="truncate">{f.label}</span>
                  </button>
                  {/* Filtre performans istatistikleri */}
                  {stat && stat.hyp_total > 0 && (
                    <div className="flex items-center gap-2 px-2.5 ml-9 text-[10px]">
                      <span className="text-green-400">{stat.correct_block} doğru engel</span>
                      <span className="text-red-400">{stat.wrong_block} yanlış engel</span>
                      {stat.accuracy != null && (
                        <span className={clsx(
                          "font-bold",
                          stat.accuracy >= 60 ? "text-green-400" : stat.accuracy < 40 ? "text-red-400" : "text-yellow-400"
                        )}>
                          %{stat.accuracy}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

