"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"

interface EconEvent {
  id: number
  title: string
  country: string | null
  category: string | null
  impact: string
  event_time: string | null
  actual: string | null
  forecast: string | null
  previous: string | null
  source: string | null
}

// Ulke bayraklari
const FLAGS: Record<string, string> = {
  US: "\u{1F1FA}\u{1F1F8}", AU: "\u{1F1E6}\u{1F1FA}", GB: "\u{1F1EC}\u{1F1E7}", EU: "\u{1F1EA}\u{1F1FA}",
  DE: "\u{1F1E9}\u{1F1EA}", JP: "\u{1F1EF}\u{1F1F5}", CN: "\u{1F1E8}\u{1F1F3}", CA: "\u{1F1E8}\u{1F1E6}",
  CH: "\u{1F1E8}\u{1F1ED}", NZ: "\u{1F1F3}\u{1F1FF}", FR: "\u{1F1EB}\u{1F1F7}", IT: "\u{1F1EE}\u{1F1F9}",
  KR: "\u{1F1F0}\u{1F1F7}", IN: "\u{1F1EE}\u{1F1F3}", BR: "\u{1F1E7}\u{1F1F7}", MX: "\u{1F1F2}\u{1F1FD}",
  TR: "\u{1F1F9}\u{1F1F7}", ZA: "\u{1F1FF}\u{1F1E6}", SE: "\u{1F1F8}\u{1F1EA}", NO: "\u{1F1F3}\u{1F1F4}",
  KZ: "\u{1F1F0}\u{1F1FF}", RU: "\u{1F1F7}\u{1F1FA}", SG: "\u{1F1F8}\u{1F1EC}", HK: "\u{1F1ED}\u{1F1F0}",
  PL: "\u{1F1F5}\u{1F1F1}", ES: "\u{1F1EA}\u{1F1F8}", PT: "\u{1F1F5}\u{1F1F9}", IE: "\u{1F1EE}\u{1F1EA}",
  AT: "\u{1F1E6}\u{1F1F9}", BE: "\u{1F1E7}\u{1F1EA}", NL: "\u{1F1F3}\u{1F1F1}", FI: "\u{1F1EB}\u{1F1EE}",
  DK: "\u{1F1E9}\u{1F1F0}", CZ: "\u{1F1E8}\u{1F1FF}", HU: "\u{1F1ED}\u{1F1FA}", ID: "\u{1F1EE}\u{1F1E9}",
  TH: "\u{1F1F9}\u{1F1ED}", PH: "\u{1F1F5}\u{1F1ED}", MY: "\u{1F1F2}\u{1F1FE}", IL: "\u{1F1EE}\u{1F1F1}",
  CL: "\u{1F1E8}\u{1F1F1}", CO: "\u{1F1E8}\u{1F1F4}", AR: "\u{1F1E6}\u{1F1F7}", TW: "\u{1F1F9}\u{1F1FC}",
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "ABD", AU: "Avustralya", GB: "Ingiltere", EU: "Avrupa", DE: "Almanya",
  JP: "Japonya", CN: "Cin", CA: "Kanada", CH: "Isvicre", NZ: "Yeni Zelanda",
  FR: "Fransa", IT: "Italya", KR: "G. Kore", IN: "Hindistan", BR: "Brezilya",
  MX: "Meksika", TR: "Turkiye", ZA: "G. Afrika", SE: "Isvec", NO: "Norvec",
  KZ: "Kazakistan", RU: "Rusya", SG: "Singapur", HK: "Hong Kong",
  PL: "Polonya", ES: "Ispanya", PT: "Portekiz", IE: "Irlanda",
  AT: "Avusturya", BE: "Belcika", NL: "Hollanda", FI: "Finlandiya",
  DK: "Danimarka", CZ: "Cekya", HU: "Macaristan", ID: "Endonezya",
  TH: "Tayland", PH: "Filipinler", MY: "Malezya", IL: "Israil",
  CL: "Sili", CO: "Kolombiya", AR: "Arjantin", TW: "Tayvan",
}

