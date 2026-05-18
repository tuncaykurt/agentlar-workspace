"use client"

import { useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"

const fetcher = (path: string) => api.get(path)

type SortKey = "base" | "price" | "price_change_24h" | "rsi_14" | "atr_pct" | "volume_ratio" | "ema200_dist" | "adx"

export default function ScannerPage() {
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<SortKey>("base")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [trendFilter, setTrendFilter] = useState<string>("")
  const [rsiFilter, setRsiFilter] = useState<string>("")

  // Veri çek
  const { data, error, isLoading } = useSWR("/coins/snapshots?zero_fee_only=true", fetcher, {
    refreshInterval: 30000,
  })
  const { data: summary } = useSWR("/coins/summary", fetcher, { refreshInterval: 30000 })

  const items: any[] = data?.items || []

  // Filtreleme
  let filtered = items
  if (search) {
    const s = search.toLowerCase()
    filtered = filtered.filter((c: any) => c.base?.toLowerCase().includes(s) || c.symbol?.toLowerCase().includes(s))
  }
  if (trendFilter === "bullish") filtered = filtered.filter((c: any) => c.supertrend_dir === 1)
  if (trendFilter === "bearish") filtered = filtered.filter((c: any) => c.supertrend_dir === -1)
  if (rsiFilter === "oversold") filtered = filtered.filter((c: any) => c.rsi_14 && c.rsi_14 < 30)
  if (rsiFilter === "overbought") filtered = filtered.filter((c: any) => c.rsi_14 && c.rsi_14 > 70)
  if (rsiFilter === "neutral") filtered = filtered.filter((c: any) => c.rsi_14 && c.rsi_14 >= 30 && c.rsi_14 <= 70)

  // Sıralama
  filtered.sort((a: any, b: any) => {
    const av = a[sortBy] ?? 0
    const bv = b[sortBy] ?? 0
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDir === "asc" ? av - bv : bv - av
  })

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortBy(key)
      setSortDir("desc")
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortBy !== col) return <span className="text-slate-600 ml-0.5">↕</span>
    return <span className="text-blue-400 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>
  }

  const rsiColor = (v: number | null) => {
    if (!v) return "text-slate-600"
    if (v < 30) return "text-green-400"
    if (v > 70) return "text-red-400"
    return "text-slate-300"
  }

  const changeColor = (v: number | null) => {
    if (!v) return "text-slate-600"
    return v > 0 ? "text-green-400" : v < 0 ? "text-red-400" : "text-slate-400"
  }

  const trendBadge = (dir: number | null) => {
    if (dir === 1) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/20">Bullish</span>
    if (dir === -1) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20">Bearish</span>
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-500">—</span>
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      {/* Başlık + Özet */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            🔍 Coin Tarayıcı
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Zero-fee USDT-M futures — göstergeler her 30 saniyede güncellenir
          </p>
        </div>

        {summary && summary.total > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
              {summary.total} coin
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
              {summary.bullish_count} bullish
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
              {summary.bearish_count} bearish
            </span>
            {summary.avg_rsi && (
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                Ort RSI: {summary.avg_rsi}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Öne çıkanlar */}
      {summary && (summary.oversold_coins?.length > 0 || summary.overbought_coins?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {summary.oversold_coins?.length > 0 && (
            <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20">
              <div className="text-xs font-medium text-green-400 mb-1.5">Aşırı Satım (RSI &lt; 30) — Potansiyel alım fırsatı</div>
              <div className="flex flex-wrap gap-1.5">
                {summary.oversold_coins.map((c: any) => (
                  <span key={c.base} className="text-[11px] px-2 py-0.5 rounded bg-green-500/10 text-green-300 border border-green-500/15">
                    {c.base} <span className="text-green-500">RSI {c.rsi?.toFixed(0)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {summary.overbought_coins?.length > 0 && (
            <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
              <div className="text-xs font-medium text-red-400 mb-1.5">Aşırı Alım (RSI &gt; 70) — Potansiyel satış bölgesi</div>
              <div className="flex flex-wrap gap-1.5">
                {summary.overbought_coins.map((c: any) => (
                  <span key={c.base} className="text-[11px] px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/15">
                    {c.base} <span className="text-red-500">RSI {c.rsi?.toFixed(0)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Coin ara (BTC, ETH, SOL...)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48"
        />

        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 mr-1">Trend:</span>
          {[
            { v: "", l: "Tümü" },
            { v: "bullish", l: "Bullish" },
            { v: "bearish", l: "Bearish" },
          ].map(f => (
            <button
              key={f.v}
              onClick={() => setTrendFilter(f.v)}
              className={`px-2 py-1 rounded transition-colors ${
                trendFilter === f.v
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 mr-1">RSI:</span>
          {[
            { v: "", l: "Tümü" },
            { v: "oversold", l: "< 30" },
            { v: "neutral", l: "30-70" },
            { v: "overbought", l: "> 70" },
          ].map(f => (
            <button
              key={f.v}
              onClick={() => setRsiFilter(f.v)}
              className={`px-2 py-1 rounded transition-colors ${
                rsiFilter === f.v
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>

        <span className="text-[10px] text-slate-600 ml-auto">
          {filtered.length} / {items.length} coin
        </span>
      </div>

      {/* Tablo */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="text-center py-16 text-slate-500">
          <div className="text-3xl mb-2">⚠️</div>
          Veri yüklenemedi. Collector henüz çalışmaya başlamamış olabilir.
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <div className="text-3xl mb-2">⏳</div>
          Coin verileri toplanıyor... İlk döngü ~1-2 dk sürer.
          <div className="text-xs mt-1">Sayfa otomatik yenilenir.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900/80 text-slate-400 text-xs border-b border-slate-800">
                <th className="text-left px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort("base")}>
                  Coin <SortIcon col="base" />
                </th>
                <th className="text-right px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort("price")}>
                  Fiyat <SortIcon col="price" />
                </th>
                <th className="text-right px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort("price_change_24h")}>
                  24h % <SortIcon col="price_change_24h" />
                </th>
                <th className="text-right px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort("rsi_14")}>
                  RSI <SortIcon col="rsi_14" />
                </th>
                <th className="text-right px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort("atr_pct")}>
                  ATR% <SortIcon col="atr_pct" />
                </th>
                <th className="text-center px-3 py-2.5">Trend</th>
                <th className="text-right px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort("ema200_dist")}>
                  EMA200 <SortIcon col="ema200_dist" />
                </th>
                <th className="text-right px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort("adx")}>
                  ADX <SortIcon col="adx" />
                </th>
                <th className="text-right px-3 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort("volume_ratio")}>
                  Hacim <SortIcon col="volume_ratio" />
                </th>
                <th className="text-right px-3 py-2.5">Kaldıraç</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.symbol} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-3 py-2">
                    <span className="font-medium text-white">{c.base}</span>
                    <span className="text-slate-600 text-xs">/USDT</span>
                  </td>
                  <td className="text-right px-3 py-2 text-slate-300 font-mono text-xs">
                    ${c.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: c.price < 1 ? 6 : 2 })}
                  </td>
                  <td className={`text-right px-3 py-2 font-mono text-xs ${changeColor(c.price_change_24h)}`}>
                    {c.price_change_24h != null ? `${c.price_change_24h > 0 ? "+" : ""}${c.price_change_24h.toFixed(2)}%` : "—"}
                  </td>
                  <td className={`text-right px-3 py-2 font-mono text-xs ${rsiColor(c.rsi_14)}`}>
                    {c.rsi_14?.toFixed(1) || "—"}
                  </td>
                  <td className="text-right px-3 py-2 font-mono text-xs text-slate-400">
                    {c.atr_pct != null ? `${c.atr_pct.toFixed(3)}%` : "—"}
                  </td>
                  <td className="text-center px-3 py-2">
                    {trendBadge(c.supertrend_dir)}
                  </td>
                  <td className={`text-right px-3 py-2 font-mono text-xs ${
                    c.ema200_dist == null ? "text-slate-600" :
                    c.ema200_dist > 0 ? "text-green-400" : "text-red-400"
                  }`}>
                    {c.ema200_dist != null ? `${c.ema200_dist > 0 ? "+" : ""}${c.ema200_dist.toFixed(2)}%` : "—"}
                  </td>
                  <td className={`text-right px-3 py-2 font-mono text-xs ${
                    c.adx == null ? "text-slate-600" :
                    c.adx > 25 ? "text-amber-400" : "text-slate-500"
                  }`}>
                    {c.adx?.toFixed(1) || "—"}
                  </td>
                  <td className={`text-right px-3 py-2 font-mono text-xs ${
                    c.volume_ratio == null ? "text-slate-600" :
                    c.volume_ratio > 2 ? "text-amber-400" :
                    c.volume_ratio > 1.2 ? "text-blue-400" : "text-slate-500"
                  }`}>
                    {c.volume_ratio != null ? `${c.volume_ratio.toFixed(1)}x` : "—"}
                  </td>
                  <td className="text-right px-3 py-2 text-xs text-slate-500">
                    {c.max_leverage ? `${c.max_leverage}x` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Son güncelleme */}
      {summary?.updated_at && (
        <div className="text-[10px] text-slate-600 text-right">
          Son güncelleme: {new Date(summary.updated_at).toLocaleTimeString("tr-TR")}
        </div>
      )}
    </div>
  )
}
