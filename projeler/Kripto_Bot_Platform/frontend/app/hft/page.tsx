"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { api, API_URL } from "@/lib/api"

const ProChart = dynamic(() => import("@/components/Chart/ProChart"), { ssr: false })

const fetcher = (path: string) => api.get(path)

// MEXC symbol (ETHUSDT) -> ProChart symbol (ETH/USDT:USDT)
function toChartSymbol(s: string): string {
  const base = s.replace("USDT", "")
  return `${base}/USDT:USDT`
}

type TradingMode = "sim" | "paper" | "live"

interface SimTrade {
  id: number
  side: "BUY" | "SELL"
  price: number
  gridLevel: number
  pnl: number
  time: string
  mode?: string
  exchange_status?: string
  grid_levels?: number[]
  level_count?: number
}

interface ExchangePosition {
  side: string
  contracts: number
  entry_price: number
  unrealized_pnl: number
  leverage: number
  margin: number
  liquidation_price: number
}

export default function HftPage() {
  const { data: hftSettingsData, mutate: mutateHftSettings } = useSWR("/simulations/hft-settings", fetcher, { refreshInterval: 5000 })
  const hftSettings = hftSettingsData || {}

  const [livePrice, setLivePrice] = useState<number>(0)
  const [simRunning, setSimRunning] = useState(false)
  const [tradingMode, setTradingMode] = useState<TradingMode>("sim")
  const [trades, setTrades] = useState<SimTrade[]>([])
  const [totalPnl, setTotalPnl] = useState(0)
  const [tradeCount, setTradeCount] = useState(0)
  const [gridBounds, setGridBounds] = useState<{ upper: number; lower: number } | null>(null)
  const lastGridHitRef = useRef<number>(-1)
  const tradeIdRef = useRef(0)

  // Backend status (paper/live modlar icin)
  const [backendStatus, setBackendStatus] = useState<any>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isKilling, setIsKilling] = useState(false)
  const [killConfirm, setKillConfirm] = useState(false)
  const [chartFullscreen, setChartFullscreen] = useState(false)

  // ESC ile tam ekrandan cik
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && chartFullscreen) setChartFullscreen(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [chartFullscreen])

  // Fullscreen gecisinde chart'i yeniden boyutlandir
  useEffect(() => {
    const timer = setTimeout(() => window.dispatchEvent(new Event("resize")), 50)
    return () => clearTimeout(timer)
  }, [chartFullscreen])

  const symbol = hftSettings.symbol || "ETHUSDT"
  const spreadPct = hftSettings.spread_pct || 0.5
  const gridCount = hftSettings.grid_count || 20
  const leverage = hftSettings.leverage || 10
  const orderSize = hftSettings.order_size || 100

  const isBackendMode = tradingMode === "paper" || tradingMode === "live"

  // Canli fiyat cek — 2sn
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const enc = encodeURIComponent(toChartSymbol(symbol))
        const res = await fetch(`${API_URL}/market/ticker?symbol=${enc}`).then(r => r.json())
        const p = parseFloat(res?.last)
        if (!cancelled && !isNaN(p) && p > 0) setLivePrice(p)
      } catch {}
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol])

  // Backend status polling (paper/live modda)
  useEffect(() => {
    if (!isBackendMode) {
      setBackendStatus(null)
      return
    }
    let cancelled = false
    const poll = async () => {
      try {
        const status = await api.get("/simulations/hft-status")
        if (!cancelled) {
          setBackendStatus(status)
          if (status.running) {
            setSimRunning(true)
            setTotalPnl(status.total_pnl || 0)
            setTradeCount(status.total_trades || 0)
            if (status.upper && status.lower) {
              setGridBounds({ upper: status.upper, lower: status.lower })
            }
            // Backend trades
            if (status.trades && status.trades.length > 0) {
              setTrades(status.trades.map((t: any, i: number) => ({
                id: t.id || i,
                side: t.side,
                price: t.price,
                gridLevel: t.grid_levels?.[0] ?? t.last_level ?? 0,
                pnl: t.pnl,
                time: t.time ? new Date(t.time).toLocaleTimeString("tr-TR") : "",
                mode: t.mode,
                exchange_status: t.exchange_status,
                grid_levels: t.grid_levels,
                level_count: t.level_count,
              })))
            }
          } else {
            setSimRunning(false)
          }
        }
      } catch {}
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [isBackendMode, tradingMode])

  // Grid sinirlarini SADECE ayar degistiginde veya kullanici "Baslat" dediginde guncelle
  const recalcGrid = () => {
    if (livePrice <= 0) return
    const upper = livePrice * (1 + spreadPct / 100)
    const lower = livePrice * (1 - spreadPct / 100)
    setGridBounds({ upper, lower })
    lastGridHitRef.current = -1
  }

  // Ilk fiyat geldiginde grid kur
  useEffect(() => {
    if (livePrice > 0 && !gridBounds) recalcGrid()
  }, [livePrice])

  // Grid cizgileri
  const gridLines = useMemo(() => {
    if (!gridBounds || gridBounds.upper <= gridBounds.lower) return []
    const lines: number[] = []
    const step = (gridBounds.upper - gridBounds.lower) / gridCount
    for (let i = 0; i <= gridCount; i++) {
      lines.push(gridBounds.lower + step * i)
    }
    return lines
  }, [gridBounds, gridCount])

  // Simulasyon motoru — SADECE "sim" modunda calisir (frontend-only)
  useEffect(() => {
    if (tradingMode !== "sim" || !simRunning || !gridBounds || livePrice <= 0 || gridLines.length < 2) return

    const step = (gridBounds.upper - gridBounds.lower) / gridCount
    const currentLevel = Math.floor((livePrice - gridBounds.lower) / step)
    const clampedLevel = Math.max(0, Math.min(gridCount - 1, currentLevel))

    if (lastGridHitRef.current !== -1 && clampedLevel !== lastGridHitRef.current) {
      const direction = clampedLevel > lastGridHitRef.current ? "BUY" : "SELL"
      const levelsDiff = Math.abs(clampedLevel - lastGridHitRef.current)
      const pnlPerLevel = (step / livePrice) * orderSize * leverage
      const pnl = direction === "SELL" ? pnlPerLevel * levelsDiff : -pnlPerLevel * levelsDiff * 0.1

      const trade: SimTrade = {
        id: ++tradeIdRef.current,
        side: direction === "BUY" ? "BUY" : "SELL",
        price: livePrice,
        gridLevel: clampedLevel,
        pnl: Number(pnl.toFixed(4)),
        time: new Date().toLocaleTimeString("tr-TR"),
        mode: "sim",
      }
      setTrades(prev => [trade, ...prev].slice(0, 100))
      setTotalPnl(prev => prev + pnl)
      setTradeCount(prev => prev + 1)

      if (livePrice >= gridBounds.upper) {
        const diff = livePrice - gridBounds.upper
        setGridBounds(prev => prev ? { upper: prev.upper + diff, lower: prev.lower + diff } : null)
      } else if (livePrice <= gridBounds.lower) {
        const diff = gridBounds.lower - livePrice
        setGridBounds(prev => prev ? { upper: prev.upper - diff, lower: prev.lower - diff } : null)
      }
    }
    lastGridHitRef.current = clampedLevel
  }, [livePrice, simRunning, gridBounds, tradingMode])

  const gridStep = gridBounds ? (gridBounds.upper - gridBounds.lower) / gridCount : 0
  const profitPerGrid = livePrice > 0 && gridStep > 0 ? (gridStep / livePrice) * 100 * leverage : 0

  const updateHftSetting = async (key: string, value: any) => {
    try {
      await api.post("/simulations/hft-settings", { [key]: value })
      mutateHftSettings()
    } catch {}
  }

  // ─── Baslat / Durdur ───────────────────────────────────────────────

  const handleStart = async () => {
    if (tradingMode === "sim") {
      recalcGrid()
      setTrades([])
      setTotalPnl(0)
      setTradeCount(0)
      setSimRunning(true)
      return
    }

    // Paper veya Live mod — backend'e gonder
    setIsStarting(true)
    try {
      const result = await api.post("/simulations/hft-start", {
        mode: tradingMode,
        symbol,
        leverage,
        order_size: orderSize,
        spread_pct: spreadPct,
        grid_count: gridCount,
      })

      if (result.error) {
        alert(`Hata: ${result.error}`)
      } else {
        setSimRunning(true)
        setTrades([])
        setTotalPnl(0)
        setTradeCount(0)
        if (result.step) {
          const upper = livePrice * (1 + spreadPct / 100)
          const lower = livePrice * (1 - spreadPct / 100)
          setGridBounds({ upper, lower })
        }
      }
    } catch (e: any) {
      alert(`Baslatma hatasi: ${e.message}`)
    }
    setIsStarting(false)
  }

  const handleStop = async () => {
    if (tradingMode === "sim") {
      setSimRunning(false)
      return
    }

    setIsStopping(true)
    try {
      await api.post("/simulations/hft-stop", { close_positions: false })
      setSimRunning(false)
    } catch (e: any) {
      alert(`Durdurma hatasi: ${e.message}`)
    }
    setIsStopping(false)
  }

  const handleKillSwitch = async () => {
    if (!killConfirm) {
      setKillConfirm(true)
      setTimeout(() => setKillConfirm(false), 5000) // 5sn icinde onaylanmazsa iptal
      return
    }

    setIsKilling(true)
    setKillConfirm(false)
    try {
      const result = await api.post("/simulations/hft-kill", {})
      setSimRunning(false)
      alert(
        `Kill Switch Aktif!\n` +
        `Emirler iptal: ${result.orders_cancelled ? 'Evet' : 'Hayir'}\n` +
        `Kapatilan pozisyonlar: ${result.positions_closed?.length || 0}\n` +
        `Toplam PnL: $${result.total_pnl?.toFixed(2) || '0'}`
      )
    } catch (e: any) {
      alert(`Kill switch hatasi: ${e.message}`)
    }
    setIsKilling(false)
  }

  const handleStopAndClose = async () => {
    setIsStopping(true)
    try {
      const result = await api.post("/simulations/hft-stop", { close_positions: true })
      setSimRunning(false)
      if (result.positions_closed?.length > 0) {
        alert(`Bot durduruldu ve ${result.positions_closed.length} pozisyon kapatildi.`)
      }
    } catch (e: any) {
      alert(`Hata: ${e.message}`)
    }
    setIsStopping(false)
  }

  const chartSymbol = toChartSymbol(symbol)

  // Mod isimleri ve renkleri
  const modeConfig = {
    sim: { label: "Simulasyon", color: "from-blue-600 to-blue-500", badge: "bg-blue-500/20 text-blue-400", desc: "Frontend uzerinde sanal" },
    paper: { label: "Paper", color: "from-amber-600 to-amber-500", badge: "bg-amber-500/20 text-amber-400", desc: "Backend sanal islem" },
    live: { label: "CANLI", color: "from-red-600 to-red-500", badge: "bg-red-500/20 text-red-400", desc: "Gercek borsa islemleri" },
  }

  const mc = modeConfig[tradingMode]

  return (
    <div className="p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto space-y-5">

      {/* Baslik */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="p-2 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-lg shadow-lg shadow-indigo-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            HFT Trailing Grid Motoru
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {symbol} · ±{spreadPct}% · {gridCount} kademe · {leverage}x kaldirac
            <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold ${mc.badge}`}>
              {mc.label}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Canli Fiyat */}
          <div className="text-right">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">{symbol}</div>
            <div className="text-2xl font-bold text-white font-mono">
              {livePrice > 0 ? `$${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "..."}
            </div>
          </div>
          {livePrice > 0 && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}

          {/* Mod Secici */}
          <div className="flex bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            {(["sim", "paper", "live"] as TradingMode[]).map(m => (
              <button
                key={m}
                onClick={() => { if (!simRunning) setTradingMode(m) }}
                disabled={simRunning}
                className={`px-3 py-1.5 text-xs font-bold transition-all ${
                  tradingMode === m
                    ? m === "live" ? "bg-red-600 text-white" : m === "paper" ? "bg-amber-600 text-white" : "bg-blue-600 text-white"
                    : "text-slate-500 hover:text-slate-300 disabled:opacity-30"
                }`}
              >
                {modeConfig[m].label}
              </button>
            ))}
          </div>

          {/* Baslat / Durdur */}
          {!simRunning ? (
            <button
              onClick={handleStart}
              disabled={livePrice <= 0 || isStarting}
              className={`px-6 py-2.5 bg-gradient-to-r ${mc.color} hover:brightness-110 disabled:opacity-50 text-white font-bold rounded-lg shadow-lg transition-all flex items-center gap-2`}
            >
              {isStarting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
              {tradingMode === "live" ? "CANLI BASLAT" : "Baslat"}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleStop}
                disabled={isStopping}
                className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-all flex items-center gap-2"
              >
                {isStopping ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>
                )}
                Durdur
              </button>
              {isBackendMode && tradingMode === "live" && (
                <button
                  onClick={handleStopAndClose}
                  disabled={isStopping}
                  className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg transition-all text-xs"
                >
                  Durdur + Kapat
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Mode Uyari + Kill Switch */}
      {tradingMode === "live" && (
        <div className="flex items-center justify-between bg-red-950/40 border border-red-500/30 rounded-xl px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <div>
              <span className="text-red-400 font-bold text-sm">CANLI ISLEM MODU</span>
              <span className="text-red-400/70 text-xs ml-3">Gercek MEXC emirleri gonderilecek — dikkatli olun!</span>
            </div>
          </div>
          <button
            onClick={handleKillSwitch}
            disabled={isKilling}
            className={`px-5 py-2.5 font-bold rounded-lg transition-all flex items-center gap-2 text-sm ${
              killConfirm
                ? "bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-lg shadow-red-600/50"
                : "bg-red-900/80 hover:bg-red-800 text-red-300 border border-red-500/50"
            }`}
          >
            {isKilling ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            )}
            {killConfirm ? "ONAYLA — TUM EMIRLERI IPTAL ET" : "KILL SWITCH"}
          </button>
        </div>
      )}

      {/* Ana Kart */}
      <div className="bg-gradient-to-br from-slate-900 to-black border border-indigo-500/30 rounded-xl p-5 relative overflow-hidden shadow-2xl">

        {/* Ayar Paneli */}
        <div className="flex flex-wrap items-end gap-4 bg-slate-800/80 p-4 rounded-xl border border-slate-700/60 relative z-10 mb-4 shadow-inner">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Coin</span>
            <select
              value={symbol}
              onChange={e => { updateHftSetting("symbol", e.target.value); setGridBounds(null) }}
              disabled={simRunning}
              className="bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
            >
              <option value="BTCUSDT">BTCUSDT</option>
              <option value="ETHUSDT">ETHUSDT</option>
              <option value="SOLUSDT">SOLUSDT</option>
              <option value="XRPUSDT">XRPUSDT</option>
              <option value="DOGEUSDT">DOGEUSDT</option>
              <option value="BNBUSDT">BNBUSDT</option>
              <option value="AVAXUSDT">AVAXUSDT</option>
            </select>
          </div>

          <div className="w-px h-8 bg-slate-700/50 hidden md:block" />

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Spread (±%)</span>
            <input type="number" value={spreadPct} onChange={e => updateHftSetting("spread_pct", Number(e.target.value))}
              min={0.05} step={0.05} max={20} disabled={simRunning}
              className="w-24 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kademe</span>
            <input type="number" value={gridCount} onChange={e => updateHftSetting("grid_count", Number(e.target.value))}
              min={2} max={200} disabled={simRunning}
              className="w-20 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kaldirac</span>
            <input type="number" value={leverage} onChange={e => updateHftSetting("leverage", Number(e.target.value))}
              min={1} max={500} disabled={simRunning}
              className="w-20 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Islem ($)</span>
            <input type="number" value={orderSize} onChange={e => updateHftSetting("order_size", Number(e.target.value))}
              min={1} step={5} disabled={simRunning}
              className="w-24 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
            />
          </div>

          <button onClick={recalcGrid} disabled={simRunning}
            className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md transition-all">
            Agi Yeniden Kur
          </button>

          {/* Alt/Ust Sinir */}
          <div className="ml-auto flex gap-3">
             <div className="flex flex-col items-end">
               <span className="text-[10px] text-green-400 font-semibold">Alt Ag</span>
               <span className="text-sm text-white bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-md font-mono">
                 {gridBounds ? `$${gridBounds.lower.toFixed(2)}` : "\u2014"}
               </span>
             </div>
             <div className="flex flex-col items-end">
               <span className="text-[10px] text-red-400 font-semibold">Ust Ag</span>
               <span className="text-sm text-white bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-md font-mono">
                 {gridBounds ? `$${gridBounds.upper.toFixed(2)}` : "\u2014"}
               </span>
             </div>
          </div>
        </div>

        {/* Performans & Simulasyon Durumu */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3 relative z-10 mb-4">
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Kademe Araligi</div>
            <div className="text-sm font-bold text-white font-mono">${gridStep.toFixed(4)}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Kademe Kari</div>
            <div className="text-sm font-bold text-emerald-400 font-mono">%{profitPerGrid.toFixed(3)}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Liq. Mesafesi</div>
            <div className="text-sm font-bold text-orange-400 font-mono">%{leverage > 0 ? (100 / leverage).toFixed(2) : "\u2014"}</div>
          </div>
          <div className={`rounded-lg p-3 border ${simRunning ? 'bg-emerald-900/30 border-emerald-500/40' : 'bg-slate-800/60 border-slate-700/40'}`}>
            <div className="text-[10px] text-slate-500 uppercase">Durum</div>
            <div className={`text-sm font-bold ${simRunning ? 'text-emerald-400' : 'text-slate-500'}`}>
              {simRunning ? `● ${mc.label}` : '○ Durdu'}
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Islem Sayisi</div>
            <div className="text-sm font-bold text-cyan-400 font-mono">{tradeCount}</div>
          </div>
          <div className={`rounded-lg p-3 border ${totalPnl >= 0 ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-red-900/20 border-red-500/30'}`}>
            <div className="text-[10px] text-slate-500 uppercase">Toplam P&L</div>
            <div className={`text-sm font-bold font-mono ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </div>
          </div>
          {/* Acik Seviyeler (backend modda) */}
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Acik Seviye</div>
            <div className="text-sm font-bold text-purple-400 font-mono">
              {backendStatus?.filled_count ?? 0} / {gridCount}
            </div>
          </div>
        </div>

        {/* Borsa Pozisyonlari (Live modda) */}
        {isBackendMode && backendStatus?.exchange_positions && backendStatus.exchange_positions.length > 0 && (
          <div className="mb-4 relative z-10">
            <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Borsa Pozisyonlari (MEXC)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {backendStatus.exchange_positions.map((pos: ExchangePosition, i: number) => (
                <div key={i} className={`rounded-lg p-3 border ${
                  pos.unrealized_pnl >= 0 ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-red-900/20 border-red-500/30'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      pos.side === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {pos.side?.toUpperCase()} {pos.leverage}x
                    </span>
                    <span className={`text-sm font-bold font-mono ${
                      pos.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {pos.unrealized_pnl >= 0 ? '+' : ''}${pos.unrealized_pnl.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <span className="text-slate-500">Kontrat</span>
                      <div className="text-white font-mono">{pos.contracts}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Giris</span>
                      <div className="text-white font-mono">${pos.entry_price.toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Liq.</span>
                      <div className="text-orange-400 font-mono">${pos.liquidation_price?.toFixed(2) || '\u2014'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grafik */}
        <div className={`${
          chartFullscreen
            ? 'fixed inset-0 z-[9999] bg-[#020817] flex flex-col'
            : 'h-[450px] w-full bg-[#020817] border border-slate-700/80 rounded-xl flex flex-col relative z-10 overflow-hidden shadow-inner'
        }`}>
          {/* Fullscreen baslik bari */}
          {chartFullscreen && (
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-700/50 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-white font-bold text-sm">{symbol}</span>
                <span className="text-slate-400 text-xs">±{spreadPct}% · {gridCount} kademe · {leverage}x</span>
                {livePrice > 0 && (
                  <span className="text-white font-mono text-sm">${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                )}
                {simRunning && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${mc.badge}`}>{mc.label}</span>
                )}
              </div>
              <button
                onClick={() => setChartFullscreen(false)}
                className="p-1.5 hover:bg-slate-700 rounded-lg transition-all text-slate-400 hover:text-white"
                title="Tam ekrandan cik (Esc)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          {/* Fullscreen buton (normal modda) */}
          {!chartFullscreen && (
            <button
              onClick={() => setChartFullscreen(true)}
              className="absolute top-2 right-2 z-20 p-1.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-600/50 rounded-lg transition-all text-slate-400 hover:text-white"
              title="Tam ekran"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            {livePrice > 0 ? (
              <ProChart
                symbol={chartSymbol}
                tp={gridBounds?.upper}
                sl={gridBounds?.lower}
                gridLines={gridLines}
                hideVolume
              />
            ) : (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                  <span className="text-slate-400 text-sm">Canli fiyat bekleniyor ({symbol})...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Islem Gecmisi */}
        {trades.length > 0 && (
          <div className="mt-4 relative z-10">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-300">Son Islemler</h3>
              <div className="flex items-center gap-3">
                {backendStatus?.win_rate !== undefined && (
                  <span className="text-[10px] text-slate-500">Basari: %{backendStatus.win_rate}</span>
                )}
                <span className="text-[10px] text-slate-600">{trades.length} islem gosteriliyor</span>
              </div>
            </div>
            <div className="max-h-[250px] overflow-y-auto rounded-lg border border-slate-700/50">
              <table className="w-full text-xs">
                <thead className="bg-slate-800/80 sticky top-0">
                  <tr className="text-slate-500">
                    <th className="px-3 py-2 text-left">Saat</th>
                    <th className="px-3 py-2 text-left">Yon</th>
                    <th className="px-3 py-2 text-right">Fiyat</th>
                    <th className="px-3 py-2 text-right">Kademe</th>
                    {isBackendMode && <th className="px-3 py-2 text-center">Durum</th>}
                    <th className="px-3 py-2 text-right">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => (
                    <tr key={t.id} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-1.5 text-slate-400 font-mono">{t.time}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {t.side}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-white font-mono text-right">${t.price.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-slate-400 text-right">
                        {t.grid_levels ? `#${t.grid_levels.join(',')}` : `#${t.gridLevel}`}
                        {t.level_count && t.level_count > 1 && (
                          <span className="text-slate-600 ml-1">({t.level_count}x)</span>
                        )}
                      </td>
                      {isBackendMode && (
                        <td className="px-3 py-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.exchange_status === 'filled' ? 'bg-emerald-500/20 text-emerald-400' :
                            t.exchange_status === 'error' ? 'bg-red-500/20 text-red-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {t.exchange_status === 'filled' ? 'FILLED' :
                             t.exchange_status === 'error' ? 'HATA' :
                             t.exchange_status === 'paper' ? 'PAPER' : t.mode?.toUpperCase()}
                          </span>
                        </td>
                      )}
                      <td className={`px-3 py-1.5 font-mono text-right font-semibold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
