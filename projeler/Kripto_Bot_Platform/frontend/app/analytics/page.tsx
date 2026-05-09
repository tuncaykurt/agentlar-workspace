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

export default function AnalyticsPage() {
  const [activeTab,   setActiveTab]   = useState<TabKey>("blocked")
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

  const formatTime = (iso: string | null) => {
    if (!iso) return "—"
    const d = new Date(iso)
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }) +
      " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
  }

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
          <div className="text-3xl font-bold text-white">{overview.total_trades}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent pointer-events-none"></div>
          <div className="text-slate-400 text-sm font-medium mb-1">Kazanma Oranı (Win Rate)</div>
          <div className="text-3xl font-bold text-green-400">%{overview.win_rate}</div>
          <div className="text-xs text-slate-500 mt-1">
            {overview.winning_trades} Kâr / {overview.losing_trades} Zarar
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm relative overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-br ${overview.total_pnl >= 0 ? 'from-blue-500/10' : 'from-red-500/10'} to-transparent pointer-events-none`}></div>
          <div className="text-slate-400 text-sm font-medium mb-1">Toplam PnL</div>
          <div className={`text-3xl font-bold ${overview.total_pnl >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
            ${overview.total_pnl}
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm">
          <div className="text-slate-400 text-sm font-medium mb-1">Reddedilen Sinyal</div>
          <div className="text-3xl font-bold text-red-400">{blockedCount}</div>
          <div className="text-xs text-slate-500 mt-1">Akıllı Filtre Koruması</div>
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

        {/* Signal Funnel — toplam doğru hesaplandı */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Sinyal İşleme Hunisi (Funnel)
          </h2>
          <div className="space-y-4">
            {[
              { label: "Gelen Toplam Sinyal",        val: totalSignals,  color: "bg-slate-600",                                                indent: "" },
              { label: "Reddedilen (Akıllı Koruma)",  val: blockedCount,  color: "bg-red-500/30 border border-red-500/50",                    indent: "pl-4" },
              { label: "Onaylanan (İşleme Alındı)",   val: executedCount, color: "bg-green-500/30 border border-green-500/50",                indent: "pl-8" },
            ].map(row => (
              <div key={row.label} className={`relative ${row.indent}`}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300">{row.label}</span>
                  <span className="font-bold text-white">{row.val}</span>
                </div>
                <div className="h-8 w-full bg-slate-800 rounded-lg overflow-hidden relative">
                  <div
                    className={`absolute top-0 left-0 h-full rounded-lg transition-all duration-1000 ${row.color}`}
                    style={{ width: `${totalSignals > 0 ? pct(row.val) : 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase tracking-wider">
                    <th className="text-left pb-3 pr-3 whitespace-nowrap">Zaman</th>
                    <th className="text-left pb-3 pr-3">Sembol</th>
                    <th className="text-left pb-3 pr-3">Yön</th>
                    <th className="text-left pb-3 pr-3">Periyot</th>
                    <th className="text-left pb-3 pr-3">Durum / Sonuç</th>
                    <th className="text-right pb-3 pr-3 whitespace-nowrap">Giriş</th>
                    <th className="text-right pb-3 pr-3 whitespace-nowrap">TP Hedef</th>
                    <th className="text-right pb-3 pr-3 whitespace-nowrap">SL Hedef</th>
                    <th className="text-right pb-3 pr-3 whitespace-nowrap">Süre</th>
                    <th className="text-left pb-3 pr-3 min-w-[140px]">Neden?</th>
                    <th className="text-left pb-3 pr-3 min-w-[280px]">Filtre Analizi / Açıklama</th>
                    <th className="text-right pb-3 pr-3">RSI</th>
                    <th className="text-right pb-3 pr-3">ATR</th>
                    <th className="text-right pb-3">EMA200%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredItems.map((item: any) => {
                    const isExecuted = item.action === "executed"

                    // Süre gösterimi
                    const fmtDur = (min: number | null) => {
                      if (min == null) return null
                      if (min < 60) return `${min}dk`
                      return `${Math.floor(min / 60)}s ${Math.round(min % 60)}dk`
                    }

                    // Sonuç badge
                    const outcomeEl = (() => {
                      if (!item.outcome || item.outcome === "open") return null
                      if (item.outcome === "tp_hit") return (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30 whitespace-nowrap">
                          ✓ TP{item.outcome_pnl_pct != null ? ` +${item.outcome_pnl_pct}%` : ""}
                        </span>
                      )
                      if (item.outcome === "sl_hit") return (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 whitespace-nowrap">
                          ✕ SL{item.outcome_pnl_pct != null ? ` ${item.outcome_pnl_pct}%` : ""}
                        </span>
                      )
                      return (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 border border-slate-700 whitespace-nowrap">
                          {item.outcome === "expired" ? "○ Süresi Doldu" : "● Takipte"}
                        </span>
                      )
                    })()

                    return (
                      <tr key={item.id} className="hover:bg-slate-800/30 transition-colors align-top">
                        {/* Zaman */}
                        <td className="py-3 pr-3 text-slate-500 whitespace-nowrap text-xs">
                          {formatTime(item.created_at)}
                        </td>

                        {/* Sembol */}
                        <td className="py-3 pr-3 font-mono font-bold text-white whitespace-nowrap text-xs">
                          {item.symbol.replace("/USDT:USDT", "USDT.P").replace("/", "")}
                        </td>

                        {/* Yön */}
                        <td className="py-3 pr-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border whitespace-nowrap ${
                            item.signal_type === "buy"
                              ? "bg-green-500/10 text-green-400 border-green-500/30"
                              : "bg-red-500/10 text-red-400 border-red-500/30"
                          }`}>
                            {item.signal_type === "buy" ? "▲ LONG" : "▼ SHORT"}
                          </span>
                        </td>

                        {/* Periyot */}
                        <td className="py-3 pr-3">
                          {item.timeframe ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-700/50 text-slate-300 border border-slate-600/40 whitespace-nowrap">
                              {item.timeframe}
                            </span>
                          ) : <span className="text-slate-700 text-xs">—</span>}
                        </td>

                        {/* Durum / Sonuç */}
                        <td className="py-3 pr-3">
                          <div className="flex flex-col gap-1">
                            {isExecuted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-green-500/10 text-green-300 border-green-500/30 whitespace-nowrap">
                                ✅ Onaylandı
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-red-500/10 text-red-300 border-red-500/30 whitespace-nowrap">
                                ❌ Reddedildi
                              </span>
                            )}
                            {outcomeEl}
                          </div>
                        </td>

                        {/* Giriş Fiyatı */}
                        <td className="py-3 pr-3 text-right font-mono text-slate-300 whitespace-nowrap text-xs">
                          {item.price != null ? `$${Number(item.price).toLocaleString("tr-TR", {maximumFractionDigits: 2})}` : <span className="text-slate-700">—</span>}
                        </td>

                        {/* TP Hedef */}
                        <td className="py-3 pr-3 text-right font-mono whitespace-nowrap text-xs">
                          {item.tp_price != null ? (
                            <span className="text-green-400">${Number(item.tp_price).toLocaleString("tr-TR", {maximumFractionDigits: 2})}</span>
                          ) : <span className="text-slate-700">—</span>}
                        </td>

                        {/* SL Hedef */}
                        <td className="py-3 pr-3 text-right font-mono whitespace-nowrap text-xs">
                          {item.sl_price != null ? (
                            <span className="text-red-400">${Number(item.sl_price).toLocaleString("tr-TR", {maximumFractionDigits: 2})}</span>
                          ) : <span className="text-slate-700">—</span>}
                        </td>

                        {/* Süre */}
                        <td className="py-3 pr-3 text-right font-mono text-slate-400 whitespace-nowrap text-xs">
                          {fmtDur(item.duration_minutes) ?? <span className="text-slate-700">—</span>}
                        </td>

                        {/* Neden — badge */}
                        <td className="py-3 pr-3">
                          <div className="flex flex-wrap gap-1">
                            {item.reason_labels && item.reason_labels.length > 0 ? (
                              item.reason_labels.map((lbl: any, i: number) => (
                                <span
                                  key={i}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border font-medium whitespace-nowrap ${COLOR_MAP[lbl.color] || COLOR_MAP.gray}`}
                                >
                                  {lbl.icon} {lbl.label}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-600 italic text-xs">—</span>
                            )}
                          </div>
                        </td>

                        {/* Filtre Analizi + Açıklama */}
                        <td className="py-3 pr-3 text-xs leading-relaxed min-w-[280px]">
                          {item.reason_description && (
                            <p className="text-slate-300 mb-1">{item.reason_description}</p>
                          )}
                          {item.filter_analysis ? (
                            <div className="space-y-0.5">
                              {item.filter_analysis.split(" | ").map((line: string, i: number) => (
                                <p key={i} className={
                                  line.includes("ENGEL") ? "text-red-400/80" :
                                  line.includes("✓") ? "text-green-400/60" :
                                  line.includes("kapalı") ? "text-slate-600" :
                                  "text-slate-500"
                                }>
                                  {line}
                                </p>
                              ))}
                            </div>
                          ) : item.reject_reason ? (
                            <span className="font-mono text-slate-600 text-[10px]">{item.reject_reason}</span>
                          ) : (
                            <span className="text-slate-700 italic">—</span>
                          )}
                        </td>

                        {/* RSI */}
                        <td className="py-3 pr-3 text-right font-mono whitespace-nowrap text-xs">
                          {item.rsi_14 != null ? (
                            <span className={
                              item.rsi_14 > 70 ? "text-red-400" :
                              item.rsi_14 < 30 ? "text-green-400" : "text-slate-300"
                            }>
                              {item.rsi_14.toFixed(1)}
                            </span>
                          ) : <span className="text-slate-700">—</span>}
                        </td>

                        {/* ATR */}
                        <td className="py-3 pr-3 text-right font-mono text-slate-400 whitespace-nowrap text-xs">
                          {item.volatility_atr != null ? item.volatility_atr.toFixed(4) : <span className="text-slate-700">—</span>}
                        </td>

                        {/* EMA200 % */}
                        <td className="py-3 text-right font-mono whitespace-nowrap text-xs">
                          {item.ema200_dist != null ? (
                            <span className={item.ema200_dist >= 0 ? "text-green-400" : "text-red-400"}>
                              {item.ema200_dist >= 0 ? "+" : ""}{item.ema200_dist.toFixed(2)}%
                            </span>
                          ) : <span className="text-slate-700">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
