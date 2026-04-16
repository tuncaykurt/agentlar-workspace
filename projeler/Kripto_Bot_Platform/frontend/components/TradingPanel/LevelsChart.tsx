"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  IChartApi, Time, SeriesMarker,
} from "lightweight-charts"
import { api } from "@/lib/api"
import dynamic from "next/dynamic"

const ProChart = dynamic(() => import("../Chart/ProChart"), { ssr: false })

interface Candle   { time: number; open: number; high: number; low: number; close: number }
interface OB       { type: "bullish"|"bearish"; high: number; low: number; time: number }
interface FVG      { type: "bullish"|"bearish"; top: number; bottom: number; time: number }
interface LiqLevel { leverage: number; long_liq: number; short_liq: number }
interface EmaPoint { time: number; value: number }
interface Signal   { time: number; type: "buy"|"sell"; price: number }

interface LevelData {
  candles: Candle[]
  order_blocks: OB[]
  fvgs: FVG[]
  liquidation_levels: LiqLevel[]
  current_price: number
  ema: { ema9: EmaPoint[]; ema21: EmaPoint[]; ema55: EmaPoint[] }
  signals: Signal[]
}

function toApiInterval(iv: string): string {
  if (iv === "D")   return "1d"
  if (iv === "240") return "4h"
  if (iv === "60")  return "1h"
  if (iv === "15")  return "15m"
  return "5m"
}

