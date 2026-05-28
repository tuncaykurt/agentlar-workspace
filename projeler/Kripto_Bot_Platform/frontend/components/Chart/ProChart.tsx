"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  IChartApi, ISeriesApi, Time, IPriceLine,
} from "lightweight-charts"
import { api, createMarketWS, API_URL } from "@/lib/api"
import IndicatorPicker from "./IndicatorPicker"
import CustomIndicatorEditor, {
  runCustomCode, CustomSeries,
  loadCustomInds, CustomIndicatorDef,
} from "./CustomIndicatorEditor"
import IndicatorSettings from "./IndicatorSettings"

// ─── Tipler ───────────────────────────────────────────────────────────────────
interface Point   { time: number; value: number }
interface Candle  { time: number; open: number; high: number; low: number; close: number }
interface VolBar  { time: number; value: number; color: string }
interface VPLevel { price: number; volume: number; pct: number; is_poc: boolean; is_va: boolean }
interface OBRect  { type:"bullish"|"bearish"; time_start:number; time_end:number; high:number; low:number; mitigated:boolean }
interface SRLevel { price: number; type:"support"|"resistance"; strength: number }
interface UTSignal{ time: number; type:"buy"|"sell"; price: number }
interface LiqLevel { price: number; long_liq: number; short_liq: number; total: number }
interface LiqData  { long_liq_count: number; short_liq_count: number; signal: string; top_price_levels?: number[] }

interface ChartData {
  candles: Candle[]; volume: VolBar[]
  ema9: Point[]; ema21: Point[]; ema55: Point[]; ema200: Point[]; sma20: Point[]; vwap: Point[]
  bb_upper: Point[]; bb_mid: Point[]; bb_lower: Point[]
  rsi: Point[]; macd_line: Point[]; macd_signal: Point[]; macd_hist: Point[]
  stoch_k: Point[]; stoch_d: Point[]
  atr: Point[]; cci: Point[]; williams_r: Point[]; obv: Point[]; mfi: Point[]
  volume_profile: VPLevel[]
  ut_bot:      { signals: UTSignal[]; trail: Point[] }
  lr_channel:  { upper: Point[]; mid: Point[]; lower: Point[]; slope: number }
  sr_levels:   SRLevel[]
  order_blocks:OBRect[]
  liquidations?: LiqData
  liq_heatmap?: { levels: LiqLevel[]; total_count?: number; total_usd?: number }
}

interface Legend  { o: number; h: number; l: number; c: number; change: number }

export interface EMALine { period: number; color: string }

export interface Indicator {
  id: string; name: string; type: "overlay" | "oscillator"
  color?: string; color2?: string; lineWidth?: number; lineStyle?: string
  params?: Record<string, number | boolean | string>
  periods?: EMALine[]   // EMA için çok-periyot desteği
  hiddenTFs?: string[]
  enabled: boolean
}

// ─── Client-side EMA hesaplayıcı ─────────────────────────────────────────────
function computeEMA(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const res: (number | null)[] = []
  let val: number | null = null
  let sum = 0; let cnt = 0
  for (const c of closes) {
    if (val === null) {
      sum += c; cnt++
      if (cnt >= period) { val = sum / period; res.push(val) }
      else res.push(null)
    } else {
      val = c * k + val * (1 - k)
      res.push(val)
    }
  }
  return res
}

// ─── Varsayılan indikatörler ───────────────────────────────────────────────────
export const INDICATOR_LIBRARY: Indicator[] = [
  {
    id: "ema", name: "EMA", type: "overlay", lineWidth: 1, enabled: true,
    periods: [
      { period: 6,   color: "#3b82f6" },
      { period: 14,  color: "#f97316" },
      { period: 50,  color: "#eab308" },
      { period: 200, color: "#ef4444" },
    ],
  },
  { id: "sma20",   name: "SMA 20",           type: "overlay",    color: "#06b6d4", lineWidth: 1, enabled: false },
  { id: "vwap",    name: "VWAP",             type: "overlay",    color: "#fbbf24", lineWidth: 1, enabled: false },
  { id: "bb",      name: "Bollinger (20,2)", type: "overlay",    color: "#64748b", lineWidth: 1, enabled: false },
  { id: "volume",  name: "Hacim",            type: "oscillator", enabled: true  },
  { id: "rsi",     name: "RSI (14)",         type: "oscillator", color: "#8b5cf6", enabled: false },
  { id: "macd",    name: "MACD (12,26,9)",   type: "oscillator", color: "#3b82f6", color2: "#f97316", enabled: false },
  { id: "stoch",   name: "Stochastic (14,3)",type: "oscillator", color: "#22c55e", color2: "#ef4444", enabled: false },
  { id: "cci",     name: "CCI (20)",         type: "oscillator", color: "#f59e0b", enabled: false },
  { id: "williams",name: "Williams %R",      type: "oscillator", color: "#06b6d4", enabled: false },
  { id: "atr",     name: "ATR (14)",         type: "oscillator", color: "#94a3b8", enabled: false },
  { id: "obv",     name: "OBV",              type: "oscillator", color: "#a3e635", enabled: false },
  { id: "mfi",     name: "MFI (14)",         type: "oscillator", color: "#fb923c", enabled: false },
]

const TIMEFRAMES = [
  { label: "1d",  value: "1m"  },
  { label: "5d",  value: "5m"  },
  { label: "15d", value: "15m" },
  { label: "1s",  value: "1h"  },
  { label: "4s",  value: "4h"  },
  { label: "1g",  value: "1d"  },
]

