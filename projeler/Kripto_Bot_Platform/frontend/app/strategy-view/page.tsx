"use client"

import { useState, useEffect } from "react"
import { api } from "@/lib/api"
import dynamic from "next/dynamic"
import { runCustomCode, loadCustomInds, type CustomIndicatorDef } from "@/components/Chart/CustomIndicatorEditor"

const BacktestChart = dynamic(() => import("../backtest/BacktestChart"), { ssr: false })

interface Trade {
  entry_ts: number
  exit_ts: number
  side: string
  entry: number
  exit: number
  qty?: number
  margin?: number
  position_value?: number
  leverage?: number
  pnl: number
  fee?: number
  pnl_pct: number
  exit_reason: string
}

interface OHLCVCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
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
  win_count: number
  loss_count: number
  avg_trade_pnl: number
  best_trade: number
  worst_trade: number
  avg_win: number
  avg_loss: number
  trades: Trade[]
  ohlcv?: OHLCVCandle[]
  indicators?: Record<string, { time: number; value: number }[]>
  config?: { symbol: string; timeframe: string; strategy: string; days: number; candle_count: number }
  error?: string
  custom?: boolean
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
      exit_at_bands: true,
    },
  },
  { id: "grid_bollinger",   name: "Bollinger Grid",   params: { Kademe: 20, BB_Periyot: 20, BB_Sapma: 2.0, Min_Spread_Pct: 0.3 } },
  { id: "grid_hybrid",      name: "Hibrit Grid (BB+Filtre)", params: { Kademe: 20, BB_Periyot: 20, BB_Sapma: 2.0, Min_Spread_Pct: 0.3 } },
  { id: "grid_bb_direction",name: "BB Yön (Oto Long/Short)", params: { Kademe: 20, BB_Periyot: 20, BB_Sapma: 2.0, Min_Spread_Pct: 0.3 } },
  { id: "grid_ema_trend",   name: "EMA Trend (Oto)",  params: { min_ema_pct: 1.0, ema_exit_mode: "ema_cross", Kademe: 15, Spread_Pct: 1.5 } },
  { id: "grid_trend_score", name: "Trend Puanlama (Claude)", params: { Kademe: 15, Spread_Pct: 1.5, BB_Periyot: 20, BB_Sapma: 2.0, ts_entry_threshold: 4, ts_exit_threshold: 1, ts_adx_period: 14, ts_adx_min: 20, ts_supertrend_period: 10, ts_supertrend_mult: 3.0, ts_divergence_lookback: 14 } },
]

const PARAM_OPTIONS: Record<string, Record<string, string[]>> = {
  bb_ema_cross: { direction: ["both", "long", "short"] },
  grid_ema_trend: { ema_exit_mode: ["ema_cross", "bollinger", "touch_ema50", "touch_ema200"] },
}

const SYMBOLS   = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT", "XRP/USDT:USDT", "DOGE/USDT:USDT", "BNB/USDT:USDT"]
const TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"]

