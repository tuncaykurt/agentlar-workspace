"use client"

import React, { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { api } from "@/lib/api"

const ProChart = dynamic(() => import("@/components/Chart/ProChart"), { ssr: false })

const fetcher = (path: string) => api.get(path)

export default function HftPage() {
  const { data: hftSettingsData, mutate: mutateHftSettings } = useSWR("/simulations/hft-settings", fetcher)
  const hftSettings = hftSettingsData || {}

  const [demoUpper, setDemoUpper] = useState<number | null>(null)
  const [demoLower, setDemoLower] = useState<number | null>(null)

  useEffect(() => {
    const handleTick = (e: any) => {
      setDemoUpper(e.detail.upperGrid)
      setDemoLower(e.detail.lowerGrid)
    }
    window.addEventListener('hft-tick', handleTick)
    return () => window.removeEventListener('hft-tick', handleTick)
  }, [])

  const updateHftSetting = async (key: string, value: any) => {
    try {
      await api.post("/simulations/hft-settings", { [key]: value })
      mutateHftSettings()
    } catch {}
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
      
      {/* Başlık Alanı */}
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
            Yüksek frekanslı (HFT) mikrosaniyelik işlemleri izole bir ortamda canlandırın. Fiyat takipli (Trailing) ağları canlı test edin.
          </p>
        </div>
        <button 
          onClick={() => {
            if ((window as any).hftDemoActive) {
              clearInterval((window as any).hftDemoTimer);
              (window as any).hftDemoActive = false;
            } else {
              (window as any).hftDemoActive = true;
              let currentPrice = 65000;
              let upperGrid = 65500;
              let lowerGrid = 64500;
              
              (window as any).hftDemoTimer = setInterval(() => {
                const move = (Math.random() - 0.45) * 80;
                currentPrice += move;
                if (currentPrice >= upperGrid) {
                  const diff = currentPrice - upperGrid;
                  upperGrid = currentPrice;
                  lowerGrid = lowerGrid + diff;
                } else if (currentPrice <= lowerGrid) {
                  const diff = lowerGrid - currentPrice;
                  lowerGrid = currentPrice;
                  upperGrid = upperGrid - diff;
                }
                const event = new CustomEvent('hft-tick', { detail: { currentPrice, upperGrid, lowerGrid } });
                window.dispatchEvent(event);
              }, 500);
            }
          }}
          className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold rounded-lg shadow-lg shadow-indigo-900/50 transition-all flex items-center gap-2"
        >
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
          HFT Demoyu Başlat
        </button>
      </div>

      <div className="bg-gradient-to-br from-slate-900 to-black border border-indigo-500/40 rounded-xl p-5 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <svg className="w-64 h-64 text-indigo-400" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z"/></svg>
        </div>
        
        {/* HFT Ayar Paneli */}
        <div className="flex flex-wrap items-center gap-4 bg-slate-800/80 p-4 rounded-xl border border-slate-700/60 relative z-10 mb-4 shadow-inner">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Hedef Coin</span>
            <select 
              value={hftSettings.symbol || "BTCUSDT"} 
              onChange={e => updateHftSetting("symbol", e.target.value)}
              className="bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
            >
              <option value="BTCUSDT">BTCUSDT</option>
              <option value="ETHUSDT">ETHUSDT</option>
              <option value="SOLUSDT">SOLUSDT</option>
              <option value="XRPUSDT">XRPUSDT</option>
              <option value="DOGEUSDT">DOGEUSDT</option>
            </select>
          </div>
          
          <div className="w-px h-8 bg-slate-700/50 hidden md:block" />

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Ağ Genişliği (Spread)</span>
            <div className="relative">
              <input 
                type="number" 
                value={hftSettings.spread_pct || 5} 
                onChange={e => updateHftSetting("spread_pct", Number(e.target.value))}
                min={0.1} step={0.1}
                className="w-24 bg-[#020817] border border-slate-700 rounded-md pl-3 pr-7 py-1.5 text-sm text-white font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none" 
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kademe Sayısı</span>
            <input 
              type="number" 
              value={hftSettings.grid_count || 20}
              onChange={e => updateHftSetting("grid_count", Number(e.target.value))}
              min={2} max={100}
              className="w-20 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none" 
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kaldıraç</span>
            <div className="relative">
              <input 
                type="number" 
                value={hftSettings.leverage || 10}
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
                value={hftSettings.order_size || 100}
                onChange={e => updateHftSetting("order_size", Number(e.target.value))}
                min={10} step={10}
                className="w-24 bg-[#020817] border border-slate-700 rounded-md pl-7 pr-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all outline-none" 
              />
            </div>
          </div>

          <div className="ml-auto flex gap-3 mt-2 md:mt-0">
             <div className="flex flex-col items-end">
               <span className="text-[10px] text-green-400 font-semibold mb-0.5">Alt Ağ (SL / DCA)</span>
               <span className="text-sm text-white bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-md font-mono">
                 ${(demoLower || hftSettings.lower_price || 0).toFixed(2)}
               </span>
             </div>
             <div className="flex flex-col items-end">
               <span className="text-[10px] text-red-400 font-semibold mb-0.5">Üst Ağ (TP)</span>
               <span className="text-sm text-white bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-md font-mono">
                 ${(demoUpper || hftSettings.upper_price || 0).toFixed(2)}
               </span>
             </div>
          </div>
        </div>
        
        {/* Grafiğin Render Edildiği Kısım */}
        <div className="h-[600px] w-full bg-[#020817] border border-slate-700/80 rounded-xl flex flex-col relative z-10 overflow-hidden shadow-inner">
          {(() => {
            const up = demoUpper || hftSettings.upper_price;
            const dn = demoLower || hftSettings.lower_price;
            const count = hftSettings.grid_count || 20;
            const lines: number[] = [];
            
            if (up && dn && up > dn && count > 1) {
              const step = (up - dn) / count;
              for (let i = 1; i < count; i++) {
                lines.push(dn + step * i);
              }
            }

            return (
              <ProChart 
                symbol={hftSettings.symbol || "BTCUSDT"} 
                tp={up || undefined} 
                sl={dn || undefined}
                gridLines={lines}
              />
            );
          })()}
        </div>
      </div>
    </div>
  )
}
