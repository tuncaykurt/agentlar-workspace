"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

interface Position {
  symbol: string
  side: string
  contracts: number
  entryPrice: number
  markPrice: number
  unrealizedPnl: number
  percentage: number
  leverage: number
}

export default function PositionsPanel() {
  const [positions, setPositions] = useState<Position[]>([])

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await api.get("/market/positions")
        setPositions(data)
      } catch {}
    }
    fetch()
    const interval = setInterval(fetch, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Açık Pozisyonlar</p>
        <span className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{positions.length}</span>
      </div>

      {positions.length === 0 ? (
        <div className="bg-slate-900 rounded-lg p-3 text-center text-xs text-slate-500">
          Açık pozisyon yok
        </div>
      ) : (
        <div className="space-y-1.5">
          {positions.map((pos, i) => (
            <div key={i} className="bg-slate-900 rounded-lg p-2.5 space-y-1">
              <div className="flex justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold px-1 py-0.5 rounded ${
                    pos.side === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                  }`}>
                    {pos.side?.toUpperCase()} {pos.leverage}x
                  </span>
                  <span className="text-xs text-white font-medium">{pos.symbol?.replace("/USDT:USDT", "")}</span>
                </div>
                <span className={`text-xs font-bold ${pos.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {pos.unrealizedPnl >= 0 ? "+" : ""}{pos.unrealizedPnl?.toFixed(2)} USDT
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Giriş: ${pos.entryPrice?.toLocaleString()}</span>
                <span>Anlık: ${pos.markPrice?.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
