"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { api, createBotWS } from "@/lib/api"

const fetcher = (path: string) => api.get(path)

const COLOR_MAP: Record<string, string> = {
  orange: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  purple: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  blue:   "bg-blue-500/20   text-blue-300   border-blue-500/40",
  red:    "bg-red-500/20    text-red-300    border-red-500/40",
  yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  indigo: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
  gray:   "bg-slate-700/50  text-slate-300  border-slate-600/40",
}

const TABS = [
  { key: "all",      label: "Tümü",           color: "text-slate-300 border-slate-600    bg-slate-800"   },
  { key: "analyzed", label: "Analiz Edildi",   color: "text-sky-400   border-sky-500/60   bg-sky-500/10"  },
  { key: "received", label: "Bekleyen",        color: "text-amber-400 border-amber-500/60 bg-amber-500/10"},
  { key: "executed", label: "İşleme Alındı",   color: "text-green-400 border-green-500/60 bg-green-500/10"},
  { key: "blocked",  label: "Reddedildi",      color: "text-red-400   border-red-500/60   bg-red-500/10"  },
] as const

type TabKey = typeof TABS[number]["key"]

// ─── Sinyal Aralığı Analizi Bileşeni ─────────────────────────────────────────
function PriceRangeBar({ item }: { item: any }) {
  const entry  = item.price
  const tp     = item.tp_price
  const sl     = item.sl_price
  const high   = item.max_price_in_range
  const low    = item.min_price_in_range
  const exit   = item.outcome_price
  const isLong = item.signal_type === "buy"

  if (!entry || !high || !low) return <span className="text-slate-700 text-xs">— veri yok</span>

  // Tüm fiyatları normalize et [0..100] aralığına
  const allPrices = [entry, tp, sl, high, low, exit].filter(Boolean) as number[]
  const minP = Math.min(...allPrices) * 0.999
  const maxP = Math.max(...allPrices) * 1.001
  const range = maxP - minP
  const pct = (p: number) => Math.max(0, Math.min(100, ((p - minP) / range) * 100))

  const entryPct = pct(entry)
  const tpPct    = tp   ? pct(tp)   : null
  const slPct    = sl   ? pct(sl)   : null
  const highPct  = pct(high)
  const lowPct   = pct(low)
  const exitPct  = exit ? pct(exit) : null

  return (
    <div className="relative w-full h-8 rounded-md overflow-hidden bg-slate-800/60 select-none" title={
      `Giriş: $${entry.toFixed(2)} | Max: $${high.toFixed(2)} | Min: $${low.toFixed(2)}` +
      (exit ? ` | Çıkış: $${exit.toFixed(2)}` : "")
    }>
      {/* TP zone — yeşil alan (entry'den tp'ye) */}
      {tpPct !== null && (
        <div className="absolute top-0 bottom-0 bg-green-500/15"
          style={isLong
            ? { left: `${entryPct}%`, width: `${tpPct - entryPct}%` }
            : { left: `${tpPct}%`,   width: `${entryPct - tpPct}%` }
          }
        />
      )}
      {/* SL zone — kırmızı alan (entry'den sl'ye) */}
      {slPct !== null && (
        <div className="absolute top-0 bottom-0 bg-red-500/15"
          style={isLong
            ? { left: `${slPct}%`,    width: `${entryPct - slPct}%` }
            : { left: `${entryPct}%`, width: `${slPct - entryPct}%` }
          }
        />
      )}
      {/* Fiyat aralığı çizgisi */}
      <div className="absolute top-1/2 -translate-y-1/2 h-0.5 bg-slate-500/50 rounded"
        style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
      />
      {/* Max high marker */}
      <div className="absolute top-0.5 w-0.5 h-3 bg-green-400/80 rounded-full" style={{ left: `${highPct}%` }} title={`Max: $${high.toFixed(2)}`} />
      {/* Min low marker */}
      <div className="absolute bottom-0.5 w-0.5 h-3 bg-red-400/80 rounded-full"  style={{ left: `${lowPct}%`  }} title={`Min: $${low.toFixed(2)}`}  />
      {/* TP line */}
      {tpPct !== null && <div className="absolute top-0 bottom-0 w-px bg-green-400/50" style={{ left: `${tpPct}%` }} />}
      {/* SL line */}
      {slPct !== null && <div className="absolute top-0 bottom-0 w-px bg-red-400/50"   style={{ left: `${slPct}%` }} />}
      {/* Entry marker — beyaz dikey çizgi */}
      <div className="absolute top-0 bottom-0 w-0.5 bg-white/70 rounded" style={{ left: `${entryPct}%` }} />
      {/* Exit marker — sarı */}
      {exitPct !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-400/80 rounded" style={{ left: `${exitPct}%` }} />}
    </div>
  )
}

function SignalRangeSection({ items, isLoading }: { items: any[], isLoading: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const VISIBLE_COUNT = 4

  // Executed ve analyzed sinyallerden range analizi olanları göster
  const rangeItems = items.filter((it: any) =>
    (it.action === "executed" || it.action === "analyzed") && it.max_price_in_range != null
  )

  if (isLoading) return null
  if (rangeItems.length === 0) return null

  const fmt = (v: number | null, dec = 2) =>
    v != null ? `$${v.toLocaleString("tr-TR", { maximumFractionDigits: dec })}` : "—"
  const fmtPct = (v: number | null) =>
    v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : "—"

  // Özet istatistikler
  const tpReachable  = rangeItems.filter(i => i.tp_was_reachable).length
  const slHit        = rangeItems.filter(i => i.sl_was_hit).length
  const nextSignal   = rangeItems.filter(i => i.outcome === "next_signal").length
  const avgFavorable = rangeItems.reduce((s: number, i: any) => s + (i.max_favorable_pct || 0), 0) / rangeItems.length

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          📊 Sinyal Aralığı Analizi
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Her sinyal açılış → sonraki sinyal aralığındaki fiyat hareketi. Bant = giriş–TP–SL zonu · Yeşil çizgi = max yüksek · Kırmızı = min düşük · Beyaz = giriş · Sarı = çıkış
        </p>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Analiz Edilen", value: rangeItems.length, color: "text-white" },
          { label: "TP'ye Ulaştı", value: tpReachable, color: "text-green-400", sub: `%${rangeItems.length ? Math.round(tpReachable / rangeItems.length * 100) : 0}` },
          { label: "SL Vuruldu",   value: slHit,        color: "text-red-400",   sub: `%${rangeItems.length ? Math.round(slHit / rangeItems.length * 100) : 0}` },
          { label: "Sinyalle Kapandı",    value: nextSignal,   color: "text-yellow-400", sub: `%${rangeItems.length ? Math.round(nextSignal / rangeItems.length * 100) : 0}` },
          { label: "Ort. Max Potansiyel", value: `+${avgFavorable.toFixed(2)}%`, color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-xl border border-slate-800 bg-slate-800/40 text-center">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            {s.sub && <div className="text-[10px] text-slate-500">{s.sub} oran</div>}
            <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Sinyal kartları */}
      <div className="space-y-3">
        {(expanded ? rangeItems : rangeItems.slice(0, VISIBLE_COUNT)).map((item: any) => {
          const isLong = item.signal_type === "buy"
          const outcomeColor =
            item.outcome === "tp_hit"     ? "text-green-400 bg-green-500/10 border-green-500/20" :
            item.outcome === "sl_hit"     ? "text-red-400 bg-red-500/10 border-red-500/20" :
            item.outcome === "next_signal"? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" :
                                            "text-slate-400 bg-slate-700/30 border-slate-700"
          const outcomeLabel =
            item.outcome === "tp_hit"      ? "TP Vurdu" :
            item.outcome === "sl_hit"      ? "SL Vurdu" :
            item.outcome === "next_signal" ? "Sinyalle Kapandı" :
            item.outcome || "Açık"
          const d = new Date(item.created_at)
          const timeStr = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }) +
            " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })

          return (
            <div key={item.id} className="p-4 rounded-xl border border-slate-800 bg-slate-800/30 space-y-3">
              {/* Başlık satırı */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded font-semibold text-xs border ${
                    isLong ? "text-green-400 bg-green-500/10 border-green-500/20"
                            : "text-red-400 bg-red-500/10 border-red-500/20"
                  }`}>
                    {isLong ? "▲ LONG" : "▼ SHORT"}
                  </span>
                  <span className={`px-2 py-0.5 rounded border text-[10px] ${outcomeColor}`}>
                    {outcomeLabel}
                  </span>
                  {item.tp_was_reachable && <span className="text-[10px] text-green-500">TP ✓</span>}
                  {item.sl_was_hit && <span className="text-[10px] text-red-500">SL ✕</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-sm font-bold ${
                    item.outcome_pnl_pct == null ? "text-slate-600" :
                    item.outcome_pnl_pct > 0 ? "text-green-400" : "text-red-400"
                  }`}>
                    {fmtPct(item.outcome_pnl_pct)}
                  </span>
                  <span className="text-[10px] text-slate-500">{timeStr}</span>
                </div>
              </div>

              {/* Fiyat grid */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Giriş</div>
                  <div className="font-mono text-slate-200">{fmt(item.price)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">TP</div>
                  <div className="font-mono text-green-400">{fmt(item.tp_price)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">SL</div>
                  <div className="font-mono text-red-400">{fmt(item.sl_price)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Max</div>
                  <div className={`font-mono ${item.tp_was_reachable ? "text-green-300 font-semibold" : "text-slate-400"}`}>
                    {fmt(item.max_price_in_range)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Min</div>
                  <div className={`font-mono ${item.sl_was_hit ? "text-red-300 font-semibold" : "text-slate-400"}`}>
                    {fmt(item.min_price_in_range)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Çıkış</div>
                  <div className="font-mono text-yellow-400">{fmt(item.outcome_price)}</div>
                </div>
              </div>

              {/* Fiyat aralığı bar */}
              <PriceRangeBar item={item} />
            </div>
          )
        })}
        {rangeItems.length > VISIBLE_COUNT && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-xl hover:bg-slate-800/50 transition-colors"
          >
            {expanded ? `Daralt (${VISIBLE_COUNT} sinyal goster)` : `Tumu goster (${rangeItems.length} sinyal)`}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Canlı Pozisyon Grafiği ──────────────────────────────────────────────────
interface PriceTick { price: number; ts: number }

function LivePositionChart({ botId }: { botId: number | null }) {
  const [ticks, setTicks] = useState<PriceTick[]>([])
  const [position, setPosition] = useState<any>(null)
  const [curPrice, setCurPrice] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const maxTicks = 120 // ~10 dakika (5s aralık)

  useEffect(() => {
    if (!botId) return
    setTicks([])
    setPosition(null)

    const ws = createBotWS(botId, (data: any) => {
      const price = data?.price
      if (price && price > 0) {
        const tick = { price, ts: Date.now() }
        setCurPrice(price)
        setTicks(prev => {
          const next = [...prev, tick]
          return next.length > maxTicks ? next.slice(-maxTicks) : next
        })
      }
      if (data?.position) {
        setPosition(data.position)
      } else {
        setPosition(null)
      }
    })
    wsRef.current = ws

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [botId])

  if (!botId) return null
  if (!position) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm col-span-full">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-2">
          📈 Canlı Pozisyon
        </h2>
        <div className="text-center py-8 text-slate-500 text-sm">
          <div className="text-3xl mb-2">📡</div>
          Aktif pozisyon yok — sinyal geldiğinde canlı grafik burada görünecek
        </div>
      </div>
    )
  }

  const isLong = position.side === "long"
  const entry  = position.entry_price || 0
  const tp     = position.tp || 0
  const sl     = position.sl || 0
  const pnl    = position.pnl_usdt || 0
  const pnlPct = position.pnl_pct || 0
  const lev    = position.leverage || 1

  // SVG chart boyutları
  const W = 600, H = 160, padX = 0, padY = 16

  // Fiyat aralığını hesapla
  const allPrices = [entry, ...ticks.map(t => t.price)]
  if (tp > 0) allPrices.push(tp)
  if (sl > 0) allPrices.push(sl)
  const minP = Math.min(...allPrices) * 0.9998
  const maxP = Math.max(...allPrices) * 1.0002
  const priceRange = maxP - minP || 1

  const yScale = (p: number) => padY + (1 - (p - minP) / priceRange) * (H - padY * 2)
  const xScale = (i: number, total: number) => padX + (i / Math.max(total - 1, 1)) * (W - padX * 2)

  // Fiyat çizgisi path
  const linePath = ticks.length > 1
    ? ticks.map((t, i) => `${i === 0 ? "M" : "L"}${xScale(i, ticks.length).toFixed(1)},${yScale(t.price).toFixed(1)}`).join(" ")
    : ""

  // Gradient area path (çizgi altı)
  const areaPath = linePath && ticks.length > 1
    ? linePath +
      ` L${xScale(ticks.length - 1, ticks.length).toFixed(1)},${H - padY}` +
      ` L${xScale(0, ticks.length).toFixed(1)},${H - padY} Z`
    : ""

  const entryY = yScale(entry)
  const tpY    = tp > 0 ? yScale(tp) : null
  const slY    = sl > 0 ? yScale(sl) : null
  const curY   = curPrice > 0 ? yScale(curPrice) : null

  const fmt = (v: number) => v >= 1000 ? v.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) : v.toFixed(4)
  const elapsed = ticks.length > 1 ? Math.round((ticks[ticks.length - 1].ts - ticks[0].ts) / 60000) : 0

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm col-span-full">
      {/* Başlık satırı */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          📈 Canlı Pozisyon
          <span className={`text-xs font-normal px-2 py-0.5 rounded border ${
            isLong ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-red-400 bg-red-500/10 border-red-500/20"
          }`}>
            {isLong ? "▲ LONG" : "▼ SHORT"} {lev}x
          </span>
          <span className="text-xs font-normal text-slate-500">
            {ticks.length} tick · {elapsed}dk
          </span>
        </h2>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] text-slate-500 uppercase">Anlık Fiyat</div>
            <div className="font-mono text-sm text-white font-bold">${fmt(curPrice)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-500 uppercase">PnL</div>
            <div className={`font-mono text-sm font-bold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)} USDT
              <span className="text-[10px] ml-1">({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fiyat bilgi satırı */}
      <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white/70" />
          <span className="text-slate-500">Giriş:</span>
          <span className="font-mono text-slate-200">${fmt(entry)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-slate-500">TP:</span>
          <span className="font-mono text-green-400">{tp > 0 ? `$${fmt(tp)}` : "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-slate-500">SL:</span>
          <span className="font-mono text-red-400">{sl > 0 ? `$${fmt(sl)}` : "—"}</span>
        </div>
      </div>

      {/* SVG Grafik */}
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }} preserveAspectRatio="none">
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={pnl >= 0 ? "#22c55e" : "#ef4444"} stopOpacity="0.3" />
              <stop offset="100%" stopColor={pnl >= 0 ? "#22c55e" : "#ef4444"} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* TP zone — yeşil bant */}
          {tpY !== null && (
            <rect x={0} y={Math.min(entryY, tpY)} width={W} height={Math.abs(tpY - entryY)}
              fill="#22c55e" opacity={0.06} />
          )}
          {/* SL zone — kırmızı bant */}
          {slY !== null && (
            <rect x={0} y={Math.min(entryY, slY)} width={W} height={Math.abs(slY - entryY)}
              fill="#ef4444" opacity={0.06} />
          )}

          {/* Entry çizgisi */}
          <line x1={0} y1={entryY} x2={W} y2={entryY}
            stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="6 4" opacity={0.5} />
          {/* TP çizgisi */}
          {tpY !== null && (
            <line x1={0} y1={tpY} x2={W} y2={tpY}
              stroke="#22c55e" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.6} />
          )}
          {/* SL çizgisi */}
          {slY !== null && (
            <line x1={0} y1={slY} x2={W} y2={slY}
              stroke="#ef4444" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.6} />
          )}

          {/* Gradient area */}
          {areaPath && <path d={areaPath} fill="url(#priceGrad)" />}

          {/* Fiyat çizgisi */}
          {linePath && (
            <path d={linePath} fill="none"
              stroke={pnl >= 0 ? "#22c55e" : "#ef4444"} strokeWidth={1.5}
              strokeLinejoin="round" strokeLinecap="round" />
          )}

          {/* Mevcut fiyat noktası */}
          {curY !== null && ticks.length > 0 && (
            <>
              <circle cx={xScale(ticks.length - 1, ticks.length)} cy={curY} r={3}
                fill={pnl >= 0 ? "#22c55e" : "#ef4444"} />
              <circle cx={xScale(ticks.length - 1, ticks.length)} cy={curY} r={6}
                fill={pnl >= 0 ? "#22c55e" : "#ef4444"} opacity={0.2}>
                <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
            </>
          )}

          {/* Etiketler — sağ kenar */}
          <text x={W - 4} y={entryY - 4} textAnchor="end" fill="#94a3b8" fontSize={9} fontFamily="monospace">
            Giriş ${fmt(entry)}
          </text>
          {tpY !== null && (
            <text x={W - 4} y={tpY - 4} textAnchor="end" fill="#22c55e" fontSize={9} fontFamily="monospace">
              TP ${fmt(tp)}
            </text>
          )}
          {slY !== null && (
            <text x={W - 4} y={slY + 12} textAnchor="end" fill="#ef4444" fontSize={9} fontFamily="monospace">
              SL ${fmt(sl)}
            </text>
          )}
        </svg>
      </div>

      {ticks.length < 3 && (
        <div className="text-center text-[10px] text-slate-600 mt-2 animate-pulse">
          Veri toplanıyor... (her 5 saniyede güncellenir)
        </div>
      )}
    </div>
  )
}

// ─── AI TP/SL Öneri Kartı ────────────────────────────────────────────────────
function AiSuggestCard({ botId }: { botId: number | null }) {
  const url = `/analytics/suggest-tp-sl${botId ? `?bot_id=${botId}` : ''}`
  const { data, isLoading } = useSWR(url, fetcher, { refreshInterval: 60000 })

  const confidenceColor =
    data?.confidence === 'high'   ? 'text-green-400'  :
    data?.confidence === 'medium' ? 'text-yellow-400' : 'text-slate-400'

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
        🤖 AI TP/SL Önerisi
        <span className="text-xs font-normal text-slate-500 ml-1">Kelly Kriteri + Beklenen Değer</span>
      </h2>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-blue-500" />
        </div>
      ) : !data || data.confidence === 'insufficient' ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          <div className="text-3xl mb-2">📊</div>
          {data?.message || 'Yeterli sinyal verisi yok (min. 5 tamamlanmış sinyal gerekli).'}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
              <div className="text-2xl font-bold text-green-400">%{data.suggested_tp_pct}</div>
              <div className="text-xs text-slate-400 mt-1">Optimal TP</div>
              <div className="text-[10px] text-green-500/70 mt-0.5">
                {data.win_probability ? `%${(data.win_probability * 100).toFixed(0)} olasılık` : ''}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
              <div className="text-2xl font-bold text-red-400">%{data.suggested_sl_pct}</div>
              <div className="text-xs text-slate-400 mt-1">Optimal SL</div>
              <div className="text-[10px] text-red-500/70 mt-0.5">
                {data.loss_probability ? `%${(data.loss_probability * 100).toFixed(0)} risk` : ''}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
              <div className="text-2xl font-bold text-blue-400">{data.rr_ratio ? `1:${data.rr_ratio}` : '—'}</div>
              <div className="text-xs text-slate-400 mt-1">R/R Oranı</div>
              <div className={`text-[10px] mt-0.5 ${confidenceColor}`}>
                {data.confidence === 'high' ? '● Yüksek güven' : data.confidence === 'medium' ? '● Orta güven' : '● Düşük güven'}
              </div>
            </div>
          </div>

          {data.reasoning && (
            <div className="bg-slate-800/40 rounded-xl p-3 space-y-1">
              {(data.reasoning as string[]).map((line: string, i: number) => (
                <div key={i} className="text-xs text-slate-400 flex items-start gap-2">
                  <span className="text-slate-600 mt-0.5">›</span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          )}

          {data.distribution && (
            <div className="space-y-2">
              <div className="text-[10px] text-slate-600 uppercase tracking-wider">Fiyat Hareket Dağılımı (Percentile)</div>
              <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
                {[
                  { label: 'Lehte %25', val: data.distribution.fav_p25, color: 'text-green-500/70', desc: 'Düşük' },
                  { label: 'Lehte %50', val: data.distribution.fav_p50, color: 'text-green-400', desc: 'Medyan' },
                  { label: 'Lehte %75', val: data.distribution.fav_p75, color: 'text-green-300', desc: 'Yüksek' },
                  { label: 'Aleyhte %25', val: data.distribution.adv_p25, color: 'text-red-400', desc: 'Düşük' },
                  { label: 'Aleyhte %50', val: data.distribution.adv_p50, color: 'text-red-500/70', desc: 'Medyan' },
                ].map(d => (
                  <div key={d.label} className="p-2 rounded-lg bg-slate-800/50">
                    <div className={`font-bold ${d.color}`}>%{d.val}</div>
                    <div className="text-slate-500 mt-0.5">{d.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── AI Prompt Yönetim Paneli ────────────────────────────────────────────────
function AiPromptEditor() {
  const [open, setOpen] = useState(false)
  const { data: prompts, mutate, isLoading, error: promptsError } = useSWR(
    open ? '/analytics/ai-prompts' : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  )
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [editModel, setEditModel] = useState("")
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState<string | null>(null)

  const startEdit = (p: any) => {
    setEditingKey(p.key)
    setEditText(p.prompt_text)
    setEditModel(p.model || "")
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setEditText("")
    setEditModel("")
  }

  const savePrompt = async () => {
    if (!editingKey) return
    setSaving(true)
    try {
      await api.put(`/analytics/ai-prompts/${editingKey}`, {
        prompt_text: editText,
        model: editModel || null,
      })
      await mutate()
      setEditingKey(null)
    } catch (e: any) {
      alert("Kaydetme hatası: " + (e?.message || "Bilinmeyen hata"))
    } finally {
      setSaving(false)
    }
  }

  const resetPrompt = async (key: string) => {
    if (!confirm("Bu promptu varsayılana sıfırlamak istediğinize emin misiniz?")) return
    setResetting(key)
    try {
      await api.delete(`/analytics/ai-prompts/${key}`)
      await mutate()
      if (editingKey === key) cancelEdit()
    } catch (e: any) {
      alert("Sıfırlama hatası: " + (e?.message || "Bilinmeyen hata"))
    } finally {
      setResetting(null)
    }
  }

  const LABEL_MAP: Record<string, { icon: string; name: string }> = {
    news_analysis:    { icon: "📰", name: "Haber Filtresi" },
    self_learning:    { icon: "🧠", name: "Öz-Öğrenme Filtresi" },
    trend_volatility: { icon: "📈", name: "Trend + Volatilite Filtresi" },
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl backdrop-blur-sm overflow-hidden">
      {/* Başlık — tıklanınca aç/kapa */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-6 hover:bg-slate-800/30 transition-colors text-left"
      >
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span>🤖</span> AI Prompt Yönetimi
            <span className="text-xs font-normal text-slate-500 ml-1">Sistem promptlarını görüntüle ve düzenle</span>
          </h2>
        </div>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* İçerik */}
      {open && (
        <div className="px-6 pb-6 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-blue-500" />
            </div>
          ) : promptsError ? (
            <div className="text-center py-8 text-red-400 text-sm">API hatası: {promptsError?.message || "Bağlantı kurulamadı"}</div>
          ) : !prompts || prompts.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">Prompt bulunamadı.</div>
          ) : (
            prompts.map((p: any) => {
              const label = LABEL_MAP[p.key] || { icon: "⚙️", name: p.key }
              const isEditing = editingKey === p.key

              return (
                <div key={p.key} className={`rounded-xl border transition-colors ${
                  isEditing ? "border-blue-500/40 bg-blue-500/5" : "border-slate-700 bg-slate-800/30"
                }`}>
                  {/* Prompt başlık satırı */}
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{label.icon}</span>
                      <div>
                        <span className="text-sm font-medium text-slate-200">{label.name}</span>
                        <span className="text-[10px] text-slate-600 ml-2 font-mono">{p.key}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Model badge */}
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-400 border border-slate-600 font-mono">
                        {p.model}
                      </span>
                      {/* Custom badge */}
                      {p.is_custom && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          Özel
                        </span>
                      )}
                      {p.updated_at && (
                        <span className="text-[10px] text-slate-600">
                          {new Date(p.updated_at).toLocaleDateString("tr-TR")}
                        </span>
                      )}
                      {/* Butonlar */}
                      {!isEditing ? (
                        <button
                          onClick={() => startEdit(p)}
                          className="text-xs px-3 py-1 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600 transition-colors"
                        >
                          Düzenle
                        </button>
                      ) : (
                        <button
                          onClick={cancelEdit}
                          className="text-xs px-3 py-1 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 border border-slate-600 transition-colors"
                        >
                          İptal
                        </button>
                      )}
                      {p.is_custom && !isEditing && (
                        <button
                          onClick={() => resetPrompt(p.key)}
                          disabled={resetting === p.key}
                          className="text-xs px-3 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50"
                        >
                          {resetting === p.key ? "..." : "Sıfırla"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Prompt içeriği — düzenleme modu veya okuma modu */}
                  {isEditing ? (
                    <div className="px-4 pb-4 space-y-3">
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">Model</label>
                        <input
                          type="text"
                          value={editModel}
                          onChange={e => setEditModel(e.target.value)}
                          placeholder="deepseek/deepseek-chat"
                          className="w-full text-xs bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 font-mono focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 block">
                          Prompt Metni
                          <span className="text-slate-600 ml-2 normal-case">
                            (Değişkenler: {"{"}coin{"}"}, {"{"}signal_type{"}"}, {"{"}price{"}"} vb. — küme parantez içinde)
                          </span>
                        </label>
                        <textarea
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          rows={18}
                          className="w-full text-xs bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 font-mono focus:outline-none focus:border-blue-500 leading-relaxed resize-y"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className="text-xs px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600 transition-colors"
                        >
                          İptal
                        </button>
                        <button
                          onClick={savePrompt}
                          disabled={saving || !editText.trim()}
                          className="text-xs px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 border border-blue-500 transition-colors disabled:opacity-50"
                        >
                          {saving ? "Kaydediliyor..." : "Kaydet"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 pb-4">
                      <pre className="text-[11px] text-slate-400 font-mono bg-slate-900/60 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                        {p.prompt_text}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })
          )}
          <p className="text-[10px] text-slate-600 text-center pt-2">
            Promptlarda {"{"}değişken{"}"} formatını kullanın. JSON çıktı şablonundaki küme parantezleri {"{"}{"{"} ve {"}"}{"}"}  şeklinde escape edilmelidir.
          </p>
        </div>
      )}
    </div>
  )
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const [page,        setPage]        = useState(0)
  const [selectedBot, setSelectedBot] = useState<number | null>(null)
  const [togglingFilter, setTogglingFilter] = useState<string | null>(null)
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)
  const PAGE_SIZE = 50

  const { data, error, isLoading } = useSWR('/analytics/dashboard', fetcher, { refreshInterval: 15000 })

  const { data: filteredData, isLoading: filteredLoading } = useSWR(
    `/analytics/filtered-signals?action=${activeTab}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
    fetcher,
    { refreshInterval: 20000 }
  )

  // Sinyal araligi analizi icin tum sinyaller (received dahil)
  const { data: allSignalsData, isLoading: allSignalsLoading } = useSWR(
    '/analytics/filtered-signals?action=all&limit=100',
    fetcher,
    { refreshInterval: 30000 }
  )

  // Bots listesi (filtre toggle için)
  const { data: botsData } = useSWR('/bots', fetcher, { refreshInterval: 60000 })
  const bots: any[] = botsData || []

  // Filtre istatistikleri
  const { data: filterStats, mutate: mutateFilterStats } = useSWR(
    `/analytics/filter-stats${selectedBot ? `?bot_id=${selectedBot}` : ""}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  // Seçili botun filtre ayarları
  const { data: botFilters, mutate: mutateBotFilters } = useSWR(
    selectedBot ? `/bots/${selectedBot}/filters` : null,
    fetcher,
    { refreshInterval: 30000 }
  )

  // Bir kez mevcut sinyallerin filtre simülasyonunu ve next_signal sonuçlarını düzelt
  const [filterPatched, setFilterPatched] = useState(false)
  useEffect(() => {
    if (filterPatched) return
    Promise.all([
      api.get('/analytics/patch-filter-markers').catch(() => null),
      api.get('/analytics/fix-next-signal-outcomes').catch(() => null),
    ]).then(() => { setFilterPatched(true); mutateFilterStats() })
  }, [filterPatched])

  const toggleFilter = async (field: string, currentValue: boolean) => {
    if (!selectedBot) return
    setTogglingFilter(field)
    try {
      await api.patch(`/bots/${selectedBot}/filters`, { [field]: !currentValue })
      await mutateBotFilters()
      await mutateFilterStats()
    } catch (e) {
      console.error("Filtre güncelleme hatası:", e)
    } finally {
      setTogglingFilter(null)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  const overview  = data?.overview || {}
  const sessions  = data?.session_performance || []
  const rawStats  = data?.signal_stats || {}

  // ── Sinyal tabanlı metrikler (birincil) ─────────────────────────────────
  const sigResolved  = overview.total_signals_resolved || 0
  const sigWinRate   = overview.signal_win_rate || 0
  const sigTpCount   = overview.signal_tp_count || 0
  const sigSlCount   = overview.signal_sl_count || 0
  const sigPnlPct    = overview.signal_pnl_pct || 0

  // ── Sinyal akış istatistikleri ──────────────────────────────────────────
  const totalSignals   = Object.values(rawStats as Record<string, number>).reduce((a, b) => a + b, 0)
  const receivedCount  = rawStats.received || 0
  const analyzedCount  = rawStats.analyzed || 0
  const blockedCount   = (rawStats.filtered || 0) + (rawStats.rejected || 0)
  const executedCount  = rawStats.executed || 0

  const filteredItems: any[] = filteredData?.items || []
  const filteredTotal: number = filteredData?.total || 0
  const totalPages = Math.ceil(filteredTotal / PAGE_SIZE)

  const pct = (val: number) => totalSignals > 0 ? (val / totalSignals) * 100 : 0

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Başlık */}
      <div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
          Analiz ve Performans Paneli
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Botların genel performansı, seans analizi ve akıllı filtre metrikleri
        </p>
      </div>

      {error && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 p-3 rounded-xl text-sm flex items-center gap-2">
          <span>⚠</span>
          <span>Bazı analiz verileri yüklenemedi — sayfa kısmi verilerle gösteriliyor. Sayfayı yenileyerek tekrar deneyin.</span>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm">
          <div className="text-slate-400 text-sm font-medium mb-1">Sonuclanan Sinyal</div>
          <div className="text-3xl font-bold text-white">
            {sigResolved > 0 ? sigResolved : <span className="text-slate-600">—</span>}
          </div>
          {sigResolved > 0 ? (
            <div className="text-xs text-slate-500 mt-1">{sigTpCount} TP / {sigSlCount} SL</div>
          ) : (
            <div className="text-xs text-slate-600 mt-1">TP veya SL ile biten sinyal yok</div>
          )}
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent pointer-events-none"></div>
          <div className="text-slate-400 text-sm font-medium mb-1">Kazanma Orani (Win Rate)</div>
          {sigResolved > 0 ? (
            <>
              <div className="text-3xl font-bold text-green-400">%{sigWinRate}</div>
              <div className="text-xs text-slate-500 mt-1">{sigTpCount} TP kazandi / {sigSlCount} SL kaybetti</div>
            </>
          ) : (
            <div className="text-3xl font-bold text-slate-600">—</div>
          )}
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-br ${sigPnlPct >= 0 ? 'from-blue-500/10' : 'from-red-500/10'} to-transparent pointer-events-none`}></div>
          <div className="text-slate-400 text-sm font-medium mb-1">Toplam PnL</div>
          {sigResolved > 0 ? (
            <div className={`text-3xl font-bold ${sigPnlPct >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
              %{sigPnlPct > 0 ? '+' : ''}{sigPnlPct}
            </div>
          ) : (
            <div className="text-3xl font-bold text-slate-600">—</div>
          )}
          {sigResolved > 0 && <div className="text-xs text-slate-500 mt-1">Sinyal bazli toplam</div>}
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm">
          <div className="text-slate-400 text-sm font-medium mb-1">Gelen Sinyal</div>
          <div className="text-3xl font-bold text-orange-400">
            {totalSignals > 0 ? totalSignals : <span className="text-slate-600">—</span>}
          </div>
          {totalSignals > 0 ? (
            <div className="text-xs text-slate-500 mt-1">
              {analyzedCount > 0 && <span>{analyzedCount} analiz </span>}
              {receivedCount > 0 && <span className="text-amber-400">· {receivedCount} bekliyor </span>}
              {executedCount > 0 && <span>· {executedCount} islem </span>}
              {blockedCount > 0 && <span>· {blockedCount} red</span>}
            </div>
          ) : (
            <div className="text-xs text-slate-600 mt-1">Webhook sinyali bekleniyor</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Session Performance */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Market Seansı Performansı
          </h2>
          <div className="space-y-6">
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">Henüz yeterli işlem verisi yok</div>
            ) : (
              sessions.map((sess: any) => (
                <div key={sess.session}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium text-slate-300 capitalize">{sess.session || "Belirsiz"} Seansı</span>
                    <span className={sess.pnl >= 0 ? "text-green-400" : "text-red-400"}>
                      %{sess.pnl > 0 ? '+' : ''}{sess.pnl} (Win: %{sess.win_rate.toFixed(1)})
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div className="bg-green-500 h-full transition-all duration-1000" style={{ width: `${sess.win_rate}%` }}></div>
                    <div className="bg-red-500 h-full transition-all duration-1000" style={{ width: `${100 - sess.win_rate}%` }}></div>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 text-right">{sess.trades} İşlem</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Signal Funnel */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm flex flex-col">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Sinyal İşleme Hunisi (Funnel)
          </h2>
          
          <div className="flex-1 flex flex-col justify-center">
            {totalSignals === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <div className="text-4xl mb-3">📡</div>
                <div className="text-sm font-medium text-slate-400">Henüz sinyal gelmedi</div>
                <div className="text-xs mt-1">TradingView webhook tetiklenince veriler burada görünecek</div>
              </div>
            ) : (
              <div className="space-y-6">
                {[
                  {
                    label: "Gelen Toplam Sinyal",
                    val: totalSignals,
                    desc: "TradingView'den alinan tum sinyaller",
                    bg: "bg-gradient-to-r from-blue-600/40 to-blue-400/20",
                    border: "border-blue-500/50",
                    text: "text-blue-200",
                    icon: "📥",
                    width: 100
                  },
                  analyzedCount > 0 && {
                    label: "Analiz Edildi",
                    val: analyzedCount,
                    desc: "RSI/ATR/EMA200 + AI filtre analizi tamamlandi",
                    bg: "bg-gradient-to-r from-sky-600/40 to-sky-400/20",
                    border: "border-sky-500/50",
                    text: "text-sky-200",
                    icon: "📊",
                    width: (analyzedCount / totalSignals) * 100
                  },
                  receivedCount > 0 && {
                    label: "Analiz Bekliyor",
                    val: receivedCount,
                    desc: "Henuz analiz edilmemis — Toplu Analiz ile isleyin",
                    bg: "bg-gradient-to-r from-amber-600/40 to-amber-400/20",
                    border: "border-amber-500/50",
                    text: "text-amber-200",
                    icon: "⏳",
                    width: (receivedCount / totalSignals) * 100
                  },
                  executedCount > 0 && {
                    label: "Isleme Alindi",
                    val: executedCount,
                    desc: "Piyasada aktif pozisyona donustu",
                    bg: "bg-gradient-to-r from-green-600/40 to-green-400/20",
                    border: "border-green-500/50",
                    text: "text-green-200",
                    icon: "✅",
                    width: (executedCount / totalSignals) * 100
                  },
                  blockedCount > 0 && {
                    label: "Reddedilen (Akilli Koruma)",
                    val: blockedCount,
                    desc: "Filtreler tarafindan engellendi",
                    bg: "bg-gradient-to-r from-red-600/40 to-red-400/20",
                    border: "border-red-500/50",
                    text: "text-red-200",
                    icon: "🛡️",
                    width: (blockedCount / totalSignals) * 100
                  },
                ].filter(Boolean).map((row: any, idx: number) => (
                  <div key={row.label} className="relative group">
                    {idx > 0 && (
                      <div className="absolute -top-6 left-8 w-px h-6 bg-slate-700/50" />
                    )}
                    <div className={`relative overflow-hidden rounded-xl border ${row.border} bg-slate-800/30 p-4 transition-all hover:bg-slate-800/50`}>
                      <div
                        className={`absolute top-0 left-0 bottom-0 ${row.bg} transition-all duration-1000 ease-out`}
                        style={{ width: `${Math.max(row.width, 2)}%` }}
                      />
                      <div className="relative flex items-center justify-between z-10">
                        <div className="flex items-center gap-4">
                          <div className="text-2xl bg-slate-900/50 p-2 rounded-lg border border-slate-700/50 shadow-inner">
                            {row.icon}
                          </div>
                          <div>
                            <div className={`font-semibold ${row.text} text-lg drop-shadow-md`}>{row.label}</div>
                            <div className="text-xs text-slate-400 mt-0.5">{row.desc}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-white drop-shadow-md">{row.val}</div>
                          {row.width > 0 && row.width < 100 && (
                            <div className={`text-xs font-medium ${row.text} mt-0.5`}>%{row.width.toFixed(1)}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Filtre Performans Analizi ─────────────────────────────────────── */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              🧪 Akıllı Filtre Performansı
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pasif analiz sinyallerinden hesaplanır.
              <span className="text-slate-400"> Doğru engel</span> = SL olurdu (zarar önlendi) &nbsp;·&nbsp;
              <span className="text-slate-400"> Yanlış engel</span> = TP olurdu (kâr kaçırıldı)
            </p>
          </div>

          {/* Bot seçici */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-500">Bot:</span>
            <select
              value={selectedBot ?? ""}
              onChange={(e: { target: { value: string } }) => setSelectedBot(e.target.value ? Number(e.target.value) : null)}
              className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300 focus:outline-none focus:border-slate-500"
            >
              <option value="">Tüm Botlar</option>
              {bots.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {filterStats && (
              <span className="text-[10px] text-slate-600 whitespace-nowrap">
                {filterStats.analyzed_with_outcome} sonuçlanan sinyal
              </span>
            )}
          </div>
        </div>

        {/* Baseline (filtre geçen sinyaller) */}
        {filterStats?.baseline && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700">
            <span className="text-sm">✅</span>
            <div>
              <span className="text-xs font-medium text-slate-300">Tüm Filtreleri Geçen Sinyaller — Baseline Win Rate: </span>
              {filterStats.baseline.executed_win_rate != null ? (
                <span className={`text-sm font-bold ${filterStats.baseline.executed_win_rate >= 50 ? "text-green-400" : "text-red-400"}`}>
                  %{filterStats.baseline.executed_win_rate}
                </span>
              ) : (
                <span className="text-xs text-slate-600">veri yok</span>
              )}
              <span className="text-[10px] text-slate-600 ml-2">({filterStats.baseline.executed_total} işlem)</span>
            </div>
          </div>
        )}

        {/* Filtre kartları */}
        {!filterStats ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-slate-500"></div>
          </div>
        ) : filterStats.analyzed_with_outcome === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">
            <div className="text-3xl mb-2">📊</div>
            Henüz sonuçlanmış pasif analiz sinyali yok.<br/>
            <span className="text-xs">Botu durdurulmuş modda bırakın, TradingView sinyalleri analiz edilip TP/SL takibe alınsın.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(filterStats.filter_stats as any[]).map((f: any) => {
              const isEnabled = botFilters ? !!botFilters[f.field] : null
              const toggling  = togglingFilter === f.field
              const hasData   = f.hyp_total > 0
              const accuracy  = f.accuracy

              // Renk: doğruluk oranına göre
              const accuracyColor = !hasData ? "text-slate-600"
                : accuracy >= 65 ? "text-green-400"
                : accuracy >= 45 ? "text-yellow-400"
                : "text-red-400"

              const barColor = !hasData ? "bg-slate-700"
                : accuracy >= 65 ? "bg-green-500"
                : accuracy >= 45 ? "bg-yellow-500"
                : "bg-red-500"

              const rec = f.recommendation
              const recBadge = rec === "keep_on"
                ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">✓ Açık tut</span>
                : rec === "keep_off"
                ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">✗ Kapat önerisi</span>
                : <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-500 border border-slate-600">— Nötr</span>

              return (
                <div key={f.id} className={`p-4 rounded-xl border transition-colors ${
                  isEnabled === true  ? "border-blue-500/30 bg-blue-500/5" :
                  isEnabled === false ? "border-slate-700 bg-slate-800/30 opacity-60" :
                  "border-slate-700 bg-slate-800/30"
                }`}>
                  {/* Başlık + Toggle */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">{f.icon}</span>
                      <span className="text-sm font-medium text-slate-200">{f.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {recBadge}
                      {selectedBot && isEnabled !== null && (
                        <button
                          onClick={() => toggleFilter(f.field, isEnabled)}
                          disabled={toggling}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            isEnabled ? "bg-blue-600" : "bg-slate-600"
                          } ${toggling ? "opacity-50" : ""}`}
                          title={isEnabled ? "Filtreyi kapat" : "Filtreyi aç"}
                        >
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            isEnabled ? "translate-x-4.5" : "translate-x-0.5"
                          }`} />
                        </button>
                      )}
                      {!selectedBot && (
                        <span className="text-[9px] text-slate-600">bot seç</span>
                      )}
                    </div>
                  </div>

                  {/* Doğruluk barı */}
                  {hasData ? (
                    <>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-500">Engel Doğruluğu</span>
                        <span className={`font-bold text-sm ${accuracyColor}`}>
                          %{accuracy ?? "—"}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden mb-3">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                          style={{ width: `${accuracy ?? 0}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-base font-bold text-white">{f.hyp_total}</div>
                          <div className="text-[10px] text-slate-500">Toplam Engel</div>
                        </div>
                        <div>
                          <div className="text-base font-bold text-green-400">{f.correct_block}</div>
                          <div className="text-[10px] text-slate-500">Doğru (SL önlendi)</div>
                        </div>
                        <div>
                          <div className="text-base font-bold text-red-400">{f.wrong_block}</div>
                          <div className="text-[10px] text-slate-500">Yanlış (TP kaçırıldı)</div>
                        </div>
                      </div>
                      {f.passed_win_rate != null && (
                        <div className="mt-3 pt-3 border-t border-slate-700/50 text-[11px] text-slate-400">
                          Filtre geçen sinyallerde win rate:
                          <span className={`font-bold ml-1 ${f.passed_win_rate >= 50 ? "text-green-400" : "text-red-400"}`}>
                            %{f.passed_win_rate}
                          </span>
                          <span className="text-slate-600 ml-1">({f.passed_total} sinyal)</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-slate-600 italic pt-1">
                      {(f.analyzed_blocks || 0) > 0 ? (
                        <span className="not-italic text-slate-400">
                          {f.analyzed_blocks} analizde engel tespit edildi
                          {f.actual_blocks > 0 && <span className="text-slate-500"> · {f.actual_blocks} gercek engel</span>}
                          <span className="block text-[10px] text-slate-600 mt-0.5">TP/SL sonucu bekleniyor</span>
                        </span>
                      ) : (
                        <>
                          Henuz analiz verisi yok
                          {f.actual_blocks > 0 && (
                            <span className="ml-1 not-italic text-slate-500">
                              · {f.actual_blocks} gercek engel kaydi
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Canlı Pozisyon Grafiği ─────────────────────────────────────── */}
      <LivePositionChart botId={selectedBot} />

      {/* ── AI TP/SL Öneri + Sinyal Aralığı Analizi ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AiSuggestCard botId={selectedBot} />
        <SignalRangeSection items={allSignalsData?.items || []} isLoading={allSignalsLoading} />
      </div>

      {/* ── AI Prompt Yönetimi ───────────────────────────────────────────── */}
      <AiPromptEditor />

      {/* ── Sinyal Detay Tablosu ──────────────────────────────────────────── */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span>📋</span>
            Sinyal Geçmişi
            <span className="ml-2 text-sm font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
              {filteredTotal} kayıt
            </span>
          </h2>

          {/* Tab filtreleri + Toplu Analiz */}
          <div className="flex gap-2 text-sm items-center">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setPage(0) }}
                className={`px-3 py-1.5 rounded-lg border font-medium transition-all ${
                  activeTab === tab.key ? tab.color : "text-slate-500 border-slate-700 bg-slate-900 hover:text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <button
              onClick={async () => {
                setBulkAnalyzing(true)
                setBulkResult(null)
                try {
                  const res = await api.post('/analytics/bulk-reanalyze', {})
                  setBulkResult(`${res.queued} sinyal analiz kuyruğuna alındı`)
                } catch (e: any) {
                  setBulkResult("Hata: " + (e?.message || "bilinmeyen"))
                } finally {
                  setBulkAnalyzing(false)
                }
              }}
              disabled={bulkAnalyzing}
              className="px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 font-medium transition-all disabled:opacity-50"
            >
              {bulkAnalyzing ? "Analiz ediliyor..." : "Toplu Analiz"}
            </button>
            {bulkResult && (
              <span className="text-xs text-amber-400">{bulkResult}</span>
            )}
          </div>
        </div>

        {filteredLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-slate-400"></div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-sm">Bu kategoride sinyal kaydı yok.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {filteredItems.map((item: any) => {
                const isLong = item.signal_type === "buy"
                const fmtPrice = (v: number | null) => v != null ? `$${Number(v).toLocaleString("tr-TR", {maximumFractionDigits: 2})}` : "—"
                const fmtDur = (min: number | null) => {
                  if (min == null) return null
                  if (min < 60) return `${min}dk`
                  return `${Math.floor(min / 60)}s ${Math.round(min % 60)}dk`
                }
                const d = new Date(item.created_at)
                const timeStr = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }) +
                  " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })

                // Durum badge
                const statusBadge = item.action === "executed"
                  ? <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-green-500/10 text-green-300 border-green-500/30">✅ İşleme Alındı</span>
                  : item.action === "filtered"
                  ? <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-red-500/10 text-red-300 border-red-500/30">❌ Filtrelendi</span>
                  : item.action === "analyzed"
                  ? <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-blue-500/10 text-blue-300 border-blue-500/30">📊 Analiz Edildi</span>
                  : item.action === "received"
                  ? <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse">⏳ Analiz Bekliyor</span>
                  : item.action === "error"
                  ? <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-orange-500/10 text-orange-300 border-orange-500/30">⚠️ Hata</span>
                  : <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-red-500/10 text-red-300 border-red-500/30">❌ Reddedildi</span>

                // Outcome badge — tüm sinyallerde göster (open dahil)
                const outcomeBadge = !item.outcome ? null
                  : item.outcome === "tp_hit"
                  ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-400 border border-green-500/30">✓ TP{item.outcome_pnl_pct != null ? ` +${item.outcome_pnl_pct}%` : ""}</span>
                  : item.outcome === "sl_hit"
                  ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 border border-red-500/30">✕ SL{item.outcome_pnl_pct != null ? ` ${item.outcome_pnl_pct}%` : ""}</span>
                  : item.outcome === "next_signal"
                  ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">↻ Sinyalle Kapandı{item.outcome_pnl_pct != null ? ` ${item.outcome_pnl_pct >= 0 ? "+" : ""}${item.outcome_pnl_pct}%` : ""}</span>
                  : item.outcome === "expired"
                  ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/50 text-slate-400 border border-slate-700">○ Süresi Doldu{item.outcome_pnl_pct != null ? ` ${item.outcome_pnl_pct >= 0 ? "+" : ""}${item.outcome_pnl_pct}%` : ""}</span>
                  : item.outcome === "open"
                  ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/15 text-blue-400 border border-blue-500/25 animate-pulse">● Takipte</span>
                  : null

                return (
                  <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-800/20 hover:bg-slate-800/40 transition-colors p-4">
                    {/* Satır 1: Sembol, Yön, Durum, Fiyatlar */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-mono font-bold text-white text-sm">
                        {item.symbol.replace("/USDT:USDT", "USDT.P").replace("/", "")}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                        isLong ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"
                      }`}>
                        {isLong ? "▲ LONG" : "▼ SHORT"}
                      </span>
                      {item.timeframe && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-700/50 text-slate-300 border border-slate-600/40">
                          {item.timeframe}
                        </span>
                      )}
                      {statusBadge}
                      {outcomeBadge}
                      <span className="ml-auto text-[11px] text-slate-500">{timeStr}</span>
                      {fmtDur(item.duration_minutes) && (
                        <span className="text-[10px] text-slate-600 font-mono">{fmtDur(item.duration_minutes)}</span>
                      )}
                    </div>

                    {/* Satır 2: Fiyatlar + Göstergeler */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono mb-2">
                      <span className="text-slate-400">Giriş: <span className="text-slate-200">{fmtPrice(item.price)}</span></span>
                      <span className="text-slate-400">TP: <span className="text-green-400">{fmtPrice(item.tp_price)}</span></span>
                      <span className="text-slate-400">SL: <span className="text-red-400">{fmtPrice(item.sl_price)}</span></span>
                      {item.rsi_14 != null && (
                        <span className="text-slate-400">RSI: <span className={item.rsi_14 > 70 ? "text-red-400" : item.rsi_14 < 30 ? "text-green-400" : "text-slate-300"}>{item.rsi_14.toFixed(1)}</span></span>
                      )}
                      {item.volatility_atr != null && (
                        <span className="text-slate-400">ATR: <span className="text-slate-300">{item.volatility_atr.toFixed(4)}</span></span>
                      )}
                      {item.ema200_dist != null && (
                        <span className="text-slate-400">EMA200: <span className={item.ema200_dist >= 0 ? "text-green-400" : "text-red-400"}>{item.ema200_dist >= 0 ? "+" : ""}{item.ema200_dist.toFixed(2)}%</span></span>
                      )}
                    </div>

                    {/* Satır 3: Filtre Ozet Badges */}
                    {item.filter_analysis && (() => {
                      const lines = (item.filter_analysis as string).split(" | ")
                      const badges: {icon: string; name: string; pass: boolean | null; off?: boolean; detail?: string}[] = []

                      const parseBadge = (lc: string, line: string, icon: string, name: string) => {
                        const isOff = lc.includes("kapalı")
                        // "kapalı, ✓ geçerdi" veya "kapalı, ✗ kalırdı" — simülasyon sonucunu oku
                        const wouldPass = lc.includes("geçerdi") || lc.includes("geçti")
                        const wouldBlock = lc.includes("kalırdı") || lc.includes("engel")
                        const pass = wouldPass ? true : wouldBlock ? false : lc.includes("✓")
                        badges.push({ icon, name, pass: isOff && !wouldPass && !wouldBlock ? null : pass, off: isOff })
                      }

                      for (const line of lines) {
                        const lc = line.toLowerCase()
                        if (lc.includes("haber[") && !lc.includes("ai haber")) {
                          parseBadge(lc, line, "📰", "Haber")
                        } else if (lc.includes("saat[")) {
                          parseBadge(lc, line, "🕐", "Saat")
                        } else if (lc.includes("volatilite[")) {
                          parseBadge(lc, line, "⚡", "Vol")
                        } else if (lc.includes("trend[") && !lc.includes("ai trend")) {
                          parseBadge(lc, line, "📈", "Trend")
                        } else if (lc.includes("ai haber[")) {
                          badges.push({ icon: "🤖📰", name: "AI Haber", pass: !lc.includes("engel") })
                        } else if (lc.includes("ai öz-öğrenme[") || lc.includes("ai öz-ögrenme[") || lc.includes("öz-öğrenme[")) {
                          badges.push({ icon: "🤖🧠", name: "AI Ogrenme", pass: !lc.includes("engel") })
                        } else if (lc.includes("ai trend[")) {
                          badges.push({ icon: "🤖📈", name: "AI Trend", pass: !lc.includes("engel") })
                        }
                      }
                      if (badges.length === 0) return null
                      return (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {badges.map((b, i) => (
                            <span key={i} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                              b.pass === null ? "bg-slate-700/30 text-slate-500 border-slate-700/40" :
                              b.pass ? "bg-green-500/10 text-green-400 border-green-500/30" :
                              "bg-red-500/10 text-red-400 border-red-500/30"
                            }`}>
                              {b.icon} {b.name} {b.pass === null ? "—" : b.pass ? "✓" : "✗"}
                              {b.off && <span className="text-[8px] opacity-50 ml-0.5">(off)</span>}
                            </span>
                          ))}
                        </div>
                      )
                    })()}

                    {/* Satır 4: Neden badge + Filtre Detay */}
                    {(item.reason_labels?.length > 0 || item.filter_analysis || item.reason_description || item.reject_reason) && (
                      <div className="pt-2 border-t border-slate-800/60">
                        {item.reason_labels?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {item.reason_labels.map((lbl: any, i: number) => (
                              <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border font-medium ${COLOR_MAP[lbl.color] || COLOR_MAP.gray}`}>
                                {lbl.icon} {lbl.label}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.reason_description && (
                          <p className="text-[11px] text-slate-300 mb-1">{item.reason_description}</p>
                        )}
                        {item.filter_analysis ? (
                          <div className="space-y-0.5">
                            {item.filter_analysis.split(" | ").map((line: string, i: number) => {
                              // "kapalı, geçerdi" veya "kapalı, kalırdı" olan satırlarda sonucu vurgula
                              const isKapaliLine = line.includes("kapalı")
                              const wouldPass = isKapaliLine && line.includes("geçerdi")
                              const wouldBlock = isKapaliLine && line.includes("kalırdı")

                              const cls =
                                line.startsWith("🤖") && line.includes("ENGEL") ? "text-red-400 font-medium bg-red-500/5 px-1 rounded" :
                                line.startsWith("🤖") ? "text-purple-400/90 bg-purple-500/5 px-1 rounded" :
                                line.startsWith("   ") ? "text-slate-400/70 pl-3 text-[10px]" :
                                line.includes("ENGEL") ? "text-red-400/80" :
                                line.includes("✓") || line.includes("geçti") ? "text-green-400/60" :
                                wouldPass ? "text-slate-400" :
                                wouldBlock ? "text-yellow-500/70" :
                                isKapaliLine ? "text-slate-500" :
                                "text-slate-500"

                              if (isKapaliLine && (wouldPass || wouldBlock)) {
                                // "📰 Haber[— kapalı, geçerdi]" → renkli gösterim
                                const parts = line.split(", ")
                                return (
                                  <p key={i} className="text-[11px] text-slate-500">
                                    {parts[0] + ", "}
                                    <span className={wouldPass ? "text-green-400/70 font-medium" : "text-yellow-400/80 font-medium"}>
                                      {wouldPass ? "✓ geçerdi" : "✗ kalırdı"}
                                    </span>
                                    {parts.length > 2 ? "]" : ""}
                                  </p>
                                )
                              }

                              return (
                                <p key={i} className={`text-[11px] ${cls}`}>
                                  {line}
                                </p>
                              )
                            })}
                          </div>
                        ) : item.reject_reason ? (
                          <span className="font-mono text-slate-600 text-[10px]">{item.reject_reason}</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
                <span className="text-xs text-slate-500">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredTotal)} / {filteredTotal} kayıt
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    ← Önceki
                  </button>
                  <span className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-400">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Sonraki →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
