"use client"

import { useState, useRef, useEffect, useCallback } from "react"

// ─── Sembol formatları ────────────────────────────────────────────────────────
// display  : "ETHUSDT.P"          (kullanıcıya gösterilen)
// internal : "ETH/USDT:USDT"      (backend + state)
// tv       : "BITGET:ETHUSDT.P"   (TradingView widget)

export interface SymbolInfo {
  display:  string   // ETHUSDT.P
  internal: string   // ETH/USDT:USDT
  tv:       string   // BITGET:ETHUSDT.P
  base:     string   // ETH
  category: string   // Major | Alt | DeFi | Layer2 | Meme
}

// Yaygın Bitget perp sembolleri
const SYMBOL_LIST: SymbolInfo[] = [
  // ── Major ──
  { base:"BTC",  display:"BTCUSDT.P",  internal:"BTC/USDT:USDT",  tv:"BITGET:BTCUSDT.P",  category:"Major" },
  { base:"ETH",  display:"ETHUSDT.P",  internal:"ETH/USDT:USDT",  tv:"BITGET:ETHUSDT.P",  category:"Major" },
  { base:"SOL",  display:"SOLUSDT.P",  internal:"SOL/USDT:USDT",  tv:"BITGET:SOLUSDT.P",  category:"Major" },
  { base:"BNB",  display:"BNBUSDT.P",  internal:"BNB/USDT:USDT",  tv:"BITGET:BNBUSDT.P",  category:"Major" },
  { base:"XRP",  display:"XRPUSDT.P",  internal:"XRP/USDT:USDT",  tv:"BITGET:XRPUSDT.P",  category:"Major" },
  { base:"ADA",  display:"ADAUSDT.P",  internal:"ADA/USDT:USDT",  tv:"BITGET:ADAUSDT.P",  category:"Major" },
  { base:"AVAX", display:"AVAXUSDT.P", internal:"AVAX/USDT:USDT", tv:"BITGET:AVAXUSDT.P", category:"Major" },
  { base:"DOT",  display:"DOTUSDT.P",  internal:"DOT/USDT:USDT",  tv:"BITGET:DOTUSDT.P",  category:"Major" },
  { base:"LTC",  display:"LTCUSDT.P",  internal:"LTC/USDT:USDT",  tv:"BITGET:LTCUSDT.P",  category:"Major" },
  { base:"DOGE", display:"DOGEUSDT.P", internal:"DOGE/USDT:USDT", tv:"BITGET:DOGEUSDT.P", category:"Major" },
  // ── Layer2 / Infra ──
  { base:"MATIC",display:"MATICUSDT.P",internal:"MATIC/USDT:USDT",tv:"BITGET:MATICUSDT.P",category:"Layer2" },
  { base:"ARB",  display:"ARBUSDT.P",  internal:"ARB/USDT:USDT",  tv:"BITGET:ARBUSDT.P",  category:"Layer2" },
  { base:"OP",   display:"OPUSDT.P",   internal:"OP/USDT:USDT",   tv:"BITGET:OPUSDT.P",   category:"Layer2" },
  { base:"LINK", display:"LINKUSDT.P", internal:"LINK/USDT:USDT", tv:"BITGET:LINKUSDT.P", category:"Layer2" },
  { base:"APT",  display:"APTUSDT.P",  internal:"APT/USDT:USDT",  tv:"BITGET:APTUSDT.P",  category:"Layer2" },
  { base:"SUI",  display:"SUIUSDT.P",  internal:"SUI/USDT:USDT",  tv:"BITGET:SUIUSDT.P",  category:"Layer2" },
  { base:"TIA",  display:"TIAUSDT.P",  internal:"TIA/USDT:USDT",  tv:"BITGET:TIAUSDT.P",  category:"Layer2" },
  { base:"SEI",  display:"SEIUSDT.P",  internal:"SEI/USDT:USDT",  tv:"BITGET:SEIUSDT.P",  category:"Layer2" },
  // ── DeFi ──
  { base:"UNI",  display:"UNIUSDT.P",  internal:"UNI/USDT:USDT",  tv:"BITGET:UNIUSDT.P",  category:"DeFi" },
  { base:"AAVE", display:"AAVEUSDT.P", internal:"AAVE/USDT:USDT", tv:"BITGET:AAVEUSDT.P", category:"DeFi" },
  { base:"CRV",  display:"CRVUSDT.P",  internal:"CRV/USDT:USDT",  tv:"BITGET:CRVUSDT.P",  category:"DeFi" },
  { base:"SNX",  display:"SNXUSDT.P",  internal:"SNX/USDT:USDT",  tv:"BITGET:SNXUSDT.P",  category:"DeFi" },
  { base:"GMX",  display:"GMXUSDT.P",  internal:"GMX/USDT:USDT",  tv:"BITGET:GMXUSDT.P",  category:"DeFi" },
  { base:"JUP",  display:"JUPUSDT.P",  internal:"JUP/USDT:USDT",  tv:"BITGET:JUPUSDT.P",  category:"DeFi" },
  // ── Meme ──
  { base:"SHIB", display:"SHIBUSDT.P", internal:"SHIB/USDT:USDT", tv:"BITGET:SHIBUSDT.P", category:"Meme" },
  { base:"PEPE", display:"PEPEUSDT.P", internal:"PEPE/USDT:USDT", tv:"BITGET:PEPEUSDT.P", category:"Meme" },
  { base:"FLOKI",display:"FLOKIUSDT.P",internal:"FLOKI/USDT:USDT",tv:"BITGET:FLOKIUSDT.P",category:"Meme" },
  { base:"WIF",  display:"WIFUSDT.P",  internal:"WIF/USDT:USDT",  tv:"BITGET:WIFUSDT.P",  category:"Meme" },
  { base:"BONK", display:"BONKUSDT.P", internal:"BONK/USDT:USDT", tv:"BITGET:BONKUSDT.P", category:"Meme" },
  // ── Alt ──
  { base:"ATOM", display:"ATOMUSDT.P", internal:"ATOM/USDT:USDT", tv:"BITGET:ATOMUSDT.P", category:"Alt" },
  { base:"NEAR", display:"NEARUSDT.P", internal:"NEAR/USDT:USDT", tv:"BITGET:NEARUSDT.P", category:"Alt" },
  { base:"FTM",  display:"FTMUSDT.P",  internal:"FTM/USDT:USDT",  tv:"BITGET:FTMUSDT.P",  category:"Alt" },
  { base:"INJ",  display:"INJUSDT.P",  internal:"INJ/USDT:USDT",  tv:"BITGET:INJUSDT.P",  category:"Alt" },
  { base:"TRX",  display:"TRXUSDT.P",  internal:"TRX/USDT:USDT",  tv:"BITGET:TRXUSDT.P",  category:"Alt" },
  { base:"TON",  display:"TONUSDT.P",  internal:"TON/USDT:USDT",  tv:"BITGET:TONUSDT.P",  category:"Alt" },
  { base:"FET",  display:"FETUSDT.P",  internal:"FET/USDT:USDT",  tv:"BITGET:FETUSDT.P",  category:"Alt" },
  { base:"WLD",  display:"WLDUSDT.P",  internal:"WLD/USDT:USDT",  tv:"BITGET:WLDUSDT.P",  category:"Alt" },
  { base:"RNDR", display:"RNDRUSDT.P", internal:"RNDR/USDT:USDT", tv:"BITGET:RNDRUSDT.P", category:"Alt" },
  { base:"IMX",  display:"IMXUSDT.P",  internal:"IMX/USDT:USDT",  tv:"BITGET:IMXUSDT.P",  category:"Alt" },
  { base:"BLUR", display:"BLURUSDT.P", internal:"BLUR/USDT:USDT", tv:"BITGET:BLURUSDT.P", category:"Alt" },
  { base:"JTO",  display:"JTOUSDT.P",  internal:"JTO/USDT:USDT",  tv:"BITGET:JTOUSDT.P",  category:"Alt" },
  { base:"PYTH", display:"PYTHUSDT.P", internal:"PYTH/USDT:USDT", tv:"BITGET:PYTHUSDT.P", category:"Alt" },
  { base:"STX",  display:"STXUSDT.P",  internal:"STX/USDT:USDT",  tv:"BITGET:STXUSDT.P",  category:"Alt" },
  { base:"MANTA",display:"MANTAUSDT.P",internal:"MANTA/USDT:USDT",tv:"BITGET:MANTAUSDT.P",category:"Alt" },
  { base:"ENA",  display:"ENAUSDT.P",  internal:"ENA/USDT:USDT",  tv:"BITGET:ENAUSDT.P",  category:"Alt" },
]

