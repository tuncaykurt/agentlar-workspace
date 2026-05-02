"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import dynamic from "next/dynamic"

const BacktestChart = dynamic(() => import("../backtest/BacktestChart"), { ssr: false })

interface Trade {
  entry_ts: number
  exit_ts: number
  side: string
  entry: number
  exit: number
  margin?: number
  position_value?: number
  pnl: number
  pnl_pct: number
  exit_reason: string
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
  total_pnl_pct: number
  win_rate: number
  max_drawdown_pct: number
  sharpe_ratio: number
  profit_factor: number
  win_count: number
  loss_count: number
  avg_trade_pnl: number
  best_trade: number
  worst_trade: number
  trades: Trade[]
  ohlcv?: OHLCVCandle[]
  config?: { symbol: string; timeframe: string; strategy: string; days: number; candle_count: number }
  error?: string
}

const STRATEGIES = [
  { id: "ema_cross",        name: "EMA Crossover",    params: { fast_ema: 9, slow_ema: 21 } },
  { id: "rsi_oversold",     name: "RSI",              params: { rsi_period: 14, oversold: 30, overbought: 70, rsi_ema_filter: 200 } },
  { id: "macd_signal",      name: "MACD",             params: { fast: 12, slow: 26, signal: 9, hist_threshold: 0 } },
  { id: "bollinger_bounce", name: "Bollinger Bounce", params: { period: 20, std_dev: 2.0, squeeze: true } },
  { id: "ut_bot",           name: "UT Bot",           params: { atr_period: 10, atr_mult: 3.0, heikin_ashi: false } },
  { id: "supertrend",       name: "Supertrend",       params: { period: 10, mult: 3.0 } },
  {
    id: "bb_ema_cross",
    name: "BB-EMA Cross",
    params: {
      bb_period: 20, bb_std: 2.0,
      ema_fast: 5, ema_slow: 13,
      touch_pct: 0.3, setup_lookback: 5,
      direction: "both", exit_at_bands: true,
    },
  },
]

const PARAM_OPTIONS: Record<string, Record<string, string[]>> = {
  bb_ema_cross: { direction: ["both", "long", "short"] },
}

const SYMBOLS   = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT", "XRP/USDT:USDT", "DOGE/USDT:USDT", "BNB/USDT:USDT"]
const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"]

