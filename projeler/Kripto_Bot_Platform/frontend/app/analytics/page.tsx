"use client"

import { useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"

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
  { key: "blocked",  label: "Reddedildi",   color: "text-red-400   border-red-500/60   bg-red-500/10"  },
  { key: "executed", label: "Onaylandı",    color: "text-green-400 border-green-500/60 bg-green-500/10"},
  { key: "analyzed", label: "Pasif Analiz", color: "text-sky-400   border-sky-500/60   bg-sky-500/10"  },
  { key: "all",      label: "Tümü",         color: "text-slate-300 border-slate-600    bg-slate-800"   },
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
  // Sadece executed + outcome var olanları göster
  const rangeItems = items.filter((it: any) =>
    it.action === "executed" && it.max_price_in_range != null
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

      {/* Sinyal tablosu */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase tracking-wider">
              <th className="text-left pb-2 pr-3 whitespace-nowrap">Zaman</th>
              <th className="text-left pb-2 pr-3">Yön</th>
              <th className="text-right pb-2 pr-3 whitespace-nowrap">Giriş</th>
              <th className="text-right pb-2 pr-3 whitespace-nowrap">TP Hedef</th>
              <th className="text-right pb-2 pr-3 whitespace-nowrap">SL Hedef</th>
              <th className="text-right pb-2 pr-3 whitespace-nowrap">Max Yüksek</th>
              <th className="text-right pb-2 pr-3 whitespace-nowrap">Min Düşük</th>
              <th className="text-right pb-2 pr-3 whitespace-nowrap">Çıkış</th>
              <th className="text-right pb-2 pr-3 whitespace-nowrap">PnL</th>
              <th className="text-right pb-2 pr-3 whitespace-nowrap">Max Potansiyel</th>
              <th className="text-left pb-2 pr-3 whitespace-nowrap">Sonuç</th>
              <th className="text-left pb-2 min-w-[180px]">Fiyat Aralığı</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {rangeItems.map((item: any) => {
              const isLong = item.signal_type === "buy"
              const outcomeColor =
                item.outcome === "tp_hit"     ? "text-green-400 bg-green-500/10 border-green-500/20" :
                item.outcome === "sl_hit"     ? "text-red-400 bg-red-500/10 border-red-500/20" :
                item.outcome === "next_signal"? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" :
                                                "text-slate-400 bg-slate-700/30 border-slate-700"
              const outcomeLabel =
                item.outcome === "tp_hit"      ? "✓ TP Vurdu" :
                item.outcome === "sl_hit"      ? "✕ SL Vurdu" :
                item.outcome === "next_signal" ? "→ Sinyalle Kapandı" :
                item.outcome || "Açık"
              const d = new Date(item.created_at)
              const timeStr = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }) +
                " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })

              return (
                <tr key={item.id} className="hover:bg-slate-800/20 transition-colors align-middle">
                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{timeStr}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-1.5 py-0.5 rounded font-semibold border whitespace-nowrap ${
                      isLong ? "text-green-400 bg-green-500/10 border-green-500/20"
                              : "text-red-400 bg-red-500/10 border-red-500/20"
                    }`}>
                      {isLong ? "▲ LONG" : "▼ SHORT"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-slate-200">{fmt(item.price)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-green-400">{fmt(item.tp_price)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-red-400">{fmt(item.sl_price)}</td>
                  <td className="py-2 pr-3 text-right font-mono">
                    <span className={item.tp_was_reachable ? "text-green-300 font-semibold" : "text-slate-400"}>
                      {fmt(item.max_price_in_range)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    <span className={item.sl_was_hit ? "text-red-300 font-semibold" : "text-slate-400"}>
                      {fmt(item.min_price_in_range)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-yellow-400">{fmt(item.outcome_price)}</td>
                  <td className="py-2 pr-3 text-right font-mono">
                    <span className={
                      item.outcome_pnl_pct == null ? "text-slate-600" :
                      item.outcome_pnl_pct > 0 ? "text-green-400" : "text-red-400"
                    }>
                      {fmtPct(item.outcome_pnl_pct)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-blue-400 font-semibold">
                    {fmtPct(item.max_favorable_pct)}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] whitespace-nowrap ${outcomeColor}`}>
                      {outcomeLabel}
                    </span>
                    <div className="mt-0.5 flex gap-1">
                      {item.tp_was_reachable && <span className="text-[9px] text-green-500">TP ✓</span>}
                      {item.sl_was_hit && <span className="text-[9px] text-red-500">SL ✕</span>}
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    <PriceRangeBar item={item} />
                    <div className="flex justify-between mt-0.5 text-[9px] text-slate-600">
                      <span>{fmt(item.min_price_in_range)}</span>
                      <span>{fmt(item.max_price_in_range)}</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
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
            <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
              {[
                { label: 'Fav P25', val: data.distribution.fav_p25, color: 'text-green-500/70' },
                { label: 'Fav P50', val: data.distribution.fav_p50, color: 'text-green-400' },
                { label: 'Fav P75', val: data.distribution.fav_p75, color: 'text-green-300' },
                { label: 'Adv P25', val: data.distribution.adv_p25, color: 'text-red-400' },
                { label: 'Adv P50', val: data.distribution.adv_p50, color: 'text-red-500/70' },
              ].map(d => (
                <div key={d.label} className="p-2 rounded-lg bg-slate-800/50">
                  <div className={`font-bold ${d.color}`}>%{d.val}</div>
                  <div className="text-slate-600 mt-0.5">{d.label}</div>
                </div>
              ))}
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
  const [activeTab,   setActiveTab]   = useState<TabKey>("all")
  const [page,        setPage]        = useState(0)
  const [selectedBot, setSelectedBot] = useState<number | null>(null)
  const [togglingFilter, setTogglingFilter] = useState<string | null>(null)
  const PAGE_SIZE = 20

  const { data, error, isLoading } = useSWR('/analytics/dashboard', fetcher, { refreshInterval: 15000 })

  const { data: filteredData, isLoading: filteredLoading } = useSWR(
    `/analytics/filtered-signals?action=${activeTab}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
    fetcher,
    { refreshInterval: 20000 }
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

  if (error) {
    return (
      <div className="p-4 md:p-8">
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl">
          Analiz verileri yüklenirken bir hata oluştu.
        </div>
      </div>
    )
  }

  const overview  = data?.overview || { total_trades: 0, win_rate: 0, total_pnl: 0, winning_trades: 0, losing_trades: 0 }
  const sessions  = data?.session_performance || []
  const rawStats  = data?.signal_stats || {}

  // ── Doğru toplam hesabı: tüm action türlerinin toplamı ──────────────────
  const totalSignals   = Object.values(rawStats as Record<string, number>).reduce((a, b) => a + b, 0)
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

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm">
          <div className="text-slate-400 text-sm font-medium mb-1">Toplam İşlem</div>
          <div className="text-3xl font-bold text-white">
            {overview.total_trades > 0 ? overview.total_trades : <span className="text-slate-600">—</span>}
          </div>
          {overview.total_trades === 0 && <div className="text-xs text-slate-600 mt-1">Henüz işlem yok</div>}
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent pointer-events-none"></div>
          <div className="text-slate-400 text-sm font-medium mb-1">Kazanma Oranı (Win Rate)</div>
          {overview.total_trades > 0 ? (
            <>
              <div className="text-3xl font-bold text-green-400">%{overview.win_rate}</div>
              <div className="text-xs text-slate-500 mt-1">{overview.winning_trades} Kâr / {overview.losing_trades} Zarar</div>
            </>
          ) : (
            <div className="text-3xl font-bold text-slate-600">—</div>
          )}
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-br ${overview.total_pnl >= 0 ? 'from-blue-500/10' : 'from-red-500/10'} to-transparent pointer-events-none`}></div>
          <div className="text-slate-400 text-sm font-medium mb-1">Toplam PnL</div>
          {overview.total_trades > 0 ? (
            <div className={`text-3xl font-bold ${overview.total_pnl >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
              ${overview.total_pnl}
            </div>
          ) : (
            <div className="text-3xl font-bold text-slate-600">—</div>
          )}
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm">
          <div className="text-slate-400 text-sm font-medium mb-1">Gelen Sinyal</div>
          <div className="text-3xl font-bold text-orange-400">
            {totalSignals > 0 ? totalSignals : <span className="text-slate-600">—</span>}
          </div>
          {totalSignals > 0 ? (
            <div className="text-xs text-slate-500 mt-1">{blockedCount} reddedildi · {executedCount} onaylandı</div>
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
                      ${sess.pnl} (Win: %{sess.win_rate.toFixed(1)})
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
                    desc: "TradingView'den al\u0131nan ham sinyaller",
                    bg: "bg-gradient-to-r from-blue-600/40 to-blue-400/20",
                    border: "border-blue-500/50",
                    text: "text-blue-200",
                    icon: "\uD83D\uDCE5",
                    width: 100
                  },
                  blockedCount > 0 && {
                    label: "Reddedilen (Ak\u0131ll\u0131 Koruma)",
                    val: blockedCount,
                    desc: "Filtreler taraf\u0131ndan engellendi",
                    bg: "bg-gradient-to-r from-red-600/40 to-red-400/20",
                    border: "border-red-500/50",
                    text: "text-red-200",
                    icon: "\uD83D\uDEE1\uFE0F",
                    width: (blockedCount / totalSignals) * 100
                  },
                  executedCount > 0 && {
                    label: "Onaylanan (\u0130\u015Fleme Al\u0131nd\u0131)",
                    val: executedCount,
                    desc: "Piyasada aktif pozisyona d\u00F6n\u00FC\u015Ft\u00FC",
                    bg: "bg-gradient-to-r from-green-600/40 to-green-400/20",
                    border: "border-green-500/50",
                    text: "text-green-200",
                    icon: "\u2705",
                    width: (executedCount / totalSignals) * 100
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
                      Henüz analiz verisi yok
                      {f.actual_blocks > 0 && (
                        <span className="ml-1 not-italic text-slate-500">
                          · {f.actual_blocks} gerçek engel kaydı
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── AI TP/SL Öneri + Sinyal Aralığı Analizi ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AiSuggestCard botId={selectedBot} />
        <SignalRangeSection items={filteredData?.items || []} isLoading={filteredLoading} />
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

          {/* Tab filtreleri */}
          <div className="flex gap-2 text-sm">
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
                  ? <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-green-500/10 text-green-300 border-green-500/30">✅ Onaylandı</span>
                  : item.action === "filtered"
                  ? <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-red-500/10 text-red-300 border-red-500/30">❌ Filtrelendi</span>
                  : item.action === "analyzed"
                  ? <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-blue-500/10 text-blue-300 border-blue-500/30">📊 Pasif Analiz</span>
                  : item.action === "error"
                  ? <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-orange-500/10 text-orange-300 border-orange-500/30">⚠️ Hata</span>
                  : <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-red-500/10 text-red-300 border-red-500/30">❌ Reddedildi</span>

                // Outcome badge
                const outcomeBadge = !item.outcome || item.outcome === "open" ? null
                  : item.outcome === "tp_hit"
                  ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-400 border border-green-500/30">✓ TP{item.outcome_pnl_pct != null ? ` +${item.outcome_pnl_pct}%` : ""}</span>
                  : item.outcome === "sl_hit"
                  ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 border border-red-500/30">✕ SL{item.outcome_pnl_pct != null ? ` ${item.outcome_pnl_pct}%` : ""}</span>
                  : <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/50 text-slate-400 border border-slate-700">{item.outcome === "expired" ? "○ Süresi Doldu" : "● Takipte"}</span>

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

                    {/* Satır 3: Neden badge + Filtre Analizi */}
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
                            {item.filter_analysis.split(" | ").map((line: string, i: number) => (
                              <p key={i} className={`text-[11px] ${
                                line.startsWith("🤖") && line.includes("ENGEL") ? "text-red-400 font-medium bg-red-500/5 px-1 rounded" :
                                line.startsWith("🤖") ? "text-purple-400/90 bg-purple-500/5 px-1 rounded" :
                                line.startsWith("   ") ? "text-slate-400/70 pl-3 text-[10px]" :
                                line.includes("ENGEL") ? "text-red-400/80" :
                                line.includes("✓") || line.includes("geçti") ? "text-green-400/60" :
                                line.includes("kapalı") ? "text-slate-600" :
                                "text-slate-500"
                              }`}>
                                {line}
                              </p>
                            ))}
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
