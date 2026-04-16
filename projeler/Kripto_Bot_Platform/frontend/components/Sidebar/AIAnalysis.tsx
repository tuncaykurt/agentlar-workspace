"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import clsx from "clsx"

interface AIResult {
  signal: string | null
  indicators: Record<string, number>
  market_context: {
    fear_greed: { value: number; label: string; change: number; signal: string }
    btc_dominance: { btc_dominance: number; signal: string }
    order_book: { ratio: number; signal: string; spread: number }
    whale: { whale_detected: boolean; whale_buys: number; whale_sells: number; signal: string }
    mtf: { confluence: string; alignment: boolean; buy_count: number; sell_count: number; timeframes: Record<string, any> }
    news: { sentiment_score: number; signal: string; bullish_count: number; bearish_count: number; total_news: number; news: { title: string; source: string; created_at: string }[]; error?: string }
    liquidations: { long_liq_count: number; short_liq_count: number; long_liq_volume: number; short_liq_volume: number; total_volume: number; signal: string; top_price_levels?: number[] }
  }
  ai_filter: { pass: boolean; strength: number; reason: string } | null
  ai_analysis: {
    approved: boolean
    confidence: number
    stop_loss: number
    take_profit: number
    risk_reward: number
    risk_level: string
    analysis: string
    key_factors: string[]
    warnings: string[]
  } | null
}