export default function StrategyViewPage() {
  const [symbol,    setSymbol]    = useState("BTC/USDT:USDT")
  const [timeframe, setTimeframe] = useState("1h")
  const [days,      setDays]      = useState(30)
  const [strategy,  setStrategy]  = useState("ema_cross")
  const [params,    setParams]    = useState<Record<string, number | boolean | string>>({})
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState<BacktestResult | null>(null)

  const selectedStrat = STRATEGIES.find(s => s.id === strategy)!

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

  const run = async () => {
    setLoading(true)
    setResult(null)
    try {
      const mergedParams = { ...selectedStrat.params, ...params }
      const res = await api.post("/backtest/run", {
        symbol, timeframe, strategy, days,
        initial_balance: 10000,
        risk_per_trade: 0.02,
        leverage: 1,
        stop_loss_pct: 3,
        take_profit_pct: 6,
        params: mergedParams,
      })
      setResult(res)
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Hata oluştu" } as BacktestResult)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4 pb-10">

      {/* Başlık */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Strateji Görüntüleyici</h1>
        <span className="text-xs text-slate-500 hidden md:block">
          Grafik üstünde giriş/çıkış noktaları · altında işlem hesaplaması
        </span>
      </div>

      {/* Kontrol Paneli */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
        {/* Üst satır: sembol / timeframe / gün / strateji / buton */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">Sembol</span>
            <select value={symbol} onChange={e => setSymbol(e.target.value)}
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white">
              {SYMBOLS.map(s => <option key={s} value={s}>{s.replace("/USDT:USDT", "")}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Zaman Dilimi</span>
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)}
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white">
              {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Süre (gün)</span>
            <input type="number" value={days} min={7} max={365}
              onChange={e => setDays(Number(e.target.value))}
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
          </label>

          <label className="block">
            <span className="text-xs text-slate-400">Strateji</span>
            <select value={strategy} onChange={e => { setStrategy(e.target.value); setParams({}) }}
              className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white">
              {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          <button
            onClick={run}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold py-1.5 rounded text-sm mt-5 transition-colors"
          >
            {loading ? "Yükleniyor..." : "Görüntüle"}
          </button>
        </div>

        {/* Alt satır: Strateji Parametreleri */}
        {Object.keys(selectedStrat.params).length > 0 && (
          <div className="border-t border-slate-800 pt-3">
            <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide">Strateji Parametreleri</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-2">
              {Object.entries(selectedStrat.params).map(([key, defaultVal]) => (
                <label key={key} className="block">
                  <span className="text-[10px] text-slate-400">{key}</span>
                  {typeof defaultVal === "string" ? (
                    <select
                      value={String(params[key] ?? defaultVal)}
                      onChange={e => updateParam(key, e.target.value)}
                      className="w-full mt-0.5 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-white"
                    >
                      {(PARAM_OPTIONS[strategy]?.[key] ?? [defaultVal]).map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : typeof defaultVal === "boolean" ? (
                    <select
                      value={String(params[key] ?? defaultVal)}
                      onChange={e => updateParam(key, e.target.value)}
                      className="w-full mt-0.5 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-white"
                    >
                      <option value="true">Evet</option>
                      <option value="false">Hayır</option>
                    </select>
                  ) : (
                    <input
                      type="number"
                      defaultValue={defaultVal as number}
                      onChange={e => updateParam(key, e.target.value)}
                      step={defaultVal < 1 ? 0.1 : 1}
                      className="w-full mt-0.5 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-xs text-white"
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Hata */}
      {result?.error && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          {result.error}
        </div>
      )}

      {/* Grafik — giriş/çıkış marker'lı */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-300">Grafik</h2>
          <span className="text-[10px] text-slate-500">
            ↑ LONG giriş &nbsp;·&nbsp; ↓ SHORT giriş &nbsp;·&nbsp; ● Çıkış (yeşil=kâr · kırmızı=zarar) &nbsp;·&nbsp; --- Bağlantı çizgisi
          </span>
        </div>
        {result && !result.error && result.ohlcv && result.ohlcv.length > 0 ? (
          <BacktestChart candles={result.ohlcv} trades={result.trades} />
        ) : (
          <div
            className="w-full bg-slate-950 rounded flex items-center justify-center"
            style={{ height: 480 }}
          >
            <p className="text-slate-600 text-sm">
              {loading ? "Veri yükleniyor..." : "Görüntüle butonuna bas"}
            </p>
          </div>
        )}
      </div>

      {/* Özet Metrikler */}
      {result && !result.error && result.total_trades > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Toplam İşlem" value={result.total_trades} />
            <StatCard
              label="Toplam PnL"
              value={`${result.total_pnl_pct >= 0 ? "+" : ""}${result.total_pnl_pct}% ($${result.total_pnl.toLocaleString()})`}
              color={result.total_pnl >= 0 ? "text-green-400" : "text-red-400"}
            />
            <StatCard
              label="Win Rate"
              value={`${result.win_rate}%  (${result.win_count}K / ${result.loss_count}Z)`}
              color={result.win_rate >= 50 ? "text-green-400" : "text-yellow-400"}
            />
            <StatCard
              label="Max Drawdown"
              value={`${result.max_drawdown_pct}%`}
              color={result.max_drawdown_pct > 20 ? "text-red-400" : "text-yellow-400"}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Sharpe Ratio" value={result.sharpe_ratio} color={result.sharpe_ratio > 1 ? "text-green-400" : "text-slate-300"} />
            <StatCard label="Profit Factor" value={result.profit_factor} color={result.profit_factor > 1.5 ? "text-green-400" : "text-yellow-400"} />
            <StatCard label="En İyi İşlem" value={`$${result.best_trade}`} color="text-green-400" />
            <StatCard label="En Kötü İşlem" value={`$${result.worst_trade}`} color="text-red-400" />
          </div>

          {result.config && (
            <p className="text-[10px] text-slate-600">
              {result.config.symbol} · {result.config.timeframe} · {result.config.days} gün · {result.config.candle_count} mum
            </p>
          )}

          {/* İşlem Listesi */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-slate-300 mb-3">İşlemler ({result.trades.length})</h2>
            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="text-slate-500 border-b border-slate-700">
                    <th className="text-left py-1.5 px-2">#</th>
                    <th className="text-left py-1.5 px-2">Tarih</th>
                    <th className="text-left py-1.5 px-2">Yön</th>
                    <th className="text-right py-1.5 px-2">Giriş</th>
                    <th className="text-right py-1.5 px-2">Çıkış</th>
                    <th className="text-right py-1.5 px-2">PnL ($)</th>
                    <th className="text-right py-1.5 px-2">PnL %</th>
                    <th className="text-left py-1.5 px-2">Neden</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="py-1.5 px-2 text-slate-600">{i + 1}</td>
                      <td className="py-1.5 px-2 text-slate-400">
                        {new Date(t.entry_ts).toLocaleDateString("tr-TR")}
                      </td>
                      <td className="py-1.5 px-2">
                        <span className={t.side === "buy" ? "text-green-400" : "text-red-400"}>
                          {t.side === "buy" ? "LONG" : "SHORT"}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-300">
                        ${t.entry.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-300">
                        ${t.exit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className={`py-1.5 px-2 text-right font-medium ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {t.pnl >= 0 ? "+" : ""}${t.pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className={`py-1.5 px-2 text-right ${t.pnl_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {t.pnl_pct > 0 ? "+" : ""}{t.pnl_pct}%
                      </td>
                      <td className="py-1.5 px-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          t.exit_reason === "take_profit"  ? "bg-green-500/10 text-green-400" :
                          t.exit_reason === "stop_loss"    ? "bg-red-500/10 text-red-400" :
                          t.exit_reason === "liquidation"  ? "bg-red-600/20 text-red-300 font-semibold" :
                          t.exit_reason === "bb_upper_band" || t.exit_reason === "bb_lower_band"
                                                           ? "bg-blue-500/10 text-blue-400" :
                          "bg-slate-700 text-slate-400"
                        }`}>
                          {t.exit_reason === "take_profit"  ? "TP" :
                           t.exit_reason === "stop_loss"    ? "SL" :
                           t.exit_reason === "liquidation"  ? "LIQ" :
                           t.exit_reason === "bb_upper_band" ? "BB↑" :
                           t.exit_reason === "bb_lower_band" ? "BB↓" :
                           t.exit_reason}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Veri yok ama hata da yok */}
      {result && !result.error && result.total_trades === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-6 text-center">
          <p className="text-slate-500 text-sm">
            Bu periyotta bu strateji hiç sinyal üretmedi. Farklı parametreler veya daha uzun süre deneyin.
          </p>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`text-base font-semibold ${color ?? "text-white"}`}>{value}</p>
    </div>
  )
}
