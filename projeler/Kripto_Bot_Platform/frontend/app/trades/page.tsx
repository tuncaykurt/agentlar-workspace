"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"

const fetcher = (path: string) => api.get(path)

// ─────── Trade Kartı ───────
function TradeRow({ t }: { t: any }) {
  const isProfit = (t.pnl || 0) > 0
  const isOpen = t.status === "open"

  return (
    <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50 hover:border-slate-600 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
            t.side === "buy" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
          }`}>
            {t.side?.toUpperCase()}
          </span>
          <span className="text-sm font-medium text-white">{t.symbol}</span>
          {t.leverage_used && (
            <span className="text-xs text-yellow-400">{t.leverage_used}x</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {t.paper && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">PAPER</span>}
          <span className={`text-xs px-2 py-0.5 rounded ${
            isOpen ? "bg-blue-500/20 text-blue-400" :
            t.status === "cancelled" ? "bg-slate-600/50 text-slate-400" :
            "bg-slate-700 text-slate-300"
          }`}>
            {isOpen ? "Açık" : t.status === "cancelled" ? "İptal" : "Kapandı"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div>
          <span className="text-slate-500">Giriş</span>
          <div className="text-white font-medium">${t.entry_price?.toFixed(2)}</div>
        </div>
        <div>
          <span className="text-slate-500">Çıkış</span>
          <div className="text-white font-medium">{t.exit_price ? `$${t.exit_price.toFixed(2)}` : "—"}</div>
        </div>
        <div>
          <span className="text-slate-500">Miktar</span>
          <div className="text-white font-medium">{t.quantity?.toFixed(4)}</div>
        </div>
        <div>
          <span className="text-slate-500">PnL</span>
          <div className={`font-bold ${isOpen ? "text-slate-400" : isProfit ? "text-green-400" : "text-red-400"}`}>
            {t.pnl != null ? `${isProfit ? "+" : ""}$${t.pnl.toFixed(2)}` : "—"}
            {t.pnl_pct != null && <span className="text-[10px] ml-1">({t.pnl_pct > 0 ? "+" : ""}{t.pnl_pct.toFixed(1)}%)</span>}
          </div>
        </div>
      </div>

      {(t.exit_reason || t.duration_minutes || t.session_type) && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {t.exit_reason && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              t.exit_reason === "tp" ? "bg-green-500/20 text-green-400" :
              t.exit_reason === "sl" ? "bg-red-500/20 text-red-400" :
              "bg-slate-700 text-slate-400"
            }`}>
              {t.exit_reason.toUpperCase()}
            </span>
          )}
          {t.duration_minutes && (
            <span className="text-[10px] text-slate-500">{t.duration_minutes} dk</span>
          )}
          {t.session_type && (
            <span className="text-[10px] text-slate-500">{t.session_type}</span>
          )}
          {t.rsi_at_entry && (
            <span className="text-[10px] text-slate-500">RSI: {t.rsi_at_entry.toFixed(0)}</span>
          )}
          <span className="text-[10px] text-slate-600 ml-auto">
            {t.opened_at ? new Date(t.opened_at).toLocaleString("tr-TR") : ""}
          </span>
        </div>
      )}
    </div>
  )
}

