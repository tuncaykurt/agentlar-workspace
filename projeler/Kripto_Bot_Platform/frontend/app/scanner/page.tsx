"use client"

import { useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"

const fetcher = (path: string) => api.get(path)

type SortKey = "base" | "price" | "price_change_24h" | "rsi_14" | "atr_pct" | "volume_ratio" | "ema200_dist" | "adx"

function SortTh({ label, col, sortBy, sortDir, onSort }: {
  label: string; col: SortKey; sortBy: SortKey; sortDir: "asc"|"desc"; onSort: (k: SortKey) => void
}) {
  const active = sortBy === col
  return (
    <th className={`text-right cursor-pointer hover:text-white select-none transition-colors ${active ? "text-blue-400" : ""}`}
      onClick={() => onSort(col)}>
      {label} {active ? (sortDir === "asc" ? "↑" : "↓") : <span className="text-slate-700">↕</span>}
    </th>
  )
}

export default function ScannerPage() {
  const [search,       setSearch]       = useState("")
  const [sortBy,       setSortBy]       = useState<SortKey>("base")
  const [sortDir,      setSortDir]      = useState<"asc"|"desc">("asc")
  const [trendFilter,  setTrendFilter]  = useState("")
  const [rsiFilter,    setRsiFilter]    = useState("")

  const { data, error, isLoading } = useSWR("/coins/snapshots?zero_fee_only=true", fetcher, { refreshInterval: 30000 })
  const { data: summary }          = useSWR("/coins/summary", fetcher, { refreshInterval: 30000 })

  const items: any[] = data?.items || []

  let filtered = items
  if (search)                          filtered = filtered.filter((c: any) => c.base?.toLowerCase().includes(search.toLowerCase()))
  if (trendFilter === "bullish")       filtered = filtered.filter((c: any) => c.supertrend_dir === 1)
  if (trendFilter === "bearish")       filtered = filtered.filter((c: any) => c.supertrend_dir === -1)
  if (rsiFilter === "oversold")        filtered = filtered.filter((c: any) => c.rsi_14 && c.rsi_14 < 30)
  if (rsiFilter === "overbought")      filtered = filtered.filter((c: any) => c.rsi_14 && c.rsi_14 > 70)
  if (rsiFilter === "neutral")         filtered = filtered.filter((c: any) => c.rsi_14 && c.rsi_14 >= 30 && c.rsi_14 <= 70)

  filtered.sort((a: any, b: any) => {
    const av = a[sortBy] ?? 0; const bv = b[sortBy] ?? 0
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDir === "asc" ? av - bv : bv - av
  })

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortBy(key); setSortDir("desc") }
  }

  const rsiColor = (v: number | null) => {
    if (!v) return "text-slate-600"
    if (v < 30) return "text-emerald-400"
    if (v > 70) return "text-red-400"
    return "text-slate-300"
  }

  const changeColor = (v: number | null) => {
    if (!v) return "text-slate-600"
    return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-slate-400"
  }

  // Summary stats
  const summaryStats = summary && summary.total > 0 ? [
    { icon: "🪙", label: "Toplam Coin",  value: summary.total,           color: "text-white",       delta: null },
    { icon: "📈", label: "Bullish",       value: summary.bullish_count,   color: "text-emerald-400", delta: "up" },
    { icon: "📉", label: "Bearish",       value: summary.bearish_count,   color: "text-red-400",     delta: "down" },
    { icon: "⚡", label: "Ort. RSI",      value: summary.avg_rsi || "—",  color: "text-blue-400",    delta: "neu" },
  ] : []

  return (
    <div className="page-container">
      {/* Header */}
      <div className="section-header">
        <div className="section-header-icon">🔍</div>
        <div>
          <h1 className="section-title">Coin Tarayıcı</h1>
          <p className="section-subtitle">Zero-fee USDT-M futures — göstergeler her 30 saniyede güncellenir</p>
        </div>
        {summary?.updated_at && (
          <span className="ml-auto text-[10px] text-slate-600 mono-val">
            Güncelleme: {new Date(summary.updated_at).toLocaleTimeString("tr-TR")}
          </span>
        )}
      </div>

      {/* Stat Cards */}
      {summaryStats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {summaryStats.map((s) => (
            <div key={s.label} className="stat-card fade-in-up">
              <div className="stat-card-icon">{s.icon}</div>
              <div className="stat-card-label">{s.label}</div>
              <div className={`stat-card-value ${s.color}`}>{s.value}</div>
              {s.delta === "up"   && <div className="stat-card-delta stat-card-delta-up">↑ Yükselen trend</div>}
              {s.delta === "down" && <div className="stat-card-delta stat-card-delta-down">↓ Düşen trend</div>}
              {s.delta === "neu"  && <div className="stat-card-delta stat-card-delta-neu">● Nötr bölge</div>}
            </div>
          ))}
        </div>
      )}

      {/* Öne çıkanlar */}
      {summary && (summary.oversold_coins?.length > 0 || summary.overbought_coins?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          {summary.oversold_coins?.length > 0 && (
            <div className="glass-card p-4 border-emerald-500/20 fade-in-up">
              <div className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
                <span>📉</span> Aşırı Satım (RSI &lt; 30) — Potansiyel alım
              </div>
              <div className="flex flex-wrap gap-1.5">
                {summary.oversold_coins.map((c: any) => (
                  <span key={c.base} className="badge badge-bullish text-[10px]">
                    {c.base} <span className="opacity-70 mono-val">RSI {c.rsi?.toFixed(0)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {summary.overbought_coins?.length > 0 && (
            <div className="glass-card p-4 border-red-500/20 fade-in-up">
              <div className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                <span>📈</span> Aşırı Alım (RSI &gt; 70) — Potansiyel satış
              </div>
              <div className="flex flex-wrap gap-1.5">
                {summary.overbought_coins.map((c: any) => (
                  <span key={c.base} className="badge badge-bearish text-[10px]">
                    {c.base} <span className="opacity-70 mono-val">RSI {c.rsi?.toFixed(0)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* DataTable */}
      {isLoading ? (
        <div className="empty-state"><div className="spinner mb-4" /><div className="empty-state-title">Taranıyor...</div></div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-icon">⚠️</div>
          <div className="empty-state-title">Veri yüklenemedi</div>
          <div className="empty-state-desc">Collector henüz çalışmaya başlamamış olabilir</div>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <div className="empty-state-title">Coin verileri toplanıyor...</div>
          <div className="empty-state-desc">İlk döngü ~1-2 dk sürer. Sayfa otomatik yenilenir.</div>
        </div>
      ) : (
        <div className="dt-wrapper fade-in-up">
          {/* Toolbar */}
          <div className="dt-toolbar flex-wrap gap-2">
            <input
              className="dt-search"
              placeholder="🔍  Coin ara (BTC, ETH, SOL...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-600 uppercase tracking-wider">Trend:</span>
              {[{ v: "", l: "Tümü" }, { v: "bullish", l: "📈 Bullish" }, { v: "bearish", l: "📉 Bearish" }].map(f => (
                <button key={f.v} onClick={() => setTrendFilter(f.v)}
                  className={`filter-pill ${trendFilter === f.v ? (f.v === "bullish" ? "active-green" : f.v === "bearish" ? "active-red" : "active-all") : ""}`}>
                  {f.l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-600 uppercase tracking-wider">RSI:</span>
              {[{ v: "", l: "Tümü" }, { v: "oversold", l: "< 30" }, { v: "neutral", l: "30-70" }, { v: "overbought", l: "> 70" }].map(f => (
                <button key={f.v} onClick={() => setRsiFilter(f.v)}
                  className={`filter-pill ${rsiFilter === f.v ? (f.v === "oversold" ? "active-green" : f.v === "overbought" ? "active-red" : "active-all") : ""}`}>
                  {f.l}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-slate-600 ml-auto mono-val">{filtered.length} / {items.length} coin</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="dt-table">
              <thead>
                <tr>
                  <SortTh label="Coin"    col="base"             sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Fiyat"   col="price"            sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="24h %"   col="price_change_24h" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="RSI"     col="rsi_14"           sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="ATR%"    col="atr_pct"          sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <th className="text-center">Trend</th>
                  <SortTh label="EMA200"  col="ema200_dist"      sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="ADX"     col="adx"              sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Hacim"   col="volume_ratio"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <th className="text-right">Kaldıraç</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c: any) => (
                  <tr key={c.symbol} className="border-b border-slate-800/30 hover:bg-blue-500/[0.03] transition-colors">
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-semibold text-white">{c.base}</span>
                      <span className="text-slate-600 text-xs">/USDT</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="mono-val text-slate-300">
                        ${c.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: c.price < 1 ? 6 : 2 })}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 text-right mono-val ${changeColor(c.price_change_24h)}`}>
                      {c.price_change_24h != null ? `${c.price_change_24h > 0 ? "+" : ""}${c.price_change_24h.toFixed(2)}%` : "—"}
                    </td>
                    <td className={`px-3 py-2.5 text-right mono-val ${rsiColor(c.rsi_14)}`}>
                      {c.rsi_14?.toFixed(1) || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right mono-val text-slate-400">
                      {c.atr_pct != null ? `${c.atr_pct.toFixed(3)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {c.supertrend_dir === 1  && <span className="badge badge-bullish">▲ Bullish</span>}
                      {c.supertrend_dir === -1 && <span className="badge badge-bearish">▼ Bearish</span>}
                      {!c.supertrend_dir       && <span className="text-slate-700 text-xs">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right mono-val ${
                      c.ema200_dist == null ? "text-slate-600" : c.ema200_dist > 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {c.ema200_dist != null ? `${c.ema200_dist > 0 ? "+" : ""}${c.ema200_dist.toFixed(2)}%` : "—"}
                    </td>
                    <td className={`px-3 py-2.5 text-right mono-val ${
                      c.adx == null ? "text-slate-600" : c.adx > 25 ? "text-amber-400" : "text-slate-500"
                    }`}>
                      {c.adx?.toFixed(1) || "—"}
                    </td>
                    <td className={`px-3 py-2.5 text-right mono-val ${
                      c.volume_ratio == null ? "text-slate-600" :
                      c.volume_ratio > 2   ? "text-amber-400" :
                      c.volume_ratio > 1.2 ? "text-blue-400"  : "text-slate-500"
                    }`}>
                      {c.volume_ratio != null ? `${c.volume_ratio.toFixed(1)}×` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {c.max_leverage ? (
                        <span className="badge text-[9px]" style={{ background:"rgba(251,191,36,0.1)", color:"#fbbf24", borderColor:"rgba(251,191,36,0.2)" }}>
                          {c.max_leverage}×
                        </span>
                      ) : <span className="text-slate-700 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
