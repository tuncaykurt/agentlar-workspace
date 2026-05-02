"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import BalancePanel   from "@/components/Sidebar/BalancePanel"
import MarketStats    from "@/components/Sidebar/MarketStats"
import PositionsPanel from "@/components/Sidebar/PositionsPanel"
import ActiveBots     from "@/components/Sidebar/ActiveBots"
import SignalOverlay  from "@/components/TradingPanel/SignalOverlay"
import AIAnalysis     from "@/components/Sidebar/AIAnalysis"
import SymbolSearch, { SymbolInfo } from "@/components/TradingPanel/SymbolSearch"

const ProChart = dynamic(
  () => import("@/components/Chart/ProChart"),
  { ssr: false }
)
const TradingViewWidget = dynamic(
  () => import("@/components/TradingPanel/TradingViewWidget"),
  { ssr: false, loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#020817]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-slate-500 text-xs">Grafik yükleniyor...</span>
      </div>
    </div>
  )}
)

const TV_INTERVALS = [
  { label: "1d",  value: "1"   },
  { label: "5d",  value: "5"   },
  { label: "15d", value: "15"  },
  { label: "1s",  value: "60"  },
  { label: "4s",  value: "240" },
  { label: "1g",  value: "D"   },
]

type ChartMode = "tv" | "pro"

