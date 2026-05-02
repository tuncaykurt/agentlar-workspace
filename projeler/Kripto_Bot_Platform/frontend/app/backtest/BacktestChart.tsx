"use client"

import { useEffect, useRef, useState } from "react"
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  IChartApi, Time,
} from "lightweight-charts"

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
}

interface Trade {
  entry_ts: number
  exit_ts: number
  side: string
  entry: number
  exit: number
  pnl: number
  exit_reason: string
}

interface IndicatorPoint {
  time: number
  value: number
}

interface Indicators {
  bb_upper?: IndicatorPoint[]
  bb_mid?: IndicatorPoint[]
  bb_lower?: IndicatorPoint[]
  ema_fast?: IndicatorPoint[]
  ema_slow?: IndicatorPoint[]
  [key: string]: IndicatorPoint[] | undefined
}

const INDICATOR_STYLES: Record<string, { color: string; lineWidth: number; lineStyle: number; title: string }> = {
  bb_upper: { color: "rgba(96,165,250,0.6)",  lineWidth: 1, lineStyle: LineStyle.Dashed,   title: "BB ↑" },
  bb_mid:   { color: "rgba(148,163,184,0.5)", lineWidth: 1, lineStyle: LineStyle.Dashed,   title: "BB mid" },
  bb_lower: { color: "rgba(96,165,250,0.6)",  lineWidth: 1, lineStyle: LineStyle.Dashed,   title: "BB ↓" },
  ema_fast: { color: "#22c55e",               lineWidth: 1, lineStyle: LineStyle.Solid,    title: "EMA fast" },
  ema_slow: { color: "#fbbf24",               lineWidth: 1, lineStyle: LineStyle.Solid,    title: "EMA slow" },
}

const CUSTOM_COLORS = ["#a78bfa","#f472b6","#34d399","#fb923c","#38bdf8","#e879f9","#facc15","#4ade80"]