export default function AIAnalysis({ symbol, onAnalysis }: { symbol: string; onAnalysis?: (tp: number, sl: number) => void }) {
  const [result, setResult] = useState<AIResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<"signal"|"context"|"mtf"|"news"|"liq">("signal")

  const analyze = async () => {
    setLoading(true)
    try {
      const encoded = encodeURIComponent(symbol)
      const data = await api.get(`/ai/analyze?symbol=${encoded}`)
      setResult(data)
      if (onAnalysis && data?.ai_analysis?.take_profit && data?.ai_analysis?.stop_loss) {
        onAnalysis(data.ai_analysis.take_profit, data.ai_analysis.stop_loss)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const signalColor = result?.signal === "buy"
    ? "text-green-400 bg-green-500/10 border-green-500/30"
    : result?.signal === "sell"
    ? "text-red-400 bg-red-500/10 border-red-500/30"
    : "text-slate-400 bg-slate-800 border-slate-700"

  const fg = result?.market_context?.fear_greed
  const fgColor = !fg ? "text-slate-400" :
    fg.value <= 25 ? "text-green-400" :
    fg.value <= 45 ? "text-yellow-400" :
    fg.value <= 55 ? "text-slate-300" :
    fg.value <= 75 ? "text-orange-400" : "text-red-400"

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">AI Analiz</p>
        <span className="text-xs text-slate-500">DeepSeek + Claude</span>
      </div>

      <button onClick={analyze} disabled={loading}
        className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
        {loading ? "⏳ Analiz ediliyor..." : "🤖 Analiz Et"}
      </button>

      {result && (
        <div className="space-y-2">
          {/* Sinyal */}
          <div className={clsx("rounded-lg p-2.5 border", signalColor)}>
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold">
                {result.signal === "buy" ? "🟢 LONG" : result.signal === "sell" ? "🔴 SHORT" : "⚪ BEKLE"}
              </span>
              {result.ai_analysis && (
                <span className="text-xs font-bold">%{result.ai_analysis.confidence} güven</span>
              )}
            </div>
          </div>

          {/* Tab seçimi */}
          <div className="grid grid-cols-5 gap-0.5">
            {(["signal","context","mtf","news","liq"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={clsx("text-xs py-1 rounded transition-colors",
                  tab === t ? "bg-slate-600 text-white" : "text-slate-500 hover:text-white")}>
                {t === "signal" ? "Sinyal" : t === "context" ? "Bağlam" : t === "mtf" ? "Zaman" : t === "news" ? "Haber" : "Liq"}
              </button>
            ))}
          </div>

          {/* Sinyal Tab */}
          {tab === "signal" && (
            <div className="space-y-2">
              <div className="bg-slate-900 rounded-lg p-2.5 grid grid-cols-2 gap-1.5 text-xs">
                <Stat label="RSI" value={result.indicators?.rsi?.toFixed(1)}
                  warn={result.indicators?.rsi > 70 || result.indicators?.rsi < 30} />
                <Stat label="EMA Trend" value={result.indicators?.ema9 > result.indicators?.ema21 ? "Yukarı ↑" : "Aşağı ↓"} />
                <Stat label="MACD" value={result.indicators?.macd_hist > 0 ? "Pozitif +" : "Negatif -"} />
                <Stat label="Hacim" value={`${result.indicators?.vol_ratio?.toFixed(1)}x`}
                  warn={result.indicators?.vol_ratio < 0.8} />
              </div>

              {result.ai_filter && (
                <div className="bg-slate-900 rounded-lg p-2.5 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">DeepSeek ({result.ai_filter.strength}/10)</span>
                    <span className={result.ai_filter.pass ? "text-green-400" : "text-red-400"}>
                      {result.ai_filter.pass ? "✓ Geçti" : "✗ Reddedildi"}
                    </span>
                  </div>
                  <p className="text-slate-500">{result.ai_filter.reason}</p>
                </div>
              )}

              {result.ai_analysis && (
                <div className="bg-slate-900 rounded-lg p-2.5 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Claude Analiz</span>
                    <RiskBadge level={result.ai_analysis.risk_level} />
                  </div>
                  {result.ai_analysis.stop_loss && (
                    <div className="grid grid-cols-2 gap-1">
                      <div>
                        <p className="text-slate-500">Stop Loss</p>
                        <p className="text-red-400 font-mono">${result.ai_analysis.stop_loss?.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Take Profit</p>
                        <p className="text-green-400 font-mono">${result.ai_analysis.take_profit?.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Risk/Ödül</p>
                        <p className="text-blue-400 font-mono">1:{result.ai_analysis.risk_reward?.toFixed(1)}</p>
                      </div>
                    </div>
                  )}
                  <p className="text-slate-300 leading-relaxed">{result.ai_analysis.analysis}</p>
                  {result.ai_analysis.key_factors?.map((f, i) => (
                    <p key={i} className="text-slate-500">• {f}</p>
                  ))}
                  {result.ai_analysis.warnings?.map((w, i) => (
                    <p key={i} className="text-yellow-500">⚠ {w}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bağlam Tab */}
          {tab === "context" && result.market_context && (
            <div className="space-y-1.5 text-xs">
              {fg && (
                <div className="bg-slate-900 rounded-lg p-2.5">
                  <p className="text-slate-400 mb-1">Fear & Greed</p>
                  <div className="flex justify-between">
                    <span className={clsx("font-bold text-lg", fgColor)}>{fg.value}</span>
                    <div className="text-right">
                      <p className={fgColor}>{fg.label}</p>
                      <p className="text-slate-500">Dünden: {fg.change > 0 ? "+" : ""}{fg.change}</p>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 bg-slate-700 rounded-full">
                    <div className={clsx("h-full rounded-full", fgColor.replace("text-", "bg-"))}
                      style={{ width: `${fg.value}%`, opacity: 0.7 }} />
                  </div>
                </div>
              )}

              <div className="bg-slate-900 rounded-lg p-2.5 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-slate-500">BTC Dominance</p>
                  <p className="text-white font-mono">%{result.market_context.btc_dominance?.btc_dominance?.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Order Book</p>
                  <p className={result.market_context.order_book?.signal === "buy_pressure" ? "text-green-400" :
                    result.market_context.order_book?.signal === "sell_pressure" ? "text-red-400" : "text-slate-300"}>
                    {result.market_context.order_book?.ratio?.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Whale</p>
                  <p className={result.market_context.whale?.signal === "whale_buying" ? "text-green-400" :
                    result.market_context.whale?.signal === "whale_selling" ? "text-red-400" : "text-slate-400"}>
                    {result.market_context.whale?.signal?.replace("_", " ") || "neutral"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Spread</p>
                  <p className="text-white font-mono">${result.market_context.order_book?.spread?.toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}

          {/* MTF Tab */}
          {tab === "mtf" && result.market_context?.mtf && (
            <div className="space-y-1.5 text-xs">
              <div className="bg-slate-900 rounded-lg p-2 text-center">
                <p className="text-slate-400">Uyum</p>
                <p className={clsx("font-bold", result.market_context.mtf.confluence?.includes("buy") ? "text-green-400" :
                  result.market_context.mtf.confluence?.includes("sell") ? "text-red-400" : "text-slate-300")}>
                  {result.market_context.mtf.confluence?.replace("_", " ").toUpperCase()}
                  {result.market_context.mtf.alignment && " ⚡"}
                </p>
              </div>
              {Object.entries(result.market_context.mtf.timeframes || {}).map(([tf, data]: [string, any]) => (
                <div key={tf} className="bg-slate-900 rounded-lg p-2.5 flex justify-between items-center">
                  <span className="text-slate-400 font-mono w-8">{tf}</span>
                  <span className={data.trend === "up" ? "text-green-400" : "text-red-400"}>
                    {data.trend === "up" ? "↑" : "↓"} {data.trend}
                  </span>
                  <span className="text-slate-400">RSI {data.rsi?.toFixed(0)}</span>
                  <span className={data.signal === "buy" ? "text-green-400" : data.signal === "sell" ? "text-red-400" : "text-slate-500"}>
                    {data.signal || "—"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Haber Tab */}
          {tab === "news" && (
            <div className="space-y-1.5 text-xs">
              {result.market_context?.news ? (
                <>
                  {result.market_context.news.error && !result.market_context.news.news?.length ? (
                    <div className="bg-slate-900 rounded-lg p-3 text-center">
                      <p className="text-slate-500">Haber verisi yok</p>
                      <p className="text-slate-600 mt-1">CRYPTOPANIC_API_KEY gerekli</p>
                      <p className="text-blue-400 mt-1">cryptopanic.com → ücretsiz kayıt</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-slate-900 rounded-lg p-2.5 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-slate-500">Sentiment</p>
                          <p className={clsx("font-bold",
                            result.market_context.news.signal === "bullish" ? "text-green-400" :
                            result.market_context.news.signal === "bearish" ? "text-red-400" : "text-slate-300")}>
                            {result.market_context.news.sentiment_score}/100
                          </p>
                        </div>
                        <div>
                          <p className="text-green-500">Bullish</p>
                          <p className="text-green-400 font-bold">{result.market_context.news.bullish_count}</p>
                        </div>
                        <div>
                          <p className="text-red-500">Bearish</p>
                          <p className="text-red-400 font-bold">{result.market_context.news.bearish_count}</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {result.market_context.news.news?.map((n, i) => (
                          <div key={i} className="bg-slate-900 rounded p-2">
                            <p className="text-slate-300 leading-snug">{n.title}</p>
                            <p className="text-slate-600 mt-0.5">{n.source}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="text-slate-500 text-center py-3">Analiz çalıştır</p>
              )}
            </div>
          )}

          {/* Liquidation Tab */}
          {tab === "liq" && (
            <div className="space-y-1.5 text-xs">
              {result.market_context?.liquidations ? (
                <>
                  <div className={clsx("bg-slate-900 rounded-lg p-2 text-center",
                    result.market_context.liquidations.signal === "shorts_liquidated" ? "border border-green-500/20" :
                    result.market_context.liquidations.signal === "longs_liquidated" ? "border border-red-500/20" : "")}>
                    <p className="text-slate-400 text-xs">Sinyal</p>
                    <p className={clsx("font-bold",
                      result.market_context.liquidations.signal === "shorts_liquidated" ? "text-green-400" :
                      result.market_context.liquidations.signal === "longs_liquidated" ? "text-red-400" : "text-slate-400")}>
                      {result.market_context.liquidations.signal === "shorts_liquidated" ? "Short'lar tasfiye → ↑" :
                       result.market_context.liquidations.signal === "longs_liquidated" ? "Long'lar tasfiye → ↓" : "Dengeli"}
                    </p>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-2.5 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-red-500">Long Tasfiye</p>
                      <p className="text-white font-mono">{result.market_context.liquidations.long_liq_count} işlem</p>
                      <p className="text-red-400 font-mono">${((result.market_context.liquidations.long_liq_volume || 0) / 1000).toFixed(0)}K</p>
                    </div>
                    <div>
                      <p className="text-green-500">Short Tasfiye</p>
                      <p className="text-white font-mono">{result.market_context.liquidations.short_liq_count} işlem</p>
                      <p className="text-green-400 font-mono">${((result.market_context.liquidations.short_liq_volume || 0) / 1000).toFixed(0)}K</p>
                    </div>
                  </div>
                  {result.market_context.liquidations.top_price_levels?.length ? (
                    <div className="bg-slate-900 rounded-lg p-2.5">
                      <p className="text-slate-500 mb-1">Büyük Tasfiye Fiyatları</p>
                      {result.market_context.liquidations.top_price_levels.map((p, i) => (
                        <p key={i} className="text-yellow-400 font-mono">${p.toFixed(2)}</p>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-slate-500 text-center py-3">Analiz çalıştır</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className={clsx("font-mono font-medium", warn ? "text-yellow-400" : "text-white")}>{value}</p>
    </div>
  )
}

function RiskBadge({ level }: { level: string }) {
  return (
    <span className={clsx("px-1.5 py-0.5 rounded text-xs",
      level === "low" ? "bg-green-500/20 text-green-400" :
      level === "medium" ? "bg-yellow-500/20 text-yellow-400" :
      "bg-red-500/20 text-red-400")}>
      {level === "low" ? "Düşük Risk" : level === "medium" ? "Orta Risk" : "Yüksek Risk"}
    </span>
  )
}
