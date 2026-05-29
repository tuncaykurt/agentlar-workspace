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

const FALLBACK_EXCHANGES: ExchangeInfo[] = [
  { exchange: "bitget",  label: "Bitget",   connected: false, needs_passphrase: true },
  { exchange: "binance", label: "Binance",  connected: false, needs_passphrase: false },
  { exchange: "mexc",    label: "MEXC",     connected: false, needs_passphrase: false },
]

export default function SettingsPage() {
  const [exchanges, setExchanges] = useState<ExchangeInfo[]>(FALLBACK_EXCHANGES)
  const [loadError, setLoadError] = useState(false)
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
      setLoadError(false)
    } catch {
      setLoadError(true)
      setExchanges(FALLBACK_EXCHANGES)
    }
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
    <div className="max-w-2xl mx-auto p-6 pb-20 space-y-6">
      <div className="section-header">
        <div className="section-header-icon">🔗</div>
        <div>
          <h1 className="section-title">Borsa Bağlantısı</h1>
          <p className="section-subtitle">Borsa API bağlantılarınızı yönetin</p>
        </div>
      </div>

      {loadError && (
        <div className="glass-card p-4 border-amber-500/20 text-amber-400 text-sm flex items-center gap-2">
          ⚠️ Backend bağlantısı kurulamadı. Coolify&apos;da servisin çalıştığını kontrol edin.
        </div>
      )}

      {message && (
        <div className={`glass-card p-4 text-sm flex items-center gap-2 ${
          message.type === "success"
            ? "border-emerald-500/20 text-emerald-400"
            : "border-red-500/20 text-red-400"
        }`}>
          {message.type === "success" ? "✓" : "✕"} {message.text}
        </div>
      )}

      {/* Exchange listesi */}
      <div className="space-y-3">
        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Borsalar</p>
        {exchanges.map((ex) => (
          <div key={ex.exchange} className="glass-card p-4 flex items-center justify-between gap-4 fade-in-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}>
                {EXCHANGE_ICONS[ex.exchange] ?? "🔗"}
              </div>
              <div>
                <p className="font-semibold text-white">{ex.label}</p>
                <p className="text-xs mt-0.5">
                  {ex.connected ? (
                    <span className="badge badge-running text-[9px]">
                      <span className="badge-dot badge-dot-green pulse-dot" /> Bağlı
                    </span>
                  ) : (
                    <span className="text-slate-600">Bağlı değil</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {ex.connected && (
                <>
                  <button onClick={() => testConnection(ex.exchange)} disabled={testing === ex.exchange}
                    className="text-xs px-3 py-1.5 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/15 disabled:opacity-50 transition-all">
                    {testing === ex.exchange ? "Test ediliyor..." : "🔌 Test Et"}
                  </button>
                  <button onClick={() => disconnect(ex.exchange)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all">
                    Kaldır
                  </button>
                </>
              )}
              <button onClick={() => openForm(ex.exchange)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-all">
                {ex.connected ? "Güncelle" : "+ Bağla"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* API Key formu */}
      {selected && selectedInfo && (
        <div className="glass-card border-blue-500/25 p-5 space-y-4 fade-in-up">
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
            <p>• API key sadece <strong className="text-white">Futures/Swap</strong> ve <strong className="text-white">Spot</strong> okuma/yazma iznine sahip olmalı</p>
            <div className="flex items-center gap-2">
              <span>• IP kısıtlaması (İşlem hızı ve güvenlik için bu IP'yi kopyalayıp borsaya ekleyin):</span>
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText("72.60.129.158");
                  const btn = e.currentTarget;
                  const originalText = btn.innerText;
                  btn.innerText = "Kopyalandı!";
                  setTimeout(() => btn.innerText = originalText, 1500);
                }}
                className="bg-slate-950 px-2 py-0.5 rounded border border-slate-700 text-emerald-400 cursor-pointer hover:bg-slate-700 hover:text-white transition-colors"
                title="Kopyalamak için tıkla"
              >
                72.60.129.158
              </button>
            </div>
            <p>• Key'ler AES-256 ile veritabanında şifreli saklanır</p>
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
      <div className="glass-card p-4 space-y-1 text-xs text-slate-600">
        <p className="font-semibold text-slate-500 flex items-center gap-1.5">🔒 Güvenlik Notu</p>
        <p>API key&apos;ler sunucunuzdaki veritabanında banka standartlarında AES-256 ile şifreli olarak saklanır. Güvenliğiniz için API key oluştururken asla para çekme yetkisi vermeyin.</p>
      </div>
    </div>
  )
}