// Internal'dan SymbolInfo bul
export function findSymbol(internal: string): SymbolInfo | undefined {
  return SYMBOL_LIST.find(s => s.internal === internal)
}

// Serbest metin → internal format dönüştür (listede yoksa)
function parseCustomSymbol(text: string): SymbolInfo {
  const raw   = text.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const base  = raw.replace("USDT", "").replace(/P$/, "")
  return {
    base,
    display:  `${base}USDT.P`,
    internal: `${base}/USDT:USDT`,
    tv:       `BITGET:${base}USDT.P`,
    category: "Alt",
  }
}

const CATEGORIES = ["Tümü", "Major", "Layer2", "DeFi", "Meme", "Alt"]
const CATEGORY_COLORS: Record<string, string> = {
  Major: "text-yellow-400", Layer2: "text-blue-400",
  DeFi: "text-green-400",  Meme:  "text-pink-400", Alt: "text-slate-400",
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────
export default function SymbolSearch({
  value,
  onChange,
}: {
  value: string          // internal format
  onChange: (sym: SymbolInfo) => void
}) {
  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState("")
  const [cat,     setCat]     = useState("Tümü")
  const [focused, setFocused] = useState(0)
  const inputRef  = useRef<HTMLInputElement>(null)
  const panelRef  = useRef<HTMLDivElement>(null)

  const current = findSymbol(value)
  const displayLabel = current?.display ?? value.split("/")[0] + "USDT.P"

  const filtered = SYMBOL_LIST.filter(s => {
    const matchCat   = cat === "Tümü" || s.category === cat
    const matchQuery = !query ||
      s.base.includes(query.toUpperCase()) ||
      s.display.includes(query.toUpperCase())
    return matchCat && matchQuery
  })

  // Listede yoksa serbest giriş seçeneği göster
  const showCustom = query.length >= 2 && !filtered.some(
    s => s.base === query.toUpperCase() || s.display === query.toUpperCase() + "USDT.P"
  )

  const select = useCallback((sym: SymbolInfo) => {
    onChange(sym)
    setOpen(false)
    setQuery("")
    setFocused(0)
  }, [onChange])

  // Klavye navigasyonu
  const handleKey = (e: React.KeyboardEvent) => {
    const total = filtered.length + (showCustom ? 1 : 0)
    if (e.key === "ArrowDown") { e.preventDefault(); setFocused(f => Math.min(f + 1, total - 1)) }
    if (e.key === "ArrowUp")   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)) }
    if (e.key === "Enter") {
      e.preventDefault()
      if (focused < filtered.length) select(filtered[focused])
      else if (showCustom && query) select(parseCustomSymbol(query))
    }
    if (e.key === "Escape") { setOpen(false); setQuery("") }
  }

  // Dışarı tıklayınca kapat
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) { setOpen(false); setQuery("") }
    }
    if (open) document.addEventListener("mousedown", fn)
    return () => document.removeEventListener("mousedown", fn)
  }, [open])

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => { setFocused(0) }, [query, cat])

  return (
    <div ref={panelRef} className="relative">
      {/* Tetikleyici buton */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 transition-colors"
      >
        <span className="text-sm font-bold text-white font-mono">{displayLabel}</span>
        <svg className={`w-3 h-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-[100] bg-[#0d1117] border border-slate-700 rounded-xl shadow-2xl w-[360px] flex flex-col overflow-hidden">

          {/* Arama kutusu */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800">
            <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Sembol ara... (örn: ETH, BTCUSDT.P)"
              className="flex-1 bg-transparent text-white text-sm placeholder-slate-600 focus:outline-none font-mono"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-slate-500 hover:text-white text-xs">✕</button>
            )}
          </div>

          {/* Kategori sekmeler */}
          <div className="flex gap-0.5 px-3 py-2 border-b border-slate-800/50 overflow-x-auto">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCat(c)}
                className={`px-2.5 py-0.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  cat === c ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}>
                {c}
              </button>
            ))}
          </div>

          {/* Sonuç listesi */}
          <div className="overflow-y-auto max-h-[320px]">

            {/* Serbest giriş seçeneği */}
            {showCustom && (
              <div
                onClick={() => select(parseCustomSymbol(query))}
                className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${
                  focused === 0 ? "bg-blue-600/20" : "hover:bg-slate-800"
                }`}>
                <div>
                  <p className="text-sm font-mono text-white font-medium">
                    {query.toUpperCase().replace(/[^A-Z0-9]/g, "")}USDT.P
                  </p>
                  <p className="text-xs text-slate-500">Özel sembol olarak ekle</p>
                </div>
                <span className="text-xs text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded">↵</span>
              </div>
            )}

            {filtered.map((sym, i) => {
              const idx    = showCustom ? i + 1 : i
              const active = value === sym.internal
              return (
                <div
                  key={sym.internal}
                  onClick={() => select(sym)}
                  className={`flex items-center justify-between px-4 py-2 cursor-pointer transition-colors ${
                    focused === idx ? "bg-blue-600/20" :
                    active ? "bg-slate-800" : "hover:bg-slate-800/60"
                  }`}>
                  <div className="flex items-center gap-3">
                    {/* Base harfi rozeti */}
                    <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                      {sym.base.slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-mono font-medium text-white">{sym.display}</p>
                      <p className={`text-[11px] ${CATEGORY_COLORS[sym.category] || "text-slate-500"}`}>
                        {sym.category} · Perpetual
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                    {focused === idx && <span className="text-xs text-slate-600 border border-slate-700 px-1 py-0.5 rounded">↵</span>}
                  </div>
                </div>
              )
            })}

            {filtered.length === 0 && !showCustom && (
              <p className="text-slate-500 text-sm text-center py-8">Sonuç bulunamadı</p>
            )}
          </div>

          {/* Alt bilgi */}
          <div className="px-4 py-2 border-t border-slate-800 text-[11px] text-slate-600 flex justify-between">
            <span>{filtered.length} sembol</span>
            <span>↑↓ gezin · ↵ seç · ESC kapat</span>
          </div>
        </div>
      )}
    </div>
  )
}
