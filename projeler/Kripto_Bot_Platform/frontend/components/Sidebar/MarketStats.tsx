"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

interface Props {
  symbol: string
}

interface Ticker {
  last: string
  bid: string
  ask: string
  funding_rate: string
}

export default function MarketStats({ symbol }: Props) {
  const [ticker, setTicker] = useState<Ticker | null>(null)
  const [change, setChange] = useState<number>(0)

  useEffect(() => {
    let localPrev = 0
    setChange(0)
    const poll = async () => {
      try {
        const encoded = encodeURIComponent(symbol)
        const data = await api.get(`/market/ticker?symbol=${encoded}`)
        setTicker(data)
        const cur = parseFloat(data.last)
        if (localPrev > 0) setChange(((cur - localPrev) / localPrev) * 100)
        localPrev = cur
      } catch {}
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [symbol])

  const price = ticker ? parseFloat(ticker.last) : 0
  const fundingRate = ticker ? parseFloat(ticker.funding_rate ?? "0") * 100 : 0
  const isPositive = change >= 0

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Piyasa</p>
      <div className="bg-slate-900 rounded-lg p-3 space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="text-xl font-bold text-white">
            ${price.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
          </span>
          <span className={`text-sm font-medium ${isPositive ? "text-green-400" : "text-red-400"}`}>
            {isPositive ? "+" : ""}{change.toFixed(3)}%
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-slate-500">Alış</p>
            <p className="text-green-400 font-mono">{ticker?.bid ? parseFloat(ticker.bid).toLocaleString() : "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Satış</p>
            <p className="text-red-400 font-mono">{ticker?.ask ? parseFloat(ticker.ask).toLocaleString() : "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Funding Rate</p>
            <p className={`font-mono ${fundingRate < 0 ? "text-green-400" : "text-red-400"}`}>
              {fundingRate.toFixed(4)}%
            </p>
          </div>
          <div>
            <p className="text-slate-500">8s Güncelleme</p>
            <p className="text-blue-400 font-mono">
              {new Date().toLocaleTimeString("tr-TR")}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
