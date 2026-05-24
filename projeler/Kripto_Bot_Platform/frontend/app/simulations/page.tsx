"use client"

import { useState } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"

const fetcher = (path: string) => api.get(path)

export default function SimulationsPage() {
  const [tab, setTab] = useState<"open" | "closed" | "settings">("open")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<any>(null)
  const [deployPaperMode, setDeployPaperMode] = useState(false)
  const [resetBalance, setResetBalance] = useState("1000")

  // Veri cek
  const { data: statsData } = useSWR("/simulations/stats", fetcher, { refreshInterval: 30000 })
  const { data: statusData } = useSWR("/simulations/status", fetcher, { refreshInterval: 10000 })
  const { data: settingsData, mutate: mutateSettings } = useSWR("/simulations/settings", fetcher)
  const { data: portfolioData, mutate: mutatePortfolio } = useSWR("/simulations/portfolio", fetcher, { refreshInterval: 15000 })
  const { data: scenarioData } = useSWR("/simulations/stats/scenarios", fetcher, { refreshInterval: 60000 })

  const queryStatus = tab === "open" ? "open" : statusFilter || undefined
  const { data: listData, mutate: mutateList } = useSWR(
    `/simulations?limit=50${queryStatus ? `&status=${queryStatus}` : ""}`,
    fetcher,
    { refreshInterval: tab === "open" ? 10000 : 30000 }
  )

  const stats = statsData || {}
  const simStatus = statusData || {}
  const settings = settingsData || {}
  const portfolio = portfolioData || {}
  const items: any[] = listData?.items || []
  const scenarios = scenarioData || {}

  const toggleSetting = async (key: string, value: any) => {
    try {
      await api.post("/simulations/settings", { [key]: value })
      mutateSettings()
    } catch {}
  }

  const triggerSim = async () => {
    setTriggering(true)
    try {
      await api.post("/simulations/trigger")
      setTimeout(() => { mutateList(); mutatePortfolio(); setTriggering(false) }, 3000)
    } catch { setTriggering(false) }
  }

  const resetPortfolio = async () => {
    try {
      await api.post("/simulations/portfolio/reset", { initial_balance: Number(resetBalance) })
      mutatePortfolio()
    } catch {}
  }

  const deployToBot = async () => {
    setDeploying(true)
    setDeployResult(null)
    try {
      const result = await api.post("/simulations/deploy-to-bot", { paper_mode: deployPaperMode })
      setDeployResult(result)
    } catch (e: any) {
      setDeployResult({ error: e.message || "Hata olustu" })
    }
    setDeploying(false)
  }

  // AI log'u parse et
  const parseAiLog = (logStr: string | null) => {
    if (!logStr) return null
    try { return JSON.parse(logStr) } catch { return null }
  }

  // Equity trend color
  const equityColor = portfolio.roi > 0 ? "text-green-400" : portfolio.roi < 0 ? "text-red-400" : "text-white"

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Scanner Simulasyon</h1>
          <p className="text-sm text-slate-400 mt-1">
            Bot acmadan AI secimlerini takip et — basarili ise botu aktif et
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (!confirm("Borsa bakiyesi modu ile yeni simülasyon başlatılacak. Emin misiniz?")) return;
              try {
                // Set trade size mode to exchange_pct, enabled=true, reset portfolio
                await api.post("/simulations/settings", { 
                  trade_size_mode: "exchange_pct", 
                  trade_size_value: 10, 
                  enabled: true 
                });
                await api.post("/simulations/portfolio/reset", { initial_balance: portfolio.exchange_balance?.free || 1000 });
                mutateSettings();
                mutatePortfolio();
                alert("Simülasyon Borsa Bakiyesi (MEXC %10) moduyla başlatıldı!");
              } catch (e) {
                alert("Hata: " + String(e));
              }
            }}
            className="px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs rounded-lg transition-colors border border-indigo-500"
          >
            Borsa Bakiyesi ile Baslat
          </button>
          
          <button
            onClick={async () => {
              if (!confirm("Simülasyon ayarları gerçek Smart Scanner botuna kopyalanacak ve bot başlatılacak. İşlemler GERÇEK borsa bakiyesi ile açılacaktır. Emin misiniz?")) return;
              try {
                const res = await api.post("/simulations/copy-to-bot");
                alert(res.data?.message || "Başarıyla kopyalandı!");
              } catch (e) {
                alert("Hata: " + String(e));
              }
            }}
            className="px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-[0_0_15px_rgba(220,38,38,0.3)]"
          >
            Gercek Bota Kopyala & Baslat
          </button>

          <button
            onClick={triggerSim}
            disabled={triggering}
            className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors disabled:opacity-50 ml-2"
          >
            {triggering ? "Taraniyor..." : "Manuel Tara"}
          </button>
          
          <div className="w-px h-6 bg-slate-700 mx-1"></div>
          
          <span className="text-xs text-slate-400">Simulasyon</span>
          <button
            onClick={() => toggleSetting("enabled", !settings.enabled)}
            className={`w-12 h-6 rounded-full transition-colors relative ${settings.enabled ? "bg-green-500" : "bg-slate-700"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.enabled ? "left-6" : "left-0.5"}`} />
          </button>
          <span className={`text-xs font-medium ${settings.enabled ? "text-green-400" : "text-slate-500"}`}>
            {settings.enabled ? "Aktif" : "Kapali"}
          </span>
        </div>
      </div>

      {/* MEXC Borsa Bakiyesi — Ayrı Kart */}
      <div className="bg-gradient-to-r from-indigo-900/30 to-blue-900/20 border border-indigo-500/30 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏦</span>
            <h3 className="text-sm font-semibold text-indigo-300">MEXC Borsa Bakiyesi</h3>
          </div>
          <div className="flex items-center gap-2">
            {simStatus.mexc_ws?.connected && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                WS Bagli ({simStatus.mexc_ws.active_tickers} coin)
              </span>
            )}
            <button
              onClick={async () => {
                try {
                  await api.post("/simulations/portfolio/sync-exchange")
                  mutatePortfolio()
                } catch {}
              }}
              className="text-[10px] px-2 py-1 rounded bg-indigo-600/40 hover:bg-indigo-600/70 text-indigo-300 border border-indigo-500/30 transition-colors"
            >
              ↻ Guncelle
            </button>
          </div>
        </div>

        {portfolio.exchange_balance ? (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
            <div>
              <div className="text-[10px] text-indigo-400/70 uppercase tracking-wider">Serbest Bakiye</div>
              <div className="text-2xl font-black text-white">
                ${portfolio.exchange_balance.free?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Islemlerde</div>
              <div className="text-lg font-semibold text-yellow-400">
                ${(portfolio.exchange_balance.used || 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Toplam</div>
              <div className="text-lg font-semibold text-white">
                ${(portfolio.exchange_balance.total || 0).toFixed(2)}
              </div>
            </div>
            <div className="col-span-2 md:col-span-2">
              <div className="text-[10px] text-indigo-400/70 uppercase tracking-wider">Simulasyon Islem Buyuklugu</div>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={settings.trade_size_mode || "fixed"}
                  onChange={e => toggleSetting("trade_size_mode", e.target.value)}
                  className="bg-slate-900 border border-indigo-500/30 rounded px-2 py-1 text-xs text-white"
                >
                  <option value="fixed">Sabit ($)</option>
                  <option value="percent">Sanal Bakiye %</option>
                  <option value="exchange_pct">MEXC Bakiye %</option>
                </select>
                <input
                  type="number"
                  value={settings.trade_size_value ?? (settings.trade_size_mode === "exchange_pct" || settings.trade_size_mode === "percent" ? 10 : 100)}
                  min={1}
                  max={settings.trade_size_mode === "exchange_pct" || settings.trade_size_mode === "percent" ? 100 : 100000}
                  step={settings.trade_size_mode === "exchange_pct" || settings.trade_size_mode === "percent" ? 1 : 10}
                  onChange={e => toggleSetting("trade_size_value", Number(e.target.value))}
                  className="w-16 bg-slate-900 border border-indigo-500/30 rounded px-2 py-1 text-xs text-white"
                />
                <span className="text-[11px] text-indigo-300/80 font-medium">
                  {settings.trade_size_mode === "fixed" || !settings.trade_size_mode
                    ? `= Her islem $${settings.trade_size_value || 100} margin`
                    : settings.trade_size_mode === "percent"
                    ? `= Sanal bakiyenin %${settings.trade_size_value || 10}'i ($${((portfolio.balance || 1000) * (settings.trade_size_value || 10) / 100).toFixed(0)})`
                    : `= MEXC bakiyenin %${settings.trade_size_value || 10}'i ($${((portfolio.exchange_balance?.free || 0) * (settings.trade_size_value || 10) / 100).toFixed(0)})`
                  }
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-slate-900/40 rounded-lg p-4">
            <div>
              <div className="text-sm text-slate-400">MEXC bakiyesi henuz yuklenemedi</div>
              <div className="text-[10px] text-slate-600 mt-0.5">Borsa Baglantisi sayfasindan MEXC API anahtarlarinizi girin</div>
            </div>
            <button
              onClick={async () => {
                try {
                  await api.post("/simulations/portfolio/sync-exchange")
                  mutatePortfolio()
                } catch {}
              }}
              className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs transition-colors"
            >
              Senkronize Et
            </button>
          </div>
        )}
      </div>

      {/* Sanal Portfolyo */}
      {portfolio.equity != null && settings.portfolio_enabled !== false && (
        <div className="bg-gradient-to-r from-slate-800/80 to-slate-800/40 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-medium text-slate-300">Sanal Portfolyo</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div>
              <div className="text-xs text-slate-500">Sanal Equity</div>
              <div className={`text-2xl font-bold ${equityColor}`}>
                ${portfolio.equity?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Kullanilabilir</div>
              <div className="text-lg font-semibold text-white">
                ${portfolio.balance?.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Islemlerde</div>
              <div className="text-lg font-semibold text-yellow-400">
                ${portfolio.reserved?.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">ROI</div>
              <div className={`text-lg font-bold ${equityColor}`}>
                {portfolio.roi > 0 ? "+" : ""}{portfolio.roi?.toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Toplam P&L</div>
              <div className={`text-lg font-semibold ${portfolio.total_pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {portfolio.total_pnl > 0 ? "+" : ""}${portfolio.total_pnl?.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Max Drawdown</div>
              <div className={`text-lg font-semibold ${portfolio.max_drawdown > 10 ? "text-red-400" : portfolio.max_drawdown > 5 ? "text-yellow-400" : "text-green-400"}`}>
                -{portfolio.max_drawdown?.toFixed(1)}%
              </div>
            </div>
          </div>
          {/* Equity bar */}
          <div>
            <div className="h-2 bg-slate-900/60 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${portfolio.roi >= 0 ? "bg-green-500" : "bg-red-500"}`}
                style={{ width: `${Math.min(100, Math.max(5, (portfolio.equity || 0) / Math.max(1, portfolio.initial_balance || 1000) * 100))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
              <span>$0</span>
              <span>Baslangic: ${portfolio.initial_balance?.toLocaleString()}</span>
              <span>${((portfolio.initial_balance || 1000) * 2).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Senaryo Kartlari — 3 farkli bakis acisi */}
      {scenarios.scenario_all && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Senaryo Karsilastirmasi</h2>
            <span className="text-[10px] text-slate-600">Kapanmis islemler uzerinden hesaplandi</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                key: "scenario_all",
                data: scenarios.scenario_all,
                gradient: "from-blue-900/40 to-blue-800/20",
                border: "border-blue-500/30",
                icon: "📊",
                iconBg: "bg-blue-500/20",
              },
              {
                key: "scenario_portfolio",
                data: scenarios.scenario_portfolio,
                gradient: "from-emerald-900/40 to-emerald-800/20",
                border: "border-emerald-500/30",
                icon: "💰",
                iconBg: "bg-emerald-500/20",
              },
              {
                key: "scenario_high_conf",
                data: scenarios.scenario_high_conf,
                gradient: "from-purple-900/40 to-purple-800/20",
                border: "border-purple-500/30",
                icon: "🎯",
                iconBg: "bg-purple-500/20",
              },
            ].map(s => {
              const d = s.data || {}
              const pnlColor = (d.total_pnl || 0) >= 0 ? "text-green-400" : "text-red-400"
              const wrColor = (d.win_rate || 0) >= 50 ? "text-green-400" : (d.win_rate || 0) >= 40 ? "text-yellow-400" : "text-red-400"
              return (
                <div key={s.key} className={`bg-gradient-to-br ${s.gradient} border ${s.border} rounded-2xl p-5 space-y-4 transition-all hover:scale-[1.01]`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-lg w-8 h-8 rounded-lg flex items-center justify-center ${s.iconBg}`}>{s.icon}</span>
                        <span className="text-sm font-bold text-white">{d.label || s.key}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{d.description || ""}</p>
                    </div>
                  </div>

                  {/* Ana PnL */}
                  <div className="text-center py-2">
                    <div className={`text-3xl font-black ${pnlColor}`}>
                      {(d.total_pnl || 0) > 0 ? "+" : ""}${(d.total_pnl || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Toplam Kar/Zarar</div>
                  </div>

                  {/* Detaylar */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <div className={`text-lg font-bold ${wrColor}`}>{d.win_rate || 0}%</div>
                      <div className="text-[9px] text-slate-500">Basari</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">{d.total || 0}</div>
                      <div className="text-[9px] text-slate-500">Islem</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${(d.profit_factor || 0) >= 1.5 ? "text-green-400" : (d.profit_factor || 0) >= 1 ? "text-yellow-400" : "text-red-400"}`}>
                        {(d.profit_factor || 0).toFixed(1)}x
                      </div>
                      <div className="text-[9px] text-slate-500">PF</div>
                    </div>
                  </div>

                  {/* Alt bilgi */}
                  <div className="flex justify-between text-[10px] text-slate-500 pt-2 border-t border-white/5">
                    <span className="text-green-500">W:{d.wins || 0}</span>
                    <span className="text-red-500">L:{d.losses || 0}</span>
                    <span>En iyi: <span className="text-green-400">${(d.best_trade || 0).toFixed(0)}</span></span>
                    <span>En kotu: <span className="text-red-400">${(d.worst_trade || 0).toFixed(0)}</span></span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Ozet Kartlari */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Toplam", value: stats.total || 0, color: "text-white" },
          { label: "Kazanc", value: stats.wins || 0, color: "text-green-400" },
          { label: "Kayip", value: stats.losses || 0, color: "text-red-400" },
          { label: "Basari %", value: `${stats.win_rate || 0}%`, color: (stats.win_rate || 0) >= 50 ? "text-green-400" : "text-red-400" },
          { label: "Toplam P&L", value: `$${(stats.total_pnl_usdt || 0).toFixed(0)}`, color: (stats.total_pnl_usdt || 0) >= 0 ? "text-green-400" : "text-red-400" },
        ].map((s, i) => (
          <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-400">{s.label}</div>
            <div className={`text-xl font-bold ${s.color} mt-1`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Detay Kartlari */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Ort. Kazanc", value: `${(stats.avg_win_pct || 0).toFixed(2)}%`, color: "text-green-400" },
          { label: "Ort. Kayip", value: `${(stats.avg_loss_pct || 0).toFixed(2)}%`, color: "text-red-400" },
          { label: "Profit Factor", value: (stats.profit_factor || 0).toFixed(2), color: (stats.profit_factor || 0) >= 1.5 ? "text-green-400" : "text-yellow-400" },
          { label: "Acik Sim", value: `${stats.open || 0} / ${settings.max_open || 5}`, color: "text-blue-400" },
        ].map((s, i) => (
          <div key={i} className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-3 text-center">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className={`text-lg font-semibold ${s.color} mt-0.5`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Yon Bazli Performans */}
      {stats.direction_stats && Object.keys(stats.direction_stats).length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(stats.direction_stats as Record<string, any>).map(([dir, s]: [string, any]) => (
            <div key={dir} className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">
                  {dir === "long" ? "Long" : "Short"}
                </span>
                <span className={`text-sm font-bold ${s.win_rate >= 50 ? "text-green-400" : "text-red-400"}`}>
                  %{s.win_rate}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {s.wins}W / {s.total - s.wins}L | Ort: {s.avg_pnl > 0 ? "+" : ""}{s.avg_pnl}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* En Iyi Coinler */}
      {stats.coin_performance && stats.coin_performance.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Coin Performansi</h3>
          <div className="flex flex-wrap gap-2">
            {stats.coin_performance.map((c: any) => (
              <span key={c.coin} className={`px-2 py-1 rounded text-xs font-medium border ${
                c.total_pnl >= 0
                  ? "bg-green-500/10 border-green-500/30 text-green-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}>
                {c.coin}: %{c.win_rate} ({c.wins}W/{c.losses}L) ${c.total_pnl}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tab Secici */}
      <div className="flex gap-1 bg-slate-800/60 p-1 rounded-lg w-fit">
        {([
          { id: "open", label: `Acik (${stats.open || 0})` },
          { id: "closed", label: `Kapali (${(stats.wins || 0) + (stats.losses || 0)})` },
          { id: "settings", label: "Ayarlar" },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === t.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Ayarlar */}
      {tab === "settings" && (
        <div className="space-y-4">

          {/* Bagimsizlik Uyarisi */}
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
            <span className="text-lg">⚡</span>
            <div>
              <div className="text-sm font-medium text-amber-400">Bu ayarlar sadece simulasyonu etkiler</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Buradaki degisiklikler Bots sayfasindaki aktif botlarin parametrelerini DEGiSTiRMEZ.
                Farkli senaryolari guvenle test edebilirsiniz. Basarili buldugunuz ayarlari &quot;Smart Bot&apos;a Aktar&quot; ile bota deploy edebilirsiniz.
              </div>
            </div>
          </div>

          {/* Portfolyo & Pozisyon Buyuklugu */}
          <div className="bg-gradient-to-r from-indigo-900/20 to-slate-800/60 border border-indigo-500/30 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">Portfolyo & Pozisyon Buyuklugu</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gercek kasa yonetimi simule et. Bakiye yetmezse islem acilmaz.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Portfolyo</span>
                <button
                  onClick={() => toggleSetting("portfolio_enabled", !settings.portfolio_enabled)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.portfolio_enabled !== false ? "bg-indigo-500" : "bg-slate-700"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${settings.portfolio_enabled !== false ? "left-5" : "left-0.5"}`} />
                </button>
              </div>
            </div>

            {settings.portfolio_enabled !== false && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Islem Miktari Modu</label>
                    <select
                      value={settings.trade_size_mode || "fixed"}
                      onChange={e => toggleSetting("trade_size_mode", e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                    >
                      <option value="fixed">Sabit Miktar ($)</option>
                      <option value="percent">Bakiyenin %&apos;si</option>
                      <option value="auto_exchange">Borsa Bakiyesinin %&apos;si</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">
                      {settings.trade_size_mode === "percent" || settings.trade_size_mode === "auto_exchange"
                        ? "Yuzde (%)"
                        : "Miktar ($)"}
                    </label>
                    <input
                      type="number"
                      value={settings.trade_size_value ?? 100}
                      min={1}
                      max={settings.trade_size_mode === "percent" || settings.trade_size_mode === "auto_exchange" ? 100 : 100000}
                      step={settings.trade_size_mode === "percent" || settings.trade_size_mode === "auto_exchange" ? 1 : 10}
                      onChange={e => toggleSetting("trade_size_value", Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                </div>

                <div className="bg-slate-900/60 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                  <div className="text-slate-300 font-medium mb-1">Islem Boyutu Hesabi:</div>
                  {settings.trade_size_mode === "fixed" || !settings.trade_size_mode ? (
                    <div>Her islemde sabit ${settings.trade_size_value || 100} margin kullanilir. {settings.max_leverage || 75}x kaldiracla pozisyon = ${((settings.trade_size_value || 100) * (settings.max_leverage || 75)).toLocaleString()}</div>
                  ) : settings.trade_size_mode === "percent" ? (
                    <div>Mevcut sanal bakiyenin %{settings.trade_size_value || 10}&apos;i margin olarak kullanilir. Bakiye: ${portfolio.balance?.toFixed(0) || "?"} → Margin: ${((portfolio.balance || 1000) * (settings.trade_size_value || 10) / 100).toFixed(0)}</div>
                  ) : (
                    <div>MEXC borsasindaki gercek bakiyenizin %{settings.trade_size_value || 10}&apos;i margin olarak kullanilir.</div>
                  )}
                </div>

                {/* Portfolyo Sifirla */}
                <div className="flex items-center gap-3 pt-2 border-t border-slate-700/30">
                  <input
                    type="number"
                    value={resetBalance}
                    onChange={e => setResetBalance(e.target.value)}
                    className="w-32 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                    placeholder="Baslangic $"
                  />
                  <button
                    onClick={resetPortfolio}
                    className="px-3 py-1 bg-amber-600/80 hover:bg-amber-600 text-white text-xs rounded transition-colors"
                  >
                    Portfolyoyu Sifirla
                  </button>
                  <span className="text-[10px] text-slate-600">Tum bakiye ve istatistikler sifirlanir</span>
                </div>
              </>
            )}
          </div>

          {/* Genel Ayarlar */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-medium text-white">Genel Ayarlar</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { key: "mode", label: "Mod", type: "select", options: [["ai","AI (Claude)"],["manual","Manuel"]] },
                { key: "interval", label: "Aralik (sn)", type: "number", min: 60, max: 3600 },
                { key: "min_confidence", label: "Min Guven %", type: "number", min: 0, max: 100 },
                { key: "max_open", label: "Max Acik", type: "number", min: 1, max: 20 },
                { key: "expiry_hours", label: "Sure Limiti (saat)", type: "number", min: 1, max: 168 },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
                  {f.type === "select" ? (
                    <select
                      value={settings[f.key] || ""}
                      onChange={e => toggleSetting(f.key, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                    >
                      {f.options?.map(([v,l]: string[]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : (
                    <input
                      type="number"
                      value={settings[f.key] ?? ""}
                      min={f.min} max={f.max} step={f.step || 1}
                      onChange={e => toggleSetting(f.key, Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Kaldirac Ayarlari */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-medium text-white">Kaldirac Ayarlari</h3>
            <p className="text-xs text-slate-500">AI bu aralikta kaldirac secer. Coin&apos;in borsadaki max kaldiraci da dikkate alinir.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { key: "min_leverage", label: "Min Kaldirac", type: "number", min: 1, max: 200 },
                { key: "max_leverage", label: "Max Kaldirac", type: "number", min: 1, max: 500 },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
                  <input
                    type="number"
                    value={settings[f.key] ?? ""}
                    min={f.min} max={f.max}
                    onChange={e => toggleSetting(f.key, Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* TP/SL Ayarlari */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">TP / SL Ayarlari</h3>
                <p className="text-xs text-slate-500 mt-0.5">Baz degerler. Otomatik olcekleme aciksa kaldirac arttikca kucultulur.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Oto Olcekle</span>
                <button
                  onClick={() => toggleSetting("auto_scale_tp_sl", !settings.auto_scale_tp_sl)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.auto_scale_tp_sl !== false ? "bg-green-500" : "bg-slate-700"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${settings.auto_scale_tp_sl !== false ? "left-5" : "left-0.5"}`} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { key: "tp_pct", label: "Baz TP %", type: "number", min: 0.1, max: 50, step: 0.1 },
                { key: "sl_pct", label: "Baz SL %", type: "number", min: 0.1, max: 50, step: 0.1 },
                { key: "scale_base_leverage", label: "Baz Kaldirac", type: "number", min: 1, max: 100 },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
                  <input
                    type="number"
                    value={settings[f.key] ?? ""}
                    min={f.min} max={f.max} step={f.step || 1}
                    onChange={e => toggleSetting(f.key, Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                  />
                </div>
              ))}
            </div>
            {settings.auto_scale_tp_sl !== false && (
              <div className="bg-slate-900/60 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                <div className="text-slate-300 font-medium mb-1">Ornek Olcekleme:</div>
                <div>{settings.scale_base_leverage || 10}x kaldirac → TP: {settings.tp_pct || 1.5}% / SL: {settings.sl_pct || 0.8}% (baz deger)</div>
                <div>25x kaldirac → TP: {((settings.tp_pct || 1.5) * (settings.scale_base_leverage || 10) / 25).toFixed(2)}% / SL: {((settings.sl_pct || 0.8) * (settings.scale_base_leverage || 10) / 25).toFixed(2)}%</div>
                <div>50x kaldirac → TP: {((settings.tp_pct || 1.5) * (settings.scale_base_leverage || 10) / 50).toFixed(2)}% / SL: {((settings.sl_pct || 0.8) * (settings.scale_base_leverage || 10) / 50).toFixed(2)}%</div>
                <div>100x kaldirac → TP: {((settings.tp_pct || 1.5) * (settings.scale_base_leverage || 10) / 100).toFixed(2)}% / SL: {((settings.sl_pct || 0.8) * (settings.scale_base_leverage || 10) / 100).toFixed(2)}%</div>
              </div>
            )}
          </div>

          {/* Trailing Stop */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">Trailing Stop (Kar Koruma)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Islem kara gecince aktif olur. Fiyat zirvesinden geri cekilince otomatik kapatir.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Trailing</span>
                <button
                  onClick={() => toggleSetting("trailing_enabled", !settings.trailing_enabled)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.trailing_enabled ? "bg-green-500" : "bg-slate-700"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${settings.trailing_enabled ? "left-5" : "left-0.5"}`} />
                </button>
              </div>
            </div>
            {settings.trailing_enabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Aktivasyon % (kara gecis esigi)</label>
                  <input
                    type="number"
                    value={settings.trailing_activate_pct ?? 0.3}
                    min={0.05} max={10} step={0.05}
                    onChange={e => toggleSetting("trailing_activate_pct", Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                  />
                  <p className="text-[10px] text-slate-600 mt-0.5">Islem bu % kara gecince trailing baslar</p>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Geri Cekilme % (callback)</label>
                  <input
                    type="number"
                    value={settings.trailing_callback_pct ?? 0.15}
                    min={0.02} max={5} step={0.02}
                    onChange={e => toggleSetting("trailing_callback_pct", Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                  />
                  <p className="text-[10px] text-slate-600 mt-0.5">Zirveden bu % duserse kapat</p>
                </div>
              </div>
            )}
            {settings.trailing_enabled && (
              <div className="bg-slate-900/60 rounded-lg p-3 text-xs text-slate-400">
                <div className="text-slate-300 font-medium mb-1">Ornek Senaryo:</div>
                <div>Giris: $100 | Fiyat $100.30&apos;a cikar → Trailing aktif (%{settings.trailing_activate_pct || 0.3} kar)</div>
                <div>Fiyat $100.50&apos;ya cikar (zirve) → takip eder</div>
                <div>Fiyat $100.35&apos;e duser → %{settings.trailing_callback_pct || 0.15} geri cekilme → KAPAT (+%0.35 kar)</div>
              </div>
            )}
          </div>

          {/* Hedge Modu */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">Hedge Modu (Cift Yonlu Islem)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ayni coin&apos;de LONG + SHORT ayni anda acar. Fiyat bir yone hareket edince biri kazanir.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Hedge</span>
                <button
                  onClick={() => toggleSetting("hedge_enabled", !settings.hedge_enabled)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${settings.hedge_enabled ? "bg-purple-500" : "bg-slate-700"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${settings.hedge_enabled ? "left-5" : "left-0.5"}`} />
                </button>
              </div>
            </div>
            {settings.hedge_enabled && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: "hedge_tp_pct", label: "Hedge TP %", min: 0.05, max: 5, step: 0.05 },
                    { key: "hedge_sl_pct", label: "Hedge SL %", min: 0.02, max: 2, step: 0.02 },
                    { key: "hedge_min_atr_pct", label: "Min ATR %", min: 0.1, max: 5, step: 0.1 },
                    { key: "hedge_min_volume_ratio", label: "Min Hacim", min: 0.5, max: 10, step: 0.1 },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
                      <input
                        type="number"
                        value={settings[f.key] ?? ""}
                        min={f.min} max={f.max} step={f.step}
                        onChange={e => toggleSetting(f.key, Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.hedge_use_max_leverage !== false}
                      onChange={e => toggleSetting("hedge_use_max_leverage", e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700"
                    />
                    <span className="text-xs text-slate-400">Coinin max kaldiracinir kullan</span>
                  </label>
                </div>
                <div className="bg-slate-900/60 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                  <div className="text-slate-300 font-medium mb-1">Hedge Kar Hesabi:</div>
                  <div>TP: %{settings.hedge_tp_pct || 0.4} | SL: %{settings.hedge_sl_pct || 0.1} | Net Kar: %{((settings.hedge_tp_pct || 0.4) - (settings.hedge_sl_pct || 0.1)).toFixed(2)}</div>
                  <div>200x kaldirac ile $100 margin → Kazanc: ${(100 * 200 * ((settings.hedge_tp_pct || 0.4) - (settings.hedge_sl_pct || 0.1)) / 100).toFixed(0)} | Kayip: $0 (her iki yon acik)</div>
                  <div className="text-amber-400 mt-1">Not: Spread, slippage ve likidite riski mevcuttur</div>
                </div>
              </>
            )}
          </div>

          {/* Bot Deploy */}
          <div className="bg-gradient-to-r from-emerald-900/20 to-slate-800/60 border border-emerald-500/30 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-white">Smart Bot&apos;a Aktar</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulasyon ayarlarini otomatik olarak yeni bir Smart Scanner bota aktar.
                Paper veya Gercek mod secebilirsiniz — Bots sayfasindan baslat.
              </p>
            </div>

            {/* Performans Onizleme */}
            {stats.total > 0 && (
              <div className="bg-slate-900/60 rounded-lg p-3 text-xs space-y-2">
                <div className="text-slate-300 font-medium">Simulasyon Performansi (Bot&apos;a aktarilacak ayarlar):</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <span className="text-slate-500">Basari:</span>{" "}
                    <span className={stats.win_rate >= 50 ? "text-green-400" : "text-red-400"}>%{stats.win_rate}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">P&L:</span>{" "}
                    <span className={stats.total_pnl_usdt >= 0 ? "text-green-400" : "text-red-400"}>${stats.total_pnl_usdt?.toFixed(0)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">PF:</span>{" "}
                    <span className={stats.profit_factor >= 1.5 ? "text-green-400" : "text-yellow-400"}>{stats.profit_factor?.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Islem:</span>{" "}
                    <span className="text-white">{stats.total}</span>
                  </div>
                </div>
                <div className="text-slate-500 mt-1">
                  Ayarlar: {settings.mode?.toUpperCase()} mod | {settings.min_leverage}-{settings.max_leverage}x kaldirac |
                  TP:{settings.tp_pct}% SL:{settings.sl_pct}% |
                  {settings.trailing_enabled ? " Trailing ON |" : ""}
                  {settings.hedge_enabled ? " Hedge ON |" : ""}
                  Margin: {settings.trade_size_mode === "percent" ? `%${settings.trade_size_value}` : `$${settings.trade_size_value}`}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg p-1">
                <button
                  onClick={() => setDeployPaperMode(true)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${deployPaperMode ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" : "text-slate-400 hover:text-white"}`}
                >
                  Paper
                </button>
                <button
                  onClick={() => setDeployPaperMode(false)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!deployPaperMode ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "text-slate-400 hover:text-white"}`}
                >
                  Gercek
                </button>
              </div>
              <button
                onClick={deployToBot}
                disabled={deploying}
                className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${deployPaperMode ? "bg-emerald-600/80 hover:bg-emerald-600" : "bg-orange-600/80 hover:bg-orange-600"}`}
              >
                {deploying ? "Olusturuluyor..." : `${deployPaperMode ? "Paper" : "Gercek"} Bot Olustur`}
              </button>
            </div>

            {deployResult && (
              <div className={`rounded-lg p-3 text-xs ${deployResult.error ? "bg-red-500/10 border border-red-500/20 text-red-400" : "bg-green-500/10 border border-green-500/20 text-green-400"}`}>
                {deployResult.error ? (
                  <span>Hata: {deployResult.error}</span>
                ) : (
                  <div>
                    <div className="font-medium mb-1">{deployResult.message}</div>
                    <div className="text-slate-400">Bot ID: {deployResult.bot_id} | Strateji: {deployResult.strategy} | Borsa: {deployResult.exchange}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Kapali filtre */}
      {tab === "closed" && (
        <div className="flex gap-2">
          {["", "win", "loss", "expired"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {s === "" ? "Hepsi" : s === "win" ? "Kazanc" : s === "loss" ? "Kayip" : "Suresi Dolmus"}
            </button>
          ))}
        </div>
      )}

      {/* Simulasyon Listesi */}
      {tab !== "settings" && (
        <div className="space-y-3">
          {items.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              {tab === "open" ? "Acik simulasyon yok — sistem otomatik tarayacak" : "Henuz kapanmis simulasyon yok"}
            </div>
          )}
          {items.map((sim: any) => {
            const isLong = sim.direction === "long"
            const isOpen = sim.status === "open"
            const isWin = sim.status === "win"
            const isExpanded = expandedId === sim.id
            const aiLog = parseAiLog(sim.ai_log)
            const simMargin = sim.margin_usdt || 100
            const posSize = simMargin * (sim.leverage || 1)

            // Coin ikonu
            const coinBase = sim.coin?.replace("STOCK", "").replace("stock", "") || ""
            const isStock = sim.coin?.includes("STOCK")
            const coinIconUrl = isStock
              ? null
              : `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/${coinBase.toLowerCase()}.png`

            // Status border color
            const borderColor = isOpen
              ? "border-blue-500/30"
              : isWin ? "border-green-500/30" : sim.status === "expired" ? "border-slate-600" : "border-red-500/30"

            return (
              <div key={sim.id} className={`bg-slate-800/60 border ${borderColor} rounded-xl overflow-hidden`}>
                {/* Ana kart */}
                <div
                  className="p-4 cursor-pointer hover:bg-slate-800/80 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : sim.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {/* Coin ikonu */}
                      <div className="relative w-10 h-10 shrink-0">
                        {isStock ? (
                          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300">
                            {coinBase.slice(0, 2)}
                          </div>
                        ) : (
                          <img
                            src={coinIconUrl!}
                            alt={coinBase}
                            className="w-10 h-10 rounded-full"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.style.display = "none"
                              target.parentElement!.innerHTML = `<div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300">${coinBase.slice(0, 2)}</div>`
                            }}
                          />
                        )}
                        {/* Status badge */}
                        <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] ${
                          isOpen ? (isLong ? "bg-green-500" : "bg-red-500") :
                          isWin ? "bg-green-500" : sim.status === "expired" ? "bg-slate-500" : "bg-red-500"
                        }`}>
                          {isOpen ? (isLong ? "↑" : "↓") : isWin ? "✓" : sim.status === "expired" ? "⏰" : "✗"}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-lg">{sim.coin}</span>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          }`}>
                            {sim.direction.toUpperCase()}
                          </span>
                          <span className="text-xs text-slate-500 bg-slate-900/50 px-1.5 py-0.5 rounded">{sim.leverage}x</span>
                          {sim.is_hedge && (
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                              HEDGE
                            </span>
                          )}
                          {sim.confidence && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              sim.confidence >= 80 ? "bg-green-500/15 text-green-400" :
                              sim.confidence >= 65 ? "bg-blue-500/15 text-blue-400" :
                              "bg-yellow-500/15 text-yellow-400"
                            }`}>
                              %{sim.confidence} guven
                            </span>
                          )}
                          <span className="text-xs text-slate-600">{sim.selection_mode === "ai" ? "AI" : "Manuel"}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Giris: ${sim.entry_price?.toFixed(4)} | TP: ${sim.tp_price?.toFixed(4)} ({sim.tp_pct}%) | SL: ${sim.sl_price?.toFixed(4)} ({sim.sl_pct}%)
                        </div>
                        {/* Margin & Pozisyon */}
                        <div className="text-xs text-slate-500 mt-0.5">
                          Margin: ${simMargin.toFixed(0)} | Pozisyon: ${posSize.toLocaleString(undefined, {maximumFractionDigits: 0})}
                        </div>
                        {/* Gostergeler */}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {[
                            sim.rsi_14 && { label: `RSI:${sim.rsi_14.toFixed(0)}`, hot: sim.rsi_14 < 30 || sim.rsi_14 > 70 },
                            sim.adx && { label: `ADX:${sim.adx.toFixed(0)}`, hot: sim.adx > 25 },
                            sim.volume_ratio && { label: `Vol:${sim.volume_ratio.toFixed(1)}x`, hot: sim.volume_ratio > 2 },
                            sim.funding_rate != null && { label: `Fund:${sim.funding_rate.toFixed(3)}%`, hot: Math.abs(sim.funding_rate) > 0.03 },
                            sim.fear_greed != null && { label: `F&G:${sim.fear_greed}`, hot: sim.fear_greed < 25 || sim.fear_greed > 75 },
                            sim.atr_pct && { label: `ATR:${sim.atr_pct.toFixed(2)}%`, hot: sim.atr_pct > 1 },
                          ].filter(Boolean).map((tag: any, i) => (
                            <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${
                              tag.hot ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" : "bg-slate-900/50 text-slate-400"
                            }`}>
                              {tag.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3 min-w-[120px]">
                      {/* Kapali islem: PnL */}
                      {!isOpen && sim.pnl_pct != null && (
                        <div className={`text-lg font-bold ${sim.pnl_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {sim.pnl_pct > 0 ? "+" : ""}{sim.pnl_pct.toFixed(2)}%
                        </div>
                      )}
                      {!isOpen && sim.pnl_usdt != null && (
                        <div className={`text-xs ${sim.pnl_usdt >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {sim.pnl_usdt > 0 ? "+" : ""}${sim.pnl_usdt.toFixed(1)}
                        </div>
                      )}
                      {/* Kapali islem: Cikis nedeni + sure */}
                      {!isOpen && (
                        <div className="flex items-center gap-1.5 justify-end mt-0.5">
                          {sim.exit_reason && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              sim.exit_reason === "TP" ? "bg-green-500/15 text-green-400" :
                              sim.exit_reason === "SL" ? "bg-red-500/15 text-red-400" :
                              sim.exit_reason === "TRAILING" ? "bg-purple-500/15 text-purple-400" :
                              "bg-slate-700 text-slate-400"
                            }`}>
                              {sim.exit_reason}
                            </span>
                          )}
                          {sim.duration_minutes != null && (
                            <span className="text-[10px] text-slate-500">
                              {sim.duration_minutes < 60
                                ? `${sim.duration_minutes}dk`
                                : sim.duration_minutes < 1440
                                ? `${Math.floor(sim.duration_minutes / 60)}sa ${sim.duration_minutes % 60}dk`
                                : `${Math.floor(sim.duration_minutes / 1440)}g ${Math.floor((sim.duration_minutes % 1440) / 60)}sa`
                              }
                            </span>
                          )}
                        </div>
                      )}
                      {/* Ilk hareket yonu (acik ve kapali islemler icin) */}
                      {sim.first_move && (
                        <div className={`text-[10px] mt-0.5 ${
                          sim.first_move === "favorable" ? "text-green-500" : "text-red-500"
                        }`}>
                          {sim.first_move === "favorable" ? "ilk lehte" : "ilk aleyhte"}
                          {sim.first_move_pct != null && ` (${sim.first_move_pct.toFixed(2)}%)`}
                        </div>
                      )}
                      {/* Acik islem: canli fiyat + PnL + max lehte/aleyhte + gecen sure */}
                      {isOpen && (
                        <>
                          {/* Canli PnL */}
                          {sim.current_price ? (
                            <div className="text-xs font-medium">
                              <span className={sim.current_pnl_pct >= 0 ? "text-green-400" : "text-red-400"}>
                                {sim.current_pnl_pct >= 0 ? "+" : ""}{sim.current_pnl_pct.toFixed(2)}%
                                {" "}(${sim.current_pnl_usdt >= 0 ? "+" : ""}{sim.current_pnl_usdt.toFixed(1)})
                              </span>
                              <span className="text-slate-500 ml-1 text-[10px]">${sim.current_price.toFixed(4)}</span>
                            </div>
                          ) : null}
                          <div className="text-xs text-slate-400">
                            {sim.max_favorable_pct != null ? (
                              <>
                                <span className="text-green-500">+{sim.max_favorable_pct.toFixed(2)}%</span>
                                {" / "}
                                <span className="text-red-500">-{(sim.max_adverse_pct || 0).toFixed(2)}%</span>
                              </>
                            ) : (
                              <span className="text-slate-600">bekliyor...</span>
                            )}
                          </div>
                          {/* Acik islem suresi */}
                          {sim.created_at && (() => {
                            const mins = Math.floor((Date.now() - new Date(sim.created_at).getTime()) / 60000)
                            return (
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {mins < 60 ? `${mins}dk` : mins < 1440 ? `${Math.floor(mins/60)}sa ${mins%60}dk` : `${Math.floor(mins/1440)}g ${Math.floor((mins%1440)/60)}sa`}
                              </div>
                            )
                          })()}
                        </>
                      )}
                      <div className="text-[10px] text-slate-600 mt-1">
                        {new Date(sim.created_at).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                      </div>
                      <div className="text-[10px] text-slate-700 mt-0.5">
                        {isExpanded ? "Kapat" : "Detay"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Genisletilmis AI Detay Paneli */}
                {isExpanded && (
                  <div className="border-t border-slate-700/50 bg-slate-900/40">
                    {/* AI Secim Gerekcelesi */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-semibold text-purple-400">AI Karar Analizi</h4>
                      </div>

                      {/* Reason */}
                      {sim.reason && (
                        <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
                          <div className="text-[10px] text-purple-400/70 uppercase tracking-wider mb-1">Secim Gerekcelsi</div>
                          <p className="text-sm text-slate-300 leading-relaxed">{sim.reason}</p>
                        </div>
                      )}

                      {/* AI Yaniti */}
                      {aiLog?.ai_response && (
                        <>
                          {aiLog.ai_response.market_summary && (
                            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                              <div className="text-[10px] text-blue-400/70 uppercase tracking-wider mb-1">AI Piyasa Degerlendirmesi</div>
                              <p className="text-sm text-slate-300 leading-relaxed">{aiLog.ai_response.market_summary}</p>
                            </div>
                          )}

                          {aiLog.ai_response.selections && aiLog.ai_response.selections.length > 0 && (
                            <div className="bg-slate-800/60 border border-slate-700/30 rounded-lg p-3">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">AI Tum Secimler (Bu Turda)</div>
                              <div className="space-y-2">
                                {aiLog.ai_response.selections.map((sel: any, idx: number) => (
                                  <div key={idx} className={`flex items-center gap-3 text-xs p-2 rounded ${
                                    sel.coin === sim.coin ? "bg-purple-500/10 border border-purple-500/20" : "bg-slate-800/40"
                                  }`}>
                                    <span className={`font-bold ${sel.direction === "long" ? "text-green-400" : "text-red-400"}`}>
                                      {sel.coin}
                                    </span>
                                    <span className={`px-1 py-0.5 rounded text-[10px] ${
                                      sel.direction === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                    }`}>
                                      {sel.direction?.toUpperCase()}
                                    </span>
                                    <span className="text-blue-400">%{sel.confidence}</span>
                                    <span className="text-slate-500">{sel.leverage_suggestion}x</span>
                                    <span className="text-slate-400 flex-1 truncate">{sel.entry_reason}</span>
                                    {sel.coin === sim.coin && <span className="text-purple-400 text-[10px]">Bu islem</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-4 text-[10px] text-slate-600">
                            {aiLog.model && <span>Model: {aiLog.model}</span>}
                            <span>Mod: {sim.selection_mode === "ai" ? "AI" : "Manuel"}</span>
                            <span>Margin: ${simMargin.toFixed(0)} | Poz: ${posSize.toLocaleString()}</span>
                          </div>
                        </>
                      )}

                      {!aiLog && !sim.reason && (
                        <div className="text-xs text-slate-500 italic">AI log verisi mevcut degil</div>
                      )}

                      {sim.ai_review && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                          <div className="text-[10px] text-amber-400/70 uppercase tracking-wider mb-1">AI Sonuc Degerlendirmesi</div>
                          <p className="text-sm text-slate-300 leading-relaxed">{sim.ai_review}</p>
                        </div>
                      )}

                      {/* Detayli Gostergeler */}
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 pt-2 border-t border-slate-700/30">
                        {[
                          { label: "RSI", value: sim.rsi_14?.toFixed(1), warn: sim.rsi_14 && (sim.rsi_14 < 30 || sim.rsi_14 > 70) },
                          { label: "ADX", value: sim.adx?.toFixed(1), warn: sim.adx && sim.adx > 25 },
                          { label: "Volume", value: sim.volume_ratio ? `${sim.volume_ratio.toFixed(1)}x` : null, warn: sim.volume_ratio && sim.volume_ratio > 2 },
                          { label: "ATR%", value: sim.atr_pct?.toFixed(2), warn: sim.atr_pct && sim.atr_pct > 1 },
                          { label: "Funding", value: sim.funding_rate != null ? `${sim.funding_rate.toFixed(4)}%` : null },
                          { label: "F&G", value: sim.fear_greed },
                        ].map((ind, i) => ind.value != null && (
                          <div key={i} className="text-center">
                            <div className="text-[10px] text-slate-500">{ind.label}</div>
                            <div className={`text-xs font-medium ${ind.warn ? "text-amber-400" : "text-slate-300"}`}>{ind.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Simulator Status */}
      {simStatus.ts && (
        <div className="text-xs text-slate-600 text-center space-y-0.5">
          <div>
            Son tarama: {new Date(simStatus.ts).toLocaleString("tr-TR")}
            {simStatus.coins_total && ` | ${simStatus.coins_total} coin tarandi`}
            {simStatus.selections_count != null && ` | ${simStatus.selections_count} secim`}
          </div>
          {simStatus.past_stats?.total > 0 && (
            <div>
              Gecmis: {simStatus.past_stats.total} islem | %{simStatus.past_stats.win_rate} basari
            </div>
          )}
          {simStatus.portfolio && (
            <div>
              Kasa: ${simStatus.portfolio.equity?.toFixed(0)} | ROI: {simStatus.portfolio.roi > 0 ? "+" : ""}{simStatus.portfolio.roi}% | DD: -{simStatus.portfolio.max_drawdown}%
            </div>
          )}
          {simStatus.error && (
            <div className="text-red-400">Hata: {simStatus.error}</div>
          )}
        </div>
      )}
    </div>
  )
}
