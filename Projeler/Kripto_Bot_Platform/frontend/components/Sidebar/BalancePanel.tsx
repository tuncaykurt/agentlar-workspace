"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

interface Balance {
  exchange: string
  total: number
  free: number
  used: number
}

interface ExchangeInfo {
  exchange: string
  label: string
  connected: boolean
}

const EXCHANGE_ICONS: Record<string, string> = {
  bitget: "🔷",
  binance: "🟡",
  mexc: "🟣",
}

export default function BalancePanel() {
  const [exchanges, setExchanges] = useState<ExchangeInfo[]>([])
  const [selected, setSelected] = useState<string>("")
  const [balance, setBalance] = useState<Balance | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Bağlı borsaları yükle
  useEffect(() => {
    const load = async () => {
      try {
        const data: ExchangeInfo[] = await api.get("/exchanges/")
        const connected = data.filter((e) => e.connected)
        setExchanges(connected)
        if (connected.length > 0 && !selected) {
          setSelected(connected[0].exchange)
        }
      } catch {}
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Seçilen borsa değişince bakiyeyi çek
  useEffect(() => {
    if (!selected) return
    let cancelled = false

    const fetchBalance = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await api.get(`/exchanges/${selected}/balance`)
        if (!cancelled) setBalance(data)
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Bakiye alınamadı")
          setBalance(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchBalance()
    const interval = setInterval(fetchBalance, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [selected])

  const usedPct = balance ? (balance.used / (balance.total || 1)) * 100 : 0

  if (exchanges.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Hesap</p>
        <div className="bg-slate-900 rounded-lg p-3 text-center">
          <p className="text-xs text-slate-500">Borsa bağlı değil</p>
          <a
            href="/settings"
            className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
          >
            Ayarlar → Borsa Ekle
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Hesap</p>
      <div className="bg-slate-900 rounded-lg p-3 space-y-3">
        {/* Borsa seçici */}
        {exchanges.length > 1 && (
          <div className="flex gap-1">
            {exchanges.map((ex) => (
              <button
                key={ex.exchange}
                onClick={() => setSelected(ex.exchange)}
                className={`flex-1 text-[10px] py-1 rounded-md transition-colors ${
                  selected === ex.exchange
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {EXCHANGE_ICONS[ex.exchange]} {ex.label}
              </button>
            ))}
          </div>
        )}

        {/* Bakiye */}
        {loading && !balance ? (
          <div className="text-xs text-slate-500 text-center py-2">Yükleniyor...</div>
        ) : error ? (
          <div className="text-xs text-red-400 text-center py-1">{error}</div>
        ) : (
          <>
            <div>
              <p className="text-[10px] text-slate-500 flex items-center gap-1">
                {EXCHANGE_ICONS[selected]} Toplam Bakiye
              </p>
              <p className="text-lg font-bold text-white">
                ${balance?.total?.toFixed(2) ?? "—"}
                <span className="text-xs text-slate-400 ml-1">USDT</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-500">Kullanılabilir</p>
                <p className="text-green-400 font-mono">${balance?.free?.toFixed(2) ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500">Kullanımda</p>
                <p className="text-yellow-400 font-mono">${balance?.used?.toFixed(2) ?? "—"}</p>
              </div>
            </div>
            {balance && (
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Kullanım</span>
                  <span>{usedPct.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${Math.min(usedPct, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