// ─── Client-side backtest for custom indicators ───────────────────────────────
function clientBacktest(
  signals: Array<{ type: string; bar_index: number; price?: number; reason?: string }>,
  candles: OHLCVCandle[],
  initialBalance: number,
  riskPct: number,
  leverage: number
): Trade[] {
  const trades: Trade[] = []
  let position: { side: "buy"|"sell"; entry: number; entry_ts: number; margin: number; qty: number } | null = null

  for (const sig of signals) {
    const idx = sig.bar_index < 0 ? candles.length + sig.bar_index : sig.bar_index
    if (idx < 0 || idx >= candles.length) continue
    const candle = candles[idx]
    const price = sig.price ?? candle.close
    const ts = candle.time * 1000

    if (sig.type === "buy" && !position) {
      const margin = initialBalance * riskPct
      const qty = (margin * leverage) / price
      position = { side: "buy", entry: price, entry_ts: ts, margin, qty }
    } else if (sig.type === "sell" && position?.side === "buy") {
      const pnl = position.qty * (price - position.entry)
      trades.push({
        entry_ts: position.entry_ts, exit_ts: ts,
        side: "buy", entry: position.entry, exit: price,
        qty: Math.round(position.qty * 1e6) / 1e6,
        margin: Math.round(position.margin * 100) / 100,
        position_value: Math.round(position.margin * leverage * 100) / 100,
        leverage, pnl: Math.round(pnl * 100) / 100,
        pnl_pct: Math.round((pnl / position.margin) * 10000) / 100,
        exit_reason: sig.reason || "signal",
      })
      position = null
    } else if (sig.type === "sell" && !position) {
      const margin = initialBalance * riskPct
      const qty = (margin * leverage) / price
      position = { side: "sell", entry: price, entry_ts: ts, margin, qty }
    } else if (sig.type === "buy" && position?.side === "sell") {
      const pnl = position.qty * (position.entry - price)
      trades.push({
        entry_ts: position.entry_ts, exit_ts: ts,
        side: "sell", entry: position.entry, exit: price,
        qty: Math.round(position.qty * 1e6) / 1e6,
        margin: Math.round(position.margin * 100) / 100,
        position_value: Math.round(position.margin * leverage * 100) / 100,
        leverage, pnl: Math.round(pnl * 100) / 100,
        pnl_pct: Math.round((pnl / position.margin) * 10000) / 100,
        exit_reason: sig.reason || "signal",
      })
      position = null
    }
  }

  // Açık kalan pozisyonu son barda kapat
  if (position && candles.length > 0) {
    const last = candles[candles.length - 1]
    const price = last.close
    const ts = last.time * 1000
    const pnl = position.side === "buy"
      ? position.qty * (price - position.entry)
      : position.qty * (position.entry - price)
    trades.push({
      entry_ts: position.entry_ts, exit_ts: ts,
      side: position.side, entry: position.entry, exit: price,
      qty: Math.round(position.qty * 1e6) / 1e6,
      margin: Math.round(position.margin * 100) / 100,
      position_value: Math.round(position.margin * leverage * 100) / 100,
      leverage, pnl: Math.round(pnl * 100) / 100,
      pnl_pct: Math.round((pnl / position.margin) * 10000) / 100,
      exit_reason: "end_of_data",
    })
  }

  return trades
}