export default function LevelsChart({
  symbol, interval,
  tp, sl,
}: {
  symbol: string; interval: string
  tp?: number; sl?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const [data,      setData]      = useState<LevelData | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [showOB,    setShowOB]    = useState(true)
  const [showFVG,   setShowFVG]   = useState(true)
  const [showLiq,   setShowLiq]   = useState(true)
  const [showEMA,   setShowEMA]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const enc = encodeURIComponent(symbol)
      const iv  = toApiInterval(interval)
      const d   = await api.get(`/market/levels?symbol=${enc}&interval=${iv}`)
      setData(d)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [symbol, interval])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!containerRef.current || !data) return

    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: 280,
      layout: { background: { type: ColorType.Solid, color: "#020817" }, textColor: "#64748b", fontSize: 11 },
      grid:   { vertLines: { color: "#0f172a" }, horzLines: { color: "#0f172a" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1e293b", scaleMargins: { top: 0.05, bottom: 0.05 } },
      timeScale: { borderColor: "#1e293b", timeVisible: true, secondsVisible: false },
    })
    chartRef.current = chart

    // ── Mumlar ────────────────────────────────────────────────────
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    })
    candleSeries.setData(data.candles)

    // ── EMA Çizgileri ─────────────────────────────────────────────
    if (showEMA && data.ema) {
      const ema9Series = chart.addLineSeries({
        color: "#3b82f6", lineWidth: 1, priceLineVisible: false,
        lastValueVisible: true, crosshairMarkerVisible: false,
        title: "EMA9",
      })
      ema9Series.setData(data.ema.ema9)

      const ema21Series = chart.addLineSeries({
        color: "#f97316", lineWidth: 1, priceLineVisible: false,
        lastValueVisible: true, crosshairMarkerVisible: false,
        title: "EMA21",
      })
      ema21Series.setData(data.ema.ema21)

      const ema55Series = chart.addLineSeries({
        color: "#a855f7", lineWidth: 1, priceLineVisible: false,
        lastValueVisible: true, crosshairMarkerVisible: false,
        title: "EMA55",
      })
      ema55Series.setData(data.ema.ema55)
    }

    // ── Buy/Sell sinyal okları ────────────────────────────────────
    if (data.signals?.length) {
      const markers: SeriesMarker<Time>[] = data.signals.map(s => ({
        time:     s.time as Time,
        position: s.type === "buy" ? "belowBar" : "aboveBar",
        color:    s.type === "buy" ? "#22c55e"  : "#ef4444",
        shape:    s.type === "buy" ? "arrowUp"  : "arrowDown",
        text:     s.type === "buy" ? "BUY"      : "SELL",
        size: 1,
      }))
      candleSeries.setMarkers(markers)
    }

    // ── TP / SL çizgileri (Claude analizinden) ───────────────────
    if (tp) {
      candleSeries.createPriceLine({
        price: tp, color: "rgba(34,197,94,0.9)", lineWidth: 2,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "TP",
      })
    }
    if (sl) {
      candleSeries.createPriceLine({
        price: sl, color: "rgba(239,68,68,0.9)", lineWidth: 2,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "SL",
      })
    }

    // ── Order Blocks ──────────────────────────────────────────────
    if (showOB) {
      data.order_blocks.forEach((ob, i) => {
        const isBull = ob.type === "bullish"
        const mc = isBull ? "rgba(34,197,94,0.85)"  : "rgba(239,68,68,0.85)"
        const sc = isBull ? "rgba(34,197,94,0.35)"  : "rgba(239,68,68,0.35)"
        const fc = isBull ? "rgba(34,197,94,0.08)"  : "rgba(239,68,68,0.08)"
        candleSeries.createPriceLine({ price: ob.high, color: mc, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true,  title: i === 0 ? (isBull ? "OB▲" : "OB▼") : "" })
        candleSeries.createPriceLine({ price: ob.low,  color: sc, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" })
        candleSeries.createPriceLine({ price: (ob.high + ob.low) / 2, color: fc, lineWidth: 20, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" })
      })
    }

    // ── FVG ───────────────────────────────────────────────────────
    if (showFVG) {
      data.fvgs.forEach((fvg, i) => {
        const isBull = fvg.type === "bullish"
        const mc = isBull ? "rgba(59,130,246,0.8)"  : "rgba(249,115,22,0.8)"
        const sc = isBull ? "rgba(59,130,246,0.35)" : "rgba(249,115,22,0.35)"
        const fc = isBull ? "rgba(59,130,246,0.07)" : "rgba(249,115,22,0.07)"
        candleSeries.createPriceLine({ price: fvg.top,    color: mc, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true,  title: i === 0 ? "FVG" : "" })
        candleSeries.createPriceLine({ price: fvg.bottom, color: sc, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" })
        candleSeries.createPriceLine({ price: (fvg.top + fvg.bottom) / 2, color: fc, lineWidth: 14, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" })
      })
    }

    // ── Liquidation Seviyeleri ────────────────────────────────────
    if (showLiq) {
      data.liquidation_levels.filter(l => l.leverage === 10 || l.leverage === 20).forEach(l => {
        candleSeries.createPriceLine({ price: l.long_liq,  color: "rgba(239,68,68,0.7)",  lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true,  title: `${l.leverage}x L.Liq` })
        candleSeries.createPriceLine({ price: l.short_liq, color: "rgba(34,197,94,0.7)",  lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true,  title: `${l.leverage}x S.Liq` })
      })
    }

    chart.timeScale().fitContent()

    const onResize = () => {
      if (containerRef.current && chartRef.current)
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener("resize", onResize)
    return () => { window.removeEventListener("resize", onResize); chart.remove(); chartRef.current = null }
  }, [data, showOB, showFVG, showLiq, showEMA, tp, sl])

  const buyCount  = data?.signals.filter(s => s.type === "buy").length  ?? 0
  const sellCount = data?.signals.filter(s => s.type === "sell").length ?? 0

  return (
    <div className="border-t border-slate-800 bg-[#020817]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/50 flex-wrap">
        <span className="text-xs text-slate-400 font-medium">Seviyeler</span>

        {/* EMA toggle */}
        <button onClick={() => setShowEMA(v => !v)}
          className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors ${showEMA ? "border-blue-500/40 text-blue-400 bg-blue-500/10" : "border-slate-700 text-slate-600"}`}>
          <span className="inline-flex gap-0.5">
            <span className="w-2 h-px bg-blue-400 mt-1.5" />
            <span className="w-2 h-px bg-orange-400 mt-1.5" />
            <span className="w-2 h-px bg-purple-400 mt-1.5" />
          </span>
          EMA
        </button>

        <button onClick={() => setShowOB(v => !v)}
          className={`text-xs px-2 py-0.5 rounded border transition-colors ${showOB ? "border-green-500/40 text-green-400 bg-green-500/10" : "border-slate-700 text-slate-600"}`}>
          OB
        </button>
        <button onClick={() => setShowFVG(v => !v)}
          className={`text-xs px-2 py-0.5 rounded border transition-colors ${showFVG ? "border-blue-500/40 text-blue-400 bg-blue-500/10" : "border-slate-700 text-slate-600"}`}>
          FVG
        </button>
        <button onClick={() => setShowLiq(v => !v)}
          className={`text-xs px-2 py-0.5 rounded border transition-colors ${showLiq ? "border-red-500/40 text-red-400 bg-red-500/10" : "border-slate-700 text-slate-600"}`}>
          Liq
        </button>

        {/* Sinyal sayacı */}
        {data && (
          <div className="flex items-center gap-2 text-xs ml-1">
            <span className="text-green-400">▲{buyCount}</span>
            <span className="text-red-400">▼{sellCount}</span>
            {tp && <span className="text-green-300 font-mono">TP ${tp.toFixed(0)}</span>}
            {sl && <span className="text-red-300 font-mono">SL ${sl.toFixed(0)}</span>}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setModalOpen(true)}
            title="Tam ekranda aç"
            className="text-slate-500 hover:text-white transition-colors text-sm px-1.5 py-0.5 rounded border border-slate-700 hover:border-slate-500">
            ⛶
          </button>
          <button onClick={fetchData} disabled={loading}
            className="text-slate-500 hover:text-white disabled:opacity-40 transition-colors">
            {loading ? "⏳" : "↻"}
          </button>
        </div>
      </div>

      <div ref={containerRef} />

      {modalOpen && (
        <ProChart symbol={symbol} tp={tp} sl={sl} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}
