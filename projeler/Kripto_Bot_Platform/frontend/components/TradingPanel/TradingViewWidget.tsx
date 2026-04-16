"use client"

import { useEffect, useRef, memo } from "react"
import { findSymbol } from "./SymbolSearch"

interface Props {
  symbol: string
  interval?: string
}

function TradingViewWidget({ symbol, interval = "1" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const info  = findSymbol(symbol)
  const tvSym = info?.tv ?? `BITGET:${symbol.split("/")[0]}USDT.P`
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${tvSym}&interval=${interval}&theme=dark&style=1&locale=tr&timezone=Europe%2FIstanbul`

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = ""

    const script = document.createElement("script")
    script.src   = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
    script.type  = "text/javascript"
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol:   tvSym,
      interval,
      timezone: "Europe/Istanbul",
      theme:    "dark",
      style:    "1",
      locale:   "tr",
      backgroundColor: "#0f172a",
      gridColor:       "#1e293b",
      hide_top_toolbar:    false,
      hide_legend:         false,
      allow_symbol_change: true,
      save_image:          true,
      studies: ["STD;EMA", "STD;MACD", "STD;RSI", "STD;Volume"],
      support_host: "https://www.tradingview.com",
    })

    const widgetDiv = document.createElement("div")
    widgetDiv.className    = "tradingview-widget-container__widget"
    widgetDiv.style.height = "100%"
    widgetDiv.style.width  = "100%"

    containerRef.current.appendChild(widgetDiv)
    containerRef.current.appendChild(script)

    return () => { if (containerRef.current) containerRef.current.innerHTML = "" }
  }, [symbol, interval])

  return (
    <div className="relative w-full h-full">
      {/* Embed widget */}
      <div className="tradingview-widget-container w-full h-full" ref={containerRef} />

      {/* TradingView'de Aç butonu — giriş yapıp özel indikatör kullanmak için */}
      <a
        href={tvUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#131722]/90 border border-slate-700 text-slate-300 hover:text-white hover:border-blue-500/60 text-xs font-medium transition-all backdrop-blur-sm shadow-lg"
        title="Kendi TradingView hesabınla aç — özel indikatörler ve alert webhook'ları için"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        TradingView'de Aç
      </a>
    </div>
  )
}

export default memo(TradingViewWidget)