export default function BacktestChart({
  candles,
  trades,
  indicators,
}: {
  candles: Candle[]
  trades: Trade[]
  indicators?: Indicators
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string>("")

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      setErr("Container bulunamadı")
      return
    }

    if (!Array.isArray(candles) || candles.length === 0) {
      setErr(`Mum verisi boş (candles.length=${candles?.length ?? 0})`)
      return
    }

    // Önceki chart temizle
    if (chartRef.current) {
      try { chartRef.current.remove() } catch { /* ignore */ }
      chartRef.current = null
    }

    let chart: IChartApi
    try {
      const initWidth = container.clientWidth || container.getBoundingClientRect().width || 800

      chart = createChart(container, {
        width: initWidth,
        height: 480,
        layout: { background: { type: ColorType.Solid, color: "#020817" }, textColor: "#94a3b8", fontSize: 11 },
        grid: { vertLines: { color: "#0f172a" }, horzLines: { color: "#0f172a" } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: "#1e293b" },
        timeScale: { borderColor: "#1e293b", timeVisible: true, secondsVisible: false, rightOffset: 5 },
      })
      chartRef.current = chart
    } catch (e) {
      setErr(`createChart hatası: ${e instanceof Error ? e.message : String(e)}`)
      return
    }

    try {
      const candleSeries = chart.addCandlestickSeries({
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      })

      // Sort + dedupe + validate
      const seen = new Set<number>()
      const cleanCandles = [...candles]
        .filter(c => Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close))
        .sort((a, b) => a.time - b.time)
        .filter(c => {
          if (seen.has(c.time)) return false
          seen.add(c.time)
          return true
        })

      if (cleanCandles.length === 0) {
        setErr("Geçerli mum verisi yok (tümü filtrelendi)")
        return
      }

      candleSeries.setData(cleanCandles as never)

      // ── İndikatör çizgileri ──
      let indicatorCount = 0
      let customColorIdx = 0
      if (indicators) {
        for (const [key, points] of Object.entries(indicators)) {
          if (!points || points.length === 0) continue
          const style = INDICATOR_STYLES[key] ?? {
            color: CUSTOM_COLORS[customColorIdx++ % CUSTOM_COLORS.length],
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            title: key.replace(/^custom_\d+_/, "").replace(/_/g, " "),
          }

          try {
            const lineSeries = chart.addLineSeries({
              color: style.color,
              lineWidth: style.lineWidth as 1 | 2 | 3 | 4,
              lineStyle: style.lineStyle,
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false,
              title: style.title,
            })

            const cleanPoints = points
              .filter(p => Number.isFinite(p.time) && Number.isFinite(p.value))
              .sort((a, b) => a.time - b.time)
              .map(p => ({ time: p.time as unknown as Time, value: p.value }))

            if (cleanPoints.length > 0) {
              lineSeries.setData(cleanPoints)
              indicatorCount++
            }
          } catch { /* skip malformed indicator */ }
        }
      }

      // Marker zamanını en yakın candle'a snap et
      const candleTimes = cleanCandles.map(c => c.time)
      const firstT = candleTimes[0]
      const lastT = candleTimes[candleTimes.length - 1]
      const snap = (t: number): number => {
        if (t <= firstT) return firstT
        if (t >= lastT) return lastT
        let best = candleTimes[0]
        let bestDiff = Math.abs(t - best)
        for (const ct of candleTimes) {
          const d = Math.abs(t - ct)
          if (d < bestDiff) { best = ct; bestDiff = d }
        }
        return best
      }

      // Markers — entry + exit her trade için
      const rawMarkers: { time: number; position: string; color: string; shape: string; text: string; size: number }[] = []
      trades.forEach((t, idx) => {
        const entryTime = snap(Math.floor(t.entry_ts / 1000))
        const exitTime = snap(Math.floor(t.exit_ts / 1000))

        rawMarkers.push({
          time: entryTime,
          position: t.side === "buy" ? "belowBar" : "aboveBar",
          color: t.side === "buy" ? "#22c55e" : "#ef4444",
          shape: t.side === "buy" ? "arrowUp" : "arrowDown",
          text: `${t.side === "buy" ? "LONG" : "SHORT"} #${idx + 1}`,
          size: 1.5,
        })

        const isWin = t.pnl >= 0
        const isLiq = t.exit_reason === "liquidation"
        rawMarkers.push({
          time: exitTime,
          position: t.side === "buy" ? "aboveBar" : "belowBar",
          color: isLiq ? "#dc2626" : (isWin ? "#22c55e" : "#ef4444"),
          shape: isLiq ? "square" : "circle",
          text: `${t.exit_reason === "take_profit" ? "TP" : t.exit_reason === "stop_loss" ? "SL" : isLiq ? "LIQ" : "X"} ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(0)}`,
          size: isLiq ? 1.3 : 1,
        })
      })

      // Sort + dedupe (aynı zaman+şekil)
      const keySet = new Set<string>()
      const markers = rawMarkers
        .sort((a, b) => a.time - b.time)
        .filter(m => {
          const k = `${m.time}_${m.shape}_${m.position}`
          if (keySet.has(k)) return false
          keySet.add(k)
          return true
        })
        .map(m => ({ ...m, time: m.time as unknown as Time }))

      // @ts-expect-error — lightweight-charts marker tipi katı
      candleSeries.setMarkers(markers)

      // Bağlantı çizgileri
      let lineCount = 0
      trades.forEach(t => {
        const entryTime = snap(Math.floor(t.entry_ts / 1000))
        const exitTime = snap(Math.floor(t.exit_ts / 1000))
        if (exitTime <= entryTime) return
        const isWin = t.pnl >= 0

        try {
          const ls = chart.addLineSeries({
            color: isWin ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          ls.setData([
            { time: entryTime as unknown as Time, value: t.entry },
            { time: exitTime as unknown as Time, value: t.exit },
          ])
          lineCount++
        } catch { /* skip malformed line */ }
      })

      chart.timeScale().fitContent()
      setInfo(`${cleanCandles.length} mum, ${trades.length} trade, ${markers.length} marker, ${lineCount} bağlantı${indicatorCount > 0 ? `, ${indicatorCount} indikatör` : ""}`)
      setErr(null)
    } catch (e) {
      setErr(`Veri yükleme hatası: ${e instanceof Error ? e.message : String(e)}`)
    }

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        if (w > 0 && chartRef.current) {
          try { chartRef.current.applyOptions({ width: w }) } catch { /* ignore */ }
        }
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      try { chart.remove() } catch { /* ignore */ }
      chartRef.current = null
    }
  }, [candles, trades, indicators])

  return (
    <div>
      {err && (
        <div className="mb-2 bg-red-950/50 border border-red-900 text-red-300 text-xs rounded px-3 py-2">
          Grafik hatası: {err}
        </div>
      )}
      {info && !err && (
        <div className="mb-2 text-[10px] text-slate-500">{info}</div>
      )}
      <div
        ref={containerRef}
        className="w-full bg-slate-950 rounded"
        style={{ height: 480, minHeight: 480 }}
      />
    </div>
  )
}
