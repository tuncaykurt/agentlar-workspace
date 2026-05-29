"use client"

import { useState, useRef, useEffect } from "react"
import { api } from "@/lib/api"
import dynamic from "next/dynamic"

const BacktestChart = dynamic(() => import("./BacktestChart"), { ssr: false })

interface Trade {
  entry_ts: number
  exit_ts: number
  side: string
  entry: number
  exit: number
  qty: number
  margin?: number
  position_value?: number
  leverage?: number
  pnl: number
  fee?: number
  pnl_pct: number
  exit_reason: string
}

interface EquityPoint {
  time: number
  equity: number
}

interface OHLCVCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
}

interface BacktestResult {
  total_trades: number
  final_balance: number
  total_pnl: number
  total_fees?: number
  total_pnl_pct: number
  win_rate: number
  max_drawdown_pct: number
  sharpe_ratio: number
  profit_factor: number
  avg_trade_pnl: number
  best_trade: number
  worst_trade: number
  avg_win: number
  avg_loss: number
  win_count: number
  loss_count: number
  avg_duration_hours: number
  trades: Trade[]
  equity_curve: EquityPoint[]
  ohlcv?: OHLCVCandle[]
  indicators?: Record<string, { time: number; value: number }[]>
  config?: { symbol: string; timeframe: string; strategy: string; days: number; candle_count: number }
  error?: string
}

const STRATEGIES = [
  { id: "ema_cross", name: "EMA Crossover", params: { fast_ema: 9, slow_ema: 21 } },
  { id: "rsi_oversold", name: "RSI Oversold/Overbought", params: { rsi_period: 14, oversold: 30, overbought: 70, rsi_ema_filter: 200 } },
  { id: "macd_signal", name: "MACD Signal", params: { fast: 12, slow: 26, signal: 9, hist_threshold: 0 } },
  { id: "bollinger_bounce", name: "Bollinger Bounce", params: { period: 20, std_dev: 2.0, squeeze: true } },
  { id: "ut_bot", name: "UT Bot Alert", params: { atr_period: 10, atr_mult: 3.0, heikin_ashi: false } },
  { id: "supertrend", name: "Supertrend", params: { period: 10, mult: 3.0 } },
  {
    id: "bb_ema_cross", name: "BB-EMA Cross",
    params: { bb_period: 20, bb_std: 2.0, ema_fast: 5, ema_slow: 13, touch_pct: 0.3, setup_lookback: 5, direction: "both", exit_at_bands: true },
  },
]

// String parametre için seçenek listesi
const PARAM_OPTIONS: Record<string, Record<string, string[]>> = {
  bb_ema_cross: { direction: ["both", "long", "short"] },
}

const SYMBOLS = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT", "XRP/USDT:USDT", "DOGE/USDT:USDT", "BNB/USDT:USDT", "ADA/USDT:USDT", "AVAX/USDT:USDT"]
const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"]

const OVERLAY_OPTIONS = [
  { id: "ema_9",   label: "EMA 9",   color: "#22c55e" },
  { id: "ema_21",  label: "EMA 21",  color: "#fbbf24" },
  { id: "ema_50",  label: "EMA 50",  color: "#f472b6" },
  { id: "ema_200", label: "EMA 200", color: "#a78bfa" },
  { id: "sma_20",  label: "SMA 20",  color: "#38bdf8" },
  { id: "bb_20",   label: "BB 20",   color: "#60a5fa" },
]

