"use client"

import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import {
  createChart, ColorType, CrosshairMode,
  IChartApi, Time,
} from "lightweight-charts"

interface Signal {
  time: number
  price: number
  signal: "buy" | "sell"
}

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
}

const STRATEGIES = [
  { id: "ema_cross", name: "EMA Crossover", params: { fast_ema: 9, slow_ema: 21 } },
  { id: "rsi_oversold", name: "RSI", params: { rsi_period: 14, oversold: 30, overbought: 70, rsi_ema_filter: 200 } },
  { id: "macd_signal", name: "MACD", params: { fast: 12, slow: 26, signal: 9 } },
  { id: "bollinger_bounce", name: "Bollinger", params: { period: 20, std_dev: 2.0, squeeze: true } },
  { id: "ut_bot", name: "UT Bot", params: { atr_period: 10, atr_mult: 3.0, heikin_ashi: false } },
  { id: "supertrend", name: "Supertrend", params: { period: 10, mult: 3.0 } },
]

const SYMBOLS = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT", "XRP/USDT:USDT", "DOGE/USDT:USDT", "BNB/USDT:USDT"]
const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"]

export default function StrategyViewPage() {
  const [symbol, setSymbol] = useState("BTC/USDT:USDT")
  const [timeframe, setTimeframe] = useState("1h")
  const [days, setDays] = useState(30)
  const [strategy, setStrategy] = useState("ema_cross")
  const [loading, setLoading] = useState(false)
  const [signalCount, setSignalCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const runOverlay = async () => {
    setLoading(true)
    setError(null)
    try {
      const selected = STRATEGIES.find(s => s.id === strategy)!
      // Önce sinyalleri al
      const sigRes = await api.post("/backtest/signals", {
        symbol, timeframe, strategy, days,
        params: selected.params,
      }) as { error?: string; signals: Signal[] }

      if (sigRes.error) {
        setError(sigRes.error)
        setLoading(false)
        return
      }

      // Sonra OHLCV — backtest/run'dan alıyoruz çünkü oradaki downsample mantığı hazır
      const btRes = await api.post("/backtest/run", {
        symbol, timeframe, strategy, days,
        initial_balance: 10000, risk_per_trade: 0.02,
        leverage: 1, stop_loss_pct: 2, take_profit_pct: 4,
        params: selected.params,
      }) as { ohlcv?: Candle[] }

      if (!btRes.ohlcv || !btRes.ohlcv.length) {
        setError("Grafik verisi alınamadı")
        setLoading(false)
        return
      }

      renderChart(btRes.ohlcv, sigRes.signals)
      setSignalCount(sigRes.signals.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata")
    } finally {
      setLoading(false)
    }
  }

  const renderChart = (candles: Candle[], signals: Signal[]) => {
    const container = containerRef.current
    if (!container) return

    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: 560,
      layout: { background: { type: ColorType.Solid, color: "#020817" }, textColor: "#94a3b8", fontSize: 11 },
      grid: { vertLines: { color: "#0f172a" }, horzLines: { color: "#0f172a" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1e293b" },
      timeScale: { borderColor: "#1e293b", timeVisible: true, secondsVisible: false, rightOffset: 5 },
    })
    chartRef.current = chart

    const series = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    })

    const seen = new Set<number>()
    const cleanCandles = [...candles]
      .sort((a, b) => a.time - b.time)
      .filter(c => {
        if (seen.has(c.time)) return false
        seen.add(c.time)
        return true
      })
    series.setData(cleanCandles as never)

    if (cleanCandles.length === 0) return
    const candleTimes = cleanCandles.map(c => c.time)
    const firstT = candleTimes[0], lastT = candleTimes[candleTimes.length - 1]
    const snap = (t: number): number => {
      if (t <= firstT) return firstT
      if (t >= lastT) return lastT
      let best = candleTimes[0], bestDiff = Math.abs(t - best)
      for (const ct of candleTimes) {
        const d = Math.abs(t - ct)
        if (d < bestDiff) { best = ct; bestDiff = d }
      }
      return best
    }

    // Sinyalleri marker olarak ekle
    const markerKey = new Set<string>()
    const markers = signals
      .map((s, i) => ({
        time: snap(s.time) as Time,
        position: s.signal === "buy" ? "belowBar" : "aboveBar",
        color: s.signal === "buy" ? "#22c55e" : "#ef4444",
        shape: s.signal === "buy" ? "arrowUp" : "arrowDown",
        text: `${s.signal === "buy" ? "AL" : "SAT"} #${i + 1}`,
        size: 1.2,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number))
      .filter(m => {
        const k = `${m.time}_${m.shape}`
        if (markerKey.has(k)) return false
        markerKey.add(k)
        return true
      })

    // @ts-expect-error — lightweight-charts marker tipi katı
    series.setMarkers(markers)
    chart.timeScale().fitContent()

    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        if (e.contentRect.width > 0 && chartRef.current) {
          chartRef.current.applyOptions({ width: e.contentRect.width })
        }
      }
    })
    ro.observe(container)
  }

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [])

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Strateji Görüntüleyici</h1>
        <span className="text-xs text-slate-500">
          Canlı mumlar üstünde stratejinin nerelerde sinyal verdiğini görsel olarak incele
        </span>
      </div>

      {/* Kontrol paneli */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">Sembol</span>
            <select value={symbol} onChange={e => setSymbol(e.target.value)} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white">
              {SYMBOLS.map(s => <option key={s} value={s}>{s.replace("/USDT:USDT", "")}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Zaman Dilimi</span>
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white">
              {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Süre (gün)</span>
            <input type="number" value={days} onChange={e => setDays(Number(e.target.value))} min={7} max={365} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Strateji</span>
            <select value={strategy} onChange={e => setStrategy(e.target.value)} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white">
              {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <button
            onClick={runOverlay}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-semibold py-1.5 rounded text-sm mt-5"
          >
            {loading ? "Yükleniyor..." : "Görüntüle"}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        {signalCount > 0 && (
          <p className="text-xs text-slate-400 mt-3">
            {signalCount} sinyal bulundu — yeşil yukarı ok = AL, kırmızı aşağı ok = SAT
          </p>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div ref={containerRef} className="w-full" style={{ height: 560, minHeight: 560 }} />
      </div>
    </div>
  )
}
