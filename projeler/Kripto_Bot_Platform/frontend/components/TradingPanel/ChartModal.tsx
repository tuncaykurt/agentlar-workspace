"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  IChartApi, Time, SeriesMarker,
} from "lightweight-charts"
import { api } from "@/lib/api"

interface Candle   { time: number; open: number; high: number; low: number; close: number }
interface OB       { type: "bullish"|"bearish"; high: number; low: number }
interface FVG      { type: "bullish"|"bearish"; top: number; bottom: number }
interface LiqLevel { leverage: number; long_liq: number; short_liq: number }
interface EmaPoint { time: number; value: number }
interface Signal   { time: number; type: "buy"|"sell"; price: number }
interface VolBar   { time: number; value: number; color: string }

interface LevelData {
  candles: Candle[]
  order_blocks: OB[]
  fvgs: FVG[]
  liquidation_levels: LiqLevel[]
  current_price: number
  ema:     { ema9: EmaPoint[]; ema21: EmaPoint[]; ema55: EmaPoint[] }
  signals: Signal[]
  bb:      { upper: EmaPoint[]; mid: EmaPoint[]; lower: EmaPoint[] }
  volume:  VolBar[]
}

const TIMEFRAMES = [
  { label: "1d",  value: "1m"  },
  { label: "5d",  value: "5m"  },
  { label: "15d", value: "15m" },
  { label: "1s",  value: "1h"  },
  { label: "4s",  value: "4h"  },
  { label: "1g",  value: "1d"  },
]

interface Settings {
  ema: boolean; ema9p: number; ema21p: number; ema55p: number
  bb: boolean; bbPeriod: number; bbMult: number
  ob: boolean; fvg: boolean; liq: boolean; volume: boolean; signals: boolean
}

const DEFAULT: Settings = {
  ema: true,  ema9p: 9,  ema21p: 21, ema55p: 55,
  bb: false,  bbPeriod: 20, bbMult: 2,
  ob: true,   fvg: true,  liq: true, volume: true, signals: true,
}

