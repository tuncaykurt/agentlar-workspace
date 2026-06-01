"use client"

import React, { useState, useEffect, useMemo, useRef, Component, ErrorInfo, ReactNode } from "react"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { api, API_URL } from "@/lib/api"

// Error Boundary — client-side hataları yakalar ve gösterir
class HftErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[HFT Error]", error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-center">
          <h2 className="text-red-400 text-xl font-bold mb-4">HFT Sayfa Hatasi</h2>
          <pre className="bg-slate-900 text-red-300 p-4 rounded-lg text-left text-xs overflow-auto max-h-60 mb-4">
            {this.state.error.message}{"\n"}{this.state.error.stack}
          </pre>
          <button onClick={() => { localStorage.removeItem("hft_sim_state"); window.location.reload() }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500">
            Sifirla ve Yeniden Yukle
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const ProChart = dynamic(() => import("@/components/Chart/ProChart"), { ssr: false })

const fetcher = (path: string) => api.get(path)

// MEXC symbol (ETHUSDT) -> ProChart symbol (ETH/USDT:USDT)
function toChartSymbol(s: string): string {
  const base = s.replace("USDT", "")
  return `${base}/USDT:USDT`
}

type TradingMode = "sim" | "paper" | "live"
type GridMode = "manual" | "bollinger" | "hybrid" | "bb_direction" | "trend_score" | "math_grid_gemini"
type GridDirection = "long" | "short" | "auto"

interface SimTrade {
  id: number
  side: "BUY" | "SELL"
  price: number
  gridLevel: number
  pnl: number
  time: string
  mode?: string
  exchange_status?: string
  grid_levels?: number[]
  level_count?: number
  timestamp?: number
}

interface ExchangePosition {
  side: string
  contracts: number
  entry_price: number
  unrealized_pnl: number
  leverage: number
  margin: number
  liquidation_price: number
}

export default function HftPage() {
  const { data: hftSettingsData, mutate: mutateHftSettings } = useSWR("/simulations/hft-settings", fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
    dedupingInterval: 3000,
  })
  const hftSettings = hftSettingsData || {}

  const [livePrice, setLivePrice] = useState<number>(0)
  const [simRunning, setSimRunning] = useState(false)
  const [tradingMode, setTradingMode] = useState<TradingMode>("sim")
  const [trades, setTrades] = useState<SimTrade[]>([])
  const [totalPnl, setTotalPnl] = useState(0)
  const [tradeCount, setTradeCount] = useState(0)
  const [gridBounds, setGridBounds] = useState<{ upper: number; lower: number } | null>(null)
  const lastGridHitRef = useRef<number>(-1)
  const tradeIdRef = useRef(0)
  const simFilledRef = useRef<Set<number>>(new Set())       // Sim: dolu seviyeler
  const simEntryPricesRef = useRef<Map<number, number>>(new Map()) // Sim: entry fiyatları

  const [gridMode, setGridMode] = useState<GridMode>("manual")
  const [bbTimeframe, setBbTimeframe] = useState("5m")
  const [bbPeriod, setBbPeriod] = useState("20")
  const [bbStdDev, setBbStdDev] = useState("2.0")
  const [minSpread, setMinSpread] = useState("0.3")
  const [minEmaPct, setMinEmaPct] = useState("1.0")
  const [emaExitMode, setEmaExitMode] = useState("ema_cross")
  const [filterRsi, setFilterRsi] = useState(true)
  const [filterSqueeze, setFilterSqueeze] = useState(true)
  const [filterMidline, setFilterMidline] = useState(true)
  const [filterMtf, setFilterMtf] = useState(true)
  const [filterAtrStep, setFilterAtrStep] = useState(false)
  const [smartStartWait, setSmartStartWait] = useState(true)
  const [gridDirection, setGridDirection] = useState<GridDirection>("long")
  const [autoGridCount, setAutoGridCount] = useState(false) // Otomatik kademe sayisi
  const [suggestedGrid, setSuggestedGrid] = useState<{ count: number; step: number; stepPct: number; atrRatio: number } | null>(null)
  
  // Akıllı Tarayıcı Modu
  const [coinMode, setCoinMode] = useState<"single" | "scanner">("single")
  const [maxScannerCoins, setMaxScannerCoins] = useState(5)
  const [selectedScannerCoin, setSelectedScannerCoin] = useState<string | null>(null)

  // Band exit tracking — fiyat BB bant disina cikip geri girince pozisyon kapat
  const bandExitRef = useRef<{ exited: boolean; side: "upper" | "lower" | null }>({ exited: false, side: null })

  // BB Yön modu — bant dokunusu sonrasi grid durduruldu, orta çizgi kesimi bekleniyor
  const [bbDirPaused, setBbDirPaused] = useState(false) // bant dokunusu sonrasi duraklama
  const [bbDirWaitCross, setBbDirWaitCross] = useState(false) // orta cizgi kesimi bekleniyor
  const bbDirLastMidSideRef = useRef<"above" | "below" | null>(null) // son orta cizgi yonu

  // Sim BB state — backend'den alinan BB meta verisi
  const simBbRef = useRef<{
    bb_upper: number; bb_lower: number; bb_mid: number; bb_width: number;
    rsi: number; adx: number; is_squeeze: boolean; above_midline: boolean;
  } | null>(null)
  const [simBbMeta, setSimBbMeta] = useState<typeof simBbRef.current>(null)

  // Sim verilerini localStorage'dan yukle (sayfa yenilemede kaybolmasin)
  const simRestoredRef = useRef(false)
  const [isRestored, setIsRestored] = useState(false)
  useEffect(() => {
    if (simRestoredRef.current) return
    simRestoredRef.current = true
    try {
      const saved = localStorage.getItem("hft_sim_state")
      if (saved) {
        const s = JSON.parse(saved)
        if (s && s.simRunning) {
          setSimRunning(true)
          setTradingMode(s.tradingMode || "sim")
          setTrades(Array.isArray(s.trades) ? s.trades : [])
          setTotalPnl(Number(s.totalPnl) || 0)
          setTradeCount(Number(s.tradeCount) || 0)
          if (s.gridBounds && typeof s.gridBounds.upper === "number") setGridBounds(s.gridBounds)
          lastGridHitRef.current = s.lastLevel ?? -1
          tradeIdRef.current = s.tradeId ?? 0
          if (Array.isArray(s.filled)) simFilledRef.current = new Set(s.filled)
          if (Array.isArray(s.entryPrices)) simEntryPricesRef.current = new Map(s.entryPrices)
          if (s.gridMode === "manual" || s.gridMode === "bollinger" || s.gridMode === "hybrid" || s.gridMode === "bb_direction" || s.gridMode === "trend_score" || s.gridMode === "math_grid_gemini") {
            setGridMode(s.gridMode)
          }
          if (s.gridDirection === "long" || s.gridDirection === "short" || s.gridDirection === "auto") {
            setGridDirection(s.gridDirection)
          }
          if (typeof s.bbDirPaused === "boolean") setBbDirPaused(s.bbDirPaused)
          if (typeof s.bbDirWaitCross === "boolean") setBbDirWaitCross(s.bbDirWaitCross)
        }
      }
    } catch {
      // Bozuk localStorage verisi — temizle
      localStorage.removeItem("hft_sim_state")
    } finally {
      setIsRestored(true)
    }
  }, [])

  // Sim state degistiginde localStorage'a kaydet
  useEffect(() => {
    if (!simRestoredRef.current) return
    try {
      if (simRunning) {
        localStorage.setItem("hft_sim_state", JSON.stringify({
          simRunning: true,
          tradingMode,
          trades: trades.slice(0, 50), // Son 50 islem yeterli
          totalPnl,
          tradeCount,
          gridBounds,
          lastLevel: lastGridHitRef.current,
          tradeId: tradeIdRef.current,
          filled: Array.from(simFilledRef.current),
          entryPrices: Array.from(simEntryPricesRef.current.entries()),
          gridMode,
          gridDirection,
          bbDirPaused,
          bbDirWaitCross,
        }))
      } else {
        // Durmus ama verileri gostermek icin sakla
        const existing = localStorage.getItem("hft_sim_state")
        if (existing) {
          const s = JSON.parse(existing)
          s.simRunning = false
          localStorage.setItem("hft_sim_state", JSON.stringify(s))
        }
      }
    } catch {}
  }, [simRunning, trades, totalPnl, tradeCount, gridBounds, tradingMode, gridMode, gridDirection])

  // Scanner açık pozisyonları (çoklu koin modu — tüm modlarda)
  const { data: scannerOpenData } = useSWR(
    "/simulations?status=open&limit=20",
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: false, dedupingInterval: 3000 }
  )
  const scannerOpenCoins: { coin: string; symbol: string; direction: string; entry_price: number; pnl_pct: number; confidence: number }[] = useMemo(() => {
    if (!scannerOpenData?.items) return []
    return scannerOpenData.items.map((item: any) => ({
      coin: item.coin,
      symbol: item.symbol || (item.coin + "USDT"),
      direction: item.direction,
      entry_price: item.entry_price,
      pnl_pct: item.pnl_pct || 0,
      confidence: item.confidence || 0,
    }))
  }, [scannerOpenData])

  const handleScannerCoinClick = (coinItem: { coin: string; symbol: string }) => {
    const mexcSymbol = coinItem.symbol.replace("/", "").replace(":USDT", "")
    setSelectedScannerCoin(mexcSymbol)
    updateHftSetting("symbol", mexcSymbol)
    setGridBounds(null)
  }

  // Backend status (paper/live modlar icin)
  const [backendStatus, setBackendStatus] = useState<any>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isKilling, setIsKilling] = useState(false)
  const [killConfirm, setKillConfirm] = useState(false)
  const [chartFullscreen, setChartFullscreen] = useState(false)

  // ESC ile tam ekrandan cik
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && chartFullscreen) setChartFullscreen(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [chartFullscreen])

  // Fullscreen gecisinde chart'i yeniden boyutlandir
  useEffect(() => {
    const timer = setTimeout(() => window.dispatchEvent(new Event("resize")), 50)
    return () => clearTimeout(timer)
  }, [chartFullscreen])

  // Eger bot (backend) calisiyorsa ve ccxt_symbol varsa, grafigi ona gore otomatik degistir.
  const isBackendActive = (tradingMode === "paper" || tradingMode === "live") && backendStatus?.running;
  const symbol = isBackendActive && backendStatus?.ccxt_symbol
    ? backendStatus.ccxt_symbol.split(":")[0].replace("/", "") // "BTC/USDT:USDT" -> "BTCUSDT"
    : (hftSettings.symbol || "ETHUSDT")

  // Local input state — silme/yazma sorunsuz çalışır, blur'da API'ye gönderilir
  const [localSpread, setLocalSpread] = useState("")
  const [localGrid, setLocalGrid] = useState("")
  const [localLev, setLocalLev] = useState("")
  const [localOrder, setLocalOrder] = useState("")

  // Backend'den gelen değerler SADECE ilk yüklemede local'i set eder (SWR refresh'lerde üzerine yazmaz)
  const settingsLoadedRef = useRef(false)
  useEffect(() => {
    if (settingsLoadedRef.current) return // İlk yüklemeden sonra tekrar çalışma
    if (!hftSettings.spread_pct && !hftSettings.grid_count) return // Henüz veri gelmedi
    settingsLoadedRef.current = true

    if (hftSettings.spread_pct != null) setLocalSpread(String(hftSettings.spread_pct))
    if (hftSettings.grid_count != null) setLocalGrid(String(hftSettings.grid_count))
    if (hftSettings.leverage != null) setLocalLev(String(hftSettings.leverage))
    if (hftSettings.order_size != null) setLocalOrder(String(hftSettings.order_size))

    if (hftSettings.grid_mode) setGridMode(hftSettings.grid_mode as GridMode)
    if (hftSettings.bb_timeframe) setBbTimeframe(hftSettings.bb_timeframe)
    if (hftSettings.bb_period != null) setBbPeriod(String(hftSettings.bb_period))
    if (hftSettings.bb_std_dev != null) setBbStdDev(String(hftSettings.bb_std_dev))
    if (hftSettings.min_spread_pct != null) setMinSpread(String(hftSettings.min_spread_pct))
    if (hftSettings.min_ema_pct != null) setMinEmaPct(String(hftSettings.min_ema_pct))
    if (hftSettings.ema_exit_mode != null) setEmaExitMode(hftSettings.ema_exit_mode)
    if (hftSettings.budget_mode != null) setBudgetMode(hftSettings.budget_mode)
    if (hftSettings.filter_mtf != null) setFilterMtf(hftSettings.filter_mtf === 1)
  }, [
    hftSettings.spread_pct, hftSettings.grid_count, hftSettings.leverage, hftSettings.order_size,
    hftSettings.grid_mode, hftSettings.bb_timeframe, hftSettings.bb_period, hftSettings.bb_std_dev, hftSettings.min_spread_pct, hftSettings.min_ema_pct, hftSettings.ema_exit_mode, hftSettings.budget_mode, hftSettings.filter_mtf
  ])

  const spreadPct = Number(localSpread) || hftSettings.spread_pct || 1.5
  const gridCount = Number(localGrid) || hftSettings.grid_count || 20
  const leverage = Number(localLev) || hftSettings.leverage || 10
  const orderSize = Number(localOrder) || hftSettings.order_size || 100
  const [budgetMode, setBudgetMode] = useState(hftSettings.budget_mode || "fixed")

  const commitSetting = async (key: string, raw: string, fallback: number) => {
    const v = Number(raw)
    if (!v || isNaN(v)) return
    updateHftSetting(key, v)
    // Spread veya grid sayısı değişince sim modda grid'i hemen güncelle
    if ((key === "min_spread_pct" || key === "grid_count") && simRunning && tradingMode === "sim" && gridMode !== "manual") {
      try {
        const res = await api.post("/simulations/hft-bb-data", {
          symbol,
          bb_timeframe: bbTimeframe,
          bb_period: Number(bbPeriod) || 20,
          bb_std_dev: Number(bbStdDev) || 2.0,
          min_spread_pct: key === "min_spread_pct" ? v : Number(minSpread) || 0.3,
          current_price: livePrice,
          grid_count: key === "grid_count" ? v : gridCount,
        })
        if (!res.error && res.bb_upper) {
          setGridBounds({ upper: res.bb_upper, lower: res.bb_lower })
        }
      } catch {}
    }
  }

  const isBackendMode = tradingMode === "paper" || tradingMode === "live"

  // Canli fiyat cek — 2sn
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
    const id = setInterval(poll, 2000)  // 2s — hızlı güncelleme
    return () => { cancelled = true; clearInterval(id) }
  }, [symbol])

  // Sayfa açılışında backend'de çalışan bot var mı kontrol et — varsa otomatik moda geç
  const backendCheckDoneRef = useRef(false)
  useEffect(() => {
    if (backendCheckDoneRef.current) return
    backendCheckDoneRef.current = true
    const checkBackend = async () => {
      try {
        const status = await api.get("/simulations/hft-status")
        if (status?.running && status.mode) {
          const mode = status.mode === "live" ? "live" : "paper"
          setTradingMode(mode)
          setSimRunning(true)
          console.log(`[HFT] Backend'de çalışan bot bulundu → ${mode} moduna geçildi`)
        }
      } catch {}
    }
    checkBackend()
  }, [])

  // Backend status polling (paper/live modda)
  useEffect(() => {
    if (!isBackendMode) {
      setBackendStatus(null)
      return
    }
    let cancelled = false
    const poll = async () => {
      try {
        const status = await api.get("/simulations/hft-status")
        if (!cancelled) {
          setBackendStatus(status)
          if (status.running) {
            setSimRunning(true)
            const unrealized = status.exchange_positions?.reduce((sum: number, p: any) => sum + (p.unrealized_pnl || 0), 0) || 0
            setTotalPnl((status.total_pnl || 0) + unrealized)
            setTradeCount(status.total_trades || 0)
            if (status.upper && status.lower) {
              setGridBounds({ upper: status.upper, lower: status.lower })
            }
            // Backend trades
            if (status.trades && status.trades.length > 0) {
              setTrades(status.trades.map((t: any, i: number) => ({
                id: t.id || i,
                side: t.side,
                price: t.price,
                gridLevel: t.grid_levels?.[0] ?? t.last_level ?? 0,
                pnl: t.pnl,
                time: t.time ? new Date(t.time).toLocaleTimeString("tr-TR") : "",
                mode: t.mode,
                exchange_status: t.exchange_status,
                grid_levels: t.grid_levels,
                level_count: t.level_count,
                timestamp: t.timestamp || (t.time ? Math.floor(new Date(t.time).getTime() / 1000) : undefined),
              })))
            } else {
              setTrades([])
            }
          } else {
            setSimRunning(false)
          }
        }
      } catch {}
    }
    poll()
    const id = setInterval(poll, 2000)  // 2s — hızlı güncelleme
    return () => { cancelled = true; clearInterval(id) }
  }, [isBackendMode, tradingMode])

  // Grid sinirlarini SADECE ayar degistiginde veya kullanici "Baslat" dediginde guncelle
  const recalcGrid = async () => {
    setTrades([])
    setTotalPnl(0)
    setTradeCount(0)
    if (livePrice <= 0) return
    
    if (gridMode !== "manual") {
      await fetchBbData()
    } else {
      const upper = livePrice * (1 + spreadPct / 100)
      const lower = livePrice * (1 - spreadPct / 100)
      setGridBounds({ upper, lower })
    }
    lastGridHitRef.current = -1
  }

  // Ilk fiyat geldiginde grid kur (sadece restore islemi bittikten sonra ve gridBounds yoksa)
  useEffect(() => {
    if (isRestored && livePrice > 0 && !gridBounds) recalcGrid()
  }, [livePrice, isRestored, gridBounds])

  // Grid cizgileri
  const gridLines = useMemo(() => {
    if (!gridBounds || gridBounds.upper <= gridBounds.lower) return []
    const lines: number[] = []
    const step = (gridBounds.upper - gridBounds.lower) / gridCount
    for (let i = 0; i <= gridCount; i++) {
      lines.push(gridBounds.lower + step * i)
    }
    return lines
  }, [gridBounds, gridCount])

  // Aktif yon hesapla — auto modda BB midline'a gore, degilse sabit
  const activeDirection = useMemo((): "long" | "short" => {
    if (gridMode === "bb_direction" || gridMode === "ema_trend") {
      return (isBackendMode && backendStatus) ? backendStatus.active_direction : (simBbMeta?.above_midline ? "long" : "short")
    }
    return gridDirection === "short" ? "short" : "long"
  }, [gridDirection, gridMode, simBbMeta, isBackendMode, backendStatus])

  const isSimWaiting = useMemo(() => {
    if (!simRunning || tradingMode !== "sim" || gridMode === "manual") return false
    // BB Yön modunda duraklama/bekleme durumları
    if (gridMode === "bb_direction") {
      if (bbDirPaused || bbDirWaitCross) return true
      return false
    }
    const bb = simBbMeta
    if (!bb) return false
    if (filterSqueeze && bb.is_squeeze) return true
    if (filterMidline) {
      if (activeDirection === "long" && !bb.above_midline) return true
      if (activeDirection === "short" && bb.above_midline) return true
    }
    return false
  }, [simRunning, tradingMode, gridMode, simBbMeta, filterSqueeze, filterMidline, activeDirection, bbDirPaused, bbDirWaitCross])

  const isBackendWaiting = useMemo(() => {
    if (!backendStatus?.running) return false
    const state = backendStatus
    if (state.grid_mode === "bb_direction") {
      if (state.bb_dir_paused || state.upper === 0) return true
      return false
    }
    // ema_trend check
    if (state.grid_mode === "ema_trend") {
      if (state.ema_paused || state.upper === 0) return true
      return false
    }
    // math_grid_gemini: upper=0 ise fırsat bekleniyor
    if (state.grid_mode === "math_grid_gemini") {
      if (state.upper === 0) return true
      return false
    }
    // bb_paused check
    if (state.bb_paused) return true

    if (state.grid_mode && state.grid_mode !== "manual") {
      const filters = state.filters || {}
      if (filters.midline_filter && state.bb_mid) {
        if (state.active_direction === "long" && livePrice < state.bb_mid) return true
        if (state.active_direction === "short" && livePrice > state.bb_mid) return true
      }
    }
    return false
  }, [simRunning, isBackendMode, backendStatus, livePrice])

  const isWaiting = isBackendMode ? isBackendWaiting : isSimWaiting

  // Simulasyon motoru — SADECE "sim" modunda calisir (frontend-only)
  // LONG: duste al, yukseliste sat | SHORT: yukseliste short ac, duste kapat
  useEffect(() => {
    if (tradingMode !== "sim" || !simRunning || !gridBounds || livePrice <= 0 || gridLines.length < 2) return

    // ═══ BB YÖN MODU — orta çizgi kesimi ve bant dokunusu lifecycle ═══
    if (gridMode === "bb_direction") {
      const bb = simBbRef.current
      if (!bb) return // BB verisi yok, henüz hesaplanmadı

      // 1. Grid durdurulmuş ve orta çizgi kesimi bekleniyor
      if (bbDirWaitCross) {
        const currentSide = livePrice > bb.bb_mid ? "above" : "below"
        const lastSide = bbDirLastMidSideRef.current
        if (lastSide && currentSide !== lastSide) {
          // Orta çizgi kesildi! Grid'i yeniden başlat
          setBbDirWaitCross(false)
          setBbDirPaused(false)
          bandExitRef.current = { exited: false, side: null }
          // Grid bounds'u güncel BB'ye güncelle
          setGridBounds({ upper: bb.bb_upper, lower: bb.bb_lower })
          lastGridHitRef.current = -1
          simFilledRef.current = new Set()
          simEntryPricesRef.current = new Map()
        }
        bbDirLastMidSideRef.current = currentSide
        return // Bekleme modunda — işlem yapma
      }

      // 2. Grid duraklatılmış (bant dokunusu sonrası) — orta çizgi bekleme moduna geç
      if (bbDirPaused) {
        setBbDirWaitCross(true)
        bbDirLastMidSideRef.current = livePrice > bb.bb_mid ? "above" : "below"
        return
      }

      // 3. Midline takibi — ilk başlangıçta set et
      if (!bbDirLastMidSideRef.current) {
        bbDirLastMidSideRef.current = livePrice > bb.bb_mid ? "above" : "below"
      }

      // 4. Aktif çalışırken orta çizgi geçişi — yön değişimi anında algıla
      const currentMidSide = livePrice > bb.bb_mid ? "above" : "below"
      const prevMidSide = bbDirLastMidSideRef.current
      if (prevMidSide && currentMidSide !== prevMidSide) {
        // Orta çizgi kesildi! Yönü güncelle
        const newAboveMidline = currentMidSide === "above"
        // simBbMeta'yı güncelle ki activeDirection hemen değişsin
        if (simBbRef.current) {
          simBbRef.current = { ...simBbRef.current, above_midline: newAboveMidline }
          setSimBbMeta({ ...simBbRef.current })
        }
        
        // Açık pozisyonları kapat (yön değişti, mevcut pozisyonlar ters kalır)
        const filled = simFilledRef.current
        const entryPrices = simEntryPricesRef.current
        const cs = symbol.includes("BTC") ? 0.0001 : 0.01
        const marginPerLvl = orderSize / gridCount
        const contractsPerLvl = Math.max(1, Math.floor((marginPerLvl * leverage) / (livePrice * cs)))
        if (filled.size > 0) {
          const closeLevels = Array.from(filled)
          const oldDir = newAboveMidline ? "short" : "long" // önceki yön
          // Gerçekçi PnL: borsa standart formülü (exit trigger)
          let totalNetPnl = 0
          for (const lvl of closeLevels) {
            const ep = entryPrices.get(lvl) ?? livePrice
            const lvlGrossPnl = activeDirection === "long" 
              ? contractsPerLvl * cs * (livePrice - ep)
              : contractsPerLvl * cs * (ep - livePrice)
            const lvlFee = (contractsPerLvl * cs * ep * 0.0002) + (contractsPerLvl * cs * livePrice * 0.0002)
            totalNetPnl += (lvlGrossPnl - lvlFee)
          }
          for (const lvl of closeLevels) { filled.delete(lvl); entryPrices.delete(lvl) }
          
          const newTrade: SimTrade = {
            id: ++tradeIdRef.current,
            side: oldDir === "long" ? "SELL" : "BUY",
            price: livePrice,
            gridLevel: closeLevels[0],
            grid_levels: closeLevels,
            level_count: closeLevels.length,
            pnl: Number(totalNetPnl.toFixed(4)),
            time: new Date().toLocaleTimeString("tr-TR"),
            mode: "sim",
            timestamp: Math.floor(Date.now() / 1000),
          }
          setTrades(prev => [newTrade, ...prev].slice(0, 100))
          setTotalPnl(prev => prev + totalNetPnl)
          setTradeCount(prev => prev + 1)
        }
        
        // Grid'i yeniden fiyata merkezle
        setGridBounds({ upper: bb.bb_upper, lower: bb.bb_lower })
        lastGridHitRef.current = -1
        simFilledRef.current = new Set()
        simEntryPricesRef.current = new Map()
        console.log(`[HFT Sim] Midline cross: ${prevMidSide} → ${currentMidSide}, yön ${newAboveMidline ? 'LONG' : 'SHORT'} olarak değişti`)
      }
      bbDirLastMidSideRef.current = currentMidSide
    }

    const step = (gridBounds.upper - gridBounds.lower) / gridCount
    const currentLevel = Math.floor((livePrice - gridBounds.lower) / step)
    const clampedLevel = Math.max(0, Math.min(gridCount - 1, currentLevel))

    if (lastGridHitRef.current === -1) {
      lastGridHitRef.current = clampedLevel
      return
    }

    if (clampedLevel === lastGridHitRef.current) {
      // Trailing kontrolu
      if (livePrice >= gridBounds.upper) {
        const diff = livePrice - gridBounds.upper
        setGridBounds(prev => prev ? { upper: prev.upper + diff, lower: prev.lower + diff } : null)
      } else if (livePrice <= gridBounds.lower && simFilledRef.current.size === 0) {
        const diff = gridBounds.lower - livePrice
        setGridBounds(prev => prev ? { upper: prev.upper - diff, lower: prev.lower - diff } : null)
      }
      return
    }

    const lastLevel = lastGridHitRef.current
    const filled = simFilledRef.current
    const entryPrices = simEntryPricesRef.current
    const cs = symbol.includes("BTC") ? 0.0001 : 0.01
    const marginPerLvl = orderSize / gridCount
    const contractsPerLvl = Math.max(1, Math.floor((marginPerLvl * leverage) / (livePrice * cs)))
    const newTrades: SimTrade[] = []
    const dir = activeDirection

    // BB/Hibrit filtre kontrolleri
    const bb = simBbRef.current
    const isBbMode = gridMode !== "manual"
    let skipOpen = false
    let skipClose = false

    if (isBbMode && bb) {
      // RSI filtresi — yon bazli
      if (dir === "long") {
        if (filterRsi && bb.rsi > 70) skipOpen = true   // Asiri alimda LONG acma
        if (filterRsi && bb.rsi < 30) skipClose = true   // Asiri satimda SELL yapma
      } else {
        if (filterRsi && bb.rsi < 30) skipOpen = true   // Asiri satimda SHORT acma
        if (filterRsi && bb.rsi > 70) skipClose = true   // Asiri alimda COVER yapma
      }
      // Squeeze filtresi — yeni pozisyon acma
      if (filterSqueeze && bb.is_squeeze) skipOpen = true
      // MTF Onayi Filtresi
      if (filterMtf) {
        if (bb.mtf_trend === "long" && dir === "short") skipOpen = true;
        if (bb.mtf_trend === "short" && dir === "long") skipOpen = true;
      }
    }

    if (dir === "long") {
      // ═══ LONG GRID: duste al, yukseliste sat ═══
      if (clampedLevel < lastLevel && !skipOpen) {
        const buyLevels: number[] = []
        for (let lvl = lastLevel - 1; lvl >= clampedLevel; lvl--) {
          if (!filled.has(lvl) && lvl >= 0 && lvl < gridCount) {
            buyLevels.push(lvl)
            filled.add(lvl)
            entryPrices.set(lvl, livePrice)
          }
        }
        if (buyLevels.length > 0) {
          newTrades.push({
            id: ++tradeIdRef.current, side: "BUY", price: livePrice,
            gridLevel: buyLevels[0], grid_levels: buyLevels, level_count: buyLevels.length,
            pnl: 0, time: new Date().toLocaleTimeString("tr-TR"),
            mode: "sim", timestamp: Math.floor(Date.now() / 1000),
          })
        }
      } else if (clampedLevel > lastLevel && !skipClose) {
        const sellLevels: number[] = []
        for (let lvl = lastLevel; lvl < clampedLevel; lvl++) {
          if (filled.has(lvl)) sellLevels.push(lvl)
        }
        if (sellLevels.length > 0) {
          // Gerçekçi PnL: borsa standart formülü
          let totalNetPnl = 0
          for (const lvl of sellLevels) {
            const ep = entryPrices.get(lvl) ?? (livePrice - step)
            const lvlGrossPnl = contractsPerLvl * cs * (livePrice - ep)
            const lvlFee = (contractsPerLvl * cs * ep * 0.0002) + (contractsPerLvl * cs * livePrice * 0.0002)
            totalNetPnl += (lvlGrossPnl - lvlFee)
          }
          if (totalNetPnl < 0) { lastGridHitRef.current = clampedLevel; return }
          for (const lvl of sellLevels) { filled.delete(lvl); entryPrices.delete(lvl) }
          newTrades.push({
            id: ++tradeIdRef.current, side: "SELL", price: livePrice,
            gridLevel: sellLevels[0], grid_levels: sellLevels, level_count: sellLevels.length,
            pnl: Number(totalNetPnl.toFixed(4)), time: new Date().toLocaleTimeString("tr-TR"),
            mode: "sim", timestamp: Math.floor(Date.now() / 1000),
          })
        }
      }
    } else {
      // ═══ SHORT GRID: yukseliste short ac, duste kapat (cover) ═══
      if (clampedLevel > lastLevel && !skipOpen) {
        // Fiyat YUKSELDI → SHORT ac (pozisyon ac)
        const shortLevels: number[] = []
        for (let lvl = lastLevel + 1; lvl <= clampedLevel; lvl++) {
          if (!filled.has(lvl) && lvl >= 0 && lvl < gridCount) {
            shortLevels.push(lvl)
            filled.add(lvl)
            entryPrices.set(lvl, livePrice) // Short giris fiyati
          }
        }
        if (shortLevels.length > 0) {
          newTrades.push({
            id: ++tradeIdRef.current, side: "SELL", price: livePrice,
            gridLevel: shortLevels[0], grid_levels: shortLevels, level_count: shortLevels.length,
            pnl: 0, time: new Date().toLocaleTimeString("tr-TR"),
            mode: "sim", timestamp: Math.floor(Date.now() / 1000),
          })
        }
      } else if (clampedLevel < lastLevel && !skipClose) {
        // Fiyat DUSTU → COVER (short kapat, kar al)
        const coverLevels: number[] = []
        for (let lvl = lastLevel; lvl > clampedLevel; lvl--) {
          if (filled.has(lvl)) coverLevels.push(lvl)
        }
        if (coverLevels.length > 0) {
          // Gerçekçi PnL: borsa standart formülü (short)
          let totalNetPnl = 0
          for (const lvl of coverLevels) {
            const ep = entryPrices.get(lvl) ?? (livePrice + step)
            const lvlGrossPnl = contractsPerLvl * cs * (ep - livePrice)
            const lvlFee = (contractsPerLvl * cs * ep * 0.0002) + (contractsPerLvl * cs * livePrice * 0.0002)
            totalNetPnl += (lvlGrossPnl - lvlFee)
          }
          if (totalNetPnl < 0) { lastGridHitRef.current = clampedLevel; return }
          for (const lvl of coverLevels) { filled.delete(lvl); entryPrices.delete(lvl) }
          newTrades.push({
            id: ++tradeIdRef.current, side: "BUY", price: livePrice,
            gridLevel: coverLevels[0], grid_levels: coverLevels, level_count: coverLevels.length,
            pnl: Number(totalNetPnl.toFixed(4)), time: new Date().toLocaleTimeString("tr-TR"),
            mode: "sim", timestamp: Math.floor(Date.now() / 1000),
          })
        }
      }
    }

    // ═══ BAND EXIT CLOSE — bant disina cik + geri gir = tum pozisyonlari kapat ═══
    const bandExit = bandExitRef.current
    const bbData = simBbRef.current

    if (isBbMode && bbData && filled.size > 0) {
      if (!bandExit.exited) {
        // Fiyat bant disina cikti mi?
        if (dir === "long" && livePrice > bbData.bb_upper) {
          bandExitRef.current = { exited: true, side: "upper" }
        } else if (dir === "short" && livePrice < bbData.bb_lower) {
          bandExitRef.current = { exited: true, side: "lower" }
        }
      } else {
        // Fiyat geri girdi mi? → TUM pozisyonlari kapat
        const reEntered =
          (bandExit.side === "upper" && livePrice <= bbData.bb_upper) ||
          (bandExit.side === "lower" && livePrice >= bbData.bb_lower)

        if (reEntered) {
          // Tum acik pozisyonlari kapat
          const closeLevels = Array.from(filled)
          if (closeLevels.length > 0) {
            // Gerçekçi PnL: margin × leverage × fiyat_değişim_yüzdesi (band exit)
            let totalNetPnl = 0
            for (const lvl of closeLevels) {
              const ep = entryPrices.get(lvl) ?? livePrice
              let priceDiffPct = 0
              if (dir === "long") {
                priceDiffPct = (livePrice - ep) / ep
              } else {
                priceDiffPct = (ep - livePrice) / ep
              }
              const lvlGrossPnl = marginPerLvl * leverage * priceDiffPct
              const lvlNotional = marginPerLvl * leverage
              const lvlFee = lvlNotional * 0.0002 * 2
              totalNetPnl += (lvlGrossPnl - lvlFee)
            }
            const netPnl = totalNetPnl

            for (const lvl of closeLevels) { filled.delete(lvl); entryPrices.delete(lvl) }

            newTrades.push({
              id: ++tradeIdRef.current,
              side: dir === "long" ? "SELL" : "BUY",
              price: livePrice,
              gridLevel: closeLevels[0],
              grid_levels: closeLevels,
              level_count: closeLevels.length,
              pnl: Number(netPnl.toFixed(4)),
              time: new Date().toLocaleTimeString("tr-TR"),
              mode: "sim",
              timestamp: Math.floor(Date.now() / 1000),
            })
          }
          // Band exit sifirla
          bandExitRef.current = { exited: false, side: null }

          // BB Yön modunda → grid'i duraklat, orta çizgi kesimi bekle
          if (gridMode === "bb_direction") {
            setBbDirPaused(true)
          }
        }
      }
    }

    if (newTrades.length > 0) {
      setTrades(prev => [...newTrades.reverse(), ...prev].slice(0, 100))
      const pnlSum = newTrades.reduce((s, t) => s + t.pnl, 0)
      setTotalPnl(prev => prev + pnlSum)
      setTradeCount(prev => prev + newTrades.length)
    }

    lastGridHitRef.current = clampedLevel

    // Trailing — BB modda bant disina cikinca trailing YAPMA (band exit mekanizmasi devreye girer)
    if (isBbMode && bandExitRef.current.exited) {
      // Bant disinda — trailing yok, geri girisi bekle
    } else if (livePrice >= gridBounds.upper) {
      const diff = livePrice - gridBounds.upper
      setGridBounds(prev => prev ? { upper: prev.upper + diff, lower: prev.lower + diff } : null)
    } else if (livePrice <= gridBounds.lower && simFilledRef.current.size === 0) {
      const diff = gridBounds.lower - livePrice
      setGridBounds(prev => prev ? { upper: prev.upper - diff, lower: prev.lower - diff } : null)
    }
  }, [livePrice, simRunning, gridBounds, tradingMode, activeDirection])

  // Sim BB recalc loop — her 60s BB bantlarini yeniden hesapla ve grid'i guncelle
  useEffect(() => {
    if (tradingMode !== "sim" || !simRunning || gridMode === "manual") return
    const interval = setInterval(async () => {
      try {
        const res = await api.post("/simulations/hft-bb-data", {
          symbol,
          bb_timeframe: bbTimeframe,
          bb_period: Number(bbPeriod),
          bb_std_dev: Number(bbStdDev),
          min_spread_pct: Number(minSpread),
          filters: { min_ema_pct: Number(minEmaPct), ema_exit_mode: emaExitMode },
          current_price: livePrice,
          grid_count: gridCount,
        })
        if (res.error || !res.bb_upper) return
        const meta = {
          bb_upper: res.bb_upper, bb_lower: res.bb_lower,
          bb_mid: res.bb_mid, bb_width: res.bb_width,
          rsi: res.rsi ?? 50, adx: res.adx ?? 0,
          is_squeeze: res.is_squeeze ?? false,
          above_midline: res.above_midline ?? true,
        }
        simBbRef.current = meta
        setSimBbMeta(meta)
        // Otomatik kademe guncelle
        if (res.suggested_grid_count && autoGridCount) {
          setSuggestedGrid({
            count: res.suggested_grid_count, step: res.suggested_step || 0,
            stepPct: res.suggested_step_pct || 0, atrRatio: res.atr_step_ratio || 0,
          })
          setLocalGrid(String(res.suggested_grid_count))
        }
        // Grid bounds degistiyse guncelle (filled levels korunur)
        setGridBounds(prev => {
          if (!prev) return { upper: res.bb_upper, lower: res.bb_lower }
          const diffPct = Math.abs(res.bb_upper - prev.upper) / prev.upper
          if (diffPct > 0.001) { // %0.1'den fazla degisim varsa guncelle
            return { upper: res.bb_upper, lower: res.bb_lower }
          }
          return prev
        })
      } catch {}
    }, 60000) // 60 saniye
    return () => clearInterval(interval)
  }, [tradingMode, simRunning, gridMode, symbol, bbTimeframe, bbPeriod, bbStdDev, minSpread, minEmaPct])

  const gridStep = gridBounds ? (gridBounds.upper - gridBounds.lower) / gridCount : 0
  // Kontrat bazlı tahmini kademe kari (margin bazli)
  // contractSize ETH=0.01, BTC=0.0001 vb.
  const contractSize = symbol.includes("BTC") ? 0.0001 : 0.01
  const marginPerLevel = orderSize / gridCount
  const contracts = Math.max(1, Math.floor((marginPerLevel * leverage) / (livePrice * contractSize)))
  const grossPerGrid = contracts * contractSize * gridStep
  const feePerGrid = contracts * contractSize * livePrice * 0.0002 * 2  // MEXC taker fee %0.02
  const netPerGrid = grossPerGrid - feePerGrid
  const profitPerGrid = livePrice > 0 && gridStep > 0 ? (netPerGrid / (contracts * contractSize * livePrice)) * 100 * leverage : 0

  const updateHftSetting = async (key: string, value: any) => {
    try {
      await api.post("/simulations/hft-settings", { [key]: value })
      mutateHftSettings()
    } catch {}
  }

  // ─── Baslat / Durdur ───────────────────────────────────────────────

  // BB verisi cek (sim modu icin)
  const fetchBbData = async (): Promise<boolean> => {
    setTrades([])
    setTotalPnl(0)
    setTradeCount(0)
    try {
      const res = await api.post("/simulations/hft-bb-data", {
        symbol,
        bb_timeframe: bbTimeframe,
        bb_period: Number(bbPeriod) || 20,
        bb_std_dev: Number(bbStdDev) || 2.0,
        min_spread_pct: Number(minSpread) || 0.3,
        current_price: livePrice,
        grid_mode: gridMode,
        smart_start_wait: smartStartWait,
        grid_count: gridCount,
      })
      if (res.error) {
        alert(`BB Hatasi: ${res.error}`)
        return false
      }
      const meta = {
        bb_upper: res.bb_upper, bb_lower: res.bb_lower,
        bb_mid: res.bb_mid, bb_width: res.bb_width,
        rsi: res.rsi ?? 50, adx: res.adx ?? 0,
        is_squeeze: res.is_squeeze ?? false,
        above_midline: res.above_midline ?? true,
        recent_cross: res.recent_cross ?? false,
        recent_cross_direction: res.recent_cross_direction ?? "",
        current_side: res.current_side ?? "above",
      }
      simBbRef.current = meta
      setSimBbMeta(meta)

      // BB Yön Akıllı Başlangıç: sinyal tazeyse hemen başla, değilse avda bekle
      if (gridMode === "bb_direction") {
        if (meta.recent_cross) {
          // Taze sinyal! Hemen başla
          setBbDirWaitCross(false)
          setBbDirPaused(false)
          bbDirLastMidSideRef.current = meta.current_side
          console.log(`[HFT Sim] Akıllı Başlangıç: Taze sinyal (${meta.recent_cross_direction}), hemen başlatılıyor`)
        } else {
          // Sinyal eski — avda bekle
          setBbDirWaitCross(true)
          bbDirLastMidSideRef.current = livePrice > meta.bb_mid ? "above" : "below"
          console.log(`[HFT Sim] Akıllı Başlangıç: Taze sinyal yok, avda bekleniyor`)
        }
      }

      setGridBounds({ upper: res.bb_upper, lower: res.bb_lower })

      // Otomatik kademe onerisi
      if (res.suggested_grid_count) {
        setSuggestedGrid({
          count: res.suggested_grid_count,
          step: res.suggested_step || 0,
          stepPct: res.suggested_step_pct || 0,
          atrRatio: res.atr_step_ratio || 0,
        })
        // Oto mod aciksa kademe sayisini otomatik ayarla
        if (autoGridCount) {
          setLocalGrid(String(res.suggested_grid_count))
          commitSetting("grid_count", String(res.suggested_grid_count), 20)
        }
      }
      return true
    } catch (e: any) {
      alert(`BB veri hatasi: ${e.message}`)
      return false
    }
  }

  const handleStart = async () => {
    // Tüm local ayarları başlatmadan önce kalıcı hale getir ki SWR geriye döndürmesin
    const _spread = Number(localSpread) || 1.5
    const _grid = Number(localGrid) || 20
    const _lev = Number(localLev) || 10
    const _order = Number(localOrder) || 100

    setLocalSpread(String(_spread))
    setLocalGrid(String(_grid))
    setLocalLev(String(_lev))
    setLocalOrder(String(_order))

    await api.post("/simulations/hft-settings", {
      spread_pct: _spread,
      grid_count: _grid,
      leverage: _lev,
      order_size: _order,
      grid_mode: gridMode,
      grid_direction: gridDirection,
      bb_timeframe: bbTimeframe,
      bb_period: Number(bbPeriod) || 20,
      bb_std_dev: Number(bbStdDev) || 2.0,
      min_spread_pct: Number(minSpread) || 0.3,
      min_ema_pct: Number(minEmaPct) || 1.0,
      ema_exit_mode: emaExitMode,
    })
    mutateHftSettings()

    if (tradingMode === "sim") {
      setTrades([])
      setTotalPnl(0)
      setTradeCount(0)
      lastGridHitRef.current = -1
      simFilledRef.current = new Set()
      simEntryPricesRef.current = new Map()
      localStorage.removeItem("hft_sim_state")

      // BB Yön modunda duraklama/bekleme state'lerini sıfırla (fetchBbData içinde akıllı başlangıç yapılır)
      setBbDirPaused(false)
      if (gridMode !== "bb_direction") setBbDirWaitCross(false)
      bbDirLastMidSideRef.current = null
      bandExitRef.current = { exited: false, side: null }

      if (gridMode !== "manual") {
        // BB/Hibrit/BB Yön: backend'den BB bantlarini al
        setIsStarting(true)
        const ok = await fetchBbData()
        setIsStarting(false)
        if (!ok) return
      } else {
        recalcGrid()
      }

      setSimRunning(true)
      return
    }

    // Paper veya Live mod — backend'e gonder
    setIsStarting(true)
    try {
      const result = await api.post("/simulations/hft-start", {
        mode: tradingMode,
        symbol,
        leverage,
        order_size: orderSize,
        spread_pct: spreadPct,
        grid_count: gridCount,
        grid_mode: gridMode,
        grid_direction: gridDirection,
        bb_timeframe: bbTimeframe,
        bb_period: Number(bbPeriod) || 20,
        bb_std_dev: Number(bbStdDev) || 2.0,
        min_spread_pct: Number(minSpread) || 0.3,
        filters: {
          rsi_filter: filterRsi,
          squeeze_filter: filterSqueeze,
          midline_filter: filterMidline,
          atr_min_step: filterAtrStep,
          min_ema_pct: Number(minEmaPct) || 1.0,
          ema_exit_mode: emaExitMode,
        },
        smart_start_wait: smartStartWait,
      })

      if (result.error) {
        alert(`Hata: ${result.error}`)
      } else {
        setSimRunning(true)
        setTrades([])
        setTotalPnl(0)
        setTradeCount(0)
        if (result.step) {
          const upper = livePrice * (1 + spreadPct / 100)
          const lower = livePrice * (1 - spreadPct / 100)
          setGridBounds({ upper, lower })
        } else {
          setGridBounds(null) // Grid henüz başlamadıysa temizle
        }
      }
    } catch (e: any) {
      alert(`Baslatma hatasi: ${e.message}`)
    }
    setIsStarting(false)
  }

  const handleStop = async () => {
    if (tradingMode === "sim") {
      setSimRunning(false)
      return
    }

    setIsStopping(true)
    try {
      await api.post("/simulations/hft-stop", { close_positions: false })
      setSimRunning(false)
    } catch (e: any) {
      alert(`Durdurma hatasi: ${e.message}`)
    }
    setIsStopping(false)
  }

  const handleKillSwitch = async () => {
    if (!killConfirm) {
      setKillConfirm(true)
      setTimeout(() => setKillConfirm(false), 5000) // 5sn icinde onaylanmazsa iptal
      return
    }

    setIsKilling(true)
    setKillConfirm(false)
    try {
      const result = await api.post("/simulations/hft-kill", {})
      setSimRunning(false)
      alert(
        `Kill Switch Aktif!\n` +
        `Emirler iptal: ${result.orders_cancelled ? 'Evet' : 'Hayir'}\n` +
        `Kapatilan pozisyonlar: ${result.positions_closed?.length || 0}\n` +
        `Toplam PnL: $${result.total_pnl?.toFixed(2) || '0'}`
      )
    } catch (e: any) {
      alert(`Kill switch hatasi: ${e.message}`)
    }
    setIsKilling(false)
  }

  const handleStopAndClose = async () => {
    setIsStopping(true)
    try {
      const result = await api.post("/simulations/hft-stop", { close_positions: true })
      setSimRunning(false)
      if (result.positions_closed?.length > 0) {
        alert(`Bot durduruldu ve ${result.positions_closed.length} pozisyon kapatildi.`)
      }
    } catch (e: any) {
      alert(`Hata: ${e.message}`)
    }
    setIsStopping(false)
  }

  const chartSymbol = toChartSymbol(symbol)

  // Mod isimleri ve renkleri
  const modeConfig = {
    sim: { label: "Simulasyon", color: "from-blue-600 to-blue-500", badge: "bg-blue-500/20 text-blue-400", desc: "Frontend uzerinde sanal" },
    paper: { label: "Paper", color: "from-amber-600 to-amber-500", badge: "bg-amber-500/20 text-amber-400", desc: "Backend sanal islem" },
    live: { label: "CANLI", color: "from-red-600 to-red-500", badge: "bg-red-500/20 text-red-400", desc: "Gercek borsa islemleri" },
  }

  const mc = modeConfig[tradingMode]

  return (
    <HftErrorBoundary>
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto space-y-4 sm:space-y-5 overflow-x-hidden">

      {/* Baslik */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2 sm:gap-3">
              <span className="p-1.5 sm:p-2 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-lg shadow-lg shadow-indigo-500/20 shrink-0">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              <span className="truncate">HFT Trailing Grid Motoru</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 truncate">
              {symbol} · {gridMode === "manual" ? `±${spreadPct}%` : `BB ${bbTimeframe}`} · {gridCount} kademe · {leverage}x kaldirac
              <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold ${mc.badge}`}>
                {mc.label}
              </span>
              {gridMode !== "manual" && (
                <span className="ml-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-400">
                  {gridMode === "bollinger" ? "BB" : "HIBRIT"}
                </span>
              )}
              <span className={`ml-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                activeDirection === "long" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              }`}>
                {activeDirection === "long" ? "LONG" : "SHORT"}
              </span>
            </p>
          </div>
          {/* Canli Fiyat — sag ust */}
          <div className="text-right shrink-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">{symbol}</div>
            <div className="text-lg sm:text-2xl font-bold text-white font-mono flex items-center gap-1 justify-end">
              {livePrice > 0 ? `$${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "..."}
              {livePrice > 0 && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />}
            </div>
          </div>
        </div>

        {/* Mod Secici + Baslat/Durdur — mobilde alt satir */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Mod Secici */}
          <div className="flex bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            {(["sim", "paper", "live"] as TradingMode[]).map(m => (
              <button
                key={m}
                onClick={() => { if (!simRunning) setTradingMode(m) }}
                disabled={simRunning}
                className={`px-3 py-1.5 text-xs font-bold transition-all ${
                  tradingMode === m
                    ? m === "live" ? "bg-red-600 text-white" : m === "paper" ? "bg-amber-600 text-white" : "bg-blue-600 text-white"
                    : "text-slate-500 hover:text-slate-300 disabled:opacity-30"
                }`}
              >
                {modeConfig[m].label}
              </button>
            ))}
          </div>

          {/* Baslat / Durdur */}
          {!simRunning ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleStart}
                disabled={livePrice <= 0 || isStarting}
                className={`px-4 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r ${mc.color} hover:brightness-110 disabled:opacity-50 text-white font-bold rounded-lg shadow-lg transition-all flex items-center justify-center gap-2 text-sm w-full`}
              >
                {isStarting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                )}
                {tradingMode === "live" ? "CANLI BASLAT" : "Baslat"}
              </button>
              {/* Toggle: Avda Başlat / Anında Başlat */}
              {(gridMode === "bb_direction" || gridMode === "ema_trend") && (
                <div className="flex items-center justify-center gap-3 w-full bg-slate-800/40 py-1.5 rounded-lg border border-slate-700/40 mt-1">
                  <span 
                    className={`text-[10px] font-bold transition-colors cursor-pointer ${smartStartWait ? 'text-amber-400' : 'text-slate-500 hover:text-slate-400'}`}
                    onClick={() => setSmartStartWait(true)}
                  >
                    Avda Başlat
                  </span>
                  <button
                    onClick={() => setSmartStartWait(!smartStartWait)}
                    disabled={simRunning}
                    className={`relative w-10 h-5 rounded-full transition-all duration-300 focus:outline-none disabled:opacity-50 ${
                      !smartStartWait
                        ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30'
                        : 'bg-amber-500 shadow-lg shadow-amber-500/30'
                    }`}
                    title={smartStartWait ? 'Avda Başlat: Taze sinyal bekler' : 'Anında Başlat: Hemen işlemlere başlar'}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
                      !smartStartWait ? 'left-[22px]' : 'left-0.5'
                    }`} />
                  </button>
                  <span 
                    className={`text-[10px] font-bold transition-colors cursor-pointer ${!smartStartWait ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-400'}`}
                    onClick={() => setSmartStartWait(false)}
                  >
                    Anında Başlat
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleStop}
                disabled={isStopping}
                className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-all flex items-center gap-2 text-sm"
              >
                {isStopping ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>
                )}
                Durdur
              </button>
              {isBackendMode && tradingMode === "live" && (
                <button
                  onClick={handleStopAndClose}
                  disabled={isStopping}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg transition-all text-xs"
                >
                  Durdur + Kapat
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Mode Uyari + Kill Switch */}
      {tradingMode === "live" && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 bg-red-950/40 border border-red-500/30 rounded-xl px-3 sm:px-5 py-2.5 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shrink-0" />
            <div className="min-w-0">
              <span className="text-red-400 font-bold text-xs sm:text-sm">CANLI ISLEM MODU</span>
              <span className="text-red-400/70 text-[10px] sm:text-xs ml-2 sm:ml-3 hidden sm:inline">Gercek MEXC emirleri gonderilecek — dikkatli olun!</span>
            </div>
          </div>
          <button
            onClick={handleKillSwitch}
            disabled={isKilling}
            className={`px-3 sm:px-5 py-2 sm:py-2.5 font-bold rounded-lg transition-all flex items-center gap-2 text-xs sm:text-sm shrink-0 w-full sm:w-auto justify-center ${
              killConfirm
                ? "bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-lg shadow-red-600/50"
                : "bg-red-900/80 hover:bg-red-800 text-red-300 border border-red-500/50"
            }`}
          >
            {isKilling ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            )}
            {killConfirm ? "ONAYLA — IPTAL ET" : "KILL SWITCH"}
          </button>
        </div>
      )}

      {/* Ana Kart */}
      <div className="bg-gradient-to-br from-slate-900 to-black border border-indigo-500/30 rounded-xl p-3 sm:p-5 relative overflow-hidden shadow-2xl">

        {/* Ayar Paneli */}
        <div className="flex flex-wrap items-end gap-2 sm:gap-4 bg-slate-800/80 p-3 sm:p-4 rounded-xl border border-slate-700/60 relative z-10 mb-4 shadow-inner">
          {/* Islem Modu (Tekli / Tarayici) */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">İşlem Modu</span>
            <select
              value={coinMode}
              onChange={e => setCoinMode(e.target.value as "single" | "scanner")}
              disabled={simRunning}
              className="bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
            >
              <option value="single">Tekli Coin</option>
              <option value="scanner">Akıllı Tarayıcı (Çoklu Coin)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {coinMode === "single" ? "Coin" : "Maks Eşzamanlı İşlem"}
            </span>
            {coinMode === "single" ? (
              <select
                value={symbol}
                onChange={e => { updateHftSetting("symbol", e.target.value); setGridBounds(null) }}
                disabled={simRunning}
                className="bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
              >
                <option value="BTCUSDT">BTCUSDT</option>
                <option value="ETHUSDT">ETHUSDT</option>
                <option value="SOLUSDT">SOLUSDT</option>
                <option value="XRPUSDT">XRPUSDT</option>
                <option value="DOGEUSDT">DOGEUSDT</option>
                <option value="BNBUSDT">BNBUSDT</option>
                <option value="AVAXUSDT">AVAXUSDT</option>
              </select>
            ) : (
              <input 
                type="number" 
                value={maxScannerCoins} 
                onChange={e => setMaxScannerCoins(Number(e.target.value))}
                min={1} max={20} disabled={simRunning}
                className="w-24 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50 text-center"
              />
            )}
          </div>

          <div className="w-px h-8 bg-slate-700/50 hidden md:block" />

          {/* Strateji Secimi */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Strateji</span>
            <select
              value={gridMode}
              onChange={e => { setGridMode(e.target.value as GridMode); updateHftSetting("grid_mode", e.target.value); }}
              disabled={simRunning}
              className="bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
            >
              <option value="manual">Manuel Grid</option>
              <option value="bollinger">Bollinger Grid</option>
              <option value="hybrid">Hibrit (BB+Filtre)</option>
              <option value="bb_direction">BB Yön (Oto Long/Short)</option>
              <option value="ema_trend">EMA Trend (Oto)</option>
              <option value="trend_score">Trend Puanlama (Claude)</option>
              <option value="math_grid_gemini">Math Genius Grid - Gemini</option>
            </select>
          </div>

          {/* Yon Secimi */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Yön</span>
            <select
              value={["bb_direction", "ema_trend", "trend_score", "math_grid_gemini"].includes(gridMode) ? "auto" : gridDirection}
              onChange={e => { setGridDirection(e.target.value as GridDirection); updateHftSetting("grid_direction", e.target.value); }}
              disabled={simRunning || ["bb_direction", "ema_trend", "trend_score", "math_grid_gemini"].includes(gridMode)}
              className={`bg-[#020817] border rounded-md px-3 py-1.5 text-sm font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50 ${
                (["bb_direction", "ema_trend", "trend_score", "math_grid_gemini"].includes(gridMode) ? "auto" : activeDirection) === "long" ? "border-emerald-500/50 text-emerald-400" : 
                (["bb_direction", "ema_trend", "trend_score", "math_grid_gemini"].includes(gridMode) ? "auto" : activeDirection) === "short" ? "border-red-500/50 text-red-400" :
                "border-indigo-500/50 text-indigo-400"
              }`}
            >
              <option value="long">Long (Al-Sat)</option>
              <option value="short">Short (Sat-Al)</option>
              <option value="auto">Otomatik (BB Yön)</option>
            </select>
          </div>

          <div className="w-px h-8 bg-slate-700/50 hidden md:block" />

          {/* Spread (Ağ Genişliği) */}
          {(gridMode === "manual" || gridMode === "ema_trend") && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{gridMode === "ema_trend" ? "Ağ Genişliği (±%)" : "Spread (±%)"}</span>
            <input type="number" value={localSpread} onChange={e => setLocalSpread(e.target.value)}
              onBlur={() => commitSetting("spread_pct", localSpread, 1.5)}
              onKeyDown={e => e.key === "Enter" && commitSetting("spread_pct", localSpread, 1.5)}
              min={0.05} step={0.05} max={20} disabled={simRunning}
              className="w-24 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
            />
          </div>
          )}

          {/* BB modu ayarlari */}
          {gridMode !== "manual" && gridMode !== "math_grid_gemini" && (
          <>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">Zaman Dilimi</span>
            <select value={bbTimeframe} onChange={e => { setBbTimeframe(e.target.value); updateHftSetting("bb_timeframe", e.target.value); }} disabled={simRunning}
              className="bg-[#020817] border border-indigo-500/30 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50">
              <option value="5m">5 dk</option>
              <option value="15m">15 dk</option>
              <option value="1h">1 saat</option>
            </select>
          </div>
          {gridMode === "ema_trend" ? (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">%50-200 Fark</span>
                <input type="number" value={minEmaPct} onChange={e => setMinEmaPct(e.target.value)} onBlur={e => commitSetting("min_ema_pct", e.target.value, 1.0)} onKeyDown={e => e.key === "Enter" && commitSetting("min_ema_pct", e.target.value, 1.0)}
                  min={0} max={10} step={0.1} disabled={simRunning}
                  className="w-16 bg-[#020817] border border-indigo-500/30 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">Kapatma Şartı</span>
                <select value={emaExitMode} onChange={e => { setEmaExitMode(e.target.value); updateHftSetting("ema_exit_mode", e.target.value); }} disabled={simRunning}
                  className="bg-[#020817] border border-indigo-500/30 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50">
                  <option value="ema_cross">EMA Ters Kesişim (6-14)</option>
                  <option value="bollinger">Bollinger Bant Dönüşü</option>
                  <option value="touch_ema6">Fiyat Teması: EMA 6</option>
                  <option value="touch_ema14">Fiyat Teması: EMA 14</option>
                  <option value="touch_ema50">Fiyat Teması: EMA 50</option>
                  <option value="touch_ema200">Fiyat Teması: EMA 200</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">BB Periyot</span>
                <input type="number" value={bbPeriod} onChange={e => setBbPeriod(e.target.value)} onBlur={e => commitSetting("bb_period", e.target.value, 20)} onKeyDown={e => e.key === "Enter" && commitSetting("bb_period", e.target.value, 20)}
                  min={10} max={50} disabled={simRunning}
                  className="w-16 bg-[#020817] border border-indigo-500/30 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">BB Sapma</span>
                <input type="number" value={bbStdDev} onChange={e => setBbStdDev(e.target.value)} onBlur={e => commitSetting("bb_std_dev", e.target.value, 2.0)} onKeyDown={e => e.key === "Enter" && commitSetting("bb_std_dev", e.target.value, 2.0)}
                  min={1} max={3} step={0.1} disabled={simRunning}
                  className="w-16 bg-[#020817] border border-indigo-500/30 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">Min Spread %</span>
                <input type="number" value={minSpread} onChange={e => setMinSpread(e.target.value)} onBlur={e => commitSetting("min_spread_pct", e.target.value, 0.3)} onKeyDown={e => e.key === "Enter" && commitSetting("min_spread_pct", e.target.value, 0.3)}
                  min={0.01} max={5} step={0.01} disabled={simRunning}
                  className="w-16 bg-[#020817] border border-indigo-500/30 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
                />
              </div>
              <div className="flex flex-col gap-1 items-center justify-center">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider text-center">MTF Filtresi</span>
                <button
                  onClick={() => { setFilterMtf(!filterMtf); updateHftSetting("filter_mtf", !filterMtf ? 1 : 0); }}
                  disabled={simRunning}
                  className={`w-12 h-6 rounded-full transition-colors relative mt-1 ${filterMtf ? 'bg-emerald-500' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${filterMtf ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </>
          )}
          </>
          )}

          {/* Gemini Modu ayarlari */}
          {gridMode === "math_grid_gemini" && (
            <div className="flex flex-wrap gap-2 w-full mt-2 pt-2 border-t border-indigo-500/20">
              <div className="flex justify-between items-center w-full mb-0">
                <span className="text-[10px] font-semibold text-indigo-400 uppercase">Gemini Matematiksel Grid Ayarları</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      updateHftSetting("atr_period", 14);
                      updateHftSetting("adx_period", 14);
                      updateHftSetting("adx_threshold", 25);
                      updateHftSetting("ema_period", 200);
                      updateHftSetting("breakout_atr_mult", 1.5);
                      updateHftSetting("grid_count", 20);
                      updateHftSetting("leverage", 25);
                      updateHftSetting("bb_timeframe", "5m");
                      setBbTimeframe("5m");
                      setLocalGrid("20");
                      setLocalLev("25");
                    }}
                    disabled={simRunning}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded text-[9px] font-bold transition-all flex items-center gap-1"
                  >
                    Varsayılan
                  </button>
                  <button 
                    onClick={() => {
                      updateHftSetting("atr_period", 14);
                      updateHftSetting("adx_period", 14);
                      updateHftSetting("adx_threshold", 20);
                      updateHftSetting("ema_period", 50);
                      updateHftSetting("breakout_atr_mult", 0.5);
                      updateHftSetting("grid_count", 80);
                      updateHftSetting("leverage", 500);
                      updateHftSetting("bb_timeframe", "1m");
                      setBbTimeframe("1m");
                      setLocalGrid("80");
                      setLocalLev("500");
                    }}
                    disabled={simRunning}
                    className="px-2 py-1 bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-500/30 rounded text-[9px] font-bold transition-all flex items-center gap-1"
                  >
                    🚀 500x Mikro-Grid (1m)
                  </button>
                </div>
              </div>
              <div className="w-full bg-indigo-950/30 border border-indigo-500/20 p-3 rounded-lg mt-1 mb-2">
                <h4 className="text-indigo-400 font-bold text-xs mb-1 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                  Strateji Çalışma Mantığı
                </h4>
                <div className="text-[11px] sm:text-[11.5px] text-slate-300 leading-relaxed space-y-2">
                  <p><strong>🤖 Math Genius Grid Nasıl Çalışır?</strong> Bu bot, piyasa koşullarını saniyeler içinde analiz edip kendi kendine karar veren matematiksel bir motordur.</p>
                  
                  <p><strong>🎯 Tekli vs Çoklu Coin (Akıllı Tarayıcı):</strong> "Tekli" modda sadece seçtiğiniz koini kilitlenir. "Akıllı Tarayıcı" modunda ise arka planda yüzlerce koini eş zamanlı tarar; ADX ve EMA göstergeleriyle <em>tam kırılım anını yakaladığı</em> koinlerde otomatik ağ kurar ve kârı alınca yeni koine geçer.</p>
                  
                  <p><strong>📏 Kâr Alma (TP) ve Kademe Aralıkları:</strong> Kademeleri manuel girmek zorunda değilsiniz. Bot, "ATR" (Oynaklık) formülüyle koinin o anki hızını ölçer. Koin çok hızlıysa kademelerin arasını açar, yataysa daraltıp ufak dalgalardan kâr toplar. Fiyat ağın dışına taşarsa, ağı fiyatın peşinden sürükleyerek (Trailing) trendi sonuna kadar sömürür.</p>

                  <p><strong>⚖️ Ayar Profilleri (Varsayılan vs 500x):</strong> 
                    <br/><span className="text-emerald-400">● Varsayılan (25x):</span> 5 dakikalık grafiklerde çalışır. Düzenli ve güvenli pasif gelir hedefleyen altın orandır. Fiyat aniden ters dönerse koruma kalkanı devreye girer, zararı kesip ağı güncel fiyata taşır.
                    <br/><span className="text-red-400">● 500x Mikro-Grid:</span> 1 dakikalık grafikte, son derece dar alanda saniyelik "vur-kaç" (scalping) yapar. Yüksek risk ve çok yüksek işlem sıklığı içerir, pür dikkat izlenmelidir.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-400 uppercase tracking-wider">Zaman Dilimi</span>
                <select value={bbTimeframe} onChange={e => { setBbTimeframe(e.target.value); updateHftSetting("bb_timeframe", e.target.value); }} disabled={simRunning}
                  className="bg-[#020817] border border-indigo-500/30 rounded-md px-2 py-1 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50">
                  <option value="1m">1 dk</option>
                  <option value="5m">5 dk</option>
                  <option value="15m">15 dk</option>
                  <option value="1h">1 saat</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-400 uppercase tracking-wider">Min Spread %</span>
                <input type="number" value={minSpread} onChange={e => setMinSpread(e.target.value)} onBlur={e => commitSetting("min_spread_pct", e.target.value, 0.3)} onKeyDown={e => e.key === "Enter" && commitSetting("min_spread_pct", e.target.value, 0.3)}
                  min={0.01} max={5} step={0.01} disabled={simRunning}
                  className="w-16 bg-[#020817] border border-indigo-500/30 rounded-md px-2 py-1 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-400 uppercase tracking-wider">ATR Prd</span>
                <input type="number" value={hftSettings.atr_period ?? 14} onChange={e => updateHftSetting("atr_period", e.target.value)} className="w-16 bg-[#020817] border border-indigo-500/30 rounded-md px-2 py-1 text-sm text-white" disabled={simRunning} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-400 uppercase tracking-wider">ADX Prd</span>
                <input type="number" value={hftSettings.adx_period ?? 14} onChange={e => updateHftSetting("adx_period", e.target.value)} className="w-16 bg-[#020817] border border-indigo-500/30 rounded-md px-2 py-1 text-sm text-white" disabled={simRunning} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-400 uppercase tracking-wider">ADX Eşik</span>
                <input type="number" value={hftSettings.adx_threshold ?? 25} onChange={e => updateHftSetting("adx_threshold", e.target.value)} className="w-16 bg-[#020817] border border-indigo-500/30 rounded-md px-2 py-1 text-sm text-white" disabled={simRunning} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-400 uppercase tracking-wider">EMA Trend</span>
                <input type="number" value={hftSettings.ema_period ?? 200} onChange={e => updateHftSetting("ema_period", e.target.value)} className="w-16 bg-[#020817] border border-indigo-500/30 rounded-md px-2 py-1 text-sm text-white" disabled={simRunning} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-slate-400 uppercase tracking-wider">Kırılım ATRx</span>
                <input type="number" value={hftSettings.breakout_atr_mult ?? 1.5} step={0.1} onChange={e => updateHftSetting("breakout_atr_mult", e.target.value)} className="w-16 bg-[#020817] border border-indigo-500/30 rounded-md px-2 py-1 text-sm text-white" disabled={simRunning} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1 justify-end">
            <div className="flex items-center gap-1.5 h-[15px]">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kademe</span>
              {gridMode !== "manual" && (
                <button
                  onClick={() => {
                    const next = !autoGridCount
                    setAutoGridCount(next)
                    if (next && suggestedGrid) {
                      setLocalGrid(String(suggestedGrid.count))
                      commitSetting("grid_count", String(suggestedGrid.count), 20)
                    }
                  }}
                  disabled={simRunning}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all disabled:opacity-50 ${
                    autoGridCount
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                      : "bg-slate-700/50 text-slate-500 border border-slate-600/30 hover:text-slate-300"
                  }`}
                >
                  {autoGridCount ? "OTO" : "MAN"}
                </button>
              )}
            </div>
            <input type="number" value={localGrid} onChange={e => { setLocalGrid(e.target.value); if (autoGridCount) setAutoGridCount(false) }}
              onBlur={() => commitSetting("grid_count", localGrid, 20)}
              onKeyDown={e => e.key === "Enter" && commitSetting("grid_count", localGrid, 20)}
              min={2} max={200} disabled={simRunning || (autoGridCount && gridMode !== "manual")}
              className={`w-20 bg-[#020817] border rounded-md px-3 py-1.5 text-sm font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50 ${
                autoGridCount && gridMode !== "manual" ? "border-cyan-500/30 text-cyan-400" : "border-slate-700 text-white"
              }`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kaldirac</span>
            <input type="number" value={localLev} onChange={e => setLocalLev(e.target.value)}
              onBlur={() => commitSetting("leverage", localLev, 10)}
              onKeyDown={e => e.key === "Enter" && commitSetting("leverage", localLev, 10)}
              min={1} max={500} disabled={simRunning}
              className="w-20 bg-[#020817] border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {budgetMode === "fixed" ? "Bütçe ($)" : "Bütçe (%)"} 
              <span className="text-slate-500 normal-case font-normal ml-1">
                {budgetMode === "fixed" ? `· kademe ${(orderSize / gridCount).toFixed(2)}$` : ""}
              </span>
            </span>
            <div className="flex gap-1">
              <select value={budgetMode} onChange={e => { setBudgetMode(e.target.value); updateHftSetting("budget_mode", e.target.value); }} disabled={simRunning}
                className="w-16 bg-[#020817] border border-slate-700 rounded-md px-1 py-1.5 text-sm text-slate-300 font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50 appearance-none text-center">
                <option value="fixed">$</option>
                <option value="percent">%</option>
              </select>
              <input type="number" value={localOrder} onChange={e => setLocalOrder(e.target.value)}
                onBlur={() => commitSetting("order_size", localOrder, 100)}
                onKeyDown={e => e.key === "Enter" && commitSetting("order_size", localOrder, 100)}
                min={1} step={budgetMode === "fixed" ? 5 : 1} max={budgetMode === "fixed" ? 100000 : 100} disabled={simRunning}
                className="w-16 sm:w-20 bg-[#020817] border border-slate-700 rounded-md px-2 py-1.5 text-sm text-white font-medium focus:border-indigo-500 transition-all outline-none disabled:opacity-50"
              />
            </div>
          </div>

          <button onClick={recalcGrid} disabled={simRunning}
            className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md transition-all">
            Agi Yeniden Kur
          </button>

          {/* Gereksiz Filtre Toggle'lari Kaldirildi */}


          {/* Alt/Ust Sinir */}
          <div className="flex gap-2 sm:gap-3 sm:ml-auto">
             <div className="flex flex-col items-end">
               <span className="text-[10px] text-green-400 font-semibold">Alt Ag</span>
               <span className="text-sm text-white bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-md font-mono">
                 {gridBounds ? `$${gridBounds.lower.toFixed(2)}` : "\u2014"}
               </span>
             </div>
             <div className="flex flex-col items-end">
               <span className="text-[10px] text-red-400 font-semibold">Ust Ag</span>
               <span className="text-sm text-white bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-md font-mono">
                 {gridBounds ? `$${gridBounds.upper.toFixed(2)}` : "\u2014"}
               </span>
             </div>
          </div>
        </div>

        {/* Performans & Simulasyon Durumu */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-2 sm:gap-3 relative z-10 mb-4">
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Kademe Margin</div>
            <div className="text-sm font-bold text-cyan-400 font-mono">${marginPerLevel.toFixed(2)}</div>
            <div className="text-[9px] text-slate-500 mt-0.5">{contracts} kontrat</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Kademe Aralığı</div>
            <div className="text-sm font-bold text-white font-mono">${gridStep.toFixed(4)}</div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              %{livePrice > 0 ? ((gridStep / livePrice) * 100).toFixed(2) : "0.00"}
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Maks Kademe Kari</div>
            <div className="text-sm font-bold text-emerald-400 font-mono">${netPerGrid.toFixed(4)}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Liq. Mesafesi</div>
            <div className="text-sm font-bold text-orange-400 font-mono">%{leverage > 0 ? (100 / leverage).toFixed(2) : "\u2014"}</div>
          </div>
          <div className={`rounded-lg p-3 border ${
            !simRunning ? 'bg-slate-800/60 border-slate-700/40' :
            isWaiting ? 'bg-amber-950/30 border-amber-500/40' :
            'bg-emerald-900/30 border-emerald-500/40'
          }`}>
            <div className="text-[10px] text-slate-500 uppercase">Durum</div>
            <div className={`text-sm font-bold ${
              !simRunning ? 'text-slate-500' :
              isWaiting ? 'text-amber-400' :
              'text-emerald-400'
            }`}>
              {!simRunning ? '○ Durdu' :
               isBackendMode && backendStatus?.running ? (
                 backendStatus.upper === 0 ? '● Fırsat Bekleniyor' :
                 backendStatus.bb_dir_paused ? '● Duraklatıldı (Kesişim Bekleniyor)' :
                 backendStatus.ema_paused ? '● Duraklatıldı (Trend Döndü)' :
                 `● İŞLEMDE: ${(backendStatus.active_direction || activeDirection) === 'long' ? '↑ SADECE LONG' : '↓ SADECE SHORT'}`
               ) :
               gridMode === "bb_direction" && (bbDirPaused && !bbDirWaitCross) ? '● Duraklatıldı (Yeni Kesişim Bekleniyor)' :
               gridMode === "bb_direction" && bbDirWaitCross ? '● Fırsat Bekleniyor (Orta Çizgi)' :
               isWaiting ? '● İşlem Bekleniyor...' :
               `● İŞLEMDE: ${activeDirection === 'long' ? '↑ SADECE LONG' : '↓ SADECE SHORT'}`}
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Islem Sayisi</div>
            <div className="text-sm font-bold text-cyan-400 font-mono">{tradeCount}</div>
          </div>
          <div className={`rounded-lg p-3 border ${totalPnl >= 0 ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-red-900/20 border-red-500/30'}`}>
            <div className="text-[10px] text-slate-500 uppercase">Toplam P&L</div>
            <div className={`text-sm font-bold font-mono ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </div>
          </div>
          {/* Acik Seviyeler (backend modda) */}
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-[10px] text-slate-500 uppercase">Acik Seviye</div>
            <div className="text-sm font-bold text-purple-400 font-mono">
              {isBackendMode ? (backendStatus?.filled_count ?? 0) : simFilledRef.current.size} / {gridCount}
            </div>
          </div>
        </div>

        {/* BB Modu Istatistikleri — sim + backend */}
        {(() => {
          if (gridMode === "manual") return null
          
          // BB verisini oncelikle backendStatus'ten, yoksa (veya bot duruyorsa) simBbMeta'dan al
          const useBackend = isBackendMode && backendStatus?.running && backendStatus.grid_mode && backendStatus.grid_mode !== "manual"
          
          const bbSrc = useBackend 
            ? {
                width: backendStatus.bb_width || 0, rsi: backendStatus.bb_rsi || 50,
                paused: backendStatus.bb_paused, mid: backendStatus.bb_mid || 0,
                mtf_trend: backendStatus.mtf_trend || "neutral"
              }
            : (simBbMeta ? {
                width: simBbMeta.bb_width || 0, rsi: simBbMeta.rsi || 50,
                paused: simBbMeta.is_squeeze, mid: simBbMeta.bb_mid || 0,
                mtf_trend: simBbMeta.mtf_trend || "neutral"
              } : null)
              
          if (!bbSrc) return null
          return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 relative z-10 mb-4">
            <div className={`rounded-lg p-3 border ${
              bbSrc.width < 0.005 ? 'bg-yellow-900/20 border-yellow-500/30' :
              bbSrc.width > 0.05 ? 'bg-red-900/20 border-red-500/30' :
              'bg-indigo-900/20 border-indigo-500/30'
            }`}>
              <div className="text-[10px] text-indigo-400 uppercase">BB Genisligi</div>
              <div className="text-sm font-bold text-white font-mono">
                %{(bbSrc.width * 100).toFixed(2)}
              </div>
            </div>
            <div className={`rounded-lg p-3 border ${
              bbSrc.rsi > 70 ? 'bg-red-900/20 border-red-500/30' :
              bbSrc.rsi < 30 ? 'bg-red-900/20 border-red-500/30' :
              'bg-emerald-900/20 border-emerald-500/30'
            }`}>
              <div className="text-[10px] text-indigo-400 uppercase">RSI</div>
              <div className={`text-sm font-bold font-mono ${
                bbSrc.rsi > 70 || bbSrc.rsi < 30 ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {bbSrc.rsi.toFixed(1)}
              </div>
            </div>
            <div className={`rounded-lg p-3 border ${
              bbSrc.paused ? 'bg-yellow-900/20 border-yellow-500/30' : 'bg-indigo-900/20 border-indigo-500/30'
            }`}>
              <div className="text-[10px] text-indigo-400 uppercase">BB Durum</div>
              <div className={`text-sm font-bold ${bbSrc.paused ? 'text-yellow-400' : 'text-indigo-400'}`}>
                {bbSrc.paused ? 'SQUEEZE' : 'Aktif'}
              </div>
            </div>
            <div className={`rounded-lg p-3 border ${
              bbSrc.mtf_trend === 'long' ? 'bg-emerald-900/20 border-emerald-500/30' :
              bbSrc.mtf_trend === 'short' ? 'bg-red-900/20 border-red-500/30' :
              'bg-slate-800/20 border-slate-600/30'
            }`}>
              <div className="text-[10px] text-indigo-400 uppercase">MTF Onayi (3D)</div>
              <div className={`text-sm font-bold font-mono uppercase ${
                bbSrc.mtf_trend === 'long' ? 'text-emerald-400' :
                bbSrc.mtf_trend === 'short' ? 'text-red-400' :
                'text-slate-400'
              }`}>
                {bbSrc.mtf_trend === 'long' ? 'YUKARI (LONG)' : bbSrc.mtf_trend === 'short' ? 'ASAGI (SHORT)' : 'BEKLEME'}
              </div>
            </div>
          </div>
          )
        })()}

        {/* Borsa Pozisyonlari (Live modda) */}
        {isBackendMode && backendStatus?.exchange_positions && backendStatus.exchange_positions.length > 0 && (
          <div className="mb-4 relative z-10">
            <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {tradingMode === "live" ? "Borsa Pozisyonlari (MEXC)" : "Sanal Pozisyonlar (Paper Mode)"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {backendStatus.exchange_positions.map((pos: ExchangePosition, i: number) => {
                const posContractSize = symbol.includes("BTC") ? 0.0001 : 0.01;
                const posNotional = pos.contracts * posContractSize * (pos.entry_price || livePrice);
                return (
                <div key={i} className={`rounded-lg p-3 border ${
                  pos.unrealized_pnl >= 0 ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-red-900/20 border-red-500/30'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      pos.side === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {pos.side?.toUpperCase()} {pos.leverage}x
                    </span>
                    <span className={`text-sm font-bold font-mono ${
                      pos.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {pos.unrealized_pnl >= 0 ? '+' : ''}${pos.unrealized_pnl.toFixed(4)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <span className="text-slate-500">Kontrat</span>
                      <div className="text-white font-mono">{pos.contracts}</div>
                      <div className="text-cyan-400 font-mono text-[9px]">${(pos.margin || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Giris</span>
                      <div className="text-white font-mono">${pos.entry_price.toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Liq.</span>
                      <div className="text-orange-400 font-mono">${pos.liquidation_price?.toFixed(2) || '\u2014'}</div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sim Modu Sanal Pozisyonlari */}
        {!isBackendMode && simRunning && simFilledRef.current.size > 0 && (
          <div className="mb-4 relative z-10">
            <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Sanal Pozisyonlar (Frontend Sim)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(() => {
                const filled = Array.from(simFilledRef.current)
                const entryPrices = simEntryPricesRef.current
                const totalEp = filled.reduce((acc, lvl) => acc + (entryPrices.get(lvl) ?? livePrice), 0)
                const avgEntry = totalEp / filled.length
                
                const totalContracts = contracts * filled.length
                const totalMargin = marginPerLevel * filled.length
                const posNotional = totalContracts * contractSize * avgEntry
                
                // Gerçekçi PnL: borsa standart formülü
                const unrealizedPnl = activeDirection === "long"
                  ? totalContracts * contractSize * (livePrice - avgEntry)
                  : totalContracts * contractSize * (avgEntry - livePrice)
                const fee = posNotional * 0.0002 * 2
                const netPnl = unrealizedPnl - fee

                return (
                  <div className={`rounded-lg p-3 border ${
                    netPnl >= 0 ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-red-900/20 border-red-500/30'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        activeDirection === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {activeDirection.toUpperCase()} {leverage}x
                      </span>
                      <span className={`text-sm font-bold font-mono ${
                        netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {netPnl >= 0 ? '+' : ''}${netPnl.toFixed(4)}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-500">Kontrat</span>
                        <div className="text-white font-mono">{totalContracts}</div>
                        <div className="text-cyan-400 font-mono text-[9px]">${totalMargin.toFixed(2)}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Ort. Giris</span>
                        <div className="text-white font-mono">${avgEntry.toFixed(2)}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Margin</span>
                        <div className="text-cyan-400 font-mono">${totalMargin.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* Aktif Coin Butonları — tüm modlarda açık pozisyonları göster */}
        {scannerOpenCoins.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 relative z-10">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Aktif Pozisyonlar ({scannerOpenCoins.length}):</span>
            {scannerOpenCoins.map((c) => {
              const mexcSym = c.symbol.replace("/", "").replace(":USDT", "")
              const isActive = symbol === mexcSym
              return (
                <button
                  key={c.coin}
                  onClick={() => handleScannerCoinClick(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1 ${
                    isActive
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-500/40'
                      : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:bg-slate-700/80 hover:border-slate-600'
                  }`}
                >
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${c.direction === 'long' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className="font-bold">{c.coin}</span>
                  <span className={`text-[10px] px-1 py-0.5 rounded ${c.direction === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {c.direction === 'long' ? 'LONG' : 'SHORT'}
                  </span>
                  {c.confidence > 0 && <span className="text-slate-500 text-[10px]">{c.confidence}%</span>}
                  <span className="text-slate-600 text-[10px]">${c.entry_price?.toFixed(2)}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Grafik */}
        <div className={`${
          chartFullscreen
            ? 'fixed inset-0 z-[9999] bg-[#020817] flex flex-col'
            : 'h-[400px] sm:h-[550px] w-full bg-[#020817] border border-slate-700/80 rounded-xl flex flex-col relative z-10 overflow-hidden shadow-inner'
        }`}>
          {/* Fullscreen baslik bari */}
          {chartFullscreen && (
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-700/50 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-white font-bold text-sm">{symbol}</span>
                <span className="text-slate-400 text-xs">±{spreadPct}% · {gridCount} kademe · {leverage}x</span>
                {livePrice > 0 && (
                  <span className="text-white font-mono text-sm">${livePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                )}
                {simRunning && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${mc.badge}`}>{mc.label}</span>
                )}
              </div>
              <button
                onClick={() => setChartFullscreen(false)}
                className="p-1.5 hover:bg-slate-700 rounded-lg transition-all text-slate-400 hover:text-white"
                title="Tam ekrandan cik (Esc)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          {/* Fullscreen buton (normal modda) */}
          {!chartFullscreen && (
            <button
              onClick={() => setChartFullscreen(true)}
              className="absolute top-2 right-2 z-20 p-1.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-600/50 rounded-lg transition-all text-slate-400 hover:text-white"
              title="Tam ekran"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
              <ProChart
                symbol={chartSymbol}
                tp={gridBounds ? (activeDirection === "long" ? gridBounds.upper : gridBounds.lower) : undefined}
                sl={gridBounds ? (activeDirection === "long" ? gridBounds.lower : gridBounds.upper) : undefined}
                gridLines={gridLines}
                hideVolume
                gridMode={isBackendMode ? backendStatus?.grid_mode : gridMode}
                trades={trades}
                activeTimeframe={isBackendMode && backendStatus?.running ? backendStatus.bb_timeframe : (simRunning ? bbTimeframe : undefined)}
              />
          </div>
        </div>

        {/* Islem Gecmisi */}
        {trades.length > 0 && (
          <div className="mt-4 relative z-10">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-300">Son Islemler</h3>
              <div className="flex items-center gap-3">
                {backendStatus?.win_rate !== undefined && (
                  <span className="text-[10px] text-slate-500">Basari: %{backendStatus.win_rate}</span>
                )}
                <span className="text-[10px] text-slate-600">{trades.length} islem gosteriliyor</span>
              </div>
            </div>
            <div className="max-h-[250px] overflow-y-auto overflow-x-auto rounded-lg border border-slate-700/50">
              <table className="w-full text-xs min-w-[500px]">
                <thead className="bg-slate-800/80 sticky top-0">
                  <tr className="text-slate-500">
                    <th className="px-3 py-2 text-left">Saat</th>
                    <th className="px-3 py-2 text-left">Coin</th>
                    <th className="px-3 py-2 text-left">Yon</th>
                    <th className="px-3 py-2 text-right">Fiyat</th>
                    <th className="px-3 py-2 text-right">Kademe</th>
                    {isBackendMode && <th className="px-3 py-2 text-center">Durum</th>}
                    <th className="px-3 py-2 text-right">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => (
                    <tr key={t.id} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-3 py-1.5 text-slate-400 font-mono">{t.time}</td>
                      <td className="px-3 py-1.5 text-indigo-400 font-semibold text-[10px]">{symbol}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {t.side}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-white font-mono text-right">${(t.price ?? 0).toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-slate-400 text-right">
                        {t.grid_levels ? `#${t.grid_levels.join(',')}` : `#${t.gridLevel}`}
                        {t.level_count && t.level_count > 1 && (
                          <span className="text-slate-600 ml-1">({t.level_count}x)</span>
                        )}
                      </td>
                      {isBackendMode && (
                        <td className="px-3 py-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.exchange_status === 'filled' ? 'bg-emerald-500/20 text-emerald-400' :
                            t.exchange_status === 'error' ? 'bg-red-500/20 text-red-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {t.exchange_status === 'filled' ? 'FILLED' :
                             t.exchange_status === 'error' ? 'HATA' :
                             t.exchange_status === 'paper' ? 'PAPER' : t.mode?.toUpperCase()}
                          </span>
                        </td>
                      )}
                      <td className={`px-3 py-1.5 font-mono text-right font-semibold ${(t.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(t.pnl ?? 0) >= 0 ? '+' : ''}{(t.pnl ?? 0).toFixed(4)}
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
    </HftErrorBoundary>
  )
}