export default function DashboardPage() {
  const [symbol,    setSymbol]    = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("prochart_symbol") ?? "BTC/USDT:USDT") : "BTC/USDT:USDT"
  )
  const [interval,  setInterval]  = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("prochart_tv_interval") ?? "60") : "60"
  )
  const [aiLevels,  setAiLevels]  = useState<{ tp?: number; sl?: number }>({})
  const [mode,      setMode]      = useState<ChartMode>(() =>
    typeof window !== "undefined" ? ((localStorage.getItem("prochart_mode") as ChartMode) ?? "tv") : "tv"
  )
  const [tvFull,    setTvFull]    = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => { localStorage.setItem("prochart_symbol", symbol) }, [symbol])
  useEffect(() => { localStorage.setItem("prochart_tv_interval", interval) }, [interval])
  useEffect(() => { localStorage.setItem("prochart_mode", mode) }, [mode])

  const handleSymbol = (info: SymbolInfo) => {
    setSymbol(info.internal)
    setAiLevels({})
  }

  // ESC ile tam ekrandan çık
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") setTvFull(false) }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [])

  const symbolDisplay = symbol.replace("/USDT:USDT", "").replace("/USDT", "") + "/USDT"

  return (
    <div className="flex flex-col md:flex-row h-full md:h-[calc(100vh-45px)] bg-[#020817] overflow-hidden md:overflow-hidden overflow-y-auto">

      {/* ── TradingView Tam Ekran Modu ── */}
      {tvFull && (
        <div className="fixed inset-0 z-50 bg-[#020817] flex flex-col">
          {/* Tam ekran üst bar */}
          <div className="flex items-center gap-3 px-4 py-2 bg-[#0d1117] border-b border-slate-800 shrink-0">
            <span className="text-white font-semibold text-sm">{symbolDisplay}</span>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center gap-0.5">
              {TV_INTERVALS.map(i => (
                <button key={i.value} onClick={() => setInterval(i.value)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    interval === i.value ? "bg-slate-600 text-white" : "text-slate-500 hover:text-white hover:bg-slate-700"
                  }`}>
                  {i.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-600">ESC veya butona bas</span>
              <button onClick={() => setTvFull(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Tam Ekrandan Çık
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <TradingViewWidget symbol={symbol} interval={interval} />
          </div>
        </div>
      )}

      {/* ── Ana Layout ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* ── Üst Araç Çubuğu ── */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-[#0d1117] shrink-0">

          {/* Sembol arama */}
          <SymbolSearch value={symbol} onChange={handleSymbol} />

          <div className="w-px h-5 bg-slate-800" />

          {/* Zaman dilimi — sadece TV modunda, masaüstünde göster */}
          {mode === "tv" && (
            <div className="hidden md:flex items-center gap-0.5">
              {TV_INTERVALS.map(i => (
                <button key={i.value} onClick={() => setInterval(i.value)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    interval === i.value
                      ? "bg-slate-700 text-white"
                      : "text-slate-500 hover:text-white hover:bg-slate-800"
                  }`}>
                  {i.label}
                </button>
              ))}
            </div>
          )}

          {/* Chart mod geçişi */}
          <div className="flex items-center gap-0.5 bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setMode("tv")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                mode === "tv"
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <rect x="2" y="3" width="20" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span className="hidden sm:inline">TradingView</span>
            </button>
            <button
              onClick={() => setMode("pro")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                mode === "pro"
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
              </svg>
              <span className="hidden sm:inline">Pro Chart</span>
            </button>
          </div>

          {/* Tam ekran — sadece masaüstünde */}
          {mode === "tv" && (
            <button
              onClick={() => setTvFull(true)}
              title="Tam ekran"
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-800 text-slate-500 hover:text-white hover:border-slate-600 text-xs transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
              </svg>
              Tam Ekran
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-700 hidden md:inline">Bitget Perpetual · USDT-M</span>
            {/* Sidebar collapse — sadece masaüstünde */}
            <button
              onClick={() => setSidebarCollapsed(v => !v)}
              className="hidden md:flex p-1.5 rounded border border-slate-800 text-slate-600 hover:text-slate-300 hover:border-slate-600 transition-colors"
              title={sidebarCollapsed ? "Paneli aç" : "Paneli kapat"}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={sidebarCollapsed ? "M11 19l-7-7 7-7m8 14l-7-7 7-7" : "M13 5l7 7-7 7M5 5l7 7-7 7"}/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Grafik Alanı ── */}
        <div className="flex-1 min-h-0 min-h-[300px]">
          {mode === "tv" ? (
            <TradingViewWidget symbol={symbol} interval={interval} />
          ) : (
            <ProChart
              symbol={symbol}
              tp={aiLevels.tp}
              sl={aiLevels.sl}
            />
          )}
        </div>
      </div>

      {/* ── Sağ Sidebar ── */}
      <div className={`border-t md:border-t-0 md:border-l border-slate-800 bg-[#0a0f1a] flex flex-col overflow-y-auto shrink-0 transition-all duration-300 ${
        sidebarCollapsed ? "hidden md:flex w-0 opacity-0 overflow-hidden border-0" : "w-full md:w-72"
      }`}>
        <div className="p-3 space-y-0 min-w-[18rem]">

          {/* Market Stats */}
          <div className="py-3">
            <MarketStats symbol={symbol} />
          </div>

          <div className="border-t border-slate-800/60" />

          {/* Balance */}
          <div className="py-3">
            <BalancePanel />
          </div>

          <div className="border-t border-slate-800/60" />

          {/* Positions */}
          <div className="py-3">
            <PositionsPanel />
          </div>

          <div className="border-t border-slate-800/60" />

          {/* Active Bots */}
          <div className="py-3">
            <ActiveBots />
          </div>

          <div className="border-t border-slate-800/60" />

          {/* AI Analysis */}
          <div className="py-3">
            <AIAnalysis
              symbol={symbol}
              onAnalysis={(tp, sl) => setAiLevels({ tp, sl })}
            />
          </div>

          <div className="border-t border-slate-800/60" />

          {/* Signal Overlay */}
          <div className="py-3">
            <SignalOverlay />
          </div>

          {/* TP/SL göstergesi */}
          {(aiLevels.tp || aiLevels.sl) && (
            <>
              <div className="border-t border-slate-800/60" />
              <div className="py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500 font-medium">AI Seviyeleri</span>
                  <button onClick={() => setAiLevels({})}
                    className="text-slate-600 hover:text-slate-400 text-xs transition-colors">
                    Temizle ×
                  </button>
                </div>
                <div className="flex gap-2">
                  {aiLevels.tp && (
                    <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                      <div className="text-[10px] text-green-400/70 mb-0.5">HEDEF</div>
                      <div className="text-green-400 font-mono text-sm font-semibold">${aiLevels.tp.toFixed(1)}</div>
                    </div>
                  )}
                  {aiLevels.sl && (
                    <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                      <div className="text-[10px] text-red-400/70 mb-0.5">STOP</div>
                      <div className="text-red-400 font-mono text-sm font-semibold">${aiLevels.sl.toFixed(1)}</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
