"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
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

export default function HftPage() {
  const { data: hftSettingsData, mutate: mutateHftSettings } = useSWR("/simulations/hft-settings", fetcher, { refreshInterval: 5000 })
  const hftSettings = hftSettingsData || {}

  // Canlı fiyat polling
  const [livePrice, setLivePrice] = useState<number>(0)
  const [simRunning, setSimRunning] = useState(false)
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const symbol = hftSettings.symbol || "ETHUSDT"
  const spreadPct = hftSettings.spread_pct || 0.5
  const gridCount = hftSettings.grid_count || 20
  const leverage = hftSettings.leverage || 10
  const orderSize = hftSettings.order_size || 100

  // Canlı fiyat çek — 2 saniyede bir
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const chartSym = toChartSymbol(symbol)
        const enc = encodeURIComponent(chartSym)
        const res = await fetch(`${API_URL}/market/ticker?symbol=${enc}`).then(r => r.json())
        const p = parseFloat(res?.last)
        if (!cancelled && !isNaN(p) && p > 0) setLivePrice(p)
      } catch {}
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol])

  // Grid hesapla: fiyat ± spread%
  const upperPrice = livePrice > 0 ? livePrice * (1 + spreadPct / 100) : 0
  const lowerPrice = livePrice > 0 ? livePrice * (1 - spreadPct / 100) : 0

  // Grid çizgileri
  const gridLines = useMemo(() => {
    if (upperPrice <= 0 || lowerPrice <= 0 || upperPrice <= lowerPrice) return []
    const lines: number[] = []
    const step = (upperPrice - lowerPrice) / gridCount
    for (let i = 0; i <= gridCount; i++) {
      lines.push(lowerPrice + step * i)
    }
    return lines
  }, [upperPrice, lowerPrice, gridCount])

  // Kademe başına kâr
  const gridStep = gridCount > 0 && upperPrice > lowerPrice ? (upperPrice - lowerPrice) / gridCount : 0
  const profitPerGrid = livePrice > 0 && gridStep > 0 ? (gridStep / livePrice) * 100 * leverage : 0
  const totalGridProfit = profitPerGrid * gridCount

  const updateHftSetting = async (key: string, value: any) => {
    try {
      await api.post("/simulations/hft-settings", { [key]: value })
      mutateHftSettings()
    } catch {}
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
            HFT Dinamik Ağ (Trailing Grid) Motoru
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Fiyat ±{spreadPct}% aralığında {gridCount} kademeli ağ ile scalping simülasyonu.
          </p>
        </div>
        {/* Canlı Fiyat */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] text-slate-500 uppercase">Canlı Fiyat ({symbol})</div>
            <div className="text-2xl font-bold text-white font-mono">
              {livePrice > 0 ? `$${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Yükleniyor..."}
            </div>
          </div>
          {livePrice > 0 && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>}
        </div>
      </div>

      {/* Ana Kart */}
      <div className="bg-gradient-to-br from-slate-900 to-black border border-indigo-500/30 rounded-xl p-5 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <svg className="w-64 h-64 text-indigo-400" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z"/></svg>
        </div>
        
        {/* Ayar Paneli */}
        <div className="flex flex-wrap items-end gap-4 bg-slate-800/80 p-4 rounded-xl border border-slate-700/60 relative z-10 mb-4 shadow-inner">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Hedef Coin</span>
            <select 
              value={symbol} 
              onChange={e => updateHftSetting("symbol", e.target.value)}
              className="bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
            >
              <option value="BTCUSDT">BTCUSDT</option>
              <option value="ETHUSDT">ETHUSDT</option>
              <option value="SOLUSDT">SOLUSDT</option>
              <option value="XRPUSDT">XRPUSDT</option>
              <option value="DOGEUSDT">DOGEUSDT</option>
              <option value="BNBUSDT">BNBUSDT</option>
              <option value="ADAUSDT">ADAUSDT</option>
              <option value="AVAXUSDT">AVAXUSDT</option>
            </select>
          </div>
          
          <div className="w-px h-8 bg-slate-700/50 hidden md:block" />

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Spread (±%)</span>
            <div className="relative">
              <input 
                type="number" 
                value={spreadPct} 
                onChange={e => updateHftSetting("spread_pct", Number(e.target.value))}
                min={0.05} step={0.05} max={20}
                className="w-24 bg-[#020817] border border-slate-700 rounded-md pl-3 pr-7 py-1.5 text-sm text-white font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none" 
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kademe</span>
            <input 
              type="number" 
              value={gridCount}
              onChange={e => updateHftSetting("grid_count", Number(e.target.value))}
              min={2} max={200}
              className="w-20 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none" 
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kaldıraç</span>
            <div className="relative">
              <input 
                type="number" 
                value={leverage}
                onChange={e => updateHftSetting("leverage", Number(e.target.value))}
                min={1} max={500}
                className="w-20 bg-[#020817] border border-slate-700 rounded-md pl-3 pr-7 py-1.5 text-sm text-white font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none" 
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">x</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">İşlem Miktarı</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
              <input 
                type="number" 
                value={orderSize}
                onChange={e => updateHftSetting("order_size", Number(e.target.value))}
                min={1} step={5}
                className="w-24 bg-[#020817] border border-slate-700 rounded-md pl-7 pr-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none" 
              />
            </div>
          </div>

          {/* Canlı Sınırlar */}
          <div className="ml-auto flex gap-3 mt-2 md:mt-0">
             <div className="flex flex-col items-end">
               <span className="text-[10px] text-green-400 font-semibold mb-0.5">Alt Ağ (Destek)</span>
               <span className="text-sm text-white bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-md font-mono">
                 {lowerPrice > 0 ? `$${lowerPrice.toFixed(2)}` : "—"}
               </span>
             </div>
             <div className="flex flex-col items-end">
               <span className="text-[10px] text-red-400 font-semibold mb-0.5">Üst Ağ (Direnç)</span>
               <span className="text-sm text-white bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-md font-mono">
                 {upperPrice > 0 ? `$${upperPrice.toFixed(2)}` : "—"}
               </span>
             </div>
          </div>
        </div>

        {/* Performans Kartları */}
        {livePrice > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 relative z-10 mb-4">
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
              <div className="text-[10px] text-slate-500 uppercase">Kademe Aralığı</div>
              <div className="text-sm font-bold text-white font-mono">${gridStep.toFixed(4)}</div>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
              <div className="text-[10px] text-slate-500 uppercase">Kademe Kârı ({leverage}x)</div>
              <div className="text-sm font-bold text-emerald-400 font-mono">%{profitPerGrid.toFixed(3)}</div>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
              <div className="text-[10px] text-slate-500 uppercase">Toplam Ağ Kârı</div>
              <div className="text-sm font-bold text-cyan-400 font-mono">%{totalGridProfit.toFixed(2)}</div>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
              <div className="text-[10px] text-slate-500 uppercase">Marjin ({leverage}x)</div>
              <div className="text-sm font-bold text-yellow-400 font-mono">${(orderSize / leverage).toFixed(2)}</div>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
              <div className="text-[10px] text-slate-500 uppercase">Liq. Mesafesi</div>
              <div className="text-sm font-bold text-orange-400 font-mono">%{leverage > 0 ? (100 / leverage).toFixed(2) : "—"}</div>
            </div>
          </div>
        )}
        
        {/* Grafik */}
        <div className="h-[550px] w-full bg-[#020817] border border-slate-700/80 rounded-xl flex flex-col relative z-10 overflow-hidden shadow-inner">
          {livePrice > 0 ? (
            <ProChart 
              symbol={chartSymbol} 
              tp={upperPrice > 0 ? upperPrice : undefined} 
              sl={lowerPrice > 0 ? lowerPrice : undefined}
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
      </div>
    </div>
  )
}