export default function ChartModal({
  symbol, onClose, tp, sl,
}: {
  symbol: string; onClose: () => void; tp?: number; sl?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const [data,    setData]    = useState<LevelData | null>(null)
  const [loading, setLoading] = useState(false)
  const [tf,      setTf]      = useState("1h")
  const [cfg,     setCfg]     = useState<Settings>(DEFAULT)
  const [showCfg, setShowCfg] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const enc = encodeURIComponent(symbol)
      const d = await api.get(`/market/levels?symbol=${enc}&interval=${tf}`)
      setData(d)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [symbol, tf])

  useEffect(() => { fetchData() }, [fetchData])

  // ESC tuşu ile kapat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    if (!containerRef.current || !data) return
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

    const h = Math.max(window.innerHeight - 160, 400)

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: h,
      layout: { background: { type: ColorType.Solid, color: "#020817" }, textColor: "#94a3b8", fontSize: 12 },
      grid:   { vertLines: { color: "#0f172a" }, horzLines: { color: "#0f172a" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1e293b", scaleMargins: { top: 0.06, bottom: cfg.volume ? 0.2 : 0.05 } },
      timeScale: { borderColor: "#1e293b", timeVisible: true, secondsVisible: false },
    })
    chartRef.current = chart

    // ── Mumlar ──────────────────────────────────────────────────
    const candles = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    })
    candles.setData(data.candles)

    // ── Hacim ───────────────────────────────────────────────────
    if (cfg.volume && data.volume) {
      const vol = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      })
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      })
      vol.setData(data.volume)
    }

    // ── EMA ─────────────────────────────────────────────────────
    if (cfg.ema && data.ema) {
      const addEma = (d: EmaPoint[], color: string, title: string) => {
        const s = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title })
        s.setData(d)
      }
      addEma(data.ema.ema9,  "#3b82f6", `EMA${cfg.ema9p}`)
      addEma(data.ema.ema21, "#f97316", `EMA${cfg.ema21p}`)
      addEma(data.ema.ema55, "#a855f7", `EMA${cfg.ema55p}`)
    }

    // ── Bollinger Bands ─────────────────────────────────────────
    if (cfg.bb && data.bb) {
      const addBB = (d: EmaPoint[], color: string, style: number) => {
        const s = chart.addLineSeries({ color, lineWidth: 1, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
        s.setData(d)
      }
      addBB(data.bb.upper, "rgba(234,179,8,0.8)",  LineStyle.Solid)
      addBB(data.bb.mid,   "rgba(234,179,8,0.4)",  LineStyle.Dashed)
      addBB(data.bb.lower, "rgba(234,179,8,0.8)",  LineStyle.Solid)
    }

    // ── Buy/Sell sinyalleri ──────────────────────────────────────
    if (cfg.signals && data.signals?.length) {
      const markers: SeriesMarker<Time>[] = data.signals.map(s => ({
        time:     s.time as Time,
        position: s.type === "buy" ? "belowBar" : "aboveBar",
        color:    s.type === "buy" ? "#22c55e"  : "#ef4444",
        shape:    s.type === "buy" ? "arrowUp"  : "arrowDown",
        text:     s.type === "buy" ? "BUY"      : "SELL",
        size: 2,
      }))
      candles.setMarkers(markers)
    }

    // ── TP / SL ─────────────────────────────────────────────────
    if (tp) candles.createPriceLine({ price: tp, color: "rgba(34,197,94,0.9)",  lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "TP" })
    if (sl) candles.createPriceLine({ price: sl, color: "rgba(239,68,68,0.9)",  lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "SL" })

    // ── Order Blocks ─────────────────────────────────────────────
    if (cfg.ob) {
      data.order_blocks.forEach((ob, i) => {
        const bull = ob.type === "bullish"
        candles.createPriceLine({ price: ob.high, color: bull ? "rgba(34,197,94,0.85)"  : "rgba(239,68,68,0.85)",  lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true,  title: i === 0 ? (bull ? "OB▲" : "OB▼") : "" })
        candles.createPriceLine({ price: ob.low,  color: bull ? "rgba(34,197,94,0.35)"  : "rgba(239,68,68,0.35)",  lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" })
        candles.createPriceLine({ price: (ob.high + ob.low) / 2, color: bull ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)", lineWidth: 22, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" })
      })
    }

    // ── FVG ──────────────────────────────────────────────────────
    if (cfg.fvg) {
      data.fvgs.forEach((fvg, i) => {
        const bull = fvg.type === "bullish"
        candles.createPriceLine({ price: fvg.top,    color: bull ? "rgba(59,130,246,0.8)"  : "rgba(249,115,22,0.8)",  lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true,  title: i === 0 ? "FVG" : "" })
        candles.createPriceLine({ price: fvg.bottom, color: bull ? "rgba(59,130,246,0.35)" : "rgba(249,115,22,0.35)", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" })
        candles.createPriceLine({ price: (fvg.top + fvg.bottom) / 2, color: bull ? "rgba(59,130,246,0.06)" : "rgba(249,115,22,0.06)", lineWidth: 14, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" })
      })
    }

    // ── Liquidation ──────────────────────────────────────────────
    if (cfg.liq) {
      data.liquidation_levels.filter(l => l.leverage === 10 || l.leverage === 20).forEach(l => {
        candles.createPriceLine({ price: l.long_liq,  color: "rgba(239,68,68,0.7)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `${l.leverage}x L.Liq` })
        candles.createPriceLine({ price: l.short_liq, color: "rgba(34,197,94,0.7)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `${l.leverage}x S.Liq` })
      })
    }

    chart.timeScale().fitContent()

    const onResize = () => {
      if (containerRef.current && chartRef.current)
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener("resize", onResize)
    return () => { window.removeEventListener("resize", onResize); chart.remove(); chartRef.current = null }
  }, [data, cfg, tp, sl])

  const set = (key: keyof Settings, val: any) => setCfg(c => ({ ...c, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col">
      {/* ── Başlık ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700 shrink-0">
        <span className="text-white font-bold text-sm">{symbol.replace("/USDT:USDT", "/USDT")} — Gelişmiş Grafik</span>

        {/* Zaman dilimi */}
        <div className="flex gap-1 ml-2">
          {TIMEFRAMES.map(t => (
            <button key={t.value} onClick={() => setTf(t.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${tf === t.value ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-700"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-slate-700 mx-1" />

        {/* İndikatör toggle'ları */}
        {[
          { key: "ema",     label: "EMA",    color: "text-blue-400"   },
          { key: "bb",      label: "BB",     color: "text-yellow-400" },
          { key: "ob",      label: "OB",     color: "text-green-400"  },
          { key: "fvg",     label: "FVG",    color: "text-blue-300"   },
          { key: "liq",     label: "Liq",    color: "text-red-400"    },
          { key: "volume",  label: "Hacim",  color: "text-slate-300"  },
          { key: "signals", label: "Sinyal", color: "text-emerald-400"},
        ].map(({ key, label, color }) => (
          <button key={key} onClick={() => set(key as keyof Settings, !(cfg as any)[key])}
            className={`px-2 py-1 rounded border text-xs transition-colors ${(cfg as any)[key]
              ? `border-current ${color} bg-current/10`
              : "border-slate-700 text-slate-600"}`}>
            {label}
          </button>
        ))}

        {/* Ayarlar */}
        <button onClick={() => setShowCfg(v => !v)}
          className={`px-2 py-1 rounded border text-xs transition-colors ${showCfg ? "border-slate-400 text-white" : "border-slate-700 text-slate-500 hover:text-white"}`}>
          ⚙ Ayarlar
        </button>

        <button onClick={fetchData} disabled={loading} className="text-slate-400 hover:text-white disabled:opacity-40 text-base">
          {loading ? "⏳" : "↻"}
        </button>

        <button onClick={onClose} className="ml-auto text-slate-400 hover:text-white text-xl leading-none px-2">✕</button>
      </div>

      {/* ── Ayarlar paneli ───────────────────────────────────── */}
      {showCfg && (
        <div className="flex items-center gap-6 px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 font-medium">EMA Periyotları</span>
            {([["ema9p","EMA1"],["ema21p","EMA2"],["ema55p","EMA3"]] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1 text-slate-400">
                {label}
                <input type="number" min={2} max={200}
                  value={(cfg as any)[k]}
                  onChange={e => set(k as keyof Settings, parseInt(e.target.value) || 9)}
                  className="w-12 px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-white text-center"
                />
              </label>
            ))}
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 font-medium">Bollinger</span>
            <label className="flex items-center gap-1 text-slate-400">
              Periyot
              <input type="number" min={5} max={100} value={cfg.bbPeriod}
                onChange={e => set("bbPeriod", parseInt(e.target.value) || 20)}
                className="w-12 px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-white text-center"
              />
            </label>
            <label className="flex items-center gap-1 text-slate-400">
              Std
              <input type="number" min={1} max={4} step={0.5} value={cfg.bbMult}
                onChange={e => set("bbMult", parseFloat(e.target.value) || 2)}
                className="w-12 px-1 py-0.5 bg-slate-800 border border-slate-700 rounded text-white text-center"
              />
            </label>
          </div>
          {tp && sl && (
            <>
              <div className="h-4 w-px bg-slate-700" />
              <span className="text-green-400">TP ${tp.toFixed(2)}</span>
              <span className="text-red-400">SL ${sl.toFixed(2)}</span>
            </>
          )}
        </div>
      )}

      {/* ── Grafik ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* ── Alt bilgi ────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-slate-900 border-t border-slate-700 text-xs text-slate-500 shrink-0">
        <span className="flex items-center gap-1.5"><span className="w-3 h-px bg-blue-400 inline-block" /> EMA{cfg.ema9p}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-px bg-orange-400 inline-block" /> EMA{cfg.ema21p}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-px bg-purple-400 inline-block" /> EMA{cfg.ema55p}</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-green-500/40 border border-green-500 inline-block" /> OB Bullish</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-500/40 border border-red-500 inline-block" /> OB Bearish</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-px bg-blue-400 inline-block border-dashed" /> FVG</span>
        {cfg.bb && <span className="flex items-center gap-1.5"><span className="w-3 h-px bg-yellow-400 inline-block" /> BB({cfg.bbPeriod},{cfg.bbMult})</span>}
        <span className="ml-auto">ESC ile kapat</span>
      </div>
    </div>
  )
}
