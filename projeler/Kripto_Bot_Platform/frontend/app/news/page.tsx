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

const IMPACT_COLORS: Record<string, string> = {
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-green-500/20 text-green-400 border-green-500/30",
}

const IMPACT_DOT: Record<string, string> = {
  high: "bg-red-400",
  medium: "bg-yellow-400",
  low: "bg-green-400",
}

const CATEGORY_LABELS: Record<string, string> = {
  interest_rate: "Faiz Orani",
  inflation: "Enflasyon",
  employment: "Istihdam",
  gdp: "GSYIH",
  producer_price: "Uretici Fiyatlari",
  retail: "Perakende",
  pmi: "PMI",
  other: "Diger",
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

export default function NewsPage() {
  const [events, setEvents] = useState<EconEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<string>("all")
  const [blackout, setBlackout] = useState<{ blackout: boolean; reason?: string } | null>(null)

  const fetchEvents = useCallback(async () => {
    try {
      const data = await api.get("/calendar/events?days=14")
      setEvents(data)
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

  useEffect(() => {
    fetchEvents()
    fetchBlackout()
  }, [fetchEvents, fetchBlackout])

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

  // Olaylari gune gore grupla
  const grouped: Record<string, EconEvent[]> = {}
  for (const ev of filtered) {
    const key = ev.event_time ? new Date(ev.event_time).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", weekday: "long" }) : "Tarih Bilinmiyor"
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(ev)
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Ekonomik Takvim</h1>
          <p className="text-sm text-slate-400">FinnHub API - Onumuzdeki 14 gunluk ekonomik olaylar</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
        >
          {syncing ? "Senkronize ediliyor..." : "Senkronize Et"}
        </button>
      </div>

      {/* Blackout Banner */}
      {blackout?.blackout && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Haber Blackout Aktif</p>
            <p className="text-xs text-slate-400">{blackout.reason}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "all", label: "Tumu" },
          { key: "high", label: "Yuksek Etki" },
          { key: "medium", label: "Orta Etki" },
          { key: "low", label: "Dusuk Etki" },
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
            {f.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {(["high", "medium", "low"] as const).map((impact) => {
          const count = events.filter((e) => e.impact === impact).length
          return (
            <div key={impact} className={`p-3 rounded-lg border ${IMPACT_COLORS[impact]}`}>
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs opacity-80">
                {impact === "high" ? "Yuksek" : impact === "medium" ? "Orta" : "Dusuk"} Etki
              </div>
            </div>
          )
        })}
      </div>

      {/* Event List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Yukleniyor...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg mb-2">Henuz olay bulunamadi</p>
          <p className="text-sm">FinnHub API anahtarinizi ekleyin ve "Senkronize Et" butonuna basin.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([day, dayEvents]) => (
            <div key={day}>
              <h2 className="text-sm font-medium text-slate-400 mb-2 sticky top-0 bg-slate-950 py-1">{day}</h2>
              <div className="space-y-1.5">
                {dayEvents.map((ev) => {
                  const t = formatEventTime(ev.event_time)
                  const isPast = ev.event_time ? new Date(ev.event_time) < new Date() : false
                  return (
                    <div
                      key={ev.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors ${
                        isPast ? "opacity-60" : ""
                      }`}
                    >
                      {/* Impact dot */}
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${IMPACT_DOT[ev.impact] || IMPACT_DOT.low}`} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium truncate">{ev.title}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {ev.country && (
                                <span className="text-xs text-slate-500">{ev.country}</span>
                              )}
                              {ev.category && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                  {CATEGORY_LABELS[ev.category] || ev.category}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm text-slate-300">{t.time}</p>
                            {t.relative && (
                              <p className={`text-xs ${isPast ? "text-slate-500" : "text-blue-400"}`}>{t.relative}</p>
                            )}
                          </div>
                        </div>

                        {/* Data row */}
                        {(ev.actual || ev.forecast || ev.previous) && (
                          <div className="flex gap-4 mt-2 text-xs">
                            {ev.previous && (
                              <span className="text-slate-500">
                                Onceki: <span className="text-slate-300">{ev.previous}</span>
                              </span>
                            )}
                            {ev.forecast && (
                              <span className="text-slate-500">
                                Tahmin: <span className="text-yellow-400">{ev.forecast}</span>
                              </span>
                            )}
                            {ev.actual && (
                              <span className="text-slate-500">
                                Gercek: <span className="text-green-400 font-medium">{ev.actual}</span>
                              </span>
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
    </div>
  )
}