// Onemli olaylari Turkce'ye cevir
const EVENT_TRANSLATIONS: Record<string, string> = {
  "Interest Rate Decision": "Faiz Orani Karari",
  "Fed Interest Rate Decision": "FED Faiz Karari",
  "ECB Interest Rate Decision": "AMB Faiz Karari",
  "Non Farm Payrolls": "Tarim Disi Istihdam",
  "Unemployment Rate": "Issizlik Orani",
  "CPI YoY": "TUFE (Yillik)",
  "CPI MoM": "TUFE (Aylik)",
  "Core CPI YoY": "Cekirdek TUFE (Yillik)",
  "Core CPI MoM": "Cekirdek TUFE (Aylik)",
  "GDP Growth Rate QoQ": "GSYIH Buyume (Ceyreklik)",
  "GDP Growth Rate YoY": "GSYIH Buyume (Yillik)",
  "PPI YoY": "UFE (Yillik)",
  "PPI MoM": "UFE (Aylik)",
  "Retail Sales MoM": "Perakende Satis (Aylik)",
  "Retail Sales YoY": "Perakende Satis (Yillik)",
  "Balance of Trade": "Dis Ticaret Dengesi",
  "Consumer Confidence": "Tuketici Guveni",
  "Manufacturing PMI": "Imalat PMI",
  "Services PMI": "Hizmet PMI",
  "Composite PMI": "Bilesik PMI",
  "Industrial Production MoM": "Sanayi Uretimi (Aylik)",
  "Industrial Production YoY": "Sanayi Uretimi (Yillik)",
  "Building Permits": "Insaat Ruhsatlari",
  "Housing Starts": "Konut Baslangiclar",
  "Existing Home Sales": "Mevcut Konut Satislari",
  "New Home Sales": "Yeni Konut Satislari",
  "Durable Goods Orders MoM": "Dayanikli Mal Siparisleri",
  "Initial Jobless Claims": "Haftalik Issizlik Basvurulari",
  "Continuing Jobless Claims": "Devam Eden Issizlik Basvurulari",
  "ADP Employment Change": "ADP Istihdam Degisimi",
  "ISM Manufacturing PMI": "ISM Imalat PMI",
  "ISM Non-Manufacturing PMI": "ISM Hizmet PMI",
  "Michigan Consumer Sentiment": "Michigan Tuketici Guveni",
  "Current Account": "Cari Islemler Dengesi",
  "Trade Balance": "Ticaret Dengesi",
  "Inflation Rate YoY": "Enflasyon Orani (Yillik)",
  "Inflation Rate MoM": "Enflasyon Orani (Aylik)",
  "Core Inflation Rate YoY": "Cekirdek Enflasyon (Yillik)",
  "Employment Change": "Istihdam Degisimi",
  "Crude Oil Inventories": "Ham Petrol Stoklari",
  "Natural Gas Stocks Change": "Dogalgaz Stok Degisimi",
  "FOMC Meeting Minutes": "FOMC Toplanti Tutanaklari",
  "FOMC Press Conference": "FOMC Basin Toplantisi",
  "Fed Chair Powell Speech": "FED Baskan Powell Konusmasi",
  "ECB Press Conference": "AMB Basin Toplantisi",
  "BOJ Interest Rate Decision": "Japonya MB Faiz Karari",
  "BOE Interest Rate Decision": "Ingiltere MB Faiz Karari",
  "RBA Interest Rate Decision": "Avustralya MB Faiz Karari",
  "Exports MoM": "Ihracat (Aylik)",
  "Imports MoM": "Ithalat (Aylik)",
  "Exports YoY": "Ihracat (Yillik)",
  "Imports YoY": "Ithalat (Yillik)",
  "Local Elections": "Yerel Secimler",
}

const CATEGORY_LABELS: Record<string, string> = {
  interest_rate: "Faiz",
  inflation: "Enflasyon",
  employment: "Istihdam",
  gdp: "GSYIH",
  producer_price: "Uretici Fiyat",
  retail: "Perakende",
  pmi: "PMI",
  other: "Ekonomi",
}

