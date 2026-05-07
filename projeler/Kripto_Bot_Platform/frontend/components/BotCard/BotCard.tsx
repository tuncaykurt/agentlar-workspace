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

interface BotStatus {
  signal: string | null
  price: number
  risk: {
    balance: number
    daily_pnl: number
    daily_pnl_pct: number
    killed: boolean
  }
}

// "BTC/USDT:USDT" → "BTCUSDT.P"
function fmtSymbol(s: string) {
  return s.replace("/USDT:USDT", "USDT.P").replace("/", "")
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

  useEffect(() => {
    if (!running) { setStatus(null); return }
    const ws = createBotWS(bot.id, (data) => setStatus(data as BotStatus))
    return () => ws.close()
  }, [bot.id, running])

  // Borsa bakiyesini çek (bot duruyorsa)
  useEffect(() => {
    if (running || !bot.exchange) return
    api.get(`/exchanges/${bot.exchange}/balance`)
      .then((data: any) => {
        const usdt = data?.total ?? data?.free ?? null
        if (usdt != null) setExchBalance(Number(usdt))
      })
      .catch(() => {})
  }, [bot.exchange, running])

  const toggle = async () => {
    setLoading(true)
    try {
      const action = running ? "stop" : "start"
      await api.post(`/bots/${bot.id}/${action}`, {})
      if (running) setStatus(null)
      setRunning(r => !r)
    } finally { setLoading(false) }
  }

  const pnlPct  = status?.risk?.daily_pnl_pct ?? 0
  const pnlColor = pnlPct >= 0 ? "text-green-400" : "text-red-400"

  return (
    <div className={clsx(
      "rounded-xl border p-4 space-y-3 transition-colors",
      running ? "border-blue-500/30 bg-[#0d1117]" : "border-slate-800 bg-[#0d1117]"
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
                Çalışıyor
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            <span className="text-slate-400 font-medium">{fmtSymbol(bot.symbol)}</span>
            <span className="mx-1">·</span>
            {bot.strategy}
            {bot.exchange && (
              <>
                <span className="mx-1">·</span>
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
              title="Düzenle"
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
          <button
            onClick={toggle}
            disabled={loading}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border",
              running
                ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20"
            )}
          >
            {loading ? "..." : running ? "Durdur" : "Başlat"}
          </button>
        </div>
      </div>

      {/* Stats */}
      {status ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Fiyat" value={`$${status.price?.toLocaleString("tr-TR", {maximumFractionDigits: 2})}`} />
          <Stat label="Günlük PnL" value={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`} className={pnlColor} />
          <Stat label="Bakiye" value={`$${status.risk?.balance?.toLocaleString("tr-TR", {maximumFractionDigits: 0})}`} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="opacity-30"><Stat label="Fiyat" value="—" /></div>
          <div className="opacity-30"><Stat label="Günlük PnL" value="—" /></div>
          <Stat
            label={`Bakiye${bot.exchange ? ` (${bot.exchange.toUpperCase()})` : ""}`}
            value={exchBalance != null ? `$${exchBalance.toLocaleString("tr-TR", {maximumFractionDigits: 2})}` : bot.initial_balance ? `$${bot.initial_balance.toLocaleString()}` : "—"}
          />
        </div>
      )}

      {status?.risk?.killed && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">
          Kill switch aktif — günlük limit aşıldı
        </div>
      )}

      {status?.signal && (
        <div className={clsx(
          "text-xs rounded-lg px-2.5 py-1.5 border",
          status.signal === "buy"
            ? "text-green-400 bg-green-500/10 border-green-500/20"
            : "text-red-400 bg-red-500/10 border-red-500/20"
        )}>
          {status.signal === "buy" ? "▲ AL sinyali tespit edildi" : "▼ SAT sinyali tespit edildi"}
        </div>
      )}
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