// ─────── Bot Kart ───────
function BotCard({ bot, isSelected, onSelect }: { bot: any; isSelected: boolean; onSelect: () => void }) {
  const isProfit = (bot.total_pnl || 0) > 0

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg border transition-all ${
        isSelected
          ? "border-blue-500 bg-blue-500/10"
          : "border-slate-700/50 bg-slate-800/60 hover:border-slate-600"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-white truncate">{bot.bot_name}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          bot.status === "running" ? "bg-green-500/20 text-green-400" :
          bot.status === "error" ? "bg-red-500/20 text-red-400" :
          "bg-slate-700 text-slate-400"
        }`}>
          {bot.status === "running" ? "Aktif" : bot.status === "error" ? "Hata" : "Durduruldu"}
        </span>
      </div>
      <div className="text-xs text-slate-400 mb-2">{bot.symbol} · {bot.strategy} · {bot.exchange}</div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-slate-500">Trade</span>
          <div className="text-white font-medium">{bot.trade_count}</div>
        </div>
        <div>
          <span className="text-slate-500">Kazanma</span>
          <div className="text-white font-medium">%{bot.win_rate}</div>
        </div>
        <div>
          <span className="text-slate-500">PnL</span>
          <div className={`font-bold ${isProfit ? "text-green-400" : bot.total_pnl < 0 ? "text-red-400" : "text-slate-400"}`}>
            ${bot.total_pnl?.toFixed(2)}
          </div>
        </div>
      </div>
    </button>
  )
}

export default function TradesPage() {
  const [selectedBot, setSelectedBot] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(null)

  const { data: botsData, mutate: mutateBots } = useSWR("/trades/bots-summary", fetcher, { refreshInterval: 30000 })
  const { data: tradesData, mutate: mutateTrades, isLoading: tradesLoading } = useSWR(
    selectedBot != null ? `/trades/bot/${selectedBot}?limit=200` : null,
    fetcher,
    { refreshInterval: 30000 }
  )

  const bots = botsData?.bots || []
  const trades = tradesData?.trades || []

  const handleDelete = useCallback(async () => {
    if (selectedBot == null) return
    const botName = bots.find((b: any) => b.bot_id === selectedBot)?.bot_name || `#${selectedBot}`
    if (!confirm(`"${botName}" botunun tüm işlem kayıtlarını silmek istediğinize emin misiniz?`)) return

    setDeleting(true)
    try {
      await api.delete(`/trades/bot/${selectedBot}`)
      mutateTrades()
      mutateBots()
    } catch (e: any) {
      alert(e.message || "Silme hatası")
    } finally {
      setDeleting(false)
    }
  }, [selectedBot, bots, mutateTrades, mutateBots])

  const handleAiAnalysis = useCallback(async () => {
    if (selectedBot == null) return
    setAnalyzing(true)
    setAnalysis(null)
    try {
      const res = await api.get(`/trades/bot/${selectedBot}/ai-analysis`)
      setAnalysis(res.analysis)
    } catch (e: any) {
      setAnalysis(`Analiz hatası: ${e.message}`)
    } finally {
      setAnalyzing(false)
    }
  }, [selectedBot])

  // Toplam istatistikler
  const totalTrades = bots.reduce((s: number, b: any) => s + b.trade_count, 0)
  const totalPnl = bots.reduce((s: number, b: any) => s + (b.total_pnl || 0), 0)
  const totalWins = bots.reduce((s: number, b: any) => s + (b.wins || 0), 0)
  const totalClosed = bots.reduce((s: number, b: any) => s + (b.closed_count || 0), 0)
  const overallWinRate = totalClosed > 0 ? (totalWins / totalClosed * 100).toFixed(1) : "0"

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Bot Islem Kayitlari</h1>
          <p className="text-sm text-slate-400 mt-1">Her botun trade gecmisi, analizi ve istatistikleri</p>
        </div>
      </div>

      {/* Genel Istatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-xs text-slate-400">Toplam Islem</div>
          <div className="text-lg font-bold text-white">{totalTrades}</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-xs text-slate-400">Toplam PnL</div>
          <div className={`text-lg font-bold ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            ${totalPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-xs text-slate-400">Basari Orani</div>
          <div className="text-lg font-bold text-blue-400">%{overallWinRate}</div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-xs text-slate-400">Aktif Bot</div>
          <div className="text-lg font-bold text-yellow-400">
            {bots.filter((b: any) => b.status === "running").length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sol Panel — Bot Listesi */}
        <div className="lg:col-span-1 space-y-2">
          <h2 className="text-sm font-semibold text-slate-300 mb-2">Botlar ({bots.length})</h2>

          {/* Tümü butonu */}
          <button
            onClick={() => { setSelectedBot(null); setAnalysis(null); }}
            className={`w-full text-left p-3 rounded-lg border transition-all ${
              selectedBot === null
                ? "border-blue-500 bg-blue-500/10"
                : "border-slate-700/50 bg-slate-800/60 hover:border-slate-600"
            }`}
          >
            <span className="text-sm font-medium text-white">Tum Botlar</span>
            <div className="text-xs text-slate-400 mt-1">{totalTrades} islem · ${totalPnl.toFixed(2)} PnL</div>
          </button>

          {bots.map((bot: any) => (
            <BotCard
              key={bot.bot_id}
              bot={bot}
              isSelected={selectedBot === bot.bot_id}
              onSelect={() => { setSelectedBot(bot.bot_id); setAnalysis(null); }}
            />
          ))}

          {bots.length === 0 && (
            <div className="text-center py-8 text-slate-500 text-sm">
              Henuz bot olusturulmamis
            </div>
          )}
        </div>

        {/* Sag Panel — Trade Listesi */}
        <div className="lg:col-span-3">
          {selectedBot != null && (
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-300 flex-1">
                {bots.find((b: any) => b.bot_id === selectedBot)?.bot_name || `Bot #${selectedBot}`} — Islemler ({tradesData?.total || 0})
              </h2>
              <button
                onClick={handleAiAnalysis}
                disabled={analyzing}
                className="text-xs px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-colors"
              >
                {analyzing ? "Analiz ediliyor..." : "AI Analiz"}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs px-3 py-1.5 rounded bg-red-600/80 hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Siliniyor..." : "Kayitlari Sil"}
              </button>
            </div>
          )}

          {selectedBot === null && (
            <h2 className="text-sm font-semibold text-slate-300 mb-3">
              Bir bot secin veya tum botlarin ozet bilgilerini gorun
            </h2>
          )}

          {/* AI Analiz Sonucu */}
          {analysis && (
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-purple-400 font-semibold text-sm">AI Analiz Raporu</span>
                <button onClick={() => setAnalysis(null)} className="text-slate-500 hover:text-white ml-auto text-xs">Kapat</button>
              </div>
              <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed prose prose-invert prose-sm max-w-none">
                {analysis}
              </div>
            </div>
          )}

          {/* Trade Listesi */}
          {selectedBot != null ? (
            tradesLoading ? (
              <div className="text-center py-12 text-slate-500">Yukluyor...</div>
            ) : trades.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">Bu botta henuz islem yok</div>
            ) : (
              <div className="space-y-2">
                {trades.map((t: any) => (
                  <TradeRow key={t.id} t={t} />
                ))}
              </div>
            )
          ) : (
            /* Tüm botlar özet görünümü */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {bots.map((bot: any) => (
                <div key={bot.bot_id} className="bg-slate-800/60 rounded-lg p-4 border border-slate-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-white text-sm">{bot.bot_name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      bot.status === "running" ? "bg-green-500/20 text-green-400" : "bg-slate-700 text-slate-400"
                    }`}>
                      {bot.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mb-3">{bot.symbol} · {bot.strategy}</div>
                  <div className="grid grid-cols-4 gap-2 text-xs text-center">
                    <div>
                      <div className="text-slate-500">Trade</div>
                      <div className="text-white font-medium">{bot.trade_count}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">W/L</div>
                      <div className="text-white font-medium">{bot.wins}/{bot.losses}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Basari</div>
                      <div className="text-blue-400 font-medium">%{bot.win_rate}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">PnL</div>
                      <div className={`font-bold ${bot.total_pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        ${bot.total_pnl?.toFixed(2)}
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
  )
}