function computeMetrics(trades: Trade[], initialBalance: number): Omit<BacktestResult, "trades" | "ohlcv" | "indicators" | "config" | "error" | "custom"> {
  if (!trades.length) return {
    total_trades: 0, final_balance: initialBalance,
    total_pnl: 0, total_pnl_pct: 0, win_rate: 0,
    max_drawdown_pct: 0, sharpe_ratio: 0, profit_factor: 0,
    avg_trade_pnl: 0, best_trade: 0, worst_trade: 0,
    avg_win: 0, avg_loss: 0, win_count: 0, loss_count: 0,
  }
  const pnls = trades.map(t => t.pnl)
  const wins = pnls.filter(p => p > 0)
  const losses = pnls.filter(p => p <= 0)
  const totalPnl = pnls.reduce((a, b) => a + b, 0)
  return {
    total_trades: trades.length,
    final_balance: Math.round((initialBalance + totalPnl) * 100) / 100,
    total_pnl: Math.round(totalPnl * 100) / 100,
    total_pnl_pct: Math.round((totalPnl / initialBalance) * 10000) / 100,
    win_rate: Math.round((wins.length / pnls.length) * 1000) / 10,
    max_drawdown_pct: 0,
    sharpe_ratio: 0,
    profit_factor: wins.length && losses.length
      ? Math.round(wins.reduce((a,b)=>a+b,0) / Math.abs(losses.reduce((a,b)=>a+b,0)) * 100) / 100
      : wins.length ? 999 : 0,
    avg_trade_pnl: Math.round((totalPnl / trades.length) * 100) / 100,
    best_trade: Math.round(Math.max(...pnls) * 100) / 100,
    worst_trade: Math.round(Math.min(...pnls) * 100) / 100,
    avg_win: wins.length ? Math.round(wins.reduce((a,b)=>a+b,0)/wins.length*100)/100 : 0,
    avg_loss: losses.length ? Math.round(losses.reduce((a,b)=>a+b,0)/losses.length*100)/100 : 0,
    win_count: wins.length,
    loss_count: losses.length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function StrategyViewPage() {
  const [symbol,     setSymbol]     = useState("BTC/USDT:USDT")
  const [timeframe,  setTimeframe]  = useState("1h")
  const [days,       setDays]       = useState(30)
  const [strategy,   setStrategy]   = useState("ema_cross")
  const [params,     setParams]     = useState<Record<string, number | boolean | string>>({})
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<BacktestResult | null>(null)
  const [customInds, setCustomInds] = useState<CustomIndicatorDef[]>([])
  // Risk & Para ayarları (string state — boş bırakılabilsin)
  const [initialBalance, setInitialBalance] = useState("10000")
  const [leverage,       setLeverage]       = useState("1")
  const [riskPct,        setRiskPct]        = useState("2")
  const [slPct,          setSlPct]          = useState("3")
  const [tpPct,          setTpPct]          = useState("6")
  const [budgetMode,     setBudgetMode]     = useState("fixed") // "fixed" or "percent"

  useEffect(() => {
    setCustomInds(loadCustomInds().filter(i => i.producesSignals))
  }, [])

  const allStrategies = [
    ...STRATEGIES,
    ...customInds.map(i => ({ id: `custom__${i.id}`, name: `⚙ ${i.name}`, params: {} as Record<string, number | boolean | string> })),
  ]

  const selectedStrat = allStrategies.find(s => s.id === strategy) ?? STRATEGIES[0]

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
      // ── Özel indikatör: tarayıcıda çalıştır ──
      if (strategy.startsWith("custom__")) {
        const indId = strategy.replace("custom__", "")
        const ind = customInds.find(i => i.id === indId)
        if (!ind) { setResult({ error: "Özel indikatör bulunamadı" } as BacktestResult); return }

        const hpc: Record<string, number> = { "1m": 1/60, "5m": 5/60, "15m": 0.25, "1h": 1, "4h": 4, "1d": 24 }
        const limit = Math.min(5000, Math.ceil((days * 24) / (hpc[timeframe] || 1)) + 50)
        const raw = await api.get(`/data/ohlcv?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`)
        const rawCandles: OHLCVCandle[] = raw.candles

        const volumes = rawCandles.map((c: OHLCVCandle) => ({ value: c.volume ?? 0 }))
        const codeResult = runCustomCode(ind.code, rawCandles, volumes)

        if (codeResult.error) { setResult({ error: `JS Hata: ${codeResult.error}` } as BacktestResult); return }

        // Series → indicators (sadece overlay/main panel)
        const indicators: Record<string, { time: number; value: number }[]> = {}
        codeResult.series.forEach((s, i) => {
          if (s.panel === "sub") return
          const key = `custom_${i}_${s.title || i}`
          indicators[key] = rawCandles
            .map((c, idx) => ({ time: c.time, value: (s.values[idx] as number) }))
            .filter(p => p.value != null && Number.isFinite(p.value))
        })

        const signals = codeResult.signals || []
        const bal = Number(initialBalance) || 10000
        const lev = Number(leverage) || 1
        const rsk = Number(riskPct) || 2
        const trades = clientBacktest(signals, rawCandles, bal, rsk / 100, lev)
        const metrics = computeMetrics(trades, bal)

        setResult({
          ...metrics,
          trades,
          ohlcv: rawCandles,
          indicators,
          config: { symbol, timeframe, strategy: ind.name, days, candle_count: rawCandles.length },
          custom: true,
          initialBalance: bal,
        })
        return
      }

      // ── Normal strateji: backend ──
      const mergedParams = { ...selectedStrat.params, ...params }
      if (strategy.startsWith("grid_")) {
        mergedParams.budget = Number(riskPct) || 1000
        if (mergedParams.Kademe) { mergedParams.grid_count = mergedParams.Kademe; delete mergedParams.Kademe }
        if (mergedParams.BB_Periyot) { mergedParams.bb_period = mergedParams.BB_Periyot; delete mergedParams.BB_Periyot }
        if (mergedParams.BB_Sapma) { mergedParams.bb_std_dev = mergedParams.BB_Sapma; delete mergedParams.BB_Sapma }
        if (mergedParams.Min_Spread_Pct) { mergedParams.min_spread_pct = mergedParams.Min_Spread_Pct; delete mergedParams.Min_Spread_Pct }
      }
      
      const res = await api.post("/backtest/run", {
        symbol, timeframe, strategy, days,
        initial_balance: Number(initialBalance) || 10000,
        risk_per_trade: strategy.startsWith("grid_") ? (Number(riskPct) || 1000) : (Number(riskPct) || 2) / 100,
        leverage: Number(leverage) || 1,
        stop_loss_pct: Number(slPct) || 3,
        take_profit_pct: Number(tpPct) || 6,
        fee_pct: 0.02,  // MEXC Taker fee
        params: { ...mergedParams, budget_mode: budgetMode },
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
      <div className="section-header">
        <div className="section-header-icon">📈</div>
        <div>
          <h1 className="section-title">Strateji Görüntüleme</h1>
          <p className="section-subtitle">Grafik üstünde giriş/çıkış noktaları · Trade simulations</p>
        </div>
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
              <optgroup label="Yerleşik Stratejiler">
                {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
              {customInds.length > 0 && (
                <optgroup label="Özel İndikatörler">
                  {customInds.map(i => (
                    <option key={i.id} value={`custom__${i.id}`}>{i.name}</option>
                  ))}
                </optgroup>
              )}
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

        {/* Risk & Para ayarları */}
        <div className="border-t border-slate-800 pt-3">
          <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide">Kasa & Risk Ayarları</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <label className="block">
              <span className="text-xs text-slate-400">Başlangıç Kasası ($)</span>
              <input type="number" value={initialBalance}
                onChange={e => setInitialBalance(e.target.value)}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Kaldıraç (x)</span>
              <input type="number" value={leverage}
                onChange={e => setLeverage(e.target.value)}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
            </label>
            {strategy.startsWith("grid_") ? (
              <>
                <label className="block">
                  <span className="text-xs text-slate-400">Bütçe Tipi</span>
                  <select value={budgetMode} onChange={e => setBudgetMode(e.target.value)}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white">
                    <option value="fixed">Sabit Tutar ($)</option>
                    <option value="percent">Kasa Yüzdesi (%)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">
                    {budgetMode === "fixed" ? "Toplam Grid Bütçesi ($)" : "Grid Bütçesi (Kasa %)"}
                  </span>
                  <input type="number" value={riskPct}
                    onChange={e => setRiskPct(e.target.value)}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
                </label>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="text-xs text-slate-400">Risk / İşlem (%)</span>
                  <input type="number" value={riskPct}
                    onChange={e => setRiskPct(e.target.value)}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">Zarar Durdur (%)</span>
                  <input type="number" value={slPct}
                    onChange={e => setSlPct(e.target.value)}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-400">Kar Al (%)</span>
                  <input type="number" value={tpPct}
                    onChange={e => setTpPct(e.target.value)}
                    className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white" />
                </label>
              </>
            )}
          </div>
        </div>

        {/* Özel indikatör bilgisi */}
        {strategy.startsWith("custom__") && (
          <div className="border-t border-slate-800 pt-2">
            <p className="text-[11px] text-purple-400">
              ⚙ Özel indikatör — JS kodu tarayıcıda çalıştırılır. Sinyaller trade simülasyonuna dönüştürülür.
            </p>
          </div>
        )}

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

      {/* Grafik */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-300">Grafik</h2>
          <span className="text-[10px] text-slate-500">
            ↑ LONG giriş &nbsp;·&nbsp; ↓ SHORT giriş &nbsp;·&nbsp; ● Çıkış &nbsp;·&nbsp; --- Bağlantı
          </span>
        </div>
        {result && !result.error && result.ohlcv && result.ohlcv.length > 0 ? (
          <BacktestChart candles={result.ohlcv} trades={result.trades} indicators={result.indicators} />
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
          {/* Kasa Durumu Kartı */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="flex flex-wrap items-center gap-4 md:gap-8">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Başlangıç Kasası</p>
                <p className="text-lg font-bold text-white">${(Number(initialBalance)||10000).toLocaleString()}</p>
              </div>
              <div className="text-slate-600 text-xl font-light hidden md:block">→</div>
              <div>
                <p className="text-xs text-slate-500 mb-0.5">Bitiş Kasası</p>
                <p className={`text-lg font-bold ${result.final_balance >= (Number(initialBalance)||10000) ? "text-green-400" : "text-red-400"}`}>
                  ${result.final_balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="border-l border-slate-700 pl-4 md:pl-8">
                <p className="text-xs text-slate-500 mb-0.5">Net Kar / Zarar</p>
                <p className={`text-lg font-bold ${result.total_pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {result.total_pnl >= 0 ? "+" : ""}${result.total_pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  <span className="text-sm font-normal ml-1.5">
                    ({result.total_pnl_pct >= 0 ? "+" : ""}{result.total_pnl_pct}%)
                  </span>
                </p>
                {result.total_fees !== undefined && (
                  <p className="text-[10px] text-orange-400 mt-1">
                    Komisyon: ${result.total_fees.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <div className="border-l border-slate-700 pl-4 md:pl-8 text-xs text-slate-500 space-y-0.5">
                <p>Kaldıraç: <span className="text-white">{leverage}x</span></p>
                <p>Risk/İşlem: <span className="text-white">%{riskPct || 2}</span></p>
                <p>SL / TP: <span className="text-white">%{slPct || 3} / %{tpPct || 6}</span></p>
              </div>
            </div>
          </div>

          {result.custom && (
            <div className="text-[11px] text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded px-3 py-2">
              Özel indikatör simülasyonu — sinyaller: buy=LONG aç, sell=LONG kapat / SHORT aç.
            </div>
          )}
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
                    <th className="text-right py-1.5 px-2">Margin</th>
                    <th className="text-right py-1.5 px-2">Poz. Değeri</th>
                    <th className="text-right py-1.5 px-2">Giriş</th>
                    <th className="text-right py-1.5 px-2">Çıkış</th>
                    <th className="text-right py-1.5 px-2">PnL ($)</th>
                    <th className="text-right py-1.5 px-2">Fee</th>
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
                      <td className="py-1.5 px-2 text-right text-slate-400 text-[11px]">
                        {t.margin != null ? `$${t.margin.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-300 text-[11px]">
                        {t.position_value != null ? `$${t.position_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
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
                      <td className="py-1.5 px-2 text-right text-orange-400">
                        {t.fee !== undefined ? `$${t.fee.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className={`py-1.5 px-2 text-right ${t.pnl_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {t.pnl_pct > 0 ? "+" : ""}{t.pnl_pct}%
                      </td>
                      <td className="py-1.5 px-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          t.exit_reason === "take_profit"   ? "bg-green-500/10 text-green-400" :
                          t.exit_reason === "stop_loss"     ? "bg-red-500/10 text-red-400" :
                          t.exit_reason === "liquidation"   ? "bg-red-600/20 text-red-300 font-semibold" :
                          t.exit_reason === "bb_upper_band" || t.exit_reason === "bb_lower_band"
                                                            ? "bg-blue-500/10 text-blue-400" :
                          t.exit_reason === "signal"        ? "bg-purple-500/10 text-purple-400" :
                          "bg-slate-700 text-slate-400"
                        }`}>
                          {t.exit_reason === "take_profit"   ? "TP" :
                           t.exit_reason === "stop_loss"     ? "SL" :
                           t.exit_reason === "liquidation"   ? "LIQ" :
                           t.exit_reason === "bb_upper_band" ? "BB↑" :
                           t.exit_reason === "bb_lower_band" ? "BB↓" :
                           t.exit_reason === "signal"        ? "SIG" :
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
            Bu periyotta hiç sinyal üretilmedi. Farklı parametreler veya daha uzun süre deneyin.
          </p>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className={`stat-card-value ${color ?? 'text-white'}`}>{value}</div>
    </div>
  )
}
