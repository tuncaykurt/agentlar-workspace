"use client"

import { useEffect, useRef } from "react"
import { createChart, IChartApi, CandlestickData } from "lightweight-charts"
import { createMarketWS, api } from "@/lib/api"

interface Props {
  symbol: string
  height?: number
}

export default function CandleChart({ symbol, height = 400 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ReturnType<IChartApi["addCandlestickSeries"]> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    chartRef.current = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: { background: { color: "#0f172a" }, textColor: "#94a3b8" },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#1e293b" },
      timeScale: { borderColor: "#1e293b", timeVisible: true },
    })

    seriesRef.current = chartRef.current.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    })

    // Tarihsel veri yükle
    const encoded = encodeURIComponent(symbol)
    api.get(`/market/kline?symbol=${encoded}&interval=1m&limit=200`).then((data: CandlestickData[]) => {
      seriesRef.current?.setData(data)
    })

    // Canlı veri WebSocket
    const ws = createMarketWS(symbol, (raw: unknown) => {
      const d = raw as { time: number; open: number; high: number; low: number; close: number }
      seriesRef.current?.update({
        time: d.time as CandlestickData["time"],
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })
    })

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener("resize", handleResize)

    return () => {
      ws.close()
      window.removeEventListener("resize", handleResize)
      chartRef.current?.remove()
    }
  }, [symbol, height])

  return (
    <div className="rounded-xl overflow-hidden border border-slate-700">
      <div className="px-4 py-2 bg-slate-800 text-sm font-medium text-slate-300">
        {symbol} — 1m
      </div>
      <div ref={containerRef} />
    </div>
  )
}
