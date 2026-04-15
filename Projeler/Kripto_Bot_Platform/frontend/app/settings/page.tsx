"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

interface ExchangeInfo {
  exchange: string
  label: string
  connected: boolean
  needs_passphrase: boolean
}

const EXCHANGE_ICONS: Record<string, string> = {
  bitget: "🔷",
  binance: "🟡",
  mexc: "🟣",
}

export default function SettingsPage() {
  const [exchanges, setExchanges] = useState<ExchangeInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState({ api_key: "", secret: "", passphrase: "" })
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    loadExchanges()
  }, [])

  const loadExchanges = async () => {
    try {
      const data = await api.get("/exchanges/")
      setExchanges(data)
    } catch {}
  }

  const openForm = (exchange: string) => {
    setSelected(exchange)
    setForm({ api_key: "", secret: "", passphrase: "" })
    setMessage(null)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setLoading(true)
    setMessage(null)
    try {
      await api.post("/exchanges/save", {
        exchange: selected,
        api_key: form.api_key,
        secret: form.secret,
        passphrase: form.passphrase,
      })
      setMessage({ type: "success", text: "API key başarıyla kaydedildi!" })
      await loadExchanges()
      setSelected(null)
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Kayıt başarısız" })
    } finally {
      setLoading(false)
    }
  }

  const testConnection = async (exchange: string) => {
    setTesting(exchange)
    setMessage(null)
    try {
      const res = await api.post(`/exchanges/${exchange}/test`, {})
      setMessage({
        type: "success",
        text: `${exchange.toUpperCase()} bağlantısı başarılı! Bakiye: $${res.balance?.total?.toFixed(2)} USDT`,
      })
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Bağlantı hatası" })
    } finally {
      setTesting(null)
    }
  }

  const disconnect = async (exchange: string) => {
    try {
      await api.delete(`/exchanges/${exchange}`)
      await loadExchanges()
      setMessage({ type: "success", text: `${exchange.toUpperCase()} bağlantısı kaldırıldı` })
    } catch {}
  }

  const selectedInfo = exchanges.find((e) => e.exchange === selected)

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Borsa Bağlantısı</h1>
        <p className="text-sm text-slate-400 mt-1">Borsa API bağlantılarınızı yönetin</p>
      </div>

      {message && (
        <div
          className={`text-sm rounded-lg px-4 py-3 border ${
            message.type === "success"
              ? "text-green-400 bg-green-500/10 border-green-500/20"
              : "text-red-400 bg-red-500/10 border-red-500/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Exchange listesi */}
      <div className="space-y-3">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Borsalar</p>
        {exchanges.map((ex) => (
          <div
            key={ex.exchange}
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{EXCHANGE_ICONS[ex.exchange] ?? "🔗"}</span>
              <div>
                <p className="font-semibold text-white">{ex.label}</p>
                <p className="text-xs text-slate-500">
                  {ex.connected ? (
                    <span className="text-green-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      Bağlı
                    </span>
                  ) : (
                    "Bağlı değil"
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {ex.connected && (
                <>
                  <button
                    onClick={() => testConnection(ex.exchange)}
                    disabled={testing === ex.exchange}
                    className="text-xs px-3 py-1.5 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                  >
                    {testing === ex.exchange ? "Test ediliyor..." : "Test Et"}
                  </button>
                  <button
                    onClick={() => disconnect(ex.exchange)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Kaldır
                  </button>
                </>
              )}
              <button
                onClick={() => openForm(ex.exchange)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
              >
                {ex.connected ? "Güncelle" : "Bağla"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* API Key formu */}
      {selected && selectedInfo && (
        <div className="bg-slate-900 border border-blue-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">
              {EXCHANGE_ICONS[selected]} {selectedInfo.label} API Key
            </h2>
            <button
              onClick={() => setSelected(null)}
              className="text-slate-500 hover:text-white text-sm"
            >
              ✕
            </button>
          </div>

          <div className="text-xs text-slate-400 bg-slate-800 rounded-lg px-3 py-2 space-y-1">
            <p>• API key sadece <strong className="text-white">Futures/Swap</strong> iznine sahip olmalı</p>
            <p>• IP kısıtlaması opsiyonel ama önerilir</p>
            <p>• Key'ler şifreli şekilde sunucunuzda saklanır</p>
          </div>

          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">API Key</label>
              <input
                type="text"
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                placeholder="API key"
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Secret Key</label>
              <input
                type="password"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                placeholder="Secret key"
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            {selectedInfo.needs_passphrase && (
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">
                  Passphrase <span className="text-yellow-400">(Bitget zorunlu)</span>
                </label>
                <input
                  type="password"
                  value={form.passphrase}
                  onChange={(e) => setForm((f) => ({ ...f, passphrase: e.target.value }))}
                  placeholder="Passphrase"
                  required={selectedInfo.needs_passphrase}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
              >
                {loading ? "Kaydediliyor..." : "Kaydet"}
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-sm transition-colors"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Güvenlik notu */}
      <div className="text-xs text-slate-600 border border-slate-800 rounded-lg p-4 space-y-1">
        <p className="font-semibold text-slate-500">Güvenlik Notu</p>
        <p>API key'ler sunucunuzdaki Redis&apos;te şifreli olarak saklanır. Asla para çekme yetkisi vermeyin.</p>
      </div>
    </div>
  )
}
