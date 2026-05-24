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

interface SimTrade {
  id: number
  side: "BUY" | "SELL"
  price: number
  gridLevel: number
  pnl: number
  time: string
}

export default function HftPage() {
  const { data: hftSettingsData, mutate: mutateHftSettings } = useSWR("/simulations/hft-settings", fetcher, { refreshInterval: 5000 })
  const hftSettings = hftSettingsData || {}

  const [livePrice, setLivePrice] = useState<number>(0)
  const [simRunning, setSimRunning] = useState(false)
  const [trades, setTrades] = useState<SimTrade[]>([])
  const [totalPnl, setTotalPnl] = useState(0)
  const [tradeCount, setTradeCount] = useState(0)
  const [gridBounds, setGridBounds] = useState<{ upper: number; lower: number } | null>(null)
  const lastGridHitRef = useRef<number>(-1)
  const tradeIdRef = useRef(0)

  const symbol = hftSettings.symbol || "ETHUSDT"
  const spreadPct = hftSettings.spread_pct || 0.5
  const gridCount = hftSettings.grid_count || 20
  const leverage = hftSettings.leverage || 10
  const orderSize = hftSettings.order_size || 100

  // Canlı fiyat çek — 2sn
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

  // Grid sınırlarını SADECE ayar değiştiğinde veya kullanıcı "Başlat" dediğinde güncelle
  const recalcGrid = () => {
    if (livePrice <= 0) return
    const upper = livePrice * (1 + spreadPct / 100)
    const lower = livePrice * (1 - spreadPct / 100)
    setGridBounds({ upper, lower })
    lastGridHitRef.current = -1
  }

  // İlk fiyat geldiğinde grid kur
  useEffect(() => {
    if (livePrice > 0 && !gridBounds) recalcGrid()
  }, [livePrice])

  // Grid çizgileri — SADECE gridBounds ve gridCount değiştiğinde hesapla
  const gridLines = useMemo(() => {
    if (!gridBounds || gridBounds.upper <= gridBounds.lower) return []
    const lines: number[] = []
    const step = (gridBounds.upper - gridBounds.lower) / gridCount
    for (let i = 0; i <= gridCount; i++) {
      lines.push(gridBounds.lower + step * i)
    }
    return lines
  }, [gridBounds, gridCount])

  // Simülasyon motoru — canlı fiyat değişince grid kademeleri kontrol et
  useEffect(() => {
    if (!simRunning || !gridBounds || livePrice <= 0 || gridLines.length < 2) return

    // Fiyatın hangi kademe aralığına düştüğünü bul
    const step = (gridBounds.upper - gridBounds.lower) / gridCount
    const currentLevel = Math.floor((livePrice - gridBounds.lower) / step)
    const clampedLevel = Math.max(0, Math.min(gridCount - 1, currentLevel))

    // Yeni bir kademeye geçiş oldu mu?
    if (lastGridHitRef.current !== -1 && clampedLevel !== lastGridHitRef.current) {
      const direction = clampedLevel > lastGridHitRef.current ? "BUY" : "SELL"
      const levelsDiff = Math.abs(clampedLevel - lastGridHitRef.current)
      const pnlPerLevel = (step / livePrice) * orderSize * leverage
      const pnl = direction === "SELL" ? pnlPerLevel * levelsDiff : -pnlPerLevel * levelsDiff * 0.1 // Kısa pozisyon zarar
      
      const trade: SimTrade = {
        id: ++tradeIdRef.current,
        side: direction === "BUY" ? "BUY" : "SELL",
        price: livePrice,
        gridLevel: clampedLevel,
        pnl: Number(pnl.toFixed(4)),
        time: new Date().toLocaleTimeString("tr-TR"),
      }
      setTrades(prev => [trade, ...prev].slice(0, 100)) // Son 100 işlem
      setTotalPnl(prev => prev + pnl)
      setTradeCount(prev => prev + 1)

      // Trailing: fiyat grid dışına çıktıysa ağı kaydır
      if (livePrice >= gridBounds.upper) {
        const diff = livePrice - gridBounds.upper
        setGridBounds(prev => prev ? { upper: prev.upper + diff, lower: prev.lower + diff } : null)
      } else if (livePrice <= gridBounds.lower) {
        const diff = gridBounds.lower - livePrice
        setGridBounds(prev => prev ? { upper: prev.upper - diff, lower: prev.lower - diff } : null)
      }
    }
    lastGridHitRef.current = clampedLevel
  }, [livePrice, simRunning, gridBounds])

  const gridStep = gridBounds ? (gridBounds.upper - gridBounds.lower) / gridCount : 0
  const profitPerGrid = livePrice > 0 && gridStep > 0 ? (gridStep / livePrice) * 100 * leverage : 0

  const updateHftSetting = async (key: string, value: any) => {
    try {
      await api.post("/simulations/hft-settings", { [key]: value })
      mutateHftSettings()
    } catch {}
  }

  const handleStart = () => {
    recalcGrid()
    setTrades([])
    setTotalPnl(0)
    setTradeCount(0)
    setSimRunning(true)
  }

  const handleStop = () => {
    setSimRunning(false)
  }

  const chartSymbol = toChartSymbol(symbol)

  return (
    <div className="p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto space-y-5">
      
      {/* Başlık */}
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
            {symbol} · ±{spreadPct}% · {gridCount} kademe · {leverage}x kaldıraç
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Canlı Fiyat */}
          <div className="text-right">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">{symbol}</div>
            <div className="text-2xl font-bold text-white font-mono">
              {livePrice > 0 ? `$${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "..."}
            </div>
          </div>
          {livePrice > 0 && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
          {/* Simülasyon Butonu */}
          {!simRunning ? (
            <button 
              onClick={handleStart}
              disabled={livePrice <= 0}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 text-white font-bold rounded-lg shadow-lg shadow-emerald-900/50 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              Simülasyonu Başlat
            </button>
          ) : (
            <button 
              onClick={handleStop}
              className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold rounded-lg shadow-lg shadow-red-900/50 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>
              Simülasyonu Durdur
            </button>
          )}
        </div>
      </div>

      {/* Ana Kart */}
      <div className="bg-gradient-to-br from-slate-900 to-black border border-indigo-500/30 rounded-xl p-5 relative overflow-hidden shadow-2xl">
        
        {/* Ayar Paneli */}
        <div className="flex flex-wrap items-end gap-4 bg-slate-800/80 p-4 rounded-xl border border-slate-700/60 relative z-10 mb-4 shadow-inner">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Coin</span>
            <select 
              value={symbol} 
              onChange={e => { updateHftSetting("symbol", e.target.value); setGridBounds(null) }}
              className="bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none"
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
              min={0.05} step={0.05} max={20}
              className="w-24 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none" 
            />
          </div>
          
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kademe</span>
            <input type="number" value={gridCount} onChange={e => updateHftSetting("grid_count", Number(e.target.value))}
              min={2} max={200}
              className="w-20 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none" 
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kaldıraç</span>
            <input type="number" value={leverage} onChange={e => updateHftSetting("leverage", Number(e.target.value))}
              min={1} max={500}
              className="w-20 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none" 
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">İşlem ($)</span>
            <input type="number" value={orderSize} onChange={e => updateHftSetting("order_size", Number(e.target.value))}
              min={1} step={5}
              className="w-24 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none" 
            />
          </div>

          <button onClick={recalcGrid} className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-all">
            Ağı Yeniden Kur
          </button>

          {/* Alt/Üst Sınır */}
          <div className="ml-auto flex gap-3">
             <div className="flex flex-col items-end">
               <span className="text-[10px] text-green-400 font-semibold">Alt Ağ</span>
               <span className="text-sm text-white bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-md font-mono">
                 {gridBounds ? `$${gridBounds.lower.toFixed(2)}` : "—"}
               </span>
             </div>
             <div className="flex flex-col items-end">
               <span className="text-[10px] text-red-400 font-semibold">Üst Ağ</span>
               <span className="text-sm text-white bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-md font-mono">
                 {gridBounds ? `$${gridBounds.upper.toFixed(2)}` : "—"}
               </span>
             </div>
          </div>
        </div>

        {/* Performans & Simülasyon Durumu */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 relative z-10 mb-4">
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Kademe Aralığı</div>
            <div className="text-sm font-bold text-white font-mono">${gridStep.toFixed(4)}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Kademe Kârı</div>
            <div className="text-sm font-bold text-emerald-400 font-mono">%{profitPerGrid.toFixed(3)}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Liq. Mesafesi</div>
            <div className="text-sm font-bold text-orange-400 font-mono">%{leverage > 0 ? (100 / leverage).toFixed(2) : "—"}</div>
          </div>
          <div className={`rounded-lg p-3 border ${simRunning ? 'bg-emerald-900/30 border-emerald-500/40' : 'bg-slate-800/60 border-slate-700/40'}`}>
            <div className="text-[10px] text-slate-500 uppercase">Durum</div>
            <div className={`text-sm font-bold ${simRunning ? 'text-emerald-400' : 'text-slate-500'}`}>
              {simRunning ? '● Çalışıyor' : '○ Durdu'}
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">İşlem Sayısı</div>
            <div className="text-sm font-bold text-cyan-400 font-mono">{tradeCount}</div>
          </div>
          <div className={`rounded-lg p-3 border ${totalPnl >= 0 ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-red-900/20 border-red-500/30'}`}>
            <div className="text-[10px] text-slate-500 uppercase">Toplam P&L</div>
            <div className={`text-sm font-bold font-mono ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </div>
          </div>
        </div>
        
        {/* Grafik */}
        <div className="h-[450px] w-full bg-[#020817] border border-slate-700/80 rounded-xl flex flex-col relative z-10 overflow-hidden shadow-inner">
          {livePrice > 0 ? (
            <ProChart 
              symbol={chartSymbol} 
              tp={gridBounds?.upper} 
              sl={gridBounds?.lower}
              gridLines={gridLines}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <span className="text-slate-400 text-sm">Canlı fiyat bekleniyor ({symbol})...</span>
              </div>
            </div>
          )}
        </div>

        {/* İşlem Geçmişi */}
        {trades.length > 0 && (
          <div className="mt-4 relative z-10">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-300">Son İşlemler</h3>
              <span className="text-[10px] text-slate-600">{trades.length} işlem gösteriliyor</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto rounded-lg border border-slate-700/50">
              <table className="w-full text-xs">
                <thead className="bg-slate-800/80 sticky top-0">
                  <tr className="text-slate-500">
                    <th className="px-3 py-2 text-left">Saat</th>
                    <th className="px-3 py-2 text-left">Yön</th>
                    <th className="px-3 py-2 text-right">Fiyat</th>
                    <th className="px-3 py-2 text-right">Kademe</th>
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
                      <td className="px-3 py-1.5 text-slate-400 text-right">#{t.gridLevel}</td>
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