export default function BacktestPage() {
  const [strategy, setStrategy] = useState("ema_cross")
  const [symbol, setSymbol] = useState("BTC/USDT:USDT")
  const [timeframe, setTimeframe] = useState("1h")
  const [days, setDays] = useState("90")
  const [balance, setBalance] = useState("10000")
  const [risk, setRisk] = useState("2")
  const [leverage, setLeverage] = useState("3")
  const [slPct, setSlPct] = useState("2")
  const [tpPct, setTpPct] = useState("4")
  const [params, setParams] = useState<Record<string, number | boolean | string>>({})
  const [feePct, setFeePct] = useState("0.06")
  const [overlays, setOverlays] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)

  const selectedStrat = STRATEGIES.find(s => s.id === strategy)

  const toggleOverlay = (id: string) => {
    setOverlays(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const numDays     = Number(days)     || 90
  const numBalance  = Number(balance)  || 10000
  const numRisk     = Number(risk)     || 2
  const numLeverage = Number(leverage) || 3
  const numSlPct    = Number(slPct)    || 2
  const numTpPct    = Number(tpPct)    || 4
  const numFeePct   = feePct.trim() === "" ? 0.06 : Math.max(0, parseFloat(feePct) || 0)

  const runBacktest = async () => {
    setLoading(true)
    setResult(null)
    try {
      const mergedParams = { ...selectedStrat?.params, ...params }
      const res = await api.post("/backtest/run", {
        symbol, timeframe, strategy,
        days: numDays,
        initial_balance: numBalance,
        risk_per_trade: numRisk / 100,
        leverage: numLeverage,
        stop_loss_pct: numSlPct,
        take_profit_pct: numTpPct,
        params: mergedParams,
        overlay_indicators: overlays,
        fee_pct: numFeePct,
      })
      setResult(res)
    } catch (e: unknown) {
      setResult({ error: e instanceof Error ? e.message : "Backtest hatasi" } as BacktestResult)
    } finally {
      setLoading(false)
    }
  }

  const updateParam = (key: string, val: string) => {
    const num = Number(val)
    if (!isNaN(num) && val !== "true" && val !== "false" && val.trim() !== "") {
      setParams(p => ({ ...p, [key]: num }))
    } else if (val === "true") {
      setParams(p => ({ ...p, [key]: true }))
    } else if (val === "false") {
      setParams(p => ({ ...p, [key]: false }))
    } else {
      setParams(p => ({ ...p, [key]: val }))
    }
  }

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4 pb-20">
      <div className="section-header">
        <div className="section-header-icon">🧪</div>
        <div>
          <h1 className="section-title">Backtest</h1>
          <p className="section-subtitle">Geçmiş veriyle strateji test et — equity curve, win rate, drawdown analizi</p>
        </div>
      </div>

      {/* Config Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sol: Genel Ayarlar */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300 border-b border-slate-700 pb-2">Genel Ayarlar</h2>

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
            <span className="text-xs text-slate-400">Test Suresi (gun)</span>
            <input type="number" value={days} onChange={e => setDays(e.target.value)} min={7} max={365} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Baslangic Bakiye ($)</span>
            <input type="number" value={balance} onChange={e => setBalance(e.target.value)} min={100} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
          </label>

          {/* Pozisyon onizlemesi */}
          <div className="text-[11px] bg-slate-800/50 border border-slate-700 rounded p-2 space-y-0.5">
            <div className="flex justify-between"><span className="text-slate-500">Marjin (pozisyona ayrilan)</span><span className="text-white">${(numBalance * numRisk / 100).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Pozisyon Degeri</span><span className="text-white">${(numBalance * numRisk / 100 * numLeverage).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Likidasyon (~)</span><span className="text-yellow-400">{(95 / numLeverage).toFixed(2)}%</span></div>
            {numFeePct > 0 && (() => {
              const margin = numBalance * numRisk / 100
              const posVal = margin * numLeverage
              const totalFee = 2 * numFeePct / 100 * posVal
              const totalFeePct = (totalFee / margin * 100).toFixed(1)
              const grossTP = numTpPct / 100 * posVal
              const netTP = grossTP - totalFee
              const netTPpct = (netTP / margin * 100).toFixed(1)
              return (
                <>
                  <div className="flex justify-between border-t border-slate-700 pt-0.5">
                    <span className="text-slate-500">Toplam Komisyon (2 taraf)</span>
                    <span className="text-orange-400">${totalFee.toFixed(2)} (%{totalFeePct} marjin)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">TP@%{numTpPct} Net Kar</span>
                    <span className={netTP >= 0 ? "text-green-400" : "text-red-400"}>${netTP.toFixed(2)} (%{netTPpct})</span>
                  </div>
                </>
              )
            })()}
            {numSlPct > 95 / numLeverage && (
              <div className="text-red-400 text-[10px] pt-1 border-t border-slate-700">
                ⚠ SL %{numSlPct} &gt; Likidasyon %{(95/numLeverage).toFixed(2)} — SL tetiklenmeden likidasyon olur
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-xs text-slate-400">Marjin %</span>
              <input type="number" value={risk} onChange={e => setRisk(e.target.value)} min={0.5} max={10} step={0.5} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Kaldrac</span>
              <input type="number" value={leverage} onChange={e => setLeverage(e.target.value)} min={1} max={500} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">SL %</span>
              <input type="number" value={slPct} onChange={e => setSlPct(e.target.value)} min={0.1} max={50} step={0.1} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-slate-400">TP %</span>
            <input type="number" value={tpPct} onChange={e => setTpPct(e.target.value)} min={0.1} max={200} step={0.1} className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
          </label>

          <div className="block">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400">Komisyon %</span>
              <div className="flex gap-1">
                <button onClick={() => setFeePct("0")} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${numFeePct === 0 ? "border-green-500 bg-green-500/20 text-green-300" : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}>Sıfır</button>
                <button onClick={() => setFeePct("0.04")} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${numFeePct === 0.04 ? "border-blue-500 bg-blue-500/20 text-blue-300" : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}>0.04%</button>
                <button onClick={() => setFeePct("0.06")} className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${numFeePct === 0.06 ? "border-blue-500 bg-blue-500/20 text-blue-300" : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"}`}>0.06%</button>
              </div>
            </div>
            <input type="number" value={feePct} onChange={e => setFeePct(e.target.value)} min={0} max={1} step={0.01} className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
          </div>

          {/* Overlay İndikatörler */}
          <div>
            <span className="text-xs text-slate-400 block mb-1.5">Grafik İndikatörleri</span>
            <div className="flex flex-wrap gap-1.5">
              {OVERLAY_OPTIONS.map(o => (
                <button
                  key={o.id}
                  onClick={() => toggleOverlay(o.id)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    overlays.includes(o.id)
                      ? "border-blue-500 bg-blue-500/20 text-blue-300"
                      : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Orta: Strateji Secimi + Parametreleri */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300 border-b border-slate-700 pb-2">Strateji</h2>

          <div className="grid grid-cols-2 gap-2">
            {STRATEGIES.map(s => (
              <button
                key={s.id}
                onClick={() => { setStrategy(s.id); setParams({}) }}
                className={`text-xs px-2 py-2 rounded border transition-colors ${
                  strategy === s.id
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          {selectedStrat && (
            <div className="space-y-2 mt-3">
              <span className="text-xs text-slate-500">Strateji Parametreleri</span>
              {Object.entries(selectedStrat.params).map(([key, defaultVal]) => (
                <label key={key} className="block">
                  <span className="text-xs text-slate-400">{key}</span>
                  {typeof defaultVal === "string" ? (
                    <select
                      value={String(params[key] ?? defaultVal)}
                      onChange={e => updateParam(key, e.target.value)}
                      className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                    >
                      {(PARAM_OPTIONS[strategy]?.[key] ?? [defaultVal]).map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : typeof defaultVal === "boolean" ? (
                    <select
                      value={String(params[key] ?? defaultVal)}
                      onChange={e => updateParam(key, e.target.value)}
                      className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                    >
                      <option value="true">Evet</option>
                      <option value="false">Hayir</option>
                    </select>
                  ) : (
                    <input
                      type="number"
                      defaultValue={defaultVal as number}
                      onChange={e => updateParam(key, e.target.value)}
                      step={typeof defaultVal === "number" && defaultVal < 1 ? 0.1 : 1}
                      className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          <button
            onClick={runBacktest}
            disabled={loading}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-2.5 rounded transition-colors text-sm"
          >
            {loading ? "Backtest calisiyor..." : "Backtest Baslat"}
          </button>
        </div>

        {/* Sag: Sonuc Metrikleri */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-300 border-b border-slate-700 pb-2 mb-3">Sonuclar</h2>
          {!result && !loading && <p className="text-xs text-slate-500">Henuz backtest calistirilmadi.</p>}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
          {result?.error && <p className="text-red-400 text-sm">{result.error}</p>}
          {result && !result.error && (
            <div className="space-y-2">
              <MetricRow label="Toplam Trade" value={result.total_trades} />
              <MetricRow label="Final Bakiye" value={`$${result.final_balance.toLocaleString()}`} />
              {result.total_fees !== undefined && (
                <MetricRow label="Toplam Komisyon" value={`$${result.total_fees.toLocaleString()}`} color="text-orange-400" />
              )}
              <MetricRow
                label="Toplam PnL (Net)"
                value={`$${result.total_pnl.toLocaleString()} (${result.total_pnl_pct > 0 ? "+" : ""}${result.total_pnl_pct}%)`}
                color={result.total_pnl >= 0 ? "text-green-400" : "text-red-400"}
              />
              <MetricRow
                label="Win Rate"
                value={`${result.win_rate}% (${result.win_count}W / ${result.loss_count}L)`}
                color={result.win_rate >= 50 ? "text-green-400" : "text-yellow-400"}
              />
              <MetricRow
                label="Max Drawdown"
                value={`${result.max_drawdown_pct}%`}
                color={result.max_drawdown_pct > 20 ? "text-red-400" : "text-yellow-400"}
              />
              <MetricRow label="Sharpe Ratio" value={result.sharpe_ratio} color={result.sharpe_ratio > 1 ? "text-green-400" : "text-slate-300"} />
              <MetricRow label="Profit Factor" value={result.profit_factor} color={result.profit_factor > 1.5 ? "text-green-400" : "text-yellow-400"} />
              <MetricRow label="Ort. Trade PnL" value={`$${result.avg_trade_pnl}`} />
              <MetricRow label="En Iyi Trade" value={`$${result.best_trade}`} color="text-green-400" />
              <MetricRow label="En Kotu Trade" value={`$${result.worst_trade}`} color="text-red-400" />
              <MetricRow label="Ort. Win" value={`$${result.avg_win}`} color="text-green-400" />
              <MetricRow label="Ort. Loss" value={`$${result.avg_loss}`} color="text-red-400" />
              <MetricRow label="Ort. Sure" value={`${result.avg_duration_hours}s`} />
              {result.config && (
                <div className="text-[10px] text-slate-500 border-t border-slate-700 pt-2 mt-2">
                  {result.config.symbol} | {result.config.timeframe} | {result.config.days} gun | {result.config.candle_count} mum
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Trade Grafigi — Mum + Giris/Cikis Marker */}
      {result && !result.error && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-2">
            Trade Grafigi
            <span className="text-[10px] text-slate-500 ml-2 font-normal">
              {result.trades.length} trade | Yesil ok = LONG giris | Kirmizi ok = SHORT giris | Daire = Cikis (TP/SL)
            </span>
          </h2>
          {result.ohlcv && result.ohlcv.length > 0 ? (
            <BacktestChart candles={result.ohlcv} trades={result.trades} indicators={result.indicators} />
          ) : (
            <div className="text-xs text-yellow-500 bg-yellow-950/30 border border-yellow-900 rounded px-3 py-4 text-center">
              Backend grafik verisi dondurmedi (ohlcv yok). Coolify&apos;da backend redeploy gerekebilir.
            </div>
          )}
        </div>
      )}

      {/* Equity Curve */}
      {result && !result.error && result.equity_curve.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Equity Curve</h2>
          <EquityChart data={result.equity_curve} initial={numBalance} />
        </div>
      )}

      {/* Trade Listesi */}
      {result && !result.error && result.trades.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Tradeler ({result.trades.length})</h2>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-left py-1.5 px-2">#</th>
                  <th className="text-left py-1.5 px-2">Tarih</th>
                  <th className="text-left py-1.5 px-2">Yon</th>
                  <th className="text-right py-1.5 px-2">Giris</th>
                  <th className="text-right py-1.5 px-2">Cikis</th>
                  <th className="text-right py-1.5 px-2">Marjin</th>
                  <th className="text-right py-1.5 px-2">Poz.Deger</th>
                  <th className="text-right py-1.5 px-2">PnL</th>
                  <th className="text-right py-1.5 px-2">Fee</th>
                  <th className="text-right py-1.5 px-2">PnL % (marjin)</th>
                  <th className="text-left py-1.5 px-2">Neden</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t, i) => (
                  <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="py-1.5 px-2 text-slate-600">{i + 1}</td>
                    <td className="py-1.5 px-2 text-slate-400">{new Date(t.entry_ts).toLocaleDateString("tr-TR")}</td>
                    <td className="py-1.5 px-2">
                      <span className={t.side === "buy" ? "text-green-400" : "text-red-400"}>
                        {t.side === "buy" ? "LONG" : "SHORT"}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-300">${t.entry.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="py-1.5 px-2 text-right text-slate-300">${t.exit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="py-1.5 px-2 text-right text-slate-400">{t.margin !== undefined ? `$${t.margin.toFixed(2)}` : "-"}</td>
                    <td className="py-1.5 px-2 text-right text-slate-400">{t.position_value !== undefined ? `$${t.position_value.toFixed(2)}` : "-"}</td>
                    <td className={`py-1.5 px-2 text-right font-medium ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                      ${t.pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-1.5 px-2 text-right text-orange-400">
                      {t.fee !== undefined ? `$${t.fee.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td className={`py-1.5 px-2 text-right ${t.pnl_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {t.pnl_pct > 0 ? "+" : ""}{t.pnl_pct}%
                    </td>
                    <td className="py-1.5 px-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        t.exit_reason === "take_profit" ? "bg-green-500/10 text-green-400" :
                        t.exit_reason === "stop_loss" ? "bg-red-500/10 text-red-400" :
                        t.exit_reason === "liquidation" ? "bg-red-600/20 text-red-300 font-semibold" :
                        "bg-slate-700 text-slate-400"
                      }`}>
                        {t.exit_reason === "take_profit" ? "TP" :
                         t.exit_reason === "stop_loss" ? "SL" :
                         t.exit_reason === "liquidation" ? "LIQ" :
                         t.exit_reason}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-medium ${color || "text-white"}`}>{value}</span>
    </div>
  )
}

function EquityChart({ data, initial }: { data: EquityPoint[]; initial: number }) {
  if (data.length < 2) return null

  const values = data.map(d => d.equity)
  const min = Math.min(...values) * 0.98
  const max = Math.max(...values) * 1.02
  const range = max - min || 1

  const W = 900
  const H = 200
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((d.equity - min) / range) * H
    return `${x},${y}`
  }).join(" ")

  const initY = H - ((initial - min) / range) * H
  const isProfit = values[values.length - 1] >= initial

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48" preserveAspectRatio="none">
      <line x1={0} y1={initY} x2={W} y2={initY} stroke="#475569" strokeWidth={1} strokeDasharray="4 4" />
      <polyline
        points={points}
        fill="none"
        stroke={isProfit ? "#22c55e" : "#ef4444"}
        strokeWidth={2}
      />
      <polygon
        points={`0,${H} ${points} ${W},${H}`}
        fill={isProfit ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)"}
      />
    </svg>
  )
}