// ─── Osilatör pane çizici ─────────────────────────────────────────────────────
function drawOscillatorPane(
  container: HTMLDivElement,
  id: string,
  data: ChartData,
  ind: Indicator,
  mainChart: IChartApi,
  customSeriesData?: import("./CustomIndicatorEditor").CustomSeries[],
  height = 140,
  signals?: import("./CustomIndicatorEditor").CustomSignal[],
): (() => void) {
  const chart = createChart(container, {
    width:  container.clientWidth,
    height: container.clientHeight > 0 ? container.clientHeight : height,
    layout: { background: { type: ColorType.Solid, color: "#020817" }, textColor: "#64748b", fontSize: 10 },
    grid:   { vertLines: { color: "#0f172a" }, horzLines: { color: "#0f172a" } },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: "#1e293b", scaleMargins: { top: 0.02, bottom: 0.02 } },
    timeScale: { visible: false },
    handleScale: { axisPressedMouseMove: { price: true, time: false }, mouseWheel: false, pinch: false },
    handleScroll: false,
  })

  // Hemen ana grafikle senkronize et — yeni oluşturulan panel kaymış olabilir
  const initRange = mainChart.timeScale().getVisibleLogicalRange()
  if (initRange) chart.timeScale().setVisibleLogicalRange(initRange)

  const syncHandler = (range: any) => {
    if (range) chart.timeScale().setVisibleLogicalRange(range)
  }
  mainChart.timeScale().subscribeVisibleLogicalRangeChange(syncHandler)

  const addLine = (d: Point[], color: string, lw = 1, style = LineStyle.Solid) => {
    const s = chart.addLineSeries({ color, lineWidth: lw, lineStyle: style, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true })
    s.setData(d as any); return s
  }
  const addHLine = (price: number, color: string) => {
    const s = chart.addLineSeries({ color, lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    s.setData(data.candles.map(c => ({ time: c.time as Time, value: price })))
  }

  // Özel indikatör serileri (alt panel): candlestick + histogram + çizgi + marker desteği
  if (id.startsWith("custom_") && customSeriesData?.length) {
    const styleMap: Record<string, LineStyle> = {
      solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted,
    }
    const resolveMarkers = (markers: any[]) =>
      markers
        .map(m => {
          const idx = m.index < 0 ? data.candles.length + m.index : m.index
          const c = data.candles[idx]
          if (!c) return null
          return { time: c.time as Time, position: m.position, shape: m.shape, color: m.color, text: m.text, size: 1 }
        })
        .filter(Boolean) as any[]

    let firstSeries: any = null

    customSeriesData.forEach(rs => {
      // ── Baseline (alan dolgusu) ──────────────────────────────
      if (rs.type === "baseline") {
        const base = (rs as any).baselineValue ?? 0
        const aboveC = (rs as any).aboveColor ?? "rgba(34,197,94,0.6)"
        const belowC = (rs as any).belowColor ?? "rgba(239,68,68,0.6)"
        const s = (chart as any).addBaselineSeries({
          baseValue:        { type: "price", price: base },
          topFillColor1:    aboveC,
          topFillColor2:    aboveC,
          bottomFillColor1: belowC,
          bottomFillColor2: belowC,
          topLineColor:     "rgba(0,0,0,0)",
          bottomLineColor:  "rgba(0,0,0,0)",
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        const pts = rs.values
          .map((v, i) => v !== null ? { time: data.candles[i]?.time as Time, value: v } : null)
          .filter(Boolean) as any[]
        if (pts.length) s.setData(pts)
        if (!firstSeries) firstSeries = s
        return
      }

      // ── Candlestick ──────────────────────────────────────────
      if (rs.type === "candlestick" && (rs as any).ohlcValues?.length) {
        const s = chart.addCandlestickSeries({
          upColor:      rs.upColor   ?? "#26a69a",
          downColor:    rs.downColor ?? "#ef5350",
          wickUpColor:  rs.upColor   ?? "#26a69a",
          wickDownColor:rs.downColor ?? "#ef5350",
          borderVisible: false,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        const pts = (rs as any).ohlcValues
          .map((v: any, i: number) => {
            if (!v) return null
            const t = data.candles[i]?.time
            if (t == null) return null
            return { time: t as Time, open: v.open, high: v.high, low: v.low, close: v.close }
          })
          .filter(Boolean) as any[]
        if (pts.length) s.setData(pts)
        if (rs.markers?.length) s.setMarkers(resolveMarkers(rs.markers))
        if (!firstSeries) firstSeries = s
        return
      }

      // ── Histogram ────────────────────────────────────────────
      const isHistogram = rs.type === "histogram" || rs.style === "histogram" || rs.style === "columns"
      if (isHistogram) {
        const s = chart.addHistogramSeries({ color: rs.color, priceLineVisible: false, lastValueVisible: false })
        if (rs.coloredValues?.length) {
          const pts = rs.coloredValues
            .map((v, i) => v !== null ? { time: data.candles[i]?.time as Time, value: v.value, color: v.color } : null)
            .filter(Boolean) as any[]
          s.setData(pts)
        } else {
          const pts = rs.values
            .map((v, i) => v !== null ? { time: data.candles[i]?.time as Time, value: v, color: rs.color } : null)
            .filter(Boolean) as any[]
          s.setData(pts)
        }
        if (rs.markers?.length) s.setMarkers(resolveMarkers(rs.markers))
        if (!firstSeries) firstSeries = s
        return
      }

      // ── Line ─────────────────────────────────────────────────
      const pts = rs.values
        .map((v, i) => v !== null ? { time: data.candles[i]?.time as Time, value: v } : null)
        .filter(Boolean) as any[]
      if (!pts.length) return
      const s = chart.addLineSeries({
        color: rs.color, lineWidth: (rs.lineWidth ?? rs.width ?? 1) as any,
        lineStyle: styleMap[rs.style] ?? LineStyle.Solid,
        priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title: rs.title,
      })
      s.setData(pts)
      if (rs.markers?.length) s.setMarkers(resolveMarkers(rs.markers))
      if (!firstSeries) firstSeries = s
    })

    // 0-100 aralığındaki osilatörler için görünür aralığı zorla (RSI, Stoch vb.)
    // Tüm sayısal değerleri topla ve aralığı tespit et
    const allNums = customSeriesData.flatMap(rs => (rs.values || []).filter((v): v is number => v !== null && v !== undefined))
    if (allNums.length > 0) {
      const dMin = Math.min(...allNums)
      const dMax = Math.max(...allNums)
      if (dMin >= -5 && dMax <= 105) {
        // Osilatör aralığı — 0 ve 100'ü görünür kıl
        const anchorMin = chart.addLineSeries({ color: "rgba(0,0,0,0)", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
        const anchorMax = chart.addLineSeries({ color: "rgba(0,0,0,0)", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
        anchorMin.setData([{ time: data.candles[0].time as Time, value: 0 }, { time: data.candles[data.candles.length - 1].time as Time, value: 0 }])
        anchorMax.setData([{ time: data.candles[0].time as Time, value: 100 }, { time: data.candles[data.candles.length - 1].time as Time, value: 100 }])
      }
    }

    // Sinyalleri ilk seriye marker olarak ekle (çağıran taraf zaten filtreledi)
    if (firstSeries && signals?.length) {
      const mks = signals
        .map(sig => {
          const idx = sig.bar_index < 0 ? data.candles.length + sig.bar_index : sig.bar_index
          const c = data.candles[idx]
          if (!c) return null
          return {
            time:     c.time as Time,
            position: sig.type === "buy" ? "belowBar" : "aboveBar",
            shape:    sig.type === "buy" ? "arrowUp"  : "arrowDown",
            color:    sig.type === "buy" ? "#22c55e"  : "#ef4444",
            text:     sig.reason ?? (sig.type === "buy" ? "▲" : "▼"),
            size: 1,
          }
        })
        .filter(Boolean)
        .sort((a: any, b: any) => (a!.time as number) - (b!.time as number)) as any[]
      if (mks.length) firstSeries.setMarkers(mks)
    }

    const onResize = () => { if (container) chart.applyOptions({ width: container.clientWidth }) }
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncHandler)
      chart.remove()
    }
  }

  if (id === "volume") {
    const s = chart.addHistogramSeries({ priceFormat: { type: "volume" } })
    s.setData(data.volume as any)
  } else if (id === "rsi") {
    addLine(data.rsi, ind.color || "#8b5cf6")
    addHLine(70, "rgba(239,68,68,0.4)"); addHLine(50, "rgba(100,100,100,0.3)"); addHLine(30, "rgba(34,197,94,0.4)")
  } else if (id === "macd") {
    const hist = chart.addHistogramSeries({ priceFormat: { type: "price", precision: 4 } })
    hist.setData(data.macd_hist.map(d => ({ ...d, color: d.value >= 0 ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)" })) as any)
    addLine(data.macd_line, ind.color || "#3b82f6")
    addLine(data.macd_signal, ind.color2 || "#f97316")
  } else if (id === "stoch") {
    addLine(data.stoch_k, ind.color  || "#22c55e")
    addLine(data.stoch_d, ind.color2 || "#ef4444")
    addHLine(80, "rgba(239,68,68,0.3)"); addHLine(20, "rgba(34,197,94,0.3)")
  } else if (id === "cci") {
    addLine(data.cci, ind.color || "#f59e0b")
    addHLine(100, "rgba(239,68,68,0.3)"); addHLine(-100, "rgba(34,197,94,0.3)")
  } else if (id === "williams") addLine(data.williams_r, ind.color || "#06b6d4")
  else if (id === "atr")        addLine(data.atr,        ind.color || "#94a3b8")
  else if (id === "obv")        addLine(data.obv,        ind.color || "#a3e635")
  else if (id === "mfi") {
    addLine(data.mfi, ind.color || "#fb923c")
    addHLine(80, "rgba(239,68,68,0.3)"); addHLine(20, "rgba(34,197,94,0.3)")
  }

  const onResize = () => { if (container) chart.applyOptions({ width: container.clientWidth }) }
  window.addEventListener("resize", onResize)
  return () => {
    window.removeEventListener("resize", onResize)
    mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncHandler)
    chart.remove()
  }
}

// ─── Volume Profile Canvas ────────────────────────────────────────────────────
function drawVolumeProfile(
  canvas: HTMLCanvasElement,
  levels: VPLevel[],
  series: ISeriesApi<"Candlestick">,
) {
  const ctx = canvas.getContext("2d")
  if (!ctx || !levels.length || canvas.width === 0 || canvas.height === 0) return
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const poc    = levels.find(l => l.is_poc)
  const barH   = Math.max(3, (H / levels.length) * 1.1)
  const MARGIN = 4  // sağ kenardan boşluk

  levels.forEach(level => {
    const y = series.priceToCoordinate(level.price)
    if (y === null) return
    const yN = y as number
    if (yN < -barH || yN > H + barH) return

    const barW = Math.max(3, level.pct * (W - MARGIN - 2))

    if (level.is_poc) {
      ctx.fillStyle = "rgba(251,191,36,0.9)"
    } else if (level.is_va) {
      ctx.fillStyle = "rgba(96,165,250,0.5)"
    } else {
      ctx.fillStyle = "rgba(96,165,250,0.2)"
    }
    ctx.fillRect(W - MARGIN - barW, yN - barH / 2, barW, barH)
  })

  // POC etiket
  if (poc) {
    const y = series.priceToCoordinate(poc.price)
    if (y !== null) {
      const yN = y as number
      ctx.font = "bold 9px monospace"
      ctx.fillStyle = "#fbbf24"
      ctx.textAlign = "right"
      ctx.fillText(`POC`, W - MARGIN - 2, yN - 3)
    }
  }

  // Value Area etiketi (üst)
  const vaLevels = levels.filter(l => l.is_va)
  if (vaLevels.length) {
    const vaHigh = Math.max(...vaLevels.map(l => l.price))
    const vaLow  = Math.min(...vaLevels.map(l => l.price))
    const yHigh  = series.priceToCoordinate(vaHigh)
    const yLow   = series.priceToCoordinate(vaLow)
    if (yHigh !== null && yLow !== null) {
      ctx.strokeStyle = "rgba(96,165,250,0.5)"
      ctx.lineWidth   = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(0, yHigh as number); ctx.lineTo(W - MARGIN, yHigh as number); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, yLow  as number); ctx.lineTo(W - MARGIN, yLow  as number); ctx.stroke()
      ctx.setLineDash([])
      ctx.font = "9px monospace"
      ctx.fillStyle = "rgba(96,165,250,0.8)"
      ctx.textAlign = "right"
      ctx.fillText("VAH", W - MARGIN - 2, (yHigh as number) - 2)
      ctx.fillText("VAL", W - MARGIN - 2, (yLow  as number) + 10)
    }
  }
}

// ─── Order Block + S/R Canvas çizici ─────────────────────────────────────────
function drawOBCanvas(
  canvas: HTMLCanvasElement,
  obs: OBRect[],
  srLevels: SRLevel[],
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  showOB: boolean,
  showSR: boolean,
) {
  const ctx = canvas.getContext("2d")
  if (!ctx || canvas.width === 0 || canvas.height === 0) return
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  // ── Order Blocks ───────────────────────────────────────────────
  if (showOB) {
    obs.forEach(ob => {
      const x1r = chart.timeScale().timeToCoordinate(ob.time_start as Time)
      const x2r = chart.timeScale().timeToCoordinate(ob.time_end   as Time)
      const y1r = series.priceToCoordinate(ob.high)
      const y2r = series.priceToCoordinate(ob.low)
      if (x1r === null || x2r === null || y1r === null || y2r === null) return

      const x1 = Math.min(x1r as number, x2r as number)
      const x2 = Math.max(x1r as number, x2r as number) + 40
      const y1 = Math.min(y1r as number, y2r as number)
      const y2 = Math.max(y1r as number, y2r as number)
      const bH = Math.max(y2 - y1, 2)
      const bW = Math.max(x2 - x1, 4)

      if (ob.type === "bullish") {
        ctx.fillStyle   = ob.mitigated ? "rgba(34,197,94,0.06)" : "rgba(34,197,94,0.18)"
        ctx.strokeStyle = ob.mitigated ? "rgba(34,197,94,0.25)" : "rgba(34,197,94,0.7)"
      } else {
        ctx.fillStyle   = ob.mitigated ? "rgba(239,68,68,0.06)" : "rgba(239,68,68,0.18)"
        ctx.strokeStyle = ob.mitigated ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.7)"
      }
      ctx.lineWidth = 1
      ctx.fillRect(x1, y1, bW, bH)
      ctx.strokeRect(x1, y1, bW, bH)

      if (!ob.mitigated) {
        ctx.font      = "bold 9px monospace"
        ctx.fillStyle = ob.type === "bullish" ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)"
        ctx.textAlign = "left"
        ctx.fillText(ob.type === "bullish" ? "OB↑" : "OB↓", x1 + 3, y1 + 10)
      }
    })
  }

  // ── S/R Seviyeleri ─────────────────────────────────────────────
  if (showSR) {
    srLevels.forEach(level => {
      const y = series.priceToCoordinate(level.price)
      if (y === null) return
      const yn = y as number
      if (yn < 0 || yn > H) return

      const isRes  = level.type === "resistance"
      const alpha  = Math.min(0.3 + level.strength * 0.1, 0.9)
      const lw     = Math.min(1 + level.strength * 0.5, 3)
      ctx.strokeStyle = isRes ? `rgba(239,68,68,${alpha})` : `rgba(34,197,94,${alpha})`
      ctx.lineWidth   = lw
      ctx.setLineDash(level.strength >= 3 ? [] : [4, 4])
      ctx.beginPath()
      ctx.moveTo(0, yn)
      ctx.lineTo(W - 80, yn)
      ctx.stroke()
      ctx.setLineDash([])

      // Fiyat etiketi
      ctx.fillStyle = isRes ? `rgba(239,68,68,${alpha + 0.1})` : `rgba(34,197,94,${alpha + 0.1})`
      ctx.font      = `${level.strength >= 3 ? "bold " : ""}9px monospace`
      ctx.textAlign = "right"
      ctx.fillText(level.price.toFixed(1), W - 82, yn - 2)
    })
  }
}

// ═══════════════════════════════════════════════════════════════
//  Ana Bileşen
// ═══════════════════════════════════════════════════════════════
export default function ProChart({
  symbol, onClose, tp, sl, gridLines, hideVolume, gridMode, trades, activeTimeframe
}: {
  symbol: string; onClose?: () => void; tp?: number; sl?: number; gridLines?: number[]
  hideVolume?: boolean; gridMode?: string; trades?: any[]; activeTimeframe?: string
}) {
  const mainRef          = useRef<HTMLDivElement>(null)
  const chartRef         = useRef<IChartApi | null>(null)
  const candleSeriesRef    = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const vpCanvasRef        = useRef<HTMLCanvasElement>(null)
  const obCanvasRef        = useRef<HTMLCanvasElement>(null)
  const userPriceLinesRef  = useRef<IPriceLine[]>([])
  const gridPriceLinesRef  = useRef<IPriceLine[]>([])
  const tpSlLinesRef       = useRef<IPriceLine[]>([])
  const hasInitialFitRef   = useRef(false)
  const vpRafRef           = useRef<number>(0)
  const obRafRef           = useRef<number>(0)
  const cdRafRef           = useRef<number>(0)
  const countdownDivRef    = useRef<HTMLDivElement>(null)
  
  // Canlı fiyat referansı (countdown hizalaması için)
  const livePriceRef       = useRef<number>(0)
  const overlaySeriesRefs  = useRef<{id: string; name: string; color: string; series: ISeriesApi<"Line">}[]>([])

  const [data,      setData]      = useState<ChartData | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [tf,        setTf]        = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("prochart_tf") ?? "1h") : "1h"
  )
  const [inds,      setInds]      = useState<Indicator[]>(() =>
    hideVolume
      ? INDICATOR_LIBRARY.map(i => i.id === "volume" ? { ...i, enabled: false } : i)
      : INDICATOR_LIBRARY
  )
  const [picker,    setPicker]    = useState(false)
  const [legend,    setLegend]    = useState<Legend | null>(null)
  const [drawMode,  setDrawMode]  = useState(false)
  const [userLines, setUserLines] = useState<number[]>([])
  const [showVP,       setShowVP]       = useState(false)
  const [showVPTable,  setShowVPTable]  = useState(false)
  const [showEditor,   setShowEditor]   = useState(false)
  const [settingsInd,  setSettingsInd]  = useState<Indicator | null>(null)
  const [customIndDefs,setCustomIndDefs]= useState<CustomIndicatorDef[]>([])
  const [liveSignals,  setLiveSignals]  = useState<{name:string;type:"buy"|"sell";reason?:string}[]>([])
  const [aiAnalysis,   setAiAnalysis]  = useState<{approved:boolean;confidence:number;reason:string;strength?:number} | null>(null)
  const [aiLoading,    setAiLoading]   = useState(false)
  const [customSeries,  setCustomSeries]  = useState<CustomSeries[]>([])
  const [editorPaneCode,setEditorPaneCode]= useState<string | null>(null) // alt panel kodu
  const [editorPaneName,setEditorPaneName]= useState<string>("Özel")
  const [editorPaneHeight, setEditorPaneHeight] = useState(220)
  const editorPaneRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{ startY: number; startH: number } | null>(null)

  const onResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragStateRef.current = { startY: e.clientY, startH: editorPaneHeight }
    const onMove = (ev: MouseEvent) => {
      if (!dragStateRef.current) return
      const delta = dragStateRef.current.startY - ev.clientY
      setEditorPaneHeight(Math.max(80, Math.min(600, dragStateRef.current.startH + delta)))
    }
    const onUp = () => {
      dragStateRef.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }
  const [countdown,   setCountdown]   = useState<string>("")
  const [emaLegend,   setEmaLegend]   = useState<{id:string;name:string;color:string;value:number|null}[]>([])
  const [showUT,      setShowUT]      = useState(false)
  const [showLR,      setShowLR]      = useState(false)
  const [showOB,      setShowOB]      = useState(false)
  const [showSR,      setShowSR]      = useState(false)
  const [showLiq,     setShowLiq]     = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  const [stratSignal,  setStratSignal]  = useState<string | null>(null)
  const [stratTrades,  setStratTrades]  = useState<any[]>([])
  const [stratLoading, setStratLoading] = useState(false)
  const [showStratMenu,setShowStratMenu]= useState(false)

  // Özel indikatörleri localStorage'dan yükle ve inds'e ekle
  useEffect(() => {
    const defs = loadCustomInds()
    setCustomIndDefs(defs)
    setInds(prev => {
      const withoutOld = prev.filter(i => !i.id.startsWith("custom_"))
      const newCustom: Indicator[] = defs.map(d => ({
        id: d.id, name: d.name, type: d.type,
        color: d.color, lineWidth: 1, enabled: false,
        params: { _code: d.code as any },
      }))
      return [...withoutOld, ...newCustom]
    })
  }, [])

  // Strateji secimine gore Bollinger ve RSI indikatörlerini otomatik ac/kapat
  useEffect(() => {
    if (gridMode === "bollinger" || gridMode === "hybrid" || gridMode === "bb_direction") {
      setInds(prev => prev.map(i => {
        if (i.id === "bb" || i.id === "rsi") return { ...i, enabled: true }
        if (i.id === "ema") return { ...i, enabled: false }
        return i
      }))
    } else if (gridMode === "ema_trend") {
      setInds(prev => prev.map(i => {
        if (i.id === "ema" || i.id === "rsi") return { ...i, enabled: true }
        if (i.id === "bb") return { ...i, enabled: false }
        return i
      }))
    } else if (gridMode === "manual") {
      setInds(prev => prev.map(i => {
        if (i.id === "bb" || i.id === "rsi") return { ...i, enabled: false }
        if (i.id === "ema") return { ...i, enabled: true }
        return i
      }))
    }
  }, [gridMode])

  // Disaridan aktif bot timeframe gelirse haritayi senkronize et
  useEffect(() => {
    if (activeTimeframe) {
      setTf(activeTimeframe)
      localStorage.setItem("prochart_tf", activeTimeframe)
    }
  }, [activeTimeframe])

  const oscillators = inds.filter(i => i.type === "oscillator" && i.enabled)
  const paneRefs    = useRef<Record<string, HTMLDivElement | null>>({})

  // ── Veri çekme ──────────────────────────────────────────────
  const tfLimits: Record<string, number> = {
    "1m": 500, "5m": 1000, "15m": 1000,
    "1h": 1000, "4h": 1000, "1d": 365,
  }
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const enc = encodeURIComponent(symbol)
      const lim = tfLimits[tf] || 2000
      const d   = await api.get(`/chart/data?symbol=${enc}&interval=${tf}&limit=${lim}`)
      if (d && d.candles && d.candles.length > 0) {
        // Sort + deduplicate candles & volume by time
        d.candles.sort((a: Candle, b: Candle) => a.time - b.time)
        const seenTimes = new Set<number>()
        d.candles = d.candles.filter((c: Candle) => {
          if (seenTimes.has(c.time)) return false
          seenTimes.add(c.time)
          return true
        })
        if (d.volume) {
          d.volume.sort((a: VolBar, b: VolBar) => a.time - b.time)
          const seenVol = new Set<number>()
          d.volume = d.volume.filter((v: VolBar) => {
            if (seenVol.has(v.time)) return false
            seenVol.add(v.time)
            return true
          })
        }
        setData(d)
      }
    } catch (e) {
      console.error("Grafik verisi alınamadı:", e)
    }
    finally { setLoading(false) }
  }, [symbol, tf])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Canlı fiyat güncellemesi (ticker polling) ──
  const liveCandleRef = useRef<{ time: number; open: number; high: number; low: number } | null>(null)

  // symbol/tf/data değişince live candle sıfırla
  useEffect(() => { liveCandleRef.current = null }, [symbol, tf, data])

  useEffect(() => {
    const tfSeconds: Record<string, number> = {
      "1m": 60, "3m": 180, "5m": 300, "15m": 900,
      "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400,
    }
    const tfSec = tfSeconds[tf] ?? 3600

    const poll = async () => {
      if (!candleSeriesRef.current || !data) return
      try {
        const enc = encodeURIComponent(symbol)
        const ticker = await fetch(
          `${API_URL}/market/ticker?symbol=${enc}`
        ).then(r => r.json())
        const price = parseFloat(ticker?.last)
        if (ticker?.last == null || isNaN(price) || price <= 0) return
        livePriceRef.current = price

        // Son tarihsel mumun zamanını referans al
        const lastCandle = data.candles[data.candles.length - 1]
        const lastTime = lastCandle?.time ?? 0

        // Mevcut mum periyodunun başlangıç zamanı
        const now = Math.floor(Date.now() / 1000)
        const candleTime = Math.floor(now / tfSec) * tfSec

        // Son tarihsel mum ile canlı mum arasında boşluk varsa, son mumun üstüne yaz
        // (boşluk = mevcut mum ile son tarihsel mum arasında 2+ periyot fark var)
        const effectiveTime = (candleTime - lastTime > tfSec * 2 && lastTime > 0)
          ? lastTime + tfSec  // Boşluk var, bir sonraki periyota yaz
          : candleTime

        if (!liveCandleRef.current || liveCandleRef.current.time !== effectiveTime) {
          // Yeni mum periyodu
          if (lastCandle && lastCandle.time === effectiveTime) {
            liveCandleRef.current = {
              time: effectiveTime,
              open: lastCandle.open,
              high: Math.max(lastCandle.high, price),
              low:  Math.min(lastCandle.low,  price),
            }
          } else {
            // Son tarihsel mumun close'unu open olarak kullan (fiyat sürekliliği)
            const openPrice = lastCandle ? lastCandle.close : price
            liveCandleRef.current = { time: effectiveTime, open: openPrice, high: Math.max(openPrice, price), low: Math.min(openPrice, price) }
          }
        } else {
          liveCandleRef.current.high = Math.max(liveCandleRef.current.high, price)
          liveCandleRef.current.low  = Math.min(liveCandleRef.current.low,  price)
        }

        candleSeriesRef.current.update({
          time:  effectiveTime as Time,
          open:  liveCandleRef.current.open,
          high:  liveCandleRef.current.high,
          low:   liveCandleRef.current.low,
          close: price,
        })
      } catch { /* sessizce geç */ }
    }
    poll()
    const id = setInterval(poll, 2000)  // 3s → 2s daha akıcı güncelleme
    return () => clearInterval(id)
  }, [symbol, tf, data])

  // ── Mum kapanış geri sayımı ──────────────────────────────────
  useEffect(() => {
    const intervalSeconds: Record<string, number> = {
      "1m": 60, "3m": 180, "5m": 300, "15m": 900,
      "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400,
    }
    const total = intervalSeconds[tf] ?? 3600

    const tick = () => {
      const now  = Math.floor(Date.now() / 1000)
      const rem  = total - (now % total)
      const h    = Math.floor(rem / 3600)
      const m    = Math.floor((rem % 3600) / 60)
      const s    = rem % 60
      if (h > 0)
        setCountdown(`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`)
      else
        setCountdown(`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tf])

  // ── ESC ─────────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (drawMode) { setDrawMode(false); return }
        onClose?.()
      }
    }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onClose, drawMode])

  // ── Ana grafik ───────────────────────────────────────────────
  useEffect(() => {
    console.log("[DEBUG] Main chart useEffect triggered - data exists:", !!data, "mainRef exists:", !!mainRef.current)
    if (!mainRef.current || !data) {
      console.log("[DEBUG] Skipping chart render - mainRef or data missing")
      return
    }
    console.log("[DEBUG] Rendering chart with candles:", data.candles?.length, "First candle:", data.candles?.[0], "Last candle:", data.candles?.[data.candles.length-1])
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
    userPriceLinesRef.current = []

    const chart = createChart(mainRef.current, {
      width:  mainRef.current.clientWidth,
      height: mainRef.current.clientHeight || 420,
      layout: { background: { type: ColorType.Solid, color: "#020817" }, textColor: "#94a3b8", fontSize: 12 },
      grid:   { vertLines: { color: "#0f172a" }, horzLines: { color: "#0f172a" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1e293b", scaleMargins: { top: 0.06, bottom: 0.02 } },
      timeScale: { borderColor: "#1e293b", timeVisible: true, secondsVisible: false, rightOffset: 5 },
    })
    chartRef.current = chart

    // Mumlar
    const candles = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    })
    console.log("[DEBUG] Setting candle data:", data.candles?.length, "items")
    candles.setData(data.candles as any)
    console.log("[DEBUG] Candle data set successfully")
    candleSeriesRef.current  = candles
    overlaySeriesRefs.current = []

    // Overlay indikatörler (lastValueVisible:false → sağ eksenden etiket kaldırıldı)
    const addLine = (d: Point[], color: string, lw = 1, style = LineStyle.Solid) => {
      const s = chart.addLineSeries({
        color, lineWidth: lw, lineStyle: style,
        priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: true,
      })
      s.setData(d as any); return s
    }

    const addArea = (d: Point[], lineColor: string, topColor: string, bottomColor: string) => {
      const s = chart.addAreaSeries({
        lineColor, topColor, bottomColor,
        lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: true,
      })
      s.setData(d as any); return s
    }

    const closes = data.candles.map(c => c.close)
    const times  = data.candles.map(c => c.time)

    inds.filter(i => i.type === "overlay" && i.enabled).forEach(ind => {
      // ── Çok-periyot EMA ─────────────────────────────────────────
      if (ind.id === "ema" && ind.periods?.length) {
        ind.periods.forEach(p => {
          const emaVals = computeEMA(closes, p.period)
          const pts = emaVals
            .map((v, i) => v !== null ? { time: times[i] as Time, value: v } : null)
            .filter(Boolean) as { time: Time; value: number }[]
          if (!pts.length) return
          const s = addLine(pts as any, p.color, ind.lineWidth ?? 1)
          overlaySeriesRefs.current.push({
            id: `ema_${p.period}`, name: `EMA ${p.period}`, color: p.color, series: s as any,
          })
        })
        return
      }

      // ── Diğer overlay'ler ────────────────────────────────────────
      const dataMap: Record<string, Point[]> = {
        sma20: data.sma20, vwap: data.vwap,
      }
      if (dataMap[ind.id]) {
        const s = addLine(dataMap[ind.id], ind.color!, ind.lineWidth,
          ind.id === "vwap" ? LineStyle.Dashed : LineStyle.Solid)
        overlaySeriesRefs.current.push({ id: ind.id, name: ind.name, color: ind.color!, series: s as any })
      }
      if (ind.id === "bb") {
        // Upper band: red line with faint blueish fill going down and fading out
        addArea(data.bb_upper, "#ef4444", "rgba(59,130,246, 0.15)", "rgba(59,130,246, 0.0)")
        // Lower band: just a green line (no solid fill mask)
        addLine(data.bb_lower, "#10b981", 1, LineStyle.Solid)
        // Middle band: blue line on top
        addLine(data.bb_mid,   "#3b82f6", 1, LineStyle.Solid)
      }
    })

    // OHLC + EMA crosshair legend
    chart.subscribeCrosshairMove((param: any) => {
      if (!param.time || !param.seriesData?.size) {
        setLegend(null); setEmaLegend([]); return
      }
      const bar = param.seriesData.get(candles) as any
      if (bar) setLegend({ o: bar.open, h: bar.high, l: bar.low, c: bar.close, change: ((bar.close - bar.open) / bar.open) * 100 })
      setEmaLegend(
        overlaySeriesRefs.current.map(ref => ({
          id: ref.id, name: ref.name, color: ref.color,
          value: (param.seriesData.get(ref.series) as any)?.value ?? null,
        }))
      )
    })

    // TP / SL handled in separate useEffect to avoid zoom reset

    // ── UT Bot ────────────────────────────────────────────────────
    if (showUT && data.ut_bot) {
      // Trail çizgisi
      if (data.ut_bot.trail?.length) {
        const trailS = chart.addLineSeries({
          color: "#f59e0b", lineWidth: 1, lineStyle: LineStyle.Solid,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
          title: "UT",
        })
        trailS.setData(data.ut_bot.trail as any)
      }
    }

    // ── Linear Regression Channel ─────────────────────────────────
    if (showLR && data.lr_channel) {
      const lrc = data.lr_channel
      const slope = lrc.slope ?? 0
      const trendColor = slope >= 0 ? "rgba(34,197,94,0.95)" : "rgba(239,68,68,0.95)"
      const bandColor  = slope >= 0 ? "rgba(34,197,94,0.65)": "rgba(239,68,68,0.65)"

      if (lrc.upper?.length) addLine(lrc.upper, bandColor,  2, LineStyle.Dashed)
      if (lrc.mid?.length)   addLine(lrc.mid,   trendColor, 2, LineStyle.Solid)
      if (lrc.lower?.length) addLine(lrc.lower,  bandColor, 2, LineStyle.Dashed)
    }

    if (!hasInitialFitRef.current) {
      chart.timeScale().fitContent()
      hasInitialFitRef.current = true
    }

    const onResize = () => {
      if (mainRef.current && chartRef.current)
        chartRef.current.applyOptions({ width: mainRef.current.clientWidth, height: mainRef.current.clientHeight || 420 })
    }
    window.addEventListener("resize", onResize)
    return () => { window.removeEventListener("resize", onResize); chart.remove(); chartRef.current = null; hasInitialFitRef.current = false }
  }, [data, inds, showUT, showLR])

  // ── TP / SL + Grid çizgileri — tek useEffect (zoom sıfırlamaz) ──
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series) return

    // Eski TP/SL temizle
    tpSlLinesRef.current.forEach(pl => { try { series.removePriceLine(pl) } catch {} })
    tpSlLinesRef.current = []
    // Eski grid temizle
    gridPriceLinesRef.current.forEach(pl => { try { series.removePriceLine(pl) } catch {} })
    gridPriceLinesRef.current = []

    // TP çizgisi — üst sınır (yeşil, noktalı, kalın)
    if (tp) tpSlLinesRef.current.push(series.createPriceLine({
      price: tp, color: "rgba(34,197,94,0.8)", lineWidth: 2, lineStyle: LineStyle.Dashed,
      axisLabelVisible: true, title: `TP  $${tp.toFixed(2)}`,
    }))
    // SL çizgisi — alt sınır (kırmızı, noktalı, kalın)
    if (sl) tpSlLinesRef.current.push(series.createPriceLine({
      price: sl, color: "rgba(239,68,68,0.8)", lineWidth: 2, lineStyle: LineStyle.Dashed,
      axisLabelVisible: true, title: `SL  $${sl.toFixed(2)}`,
    }))

    // Grid ara kademeleri — ilk ve son hariç (TP/SL ile çakışmasın)
    if (gridLines && gridLines.length > 2) {
      const innerLines = gridLines.slice(1, -1)
      innerLines.forEach((price, idx) => {
        const prevPrice = idx === 0 ? gridLines[0] : innerLines[idx - 1]
        const pctDiff = ((price - prevPrice) / prevPrice * 100).toFixed(2)

        const pl = series.createPriceLine({
          price,
          color: "rgba(129,140,248,0.5)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `$${price.toFixed(2)}  +${pctDiff}%`,
          axisLabelColor: "rgba(129,140,248,0.9)",
          axisLabelTextColor: "#e2e8f0",
        })
        gridPriceLinesRef.current.push(pl)
      })
    }

    // TP ve SL cizgileri gorunur olsun diye autoscale'i zorla
    series.applyOptions({
      autoscaleInfoProvider: (original) => {
        const res = original()
        if (res !== null && tp && sl && res.priceRange) {
          const padding = (tp - sl) * 0.1 // %10 ust/alt bosluk
          res.priceRange.minValue = Math.min(res.priceRange.minValue, sl - padding)
          res.priceRange.maxValue = Math.max(res.priceRange.maxValue, tp + padding)
        }
        return res
      }
    })
  }, [tp, sl, gridLines])

  // ── Birleşik marker useEffect (UT Bot + strateji sinyalleri) ──
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series || !data) return

    const allMarkers: any[] = []

    // UT Bot sinyalleri
    if (showUT && data.ut_bot?.signals?.length) {
      data.ut_bot.signals.forEach((s: UTSignal) => {
        allMarkers.push({
          time: s.time as Time,
          position: s.type === "buy" ? "belowBar" : "aboveBar",
          color:    s.type === "buy" ? "#22c55e"  : "#ef4444",
          shape:    s.type === "buy" ? "arrowUp"  : "arrowDown",
          text:     s.type === "buy" ? "AL"       : "SAT",
          size: 1,
        })
      })
    }

    // Strateji trade sinyalleri
    if (stratTrades.length) {
      const candleTimes = data.candles.map(c => c.time)
      const snap = (ts: number) => {
        const sec = Math.floor(ts / 1000)
        let best = candleTimes[0]; let bestDiff = Math.abs(sec - best)
        for (const ct of candleTimes) { const d = Math.abs(sec - ct); if (d < bestDiff) { best = ct; bestDiff = d } }
        return best
      }
      stratTrades.forEach((t, idx) => {
        const entryT = snap(t.entry_ts)
        const exitT  = snap(t.exit_ts)
        const isLong = t.side === "buy"
        // Giriş oku
        allMarkers.push({
          time:     entryT as Time,
          position: isLong ? "belowBar" : "aboveBar",
          color:    isLong ? "#22c55e"  : "#ef4444",
          shape:    isLong ? "arrowUp"  : "arrowDown",
          text:     `${isLong ? "Long" : "Short"} #${idx + 1}`,
          size: 1.5,
        })
        // Çıkış işareti
        const isTP  = t.exit_reason === "take_profit"
        const isLiq = t.exit_reason === "liquidation"
        allMarkers.push({
          time:     exitT as Time,
          position: isLong ? "aboveBar" : "belowBar",
          color:    isTP ? "#22c55e" : isLiq ? "#dc2626" : "#f59e0b",
          shape:    "circle",
          text:     `${isTP ? "TP" : isLiq ? "LIQ" : "SL"} ${t.pnl >= 0 ? "+" : ""}$${Math.abs(t.pnl).toFixed(0)}`,
          size: 1,
        })
      })
    }

    // HFT Bot Sim/Canli islemleri
    if (trades && trades.length) {
      const candleTimes = data.candles.map(c => c.time)
      const snap = (tradeTs: number) => {
        let best = candleTimes[0]
        let bestDiff = Math.abs(tradeTs - (best as number))
        for (const ct of candleTimes) {
          const d = Math.abs(tradeTs - (ct as number))
          if (d < bestDiff) {
            best = ct
            bestDiff = d
          }
        }
        return best
      }
      trades.forEach((t) => {
        const tradeTs = t.timestamp || 0
        if (tradeTs <= 0) return
        const markerTime = snap(tradeTs)
        const isBuy = t.side.toUpperCase() === "BUY"
        allMarkers.push({
          time:     markerTime as Time,
          position: isBuy ? "belowBar" : "aboveBar",
          color:    isBuy ? "#22c55e" : (t.pnl >= 0 ? "#10b981" : "#ef4444"),
          shape:    isBuy ? "arrowUp" : "arrowDown",
          text:     isBuy ? `BUY` : `SELL ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}`,
          size:     1.2,
        })
      })
    }

    // Sırala (lightweight-charts zorunluluğu)
    allMarkers.sort((a, b) => (a.time as number) - (b.time as number))
    try { series.setMarkers(allMarkers as any) } catch {}
  }, [showUT, data, stratTrades, trades])

  // ── Volume Profile canvas (rAF ile sürekli senkron) ──────────
  useEffect(() => {
    cancelAnimationFrame(vpRafRef.current)
    if (!showVP || !data?.volume_profile?.length || !candleSeriesRef.current || !vpCanvasRef.current) return

    const canvas = vpCanvasRef.current
    const series = candleSeriesRef.current

    // Canvas boyutunu container ile eşleştir — hem pixel hem CSS'i birlikte ayarla
    const VP_WIDTH = 120
    const syncSize = () => {
      const h = mainRef.current?.clientHeight || 420
      canvas.width        = VP_WIDTH
      canvas.height       = h
      canvas.style.width  = `${VP_WIDTH}px`
      canvas.style.height = `${h}px`
    }
    syncSize()

    let lastY0 = -9999
    const loop = () => {
      const y0 = series.priceToCoordinate(data.volume_profile[0].price)
      const y0n = y0 !== null ? Math.round(y0 as number) : -9999
      if (y0n !== lastY0) {
        lastY0 = y0n
        drawVolumeProfile(canvas, data.volume_profile, series)
      }
      vpRafRef.current = requestAnimationFrame(loop)
    }
    vpRafRef.current = requestAnimationFrame(loop)

    const onResize = () => {
      syncSize()
      lastY0 = -9999  // zorla yeniden çiz
    }
    window.addEventListener("resize", onResize)
    return () => { cancelAnimationFrame(vpRafRef.current); window.removeEventListener("resize", onResize) }
  }, [showVP, data, inds])

  // ── Özel indikatör serileri (editor + menüden aktif olanlar) ────────────
  useEffect(() => {
    if (!chartRef.current || !data) return
    const chart = chartRef.current
    const styleMap: Record<string, LineStyle> = {
      solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted,
    }
    const addedSeries: any[] = []
    const detectedSignals: {name:string;type:"buy"|"sell";reason?:string}[] = []

    // Menüden aktif edilmiş özel indikatörler — sadece overlay tipi (oscillator tipler sub-panel'de)
    const activeCustomInds = inds.filter(i => i.id.startsWith("custom_") && i.enabled && i.type === "overlay")
    const allToRun = [
      ...customSeries,
      ...activeCustomInds.map(ind => ({
        id: ind.id, values: [], color: ind.color || "#fff",
        title: ind.name, style: "solid" as const,
        _code: (ind.params as any)?._code ?? customIndDefs.find(d => d.id === ind.id)?.code ?? "",
        _name: ind.name,
      })),
    ]

    allToRun.forEach(cs => {
      const src  = (cs as any)._code
      const name = (cs as any)._name ?? cs.title
      if (!src) return

      const result = runCustomCode(src, data.candles, data.volume)
      if (result.error) { console.warn("Özel indikatör hatası:", result.error); return }

      // Serileri grafiğe ekle (sadece overlay tipi veya panel belirtilmemişse)
      result.series
        .filter(rs => !rs.panel || rs.panel === "main")
        .forEach(rs => {
          const isHistogram = rs.style === "histogram" || rs.style === "columns"
          
          // Histogram/Columns serisi
          if (isHistogram) {
            const s = chart.addHistogramSeries({ 
              color: rs.color, 
              priceLineVisible: false, 
              lastValueVisible: false 
            })
            // coloredValues varsa renkli, yoksa tek renkli
            const pts = rs.coloredValues?.length
              ? rs.coloredValues
                  .map((v, i) => v !== null ? { time: data.candles[i]?.time as Time, value: v.value, color: v.color } : null)
                  .filter(Boolean) as any[]
              : rs.values
                  .map((v, i) => v !== null ? { time: data.candles[i]?.time as Time, value: v } : null)
                  .filter(Boolean) as any[]
            if (!pts.length) return
            s.setData(pts)
            addedSeries.push(s)
            return
          }
          
          // Çizgi serisi
          const points = rs.values
            .map((v, i) => v !== null ? { time: data.candles[i]?.time as Time, value: v } : null)
            .filter(Boolean) as any[]
          if (!points.length) return
          const s = chart.addLineSeries({
            color: rs.color, lineWidth: (rs as any).lineWidth ?? (rs as any).width ?? 1,
            lineStyle: styleMap[rs.style as keyof typeof styleMap] ?? LineStyle.Solid,
            priceLineVisible: false, lastValueVisible: true,
            crosshairMarkerVisible: false, title: rs.title,
          })
          s.setData(points)
          // Grafik üzeri marker'lar (▲▼ ok etiketleri)
          if (rs.markers?.length) {
            const mks = rs.markers
              .map((m: any) => {
                // normalizeMarkers zaten time döndürür; eski format index kullanır
                if (m.time != null) {
                  return { time: m.time as Time, position: m.position, shape: m.shape, color: m.color, text: m.text, size: m.size ?? 2 }
                }
                const idx = m.index < 0 ? data.candles.length + m.index : m.index
                const c = data.candles[idx]
                if (!c) return null
                return { time: c.time as Time, position: m.position, shape: m.shape, color: m.color, text: m.text, size: 2 }
              })
              .filter(Boolean) as any[]
            if (mks.length) s.setMarkers(mks)
          }
          addedSeries.push(s)
        })

      // Sinyal tespiti
      if (result.signals?.length) {
        result.signals.forEach(sig => {
          detectedSignals.push({ name, type: sig.type, reason: sig.reason })
        })
      }
    })

    // Sadece en son (en güçlü) sinyali göster — spam önleme
    const lastSignal = detectedSignals.length > 0 ? [detectedSignals[detectedSignals.length - 1]] : []
    setLiveSignals(lastSignal)

    // Sinyalleri backend'e gönder (sadece son sinyal)
    if (lastSignal.length > 0) {
      const sig = lastSignal[0]
      const lastClose = data.candles[data.candles.length - 1]?.close ?? 0
      api.post("/signals/custom", {
        symbol,
        type:   sig.type,
        price:  lastClose,
        source: sig.name,
        reason: sig.reason ?? "",
      }).catch(() => {})
    }

    return () => { addedSeries.forEach(s => { try { chart.removeSeries(s) } catch {} }) }
  }, [customSeries, data, inds, customIndDefs, symbol])

  // ── OB + SR canvas (rAF) ─────────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(obRafRef.current)
    const canvas  = obCanvasRef.current
    const chart   = chartRef.current
    const series  = candleSeriesRef.current
    if (!canvas || !chart || !series || !data) return
    if (!showOB && !showSR) {
      const ctx = canvas.getContext("2d")
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    const syncSize = () => {
      if (mainRef.current) {
        const W = mainRef.current.clientWidth
        const H = mainRef.current.clientHeight || 420
        canvas.width       = W; canvas.height       = H
        canvas.style.width = `${W}px`; canvas.style.height = `${H}px`
      }
    }
    syncSize()

    let lastRef = -1
    const loop = () => {
      const y0 = series.priceToCoordinate(data.candles[0]?.close ?? 0)
      const ref = Math.round((y0 ?? 0) as number)
      if (ref !== lastRef) {
        lastRef = ref
        drawOBCanvas(canvas, data.order_blocks ?? [], data.sr_levels ?? [], chart, series, showOB, showSR)
      }
      obRafRef.current = requestAnimationFrame(loop)
    }
    obRafRef.current = requestAnimationFrame(loop)

    const onResize = () => { syncSize(); lastRef = -1 }
    window.addEventListener("resize", onResize)
    return () => { cancelAnimationFrame(obRafRef.current); window.removeEventListener("resize", onResize) }
  }, [data, showOB, showSR])

  // ── Geri sayım div'ini fiyat eksenine hizala (rAF) ──────────
  useEffect(() => {
    cancelAnimationFrame(cdRafRef.current)
    if (!data) return
    const loop = () => {
      if (candleSeriesRef.current && countdownDivRef.current) {
        const currentPrice = livePriceRef.current || data.candles[data.candles.length - 1]?.close
        if (currentPrice) {
          const y = candleSeriesRef.current.priceToCoordinate(currentPrice)
          if (y !== null) {
            // Lightweight Charts fiyat etiketi y eksenini tam ortalar (yükseklik ~22px). Altına yapışması için +12px ekliyoruz.
            countdownDivRef.current.style.top = `${(y as number) + 12}px`
          }
        }
      }
      cdRafRef.current = requestAnimationFrame(loop)
    }
    cdRafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(cdRafRef.current)
  }, [data])

  // ── Kullanıcı çizgileri ───────────────────────────────────────
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series) return
    userPriceLinesRef.current.forEach(l => { try { series.removePriceLine(l) } catch {} })
    userPriceLinesRef.current = []
    userLines.forEach(price => {
      const l = series.createPriceLine({ price, color: "rgba(148,163,184,0.8)", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "—" })
      userPriceLinesRef.current.push(l)
    })
  }, [userLines])

  // ── Likidasyon seviyeleri (price lines) ─────────────────────
  const liqLinesRef = useRef<any[]>([])
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series) return
    // Eski çizgileri temizle
    liqLinesRef.current.forEach(l => { try { series.removePriceLine(l) } catch {} })
    liqLinesRef.current = []
    if (!showLiq || !data) return

    // Binance liquidation top levels
    const topLevels = data.liquidations?.top_price_levels ?? []
    topLevels.forEach(price => {
      const l = series.createPriceLine({
        price,
        color: "rgba(255,165,0,0.7)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "LIQ",
      })
      liqLinesRef.current.push(l)
    })

    // Likidasyon heatmap levels (DB'den — Binance WS + Coinglass)
    const heatmapLevels = data.liq_heatmap?.levels ?? []
    const maxTotal = Math.max(...heatmapLevels.map(l => l.total), 1)
    heatmapLevels.slice(0, 10).forEach(level => {
      const intensity = Math.min(level.total / maxTotal, 1)
      const isLong = level.long_liq > level.short_liq
      const color = isLong
        ? `rgba(239,68,68,${0.3 + intensity * 0.5})`   // kırmızı = long liq
        : `rgba(34,197,94,${0.3 + intensity * 0.5})`    // yeşil = short liq
      const l = series.createPriceLine({
        price: level.price,
        color,
        lineWidth: intensity > 0.5 ? 2 : 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: isLong ? "L-LIQ" : "S-LIQ",
      })
      liqLinesRef.current.push(l)
    })
  }, [showLiq, data])

  // ── Osilatör pane'leri ───────────────────────────────────────
  useEffect(() => {
    if (!data || !chartRef.current) return
    const cleanups: (() => void)[] = []
    oscillators.forEach(ind => {
      const el = paneRefs.current[ind.id]
      if (!el) return
      // Özel indikatörler: kodu çalıştır, sonuçları alt panele ver
      if (ind.id.startsWith("custom_")) {
        const code = (ind.params as any)?._code ?? customIndDefs.find(d => d.id === ind.id)?.code ?? ""
        if (code) {
          const result = runCustomCode(code, data.candles, data.volume)
          if (!result.error && result.series.length) {
            cleanups.push(drawOscillatorPane(el, ind.id, data, ind, chartRef.current!, result.series))
            return
          }
        }
      }
      cleanups.push(drawOscillatorPane(el, ind.id, data, ind, chartRef.current!))
    })
    return () => cleanups.forEach(fn => fn())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, oscillators.map(o => o.id).join(","), customIndDefs])

  // ── Editör: Ana grafik + Alt panel güncelleme ──
  useEffect(() => {
    if (!editorPaneCode || !data || !chartRef.current) return
    const result = runCustomCode(editorPaneCode, data.candles, data.volume)
    if (result.error || !result.series.length) return
    
    const chart = chartRef.current
    const styleMap: Record<string, LineStyle> = {
      solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted,
    }
    const addedSeries: any[] = []
    
    // Ana panele eklenecek seriler (panel: "main" veya belirtilmemiş)
    const mainSeries = result.series.filter(rs => !rs.panel || rs.panel === "main")
    const resolveMarkersMain = (markers: any[]) =>
      markers.map((m: any) => {
        if (m.time != null) return { time: m.time as Time, position: m.position, shape: m.shape, color: m.color, text: m.text, size: m.size ?? 2 }
        const idx = m.index < 0 ? data.candles.length + m.index : m.index
        const c = data.candles[idx]
        if (!c) return null
        return { time: c.time as Time, position: m.position, shape: m.shape, color: m.color, text: m.text, size: 2 }
      }).filter(Boolean) as any[]

    mainSeries.forEach(rs => {
      // ── Baseline ─────────────────────────────────────────────
      if (rs.type === "baseline") {
        const base = (rs as any).baselineValue ?? 0
        const aboveC = (rs as any).aboveColor ?? "rgba(34,197,94,0.6)"
        const belowC = (rs as any).belowColor ?? "rgba(239,68,68,0.6)"
        const s = (chart as any).addBaselineSeries({
          baseValue:        { type: "price", price: base },
          topFillColor1:    aboveC,
          topFillColor2:    aboveC,
          bottomFillColor1: belowC,
          bottomFillColor2: belowC,
          topLineColor:     "rgba(0,0,0,0)",
          bottomLineColor:  "rgba(0,0,0,0)",
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        const pts = rs.values
          .map((v, i) => v !== null ? { time: data.candles[i]?.time as Time, value: v } : null)
          .filter(Boolean) as any[]
        if (pts.length) s.setData(pts)
        addedSeries.push(s)
        return
      }

      // ── Candlestick ─────────────────────────────────────────
      if (rs.type === "candlestick" && (rs as any).ohlcValues?.length) {
        const s = chart.addCandlestickSeries({
          upColor:      rs.upColor   ?? "#26a69a",
          downColor:    rs.downColor ?? "#ef5350",
          wickUpColor:  rs.upColor   ?? "#26a69a",
          wickDownColor:rs.downColor ?? "#ef5350",
          borderVisible: false,
          priceLineVisible: false,
          lastValueVisible: false,
        })
        const pts = (rs as any).ohlcValues
          .map((v: any, i: number) => {
            if (!v) return null
            const t = data.candles[i]?.time
            if (t == null) return null
            return { time: t as Time, open: v.open, high: v.high, low: v.low, close: v.close }
          })
          .filter(Boolean) as any[]
        if (pts.length) s.setData(pts)
        if (rs.markers?.length) s.setMarkers(resolveMarkersMain(rs.markers))
        addedSeries.push(s)
        return
      }

      // ── Histogram ────────────────────────────────────────────
      const isHistogram = rs.type === "histogram" || rs.style === "histogram" || rs.style === "columns"
      if (isHistogram) {
        const s = chart.addHistogramSeries({
          color: rs.color,
          priceLineVisible: false,
          lastValueVisible: false
        })
        const pts = rs.coloredValues?.length
          ? rs.coloredValues
              .map((v, i) => v !== null ? { time: data.candles[i]?.time as Time, value: v.value, color: v.color } : null)
              .filter(Boolean) as any[]
          : rs.values
              .map((v, i) => v !== null ? { time: data.candles[i]?.time as Time, value: v } : null)
              .filter(Boolean) as any[]
        if (pts.length) s.setData(pts)
        addedSeries.push(s)
        return
      }

      // ── Line ─────────────────────────────────────────────────
      const pts = rs.values
        .map((v, i) => v !== null ? { time: data.candles[i]?.time as Time, value: v } : null)
        .filter(Boolean) as any[]
      if (!pts.length) return
      const s = chart.addLineSeries({
        color: rs.color,
        lineWidth: (rs as any).lineWidth ?? (rs as any).width ?? 1,
        lineStyle: styleMap[rs.style as keyof typeof styleMap] ?? LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: rs.title,
      })
      s.setData(pts)
      if (rs.markers?.length) s.setMarkers(resolveMarkersMain(rs.markers))
      addedSeries.push(s)
    })
    
    // Alt paneli güncelle (panel: "sub" olanlar)
    let cleanupSub = () => {}
    if (editorPaneRef.current) {
      const subSeries = result.series.filter(rs => rs.panel === "sub")
      if (subSeries.length) {
        const fakeInd: Indicator = { id: "custom_editor", name: editorPaneName, type: "oscillator", enabled: true }
        // panel:"sub" olan sinyaller alt panele, panel:"main" veya belirtilmemiş olanlar ana grafiğe
        const subSignals = result.signals?.filter(s => s.panel === "sub") ?? []
        cleanupSub = drawOscillatorPane(editorPaneRef.current, "custom_editor", data, fakeInd, chart, subSeries, editorPaneHeight, subSignals)
      }
    }
    
    return () => {
      addedSeries.forEach(s => { try { chart.removeSeries(s) } catch {} })
      cleanupSub()
    }
  }, [editorPaneCode, data, editorPaneName, editorPaneHeight])

  // ── AI Analiz — sinyal gelince otomatik tetiklenir ──────────
  const aiCooldownRef = useRef<string>("")   // spam önleme: aynı sinyal için bir kez

  useEffect(() => {
    if (liveSignals.length === 0) { setAiAnalysis(null); return }
    const sig = liveSignals[0]
    const key = `${sig.type}_${sig.name}`
    if (key === aiCooldownRef.current || aiLoading) return
    aiCooldownRef.current = key

    const run = async () => {
      setAiLoading(true)
      setAiAnalysis(null)
      try {
        const enc = encodeURIComponent(symbol)
        const res = await api.get(`/ai/analyze?symbol=${enc}`)
        const filter = res.ai_filter
        const deep   = res.ai_analysis
        if (deep) {
          setAiAnalysis({
            approved:   deep.approved ?? filter?.pass ?? true,
            confidence: deep.confidence ?? (filter?.strength ? filter.strength * 10 : 50),
            reason:     deep.summary ?? deep.reason ?? filter?.reason ?? "—",
            strength:   filter?.strength,
          })
        } else if (filter) {
          setAiAnalysis({
            approved:   filter.pass,
            confidence: (filter.strength ?? 5) * 10,
            reason:     filter.reason ?? "—",
            strength:   filter.strength,
          })
        }
      } catch {
        setAiAnalysis({ approved: false, confidence: 0, reason: "AI bağlantı hatası" })
      } finally {
        setAiLoading(false)
      }
    }
    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSignals])

  // ── Yatay çizgi çizme ────────────────────────────────────────
  const handleChartClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawMode || !mainRef.current || !candleSeriesRef.current) return
    const rect  = mainRef.current.getBoundingClientRect()
    const price = candleSeriesRef.current.coordinateToPrice(e.clientY - rect.top)
    if (price !== null) { setUserLines(prev => [...prev, price as number]); setDrawMode(false) }
  }

  const STRAT_LIST = [
    { id: "ema_cross",       name: "EMA Cross",      params: {} },
    { id: "supertrend",      name: "Supertrend",     params: { period: 10, mult: 3.0 } },
    { id: "ut_bot",          name: "UT Bot",         params: { atr_period: 10, atr_mult: 3.0, heikin_ashi: false } },
    { id: "macd_signal",     name: "MACD",           params: { fast: 12, slow: 26, signal: 9 } },
    { id: "rsi_oversold",    name: "RSI",            params: { rsi_period: 14, oversold: 30, overbought: 70 } },
    { id: "bollinger_bounce",name: "Bollinger",      params: { period: 20, std_dev: 2.0 } },
    { id: "bb_ema_cross",    name: "BB-EMA Cross",   params: { bb_period: 20, bb_std: 2.0, ema_fast: 5, ema_slow: 13 } },
  ]

  // Sinyal menüsünü dışa tıklayınca kapat
  useEffect(() => {
    if (!showStratMenu) return
    const handler = () => setShowStratMenu(false)
    window.addEventListener("click", handler)
    return () => window.removeEventListener("click", handler)
  }, [showStratMenu])

  const fetchStratSignals = async (stratId: string) => {
    setStratLoading(true)
    setShowStratMenu(false)
    try {
      const strat = STRAT_LIST.find(s => s.id === stratId)
      const res = await api.post("/backtest/run", {
        symbol, timeframe: tf, strategy: stratId,
        days: 30,
        initial_balance: 10000,
        risk_per_trade: 0.02,
        leverage: 1,
        stop_loss_pct: 2.0,
        take_profit_pct: 4.0,
        params: strat?.params ?? {},
      })
      setStratTrades(res.trades || [])
      setStratSignal(stratId)
    } catch {
      setStratTrades([])
    } finally {
      setStratLoading(false)
    }
  }

  const clearStratSignals = () => { setStratSignal(null); setStratTrades([]) }

  const toggleInd      = (id: string) => setInds(prev => prev.map(i => i.id === id ? { ...i, enabled: !i.enabled } : i))
  const overlayEnabled = inds.filter(i => i.type === "overlay" && i.enabled)
  const lastClose      = data?.candles[data.candles.length - 1]?.close

  return (
    <div className={onClose
      ? "fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col"
      : "flex flex-col h-full bg-[#020817]"
    }>

      {/* ── Üst araç çubuğu ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0d1117] border-b border-slate-800 shrink-0 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden">

        {onClose && (
          <span className="text-white font-semibold text-sm mr-1">
            {symbol.replace("/USDT:USDT", "")}/USDT
          </span>
        )}

        {/* Zaman dilimi */}
        <div className="flex gap-0.5 bg-slate-900 rounded p-0.5">
          {TIMEFRAMES.map(t => (
            <button key={t.value} onClick={() => { setTf(t.value); localStorage.setItem("prochart_tf", t.value) }}
              className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${tf === t.value ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-slate-700" />

        {/* Aktif overlay indikatörler */}
        <div className="flex gap-1 flex-wrap">
          {overlayEnabled.map(ind => {
            // EMA için renk şeridi çok renkli
            const isEMA = ind.id === "ema" && ind.periods?.length
            const borderColor = isEMA ? "#3b82f680" : (ind.color ?? "#64748b") + "60"
            const bgColor     = isEMA ? "#3b82f612" : (ind.color ?? "#64748b") + "12"
            const textColor   = isEMA ? "#94a3b8"   : (ind.color ?? "#94a3b8")
            return (
              <div key={ind.id}
                className="flex items-center rounded border overflow-hidden text-xs transition-colors"
                style={{ borderColor, backgroundColor: bgColor }}>
                <button
                  onClick={() => setSettingsInd(ind)}
                  className="flex items-center gap-1.5 px-2 py-0.5 hover:opacity-80 transition-opacity"
                  style={{ color: textColor }}
                  title="Ayarlar"
                >
                  {/* Renk şeritleri */}
                  <span className="flex items-center gap-0.5">
                    {isEMA
                      ? ind.periods!.map(p => (
                          <span key={p.period} className="w-2 h-px inline-block rounded"
                            style={{ backgroundColor: p.color }} />
                        ))
                      : <span className="w-2.5 h-px inline-block rounded" style={{ backgroundColor: ind.color }} />
                    }
                  </span>
                  {ind.name}
                </button>
                <button
                  onClick={() => toggleInd(ind.id)}
                  className="px-1.5 py-0.5 opacity-30 hover:opacity-100 transition-opacity border-l"
                  style={{ borderColor: borderColor, color: textColor }}
                  title="Kaldır"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>

        {/* + İndikatör */}
        <button onClick={() => setPicker(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs transition-colors">
          <span className="text-base leading-none">+</span> İndikatör
        </button>

        <div className="w-px h-4 bg-slate-700" />

        {/* Volume Profile toggle */}
        <button onClick={() => setShowVP(v => !v)} title="Hacim Profili (Volume Profile)"
          className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs transition-colors ${
            showVP ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10" : "border-slate-700 text-slate-400 hover:text-white"
          }`}>
          <span className="flex gap-0.5 items-end">
            <span className="w-1 h-1.5 rounded-sm bg-current opacity-40" />
            <span className="w-1 h-3   rounded-sm bg-current opacity-70" />
            <span className="w-1 h-5   rounded-sm bg-yellow-400" />
            <span className="w-1 h-3   rounded-sm bg-current opacity-70" />
            <span className="w-1 h-2   rounded-sm bg-current opacity-40" />
          </span>
          VP
        </button>

        {/* VP Yoğunluk Tablosu */}
        {showVP && (
          <button onClick={() => setShowVPTable(v => !v)} title="VP Hacim Tablosu"
            className={`px-2 py-0.5 rounded border text-xs transition-colors ${
              showVPTable ? "border-yellow-500/50 text-yellow-400 bg-yellow-500/10" : "border-slate-700 text-slate-400 hover:text-white"
            }`}>
            ≡ Tablo
          </button>
        )}

        <div className="w-px h-4 bg-slate-700" />

        {/* UT Bot */}
        <button onClick={() => setShowUT(v => !v)} title="UT Bot Alert (ATR trailing stop)">
          <span className={`text-xs px-2 py-0.5 rounded border transition-colors ${showUT ? "border-amber-500/50 text-amber-400 bg-amber-500/10" : "border-slate-700 text-slate-400 hover:text-white"}`}>
            UT Bot
          </span>
        </button>

        {/* Strateji Sinyalleri */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); stratSignal ? clearStratSignals() : setShowStratMenu(v => !v) }}
            disabled={stratLoading}
            className={`text-xs px-2 py-0.5 rounded border transition-colors disabled:opacity-50 ${
              stratSignal
                ? "border-purple-500/50 text-purple-400 bg-purple-500/10"
                : "border-slate-700 text-slate-400 hover:text-white"
            }`}
          >
            {stratLoading ? "⏳" : stratSignal
              ? `✕ ${STRAT_LIST.find(s => s.id === stratSignal)?.name ?? stratSignal}`
              : "↑↓ Sinyal"
            }
          </button>
          {showStratMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-[#0d1117] border border-slate-700 rounded-lg shadow-xl min-w-[160px] py-1">
              {STRAT_LIST.map(s => (
                <button
                  key={s.id}
                  onClick={(e) => { e.stopPropagation(); fetchStratSignals(s.id) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* LR Channel */}
        <button onClick={() => setShowLR(v => !v)} title="Linear Regression Channel">
          <span className={`text-xs px-2 py-0.5 rounded border transition-colors ${showLR ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" : "border-slate-700 text-slate-400 hover:text-white"}`}>
            LR Kanal
          </span>
        </button>

        {/* Order Blocks */}
        <button onClick={() => setShowOB(v => !v)} title="Order Blocks (dikdörtgen)">
          <span className={`text-xs px-2 py-0.5 rounded border transition-colors ${showOB ? "border-orange-500/50 text-orange-400 bg-orange-500/10" : "border-slate-700 text-slate-400 hover:text-white"}`}>
            OB
          </span>
        </button>

        {/* S/R Seviyeleri */}
        <button onClick={() => setShowSR(v => !v)} title="Destek / Direnç seviyeleri">
          <span className={`text-xs px-2 py-0.5 rounded border transition-colors ${showSR ? "border-sky-500/50 text-sky-400 bg-sky-500/10" : "border-slate-700 text-slate-400 hover:text-white"}`}>
            S/R
          </span>
        </button>

        {/* Likidasyon seviyeleri */}
        <button onClick={() => setShowLiq(v => !v)} title="Likidasyon seviyeleri (Binance + Coinglass)">
          <span className={`text-xs px-2 py-0.5 rounded border transition-colors ${showLiq ? "border-orange-500/50 text-orange-400 bg-orange-500/10" : "border-slate-700 text-slate-400 hover:text-white"}`}>
            LIQ
          </span>
        </button>

        {/* Dünya Borsası Seanslari */}
        <button onClick={() => setShowSessions(v => !v)} title="Dünya borsası hareketli saatler (Tokyo / Londra / New York)">
          <span className={`text-xs px-2 py-0.5 rounded border transition-colors ${showSessions ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" : "border-slate-700 text-slate-400 hover:text-white"}`}>
            Sessions
          </span>
        </button>

        {/* Çizgi aracı */}
        <button onClick={() => setDrawMode(v => !v)} title="Yatay çizgi çiz"
          className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs transition-colors ${
            drawMode ? "border-cyan-500/60 text-cyan-400 bg-cyan-500/10" : "border-slate-700 text-slate-400 hover:text-white"
          }`}>
          — Çizgi
        </button>

        {userLines.length > 0 && (
          <button onClick={() => setUserLines([])} title="Tüm çizgileri sil"
            className="text-slate-500 hover:text-red-400 text-xs px-1.5 py-0.5 rounded border border-slate-700 hover:border-red-500/40 transition-colors">
            ✕ Çizgiler
          </button>
        )}

        {/* Özel İndikatör Editörü */}
        <button onClick={() => setShowEditor(true)}
          title="Özel indikatör yaz (Pine Script benzeri JS editörü)"
          className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs transition-colors ${
            customSeries.length > 0
              ? "border-purple-500/50 text-purple-400 bg-purple-500/10"
              : "border-slate-700 text-slate-400 hover:text-white"
          }`}>
          {"</>"}  Özel
          {customSeries.length > 0 && (
            <span className="ml-1 text-[10px] bg-purple-500/20 px-1 rounded">{customSeries.length}</span>
          )}
        </button>

        {customSeries.length > 0 && (
          <button onClick={() => setCustomSeries([])}
            title="Özel indikatörleri kaldır"
            className="text-slate-500 hover:text-red-400 text-xs px-1.5 py-0.5 rounded border border-slate-700 hover:border-red-500/40 transition-colors">
            ✕ Özel
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {tp && <span className="text-xs text-green-400 font-mono">TP ${tp.toFixed(0)}</span>}
          {sl && <span className="text-xs text-red-400 font-mono">SL ${sl.toFixed(0)}</span>}
          <button onClick={fetchData} disabled={loading} className="text-slate-400 hover:text-white disabled:opacity-40 text-sm transition-colors">
            {loading ? "⏳" : "↻"}
          </button>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none px-1 transition-colors">✕</button>
          )}
        </div>
      </div>

      {/* ── Dünya Borsası Seansları ────────────────────────────── */}
      {showSessions && <SessionBar />}

      {/* ── Ana grafik alanı ────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative">

        {/* Yükleme göstergesi */}
        {loading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#020817]/70 pointer-events-none">
            <span className="flex items-center gap-2 text-slate-400 text-xs">
              <span className="w-4 h-4 border-2 border-slate-500 border-t-blue-400 rounded-full animate-spin" />
              Veri yükleniyor…
            </span>
          </div>
        )}

        {/* Canlı sinyal bildirimi */}
        {liveSignals.length > 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5">
            {liveSignals.map((sig, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-lg ${
                sig.type === "buy"
                  ? "bg-green-500/20 border-green-500/60 text-green-300 shadow-green-500/20"
                  : "bg-red-500/20 border-red-500/60 text-red-300 shadow-red-500/20"
              }`}>
                <span className={`w-2 h-2 rounded-full animate-pulse ${sig.type === "buy" ? "bg-green-400" : "bg-red-400"}`} />
                <span>{sig.type === "buy" ? "▲ AL SİNYALİ" : "▼ SAT SİNYALİ"}</span>
                <span className="font-normal opacity-80">· {sig.name}</span>
                {sig.reason && <span className="font-normal opacity-60">· {sig.reason}</span>}
                {/* AI yükleniyor göstergesi — otomatik tetiklenir */}
                {aiLoading && (
                  <span className="ml-1 flex items-center gap-1 text-violet-400 text-[10px]">
                    <span className="inline-block w-2.5 h-2.5 border border-violet-400 border-t-transparent rounded-full animate-spin" />
                    AI analiz ediyor…
                  </span>
                )}
              </div>
            ))}
            {/* AI Analiz Sonucu */}
            {aiAnalysis && (
              <div className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs shadow-lg max-w-xs ${
                aiAnalysis.approved
                  ? "bg-violet-500/15 border-violet-500/50 text-violet-200"
                  : "bg-orange-500/15 border-orange-500/50 text-orange-200"
              }`}>
                <span className="text-base leading-none mt-0.5">{aiAnalysis.approved ? "✅" : "⚠️"}</span>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 font-semibold">
                    <span>{aiAnalysis.approved ? "AI Onayladı" : "AI Reddetti"}</span>
                    <span className="font-mono text-[10px] opacity-70">Güven: {aiAnalysis.confidence}%</span>
                    {aiAnalysis.strength !== undefined && (
                      <span className="font-mono text-[10px] opacity-70">Güç: {aiAnalysis.strength}/10</span>
                    )}
                  </div>
                  <span className="font-normal opacity-80 leading-relaxed">{aiAnalysis.reason}</span>
                </div>
                <button
                  onClick={() => setAiAnalysis(null)}
                  className="ml-auto text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                >✕</button>
              </div>
            )}
          </div>
        )}

        {/* Sol üst: OHLC + EMA legend (TradingView tarzı) */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 pointer-events-none select-none">
          {/* OHLC */}
          {legend && (
            <div className="flex items-center gap-2.5 text-xs font-mono bg-[#0d1117]/90 px-2.5 py-1.5 rounded border border-slate-800">
              <span className="text-slate-500">O<span className="text-slate-200 ml-0.5">{legend.o.toFixed(2)}</span></span>
              <span className="text-slate-500">H<span className="text-green-400 ml-0.5">{legend.h.toFixed(2)}</span></span>
              <span className="text-slate-500">L<span className="text-red-400 ml-0.5">{legend.l.toFixed(2)}</span></span>
              <span className="text-slate-500">C<span className="text-slate-200 ml-0.5">{legend.c.toFixed(2)}</span></span>
              <span className={`font-semibold ${legend.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                {legend.change >= 0 ? "+" : ""}{legend.change.toFixed(2)}%
              </span>
            </div>
          )}
          {/* EMA / Overlay değerleri */}
          {emaLegend.length > 0 && (
            <div className="flex items-center gap-2.5 text-xs font-mono bg-[#0d1117]/85 px-2.5 py-1 rounded border border-slate-800/60">
              {emaLegend.filter(e => e.value !== null).map(e => (
                <span key={e.id}>
                  <span className="opacity-60" style={{ color: e.color }}>{e.name} </span>
                  <span className="font-semibold" style={{ color: e.color }}>
                    {e.value!.toFixed(2)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Geri sayım — fiyat ekseninde mevcut fiyat etiketinin altında */}
        <div
          ref={countdownDivRef}
          className="absolute right-0 z-10 pointer-events-none"
          style={{ top: 0, paddingRight: '1px' }}
        >
          {countdown && data && data.candles && data.candles.length > 0 && (() => {
            const currentPrice = livePriceRef.current || data.candles[data.candles.length - 1]?.close || 0
            const openPrice = liveCandleRef.current?.open || data.candles[data.candles.length - 1]?.open || 0
            const isUp = currentPrice >= openPrice
            const bgColor = isUp ? "bg-[#089981]" : "bg-[#f23645]"
            return (
              <div className={`text-[11px] font-mono text-white ${bgColor} px-1.5 py-[2px] font-medium shadow-sm flex items-center justify-center min-w-[45px]`}>
                {countdown}
              </div>
            )
          })()}
        </div>

        {/* VP efsanesi + Tablo */}
        {showVP && (
          <div className="absolute top-2 right-14 z-10 flex flex-col items-end gap-1.5 pointer-events-none select-none">
            {/* Legend */}
            <div className="flex items-center gap-2 text-xs bg-[#0d1117]/80 border border-slate-800 px-2 py-1 rounded">
              <span className="w-2.5 h-2.5 rounded-sm bg-yellow-400 inline-block" />
              <span className="text-slate-300">POC — En yüksek hacim seviyesi</span>
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-400/60 inline-block ml-1" />
              <span className="text-slate-300">VA — %70 hacim alanı</span>
            </div>

            {/* Yoğunluk Tablosu */}
            {showVPTable && data?.volume_profile && (
              <div className="bg-[#0a0f1a]/95 border border-slate-800 rounded text-xs font-mono overflow-hidden max-h-64 overflow-y-auto">
                <div className="px-2 py-1 bg-slate-800/60 text-slate-400 text-[10px] flex gap-3 border-b border-slate-800">
                  <span className="w-16 text-right">Fiyat</span>
                  <span className="w-20 text-right">Hacim</span>
                  <span className="w-14 text-right">%</span>
                  <span className="w-16">Yoğunluk</span>
                </div>
                {[...data.volume_profile]
                  .sort((a, b) => b.volume - a.volume)
                  .slice(0, 20)
                  .map((lvl, i) => {
                    const vol = lvl.volume >= 1_000_000
                      ? `${(lvl.volume / 1_000_000).toFixed(2)}M`
                      : lvl.volume >= 1_000
                      ? `${(lvl.volume / 1_000).toFixed(1)}K`
                      : lvl.volume.toFixed(0)
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 px-2 py-0.5 border-b border-slate-900 ${
                          lvl.is_poc ? "bg-yellow-500/10" : lvl.is_va ? "bg-blue-500/5" : ""
                        }`}
                      >
                        <span className={`w-16 text-right ${lvl.is_poc ? "text-yellow-400 font-bold" : lvl.is_va ? "text-blue-300" : "text-slate-400"}`}>
                          {lvl.price.toFixed(1)}
                        </span>
                        <span className={`w-20 text-right ${lvl.is_poc ? "text-yellow-300" : "text-slate-300"}`}>
                          {vol}
                        </span>
                        <span className="w-14 text-right text-slate-500">
                          {(lvl.pct * 100).toFixed(1)}%
                        </span>
                        <div className="w-16 h-1.5 bg-slate-800 rounded overflow-hidden">
                          <div
                            className={`h-full rounded ${lvl.is_poc ? "bg-yellow-400" : lvl.is_va ? "bg-blue-400/70" : "bg-slate-600/50"}`}
                            style={{ width: `${lvl.pct * 100}%` }}
                          />
                        </div>
                        {lvl.is_poc && <span className="text-yellow-400/70 text-[9px]">POC</span>}
                        {!lvl.is_poc && lvl.is_va && <span className="text-blue-400/50 text-[9px]">VA</span>}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {/* Draw mode uyarı */}
        {drawMode && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 text-xs bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 px-3 py-1.5 rounded pointer-events-none">
            Fiyata tıkla → Yatay çizgi ekle &nbsp;|&nbsp; ESC iptal
          </div>
        )}

        {/* Volume Profile Canvas overlay (sağ kenara yaslanır) */}
        <div ref={mainRef} className={`w-full h-full ${drawMode ? "cursor-crosshair" : ""}`} onClick={handleChartClick} />

        {/* OB + SR canvas — tam grafik üstü */}
        <canvas
          ref={obCanvasRef}
          className="absolute top-0 left-0 pointer-events-none"
          style={{ zIndex: 4 }}
        />

        {/* VP canvas — sağ kenara yaslanır */}
        <canvas
          ref={vpCanvasRef}
          className={`absolute top-0 right-0 pointer-events-none transition-opacity duration-300 ${showVP ? "opacity-100" : "opacity-0"}`}
          style={{ zIndex: 5 }}
        />
      </div>

      {/* ── Editör özel alt panel ────────────────────────────────── */}
      {editorPaneCode && (
        <>
          {/* Sürüklenebilir ayırıcı */}
          <div
            onMouseDown={onResizerMouseDown}
            className="shrink-0 h-[5px] bg-slate-800 hover:bg-purple-600 transition-colors cursor-row-resize select-none"
            title="Paneli yeniden boyutlandır"
          />
          <div className="shrink-0 border-slate-800 relative" style={{ height: editorPaneHeight }}>
            <div className="absolute top-1 left-2 z-10 flex items-center gap-2">
              <span className="text-xs font-medium text-purple-400">{editorPaneName}</span>
              <button
                onClick={() => setEditorPaneCode(null)}
                className="text-slate-600 hover:text-slate-300 text-xs leading-none"
              >×</button>
            </div>
            <div ref={editorPaneRef} className="w-full h-full" />
          </div>
        </>
      )}

      {/* ── Osilatör pane'leri ──────────────────────────────────── */}
      {oscillators.map(ind => (
        <div key={ind.id} className="shrink-0 border-t border-slate-800 relative">
          <div className="absolute top-1 left-2 z-10 flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: ind.color || "#94a3b8" }}>{ind.name}</span>
            <button onClick={() => toggleInd(ind.id)} className="text-slate-600 hover:text-slate-300 text-xs leading-none">×</button>
          </div>
          <div ref={el => { paneRefs.current[ind.id] = el }} />
        </div>
      ))}

      {/* ── İndikatör Seçici ────────────────────────────────────── */}
      {picker && <IndicatorPicker indicators={inds} onToggle={toggleInd} onClose={() => setPicker(false)} />}

      {showEditor && (
        <CustomIndicatorEditor
          onApply={(series, code) => {
            // Gerçek kodu çalıştır — hangi seriler çıkıyor tespit et
            const result = data ? runCustomCode(code, data.candles, data.volume) : null
            const hasSubPanel = result
              ? result.series.some(s => s.panel === "sub" || s.style === "histogram" || s.style === "columns")
              : false
            if (hasSubPanel) {
              // Sub-panel: histogram veya panel:"sub" olan seriler alt panele git
              setEditorPaneCode(code)
              const subSer = result!.series.find(s => s.panel === "sub" || s.style === "histogram")
              setEditorPaneName(subSer?.title?.split(" ")[0] || "Özel")
              setCustomSeries([])
            } else {
              setEditorPaneCode(null)
              setCustomSeries(series)  // overlay — _code ile yeniden çizilir
            }
          }}
          onClose={() => setShowEditor(false)}
        />
      )}

      {/* ── İndikatör Ayarları ──────────────────────────────────── */}
      {settingsInd && (
        <IndicatorSettings
          indicator={settingsInd}
          onSave={updated => {
            setInds(prev => prev.map(i => i.id === updated.id ? updated : i))
            setSettingsInd(null)
          }}
          onRemove={() => {
            toggleInd(settingsInd.id)
            setSettingsInd(null)
          }}
          onClose={() => setSettingsInd(null)}
        />
      )}
    </div>
  )
}


// ─── Dünya Borsası Seansları ──────────────────────────────────────────────────
const SESSIONS = [
  { name: "Sydney",    flag: "AU", startUTC: 22, endUTC: 7,  color: "#a78bfa", bg: "bg-violet-500/10", border: "border-violet-500/30" },
  { name: "Tokyo",     flag: "JP", startUTC: 0,  endUTC: 9,  color: "#f472b6", bg: "bg-pink-500/10",   border: "border-pink-500/30"   },
  { name: "Shanghai",  flag: "CN", startUTC: 1,  endUTC: 7,  color: "#fb923c", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  { name: "London",    flag: "GB", startUTC: 7,  endUTC: 16, color: "#60a5fa", bg: "bg-blue-500/10",   border: "border-blue-500/30"   },
  { name: "Frankfurt", flag: "DE", startUTC: 7,  endUTC: 16, color: "#34d399", bg: "bg-emerald-500/10",border: "border-emerald-500/30"},
  { name: "New York",  flag: "US", startUTC: 13, endUTC: 22, color: "#fbbf24", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
]

function SessionBar() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const utcH = now.getUTCHours()

  const isActive = (s: typeof SESSIONS[0]) => {
    if (s.startUTC < s.endUTC) return utcH >= s.startUTC && utcH < s.endUTC
    return utcH >= s.startUTC || utcH < s.endUTC  // gece yarisini gecen (Sydney)
  }

  const fmtTime = (h: number) => `${String(h).padStart(2, "0")}:00`

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border-b border-slate-800 overflow-x-auto">
      <span className="text-[10px] text-slate-500 shrink-0">UTC {fmtTime(utcH)}</span>
      {SESSIONS.map(s => {
        const active = isActive(s)
        return (
          <div key={s.name} className={`flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] shrink-0 transition-all ${
            active ? `${s.bg} ${s.border}` : "bg-slate-900 border-slate-800 opacity-40"
          }`}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: active ? s.color : "#475569" }} />
            <span className={active ? "text-white font-medium" : "text-slate-500"}>{s.name}</span>
            <span className="text-slate-500">{fmtTime(s.startUTC)}-{fmtTime(s.endUTC)}</span>
          </div>
        )
      })}
      {SESSIONS.some(s => isActive(s)) && (
        <span className="text-[10px] text-emerald-400 ml-auto shrink-0">
          {SESSIONS.filter(s => isActive(s)).map(s => s.name).join(" + ")} aktif
        </span>
      )}
    </div>
  )
}
