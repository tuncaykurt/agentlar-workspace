"use client"

import { useEffect, useState } from "react"
import { createBotWS } from "@/lib/api"

interface Signal {
  side: "buy" | "sell"
  price: number
  ts: string
  strategy: string
}

interface Props {
  botId?: number
}

export default function SignalOverlay({ botId }: Props) {
  const [signals, setSignals] = useState<Signal[]>([])
  const [lastSignal, setLastSignal] = useState<Signal | null>(null)

  useEffect(() => {
    if (!botId) return
    const ws = createBotWS(botId, (data: any) => {
      if (data.signal) {
        const sig: Signal = {
          side: data.signal,
          price: data.price,
          ts: data.ts,
          strategy: data.strategy ?? "ema_cross",
        }
        setLastSignal(sig)
        setSignals(prev => [sig, ...prev].slice(0, 10))
      }
    })
    return () => ws.close()
  }, [botId])

  if (signals.length === 0) return null

  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Son Sinyaller</p>
      {signals.map((s, i) => (
        <div key={i} className="flex items-center justify-between bg-slate-900 rounded px-2 py-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
              s.side === "buy"
                ? "bg-green-500/20 text-green-400"
                : "bg-red-500/20 text-red-400"
            }`}>
              {s.side === "buy" ? "LONG" : "SHORT"}
            </span>
            <span className="text-xs text-slate-300">${s.price?.toLocaleString()}</span>
          </div>
          <span className="text-xs text-slate-500">
            {new Date(s.ts).toLocaleTimeString("tr-TR")}
          </span>
        </div>
      ))}
    </div>
  )
}