const CATEGORY_COLORS: Record<string, string> = {
  interest_rate: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  inflation: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  employment: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  gdp: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  producer_price: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  retail: "bg-pink-500/15 text-pink-400 border-pink-500/20",
  pmi: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  other: "bg-slate-500/15 text-slate-400 border-slate-500/20",
}

function isValidValue(v: string | null | undefined): v is string {
  return v != null && v !== "" && v !== "None" && v !== "null" && v !== "none"
}

function translateTitle(title: string): string {
  // Tam eslesme
  if (EVENT_TRANSLATIONS[title]) return EVENT_TRANSLATIONS[title]
  // Kısmi eslesme
  for (const [en, tr] of Object.entries(EVENT_TRANSLATIONS)) {
    if (title.includes(en)) return title.replace(en, tr)
  }
  return title
}

function formatEventTime(iso: string | null): { date: string; time: string; relative: string } {
  if (!iso) return { date: "-", time: "-", relative: "" }
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffMin = Math.round(diffMs / 60000)

  let relative = ""
  if (diffMin > 0 && diffMin < 60) relative = `${diffMin} dk sonra`
  else if (diffMin >= 60 && diffMin < 1440) relative = `${Math.round(diffMin / 60)} saat sonra`
  else if (diffMin >= 1440) relative = `${Math.round(diffMin / 1440)} gun sonra`
  else if (diffMin < 0 && diffMin > -60) relative = `${Math.abs(diffMin)} dk once`
  else if (diffMin <= -60 && diffMin > -1440) relative = `${Math.round(Math.abs(diffMin) / 60)} saat once`
  else if (diffMin <= -1440) relative = `${Math.round(Math.abs(diffMin) / 1440)} gun once`

  return {
    date: d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", weekday: "short" }),
    time: d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
    relative,
  }
}

interface CryptoNews {
  id: number | string
  title: string
  url: string
  source: string
  published_at: string
  currencies: string[]
  kind: string
  votes: { positive: number; negative: number; important: number }
  sentiment: string
}

interface NewsSummary {
  title_tr: string
  summary: string
  sentiment: string
  impact: string
  affected_coins: string[]
  trading_note: string
}

const IMPACT_LABELS: Record<string, string> = { high: "Yuksek", medium: "Orta", low: "Dusuk" }
const IMPACT_COLORS: Record<string, string> = {
  high: "text-red-400 bg-red-500/10 border-red-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low: "text-green-400 bg-green-500/10 border-green-500/20",
}

const SENTIMENT_COLORS: Record<string, string> = {
  bullish: "text-green-400 bg-green-500/10 border-green-500/20",
  bearish: "text-red-400 bg-red-500/10 border-red-500/20",
  neutral: "text-slate-400 bg-slate-500/10 border-slate-500/20",
}

const SENTIMENT_LABELS: Record<string, string> = {
  bullish: "Yukselis",
  bearish: "Dusus",
  neutral: "Notr",
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  const now = new Date()
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000)
  if (diffMin < 1) return "az once"
  if (diffMin < 60) return `${diffMin} dk once`
  if (diffMin < 1440) return `${Math.round(diffMin / 60)} saat once`
  return `${Math.round(diffMin / 1440)} gun once`
}

