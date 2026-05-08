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
    last_signals: Array<{
      id: number
      signal_type: string
      price: number
      tp_price: number | null
      sl_price: number | null
      outcome: string
      outcome_pnl_pct: number | null
      created_at: string | null
    }>
  } | null>(null)

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
      await api.patch(`/bots/${bot.id}/filters`, { [key]: newVal })
    } catch {
      // Geri al
      setFilters(prev => ({ ...prev, [key]: !newVal }))
    }
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  const pnlPct  = status?.risk?.daily_pnl_pct ?? 0
  const pnlUsdt = status?.risk?.daily_pnl ?? 0
  const pnlColor = pnlPct >= 0 ? "text-green-400" : "text-red-400"

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
        const exchLabel = bot.exchange ? ` (${bot.exchange.toUpperCase()})` : ""
        const balanceVal = status?.risk?.balance
          ? `$${status.risk.balance.toLocaleString("tr-TR", {maximumFractionDigits: 0})}`
          : exchBalance != null
            ? `$${exchBalance.toLocaleString("tr-TR", {maximumFractionDigits: 2})}`
            : bot.initial_balance
              ? `$${bot.initial_balance.toLocaleString()}`
              : "—"

        return status ? (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Fiyat" value={`$${status.price?.toLocaleString("tr-TR", {maximumFractionDigits: 2})}`} />
            <Stat label="Gunluk PnL" value={`${pnlUsdt >= 0 ? "+" : ""}${pnlUsdt.toFixed(2)}$ (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)`} className={pnlColor} />
            <Stat label={`Bakiye${exchLabel}`} value={balanceVal} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="opacity-30"><Stat label="Fiyat" value="—" /></div>
            <div className="opacity-30"><Stat label="Gunluk PnL" value="—" /></div>
            <Stat label={`Bakiye${exchLabel}`} value={balanceVal} />
          </div>
        )
      })()}

      {/* Açık Pozisyon */}
      {status?.position && (
        <div className={clsx(
          "rounded-lg border p-2.5 space-y-1.5",
          status.position.side === "long"
            ? "bg-green-500/5 border-green-500/20"
            : "bg-red-500/5 border-red-500/20"
        )}>
          <div className="flex items-center justify-between">
            <span className={clsx(
              "text-xs font-bold px-2 py-0.5 rounded",
              status.position.side === "long"
                ? "bg-green-500/15 text-green-400"
                : "bg-red-500/15 text-red-400"
            )}>
              {status.position.side === "long" ? "LONG" : "SHORT"} {status.position.leverage}x
            </span>
            <span className={clsx(
              "text-sm font-bold",
              status.position.pnl_usdt >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {status.position.pnl_usdt >= 0 ? "+" : ""}{status.position.pnl_usdt.toFixed(2)} USDT
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <span className="text-slate-500">Giris</span>
              <p className="text-slate-300 font-medium">${status.position.entry_price.toLocaleString("tr-TR", {maximumFractionDigits: 2})}</p>
            </div>
            <div>
              <span className="text-slate-500">Miktar</span>
              <p className="text-slate-300 font-medium">${status.position.notional.toLocaleString("tr-TR", {maximumFractionDigits: 2})}</p>
            </div>
            <div>
              <span className="text-slate-500">PnL %</span>
              <p className={clsx("font-medium", status.position.pnl_pct >= 0 ? "text-green-400" : "text-red-400")}>
                {status.position.pnl_pct >= 0 ? "+" : ""}{status.position.pnl_pct.toFixed(2)}%
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

      {/* Sinyal Performansı */}
      {perf && perf.total_signals > 0 && (
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
              <span className={clsx(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                perf.win_rate >= 50
                  ? "bg-green-500/20 text-green-400"
                  : perf.win_rate > 0
                    ? "bg-red-500/20 text-red-400"
                    : "bg-slate-700/50 text-slate-400"
              )}>
                {perf.tp_hit + perf.sl_hit > 0 ? `%${perf.win_rate} basari` : `${perf.open} acik`}
              </span>
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
                <div className="bg-blue-500/5 rounded-lg p-1.5 text-center border border-blue-500/20">
                  <p className="text-[9px] text-blue-400/70">Acik</p>
                  <p className="text-xs font-bold text-blue-400">{perf.open}</p>
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
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {perf.last_signals.map(s => (
                    <div key={s.id} className={clsx(
                      "flex items-center justify-between text-[10px] px-2 py-1 rounded-lg border",
                      s.outcome === "tp_hit"
                        ? "bg-green-500/5 border-green-500/15 text-green-400"
                        : s.outcome === "sl_hit"
                          ? "bg-red-500/5 border-red-500/15 text-red-400"
                          : s.outcome === "open"
                            ? "bg-blue-500/5 border-blue-500/15 text-blue-400"
                            : "bg-slate-900/40 border-slate-800 text-slate-500"
                    )}>
                      <span className="font-medium">
                        {s.signal_type === "buy" ? "LONG" : "SHORT"} @ ${s.price?.toLocaleString("tr-TR", {maximumFractionDigits: 2})}
                      </span>
                      <span>
                        {s.outcome === "tp_hit" ? "TP" : s.outcome === "sl_hit" ? "SL" : s.outcome === "open" ? "Acik" : "Suresi doldu"}
                        {s.outcome_pnl_pct != null && ` ${s.outcome_pnl_pct >= 0 ? "+" : ""}${s.outcome_pnl_pct}%`}
                      </span>
                      <span className="text-slate-600">
                        {s.created_at ? new Date(s.created_at).toLocaleString("tr-TR", {day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"}) : ""}
                      </span>
                    </div>
                  ))}
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
              return (
                <button
                  key={f.key}
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
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-800">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={clsx("text-sm font-semibold text-white mt-0.5", className)}>{value}</p>
    </div>
  )
}