export default function NewsPage() {
  const [tab, setTab] = useState<"calendar" | "crypto">("calendar")
  const [events, setEvents] = useState<EconEvent[]>([])
  const [cryptoNews, setCryptoNews] = useState<CryptoNews[]>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsCurrency, setNewsCurrency] = useState("")
  const [selectedNews, setSelectedNews] = useState<CryptoNews | null>(null)
  const [summary, setSummary] = useState<NewsSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<string>("all")
  const [blackout, setBlackout] = useState<{ blackout: boolean; reason?: string } | null>(null)

  const fetchEvents = useCallback(async () => {
    try {
      const data = await api.get("/calendar/events?days=14")
      if (Array.isArray(data)) setEvents(data)
    } catch (e) {
      console.error("Events fetch error:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchBlackout = useCallback(async () => {
    try {
      const data = await api.get("/calendar/blackout")
      setBlackout(data)
    } catch {
      // ignore
    }
  }, [])

  const fetchCryptoNews = useCallback(async (currency = "") => {
    setNewsLoading(true)
    try {
      const params = currency ? `?currency=${currency}&limit=50` : "?limit=50"
      const data = await api.get(`/calendar/crypto-news${params}`)
      if (Array.isArray(data)) setCryptoNews(data)
    } catch (e) {
      console.error("Crypto news fetch error:", e)
    } finally {
      setNewsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
    fetchBlackout()
  }, [fetchEvents, fetchBlackout])

  const openNewsSummary = async (news: CryptoNews) => {
    setSelectedNews(news)
    setSummary(null)
    setSummaryLoading(true)
    try {
      const data = await api.post("/calendar/crypto-news/summarize", {
        title: news.title,
        url: news.url,
      })
      if (data && !data.error) setSummary(data as NewsSummary)
      else setSummary({ title_tr: news.title, summary: "Ozet alinamadi", sentiment: "neutral", impact: "low", affected_coins: [], trading_note: "" })
    } catch {
      setSummary({ title_tr: news.title, summary: "Ozet alinamadi", sentiment: "neutral", impact: "low", affected_coins: [], trading_note: "" })
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => {
    if (tab === "crypto" && cryptoNews.length === 0) {
      fetchCryptoNews(newsCurrency)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await api.post("/calendar/sync", {})
      await fetchEvents()
    } catch (e) {
      console.error("Sync error:", e)
    } finally {
      setSyncing(false)
    }
  }

  const filtered = filter === "all" ? events : events.filter((e) => e.impact === filter)

  // Gune gore grupla
  const grouped: Record<string, EconEvent[]> = {}
  for (const ev of filtered) {
    const key = ev.event_time
      ? new Date(ev.event_time).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" })
      : "Tarih Bilinmiyor"
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(ev)
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Haberler & Takvim</h1>
          <p className="text-sm text-slate-400">Kripto haberler ve ekonomik olaylar</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "calendar" && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
            >
              {syncing ? "Guncelleniyor..." : "Guncelle"}
            </button>
          )}
          {tab === "crypto" && (
            <button
              onClick={() => fetchCryptoNews(newsCurrency)}
              disabled={newsLoading}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
            >
              {newsLoading ? "Yukleniyor..." : "Yenile"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900/60 p-1 rounded-lg border border-slate-800">
        <button
          onClick={() => setTab("calendar")}
          className={`flex-1 px-4 py-2 text-sm rounded-md font-medium transition-all ${
            tab === "calendar"
              ? "bg-blue-600 text-white shadow"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Ekonomik Takvim
        </button>
        <button
          onClick={() => setTab("crypto")}
          className={`flex-1 px-4 py-2 text-sm rounded-md font-medium transition-all ${
            tab === "crypto"
              ? "bg-blue-600 text-white shadow"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Kripto Haberler
        </button>
      </div>

      {/* ═══ Kripto Haberler Sekmesi ═══ */}
      {tab === "crypto" && (
        <div className="space-y-4">
          {/* Currency Filter */}
          <div className="flex gap-2 flex-wrap">
            {["", "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE"].map(c => (
              <button
                key={c}
                onClick={() => { setNewsCurrency(c); fetchCryptoNews(c) }}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  newsCurrency === c
                    ? "bg-blue-600/20 border-blue-500/40 text-blue-400"
                    : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white"
                }`}
              >
                {c || "Tumu"}
              </button>
            ))}
          </div>

          {/* News List */}
          {newsLoading ? (
            <div className="text-center py-12 text-slate-400">Yukleniyor...</div>
          ) : cryptoNews.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-lg mb-2">Haber bulunamadi</p>
              <p className="text-sm">CryptoPanic API anahtarini Coolify env&apos;ye ekleyin veya RSS kaynaklari kontrol ediliyor.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cryptoNews.map((news) => {
                const sentColor = SENTIMENT_COLORS[news.sentiment] || SENTIMENT_COLORS.neutral
                const sentLabel = SENTIMENT_LABELS[news.sentiment] || "Notr"
                const totalVotes = news.votes.positive + news.votes.negative
                return (
                  <button
                    key={news.id}
                    onClick={() => openNewsSummary(news)}
                    className="block w-full text-left p-3 rounded-lg border border-slate-800 hover:border-blue-500/30 hover:bg-blue-500/[0.03] transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors line-clamp-2">
                          {news.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-xs text-slate-500">{news.source}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sentColor}`}>
                            {sentLabel}
                          </span>
                          {news.currencies.length > 0 && news.currencies.map(c => (
                            <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {c}
                            </span>
                          ))}
                          {totalVotes > 0 && (
                            <span className="text-[10px] text-slate-600">
                              {news.votes.positive > 0 && <span className="text-green-500">+{news.votes.positive}</span>}
                              {news.votes.negative > 0 && <span className="text-red-500 ml-1">-{news.votes.negative}</span>}
                              {news.votes.important > 0 && <span className="text-yellow-500 ml-1">!{news.votes.important}</span>}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-500">{timeAgo(news.published_at)}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ Haber Ozet Modal ═══ */}
      {selectedNews && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelectedNews(null)}>
          <div className="bg-[#0d1117] border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-start justify-between p-4 border-b border-slate-800">
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-sm font-medium text-white">{selectedNews.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-500">{selectedNews.source}</span>
                  <span className="text-xs text-slate-600">{timeAgo(selectedNews.published_at)}</span>
                </div>
              </div>
              <button onClick={() => setSelectedNews(null)} className="text-slate-500 hover:text-white text-xl shrink-0">x</button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-3">
              {summaryLoading ? (
                <div className="flex items-center justify-center py-8 gap-3">
                  <span className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-slate-400">AI ile Turkce ozet hazirlaniyor...</span>
                </div>
              ) : summary ? (
                <>
                  {/* Turkce baslik */}
                  <h3 className="text-base font-semibold text-white">{summary.title_tr}</h3>

                  {/* Ozet */}
                  <p className="text-sm text-slate-300 leading-relaxed">{summary.summary}</p>

                  {/* Sentiment + Impact */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-1 rounded border font-medium ${SENTIMENT_COLORS[summary.sentiment] || SENTIMENT_COLORS.neutral}`}>
                      {SENTIMENT_LABELS[summary.sentiment] || "Notr"}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded border font-medium ${IMPACT_COLORS[summary.impact] || IMPACT_COLORS.low}`}>
                      Etki: {IMPACT_LABELS[summary.impact] || "Dusuk"}
                    </span>
                    {summary.affected_coins?.map(c => (
                      <span key={c} className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {c}
                      </span>
                    ))}
                  </div>

                  {/* Trading Note */}
                  {summary.trading_note && (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
                      <p className="text-[10px] text-slate-500 mb-1">Islem Notu</p>
                      <p className="text-sm text-slate-200">{summary.trading_note}</p>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center gap-2 p-4 border-t border-slate-800">
              <a
                href={selectedNews.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center px-4 py-2 text-sm rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
              >
                Orijinal Haberi Ac
              </a>
              <button
                onClick={() => setSelectedNews(null)}
                className="flex-1 px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Ekonomik Takvim Sekmesi ═══ */}
      {tab === "calendar" && <>

      {/* Blackout Banner */}
      {blackout?.blackout && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Haber Blackout Aktif — Islem Yapma!</p>
            <p className="text-xs text-slate-400">{blackout.reason}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "all", label: "Tumu", icon: "" },
          { key: "high", label: "Yuksek Etki", icon: "🔴" },
          { key: "medium", label: "Orta Etki", icon: "🟡" },
          { key: "low", label: "Dusuk Etki", icon: "🟢" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              filter === f.key
                ? "bg-blue-600/20 border-blue-500/40 text-blue-400"
                : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white"
            }`}
          >
            {f.icon && <span className="mr-1">{f.icon}</span>}{f.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border bg-red-500/10 border-red-500/20">
          <div className="text-2xl font-bold text-red-400">{events.filter(e => e.impact === "high").length}</div>
          <div className="text-xs text-red-400/70">Yuksek Etki</div>
        </div>
        <div className="p-3 rounded-lg border bg-yellow-500/10 border-yellow-500/20">
          <div className="text-2xl font-bold text-yellow-400">{events.filter(e => e.impact === "medium").length}</div>
          <div className="text-xs text-yellow-400/70">Orta Etki</div>
        </div>
        <div className="p-3 rounded-lg border bg-green-500/10 border-green-500/20">
          <div className="text-2xl font-bold text-green-400">{events.filter(e => e.impact === "low").length}</div>
          <div className="text-xs text-green-400/70">Dusuk Etki</div>
        </div>
      </div>

      {/* Event List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Yukleniyor...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg mb-2">Henuz olay bulunamadi</p>
          <p className="text-sm">FinnHub API anahtarini ekleyip "Guncelle" butonuna basin.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([day, dayEvents]) => (
            <div key={day}>
              <h2 className="text-sm font-medium text-slate-400 mb-2 sticky top-0 bg-slate-950 py-1 z-10">{day}</h2>
              <div className="space-y-1.5">
                {dayEvents.map((ev) => {
                  const t = formatEventTime(ev.event_time)
                  const isPast = ev.event_time ? new Date(ev.event_time) < new Date() : false
                  const flag = ev.country ? FLAGS[ev.country] || "" : ""
                  const countryName = ev.country ? COUNTRY_NAMES[ev.country] || ev.country : ""
                  const title = translateTitle(ev.title)
                  const catLabel = CATEGORY_LABELS[ev.category || "other"] || "Ekonomi"
                  const catColor = CATEGORY_COLORS[ev.category || "other"] || CATEGORY_COLORS.other

                  const hasActual = isValidValue(ev.actual)
                  const hasForecast = isValidValue(ev.forecast)
                  const hasPrevious = isValidValue(ev.previous)
                  const hasData = hasActual || hasForecast || hasPrevious

                  // Gercek vs Tahmin karsilastirma rengi
                  let actualColor = "text-green-400"
                  if (hasActual && hasForecast) {
                    const a = parseFloat(ev.actual!)
                    const f = parseFloat(ev.forecast!)
                    if (!isNaN(a) && !isNaN(f)) {
                      actualColor = a >= f ? "text-green-400" : "text-red-400"
                    }
                  }

                  return (
                    <div
                      key={ev.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        isPast
                          ? "border-slate-800/50 opacity-50 hover:opacity-70"
                          : ev.impact === "high"
                            ? "border-red-500/15 hover:border-red-500/30 bg-red-500/[0.02]"
                            : "border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      {/* Impact indicator */}
                      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                        <div className={`w-2.5 h-2.5 rounded-full ${
                          ev.impact === "high" ? "bg-red-400" : ev.impact === "medium" ? "bg-yellow-400" : "bg-green-400"
                        }`} />
                        {flag && <span className="text-sm leading-none">{flag}</span>}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{title}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {countryName && (
                                <span className="text-xs text-slate-500">{countryName}</span>
                              )}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${catColor}`}>
                                {catLabel}
                              </span>
                              {ev.impact === "high" && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20">
                                  Yuksek Etki
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm text-slate-300 font-medium">{t.time}</p>
                            {t.relative && (
                              <p className={`text-xs ${isPast ? "text-slate-500" : "text-blue-400"}`}>{t.relative}</p>
                            )}
                          </div>
                        </div>

                        {/* Data row */}
                        {hasData && (
                          <div className="flex items-center gap-4 mt-2 text-xs">
                            {hasPrevious && (
                              <div className="flex items-center gap-1">
                                <span className="text-slate-600">Onceki</span>
                                <span className="text-slate-300 font-medium">{ev.previous}</span>
                              </div>
                            )}
                            {hasForecast && (
                              <div className="flex items-center gap-1">
                                <span className="text-slate-600">Beklenen</span>
                                <span className="text-yellow-400 font-medium">{ev.forecast}</span>
                              </div>
                            )}
                            {hasActual && (
                              <div className="flex items-center gap-1">
                                <span className="text-slate-600">Aciklanan</span>
                                <span className={`font-bold ${actualColor}`}>{ev.actual}</span>
                              </div>
                            )}
                            {hasPrevious && !hasForecast && !hasActual && (
                              <span className="text-slate-600 italic">Aciklanmadi</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      </>}
    </div>
  )
}
