"use client"

import { useState, useEffect } from "react"
import { Indicator } from "./ProChart"
import { loadCustomInds, saveCustomInds, CustomIndicatorDef } from "./CustomIndicatorEditor"

const CATEGORIES = [
  { label: "Tümü",     filter: (_: Indicator) => true },
  { label: "Overlay",  filter: (i: Indicator) => i.type === "overlay" },
  { label: "Osilatör", filter: (i: Indicator) => i.type === "oscillator" },
  { label: "Özel",     filter: (i: Indicator) => i.id.startsWith("custom_") },
]

export default function IndicatorPicker({
  indicators, onToggle, onClose,
}: {
  indicators: Indicator[]
  onToggle: (id: string) => void
  onClose: () => void
}) {
  const [search,     setSearch]     = useState("")
  const [cat,        setCat]        = useState(0)
  const [customInds, setCustomInds] = useState<CustomIndicatorDef[]>([])

  useEffect(() => { setCustomInds(loadCustomInds()) }, [])

  // Özel indikatörleri Indicator formatına dönüştür
  const customAsInds: Indicator[] = customInds.map(c => ({
    id:      c.id,
    name:    c.name,
    type:    c.type,
    color:   c.color,
    enabled: indicators.find(i => i.id === c.id)?.enabled ?? false,
    params:  {},
  }))

  // Standart + özel birleşik liste
  const allIndicators = [
    ...indicators.filter(i => !i.id.startsWith("custom_")),
    ...customAsInds,
  ]

  const filtered = allIndicators.filter(ind =>
    CATEGORIES[cat].filter(ind) &&
    ind.name.toLowerCase().includes(search.toLowerCase())
  )

  const removeCustom = (id: string) => {
    const next = customInds.filter(c => c.id !== id)
    saveCustomInds(next)
    setCustomInds(next)
  }

  const activeCount = allIndicators.filter(i => i.enabled).length
  const customCount = customInds.length

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center" onClick={onClose}>
      <div className="bg-[#0d1117] border border-slate-700 rounded-xl w-[500px] max-h-[580px] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Başlık */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
          <div>
            <span className="text-white font-semibold">İndikatör Ekle</span>
            {customCount > 0 && (
              <span className="ml-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                {customCount} özel
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none transition-colors">×</button>
        </div>

        {/* Arama */}
        <div className="px-4 pt-3 shrink-0">
          <input autoFocus type="text" placeholder="İndikatör ara..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Kategori sekmeleri */}
        <div className="flex gap-1 px-4 pt-2.5 pb-2 shrink-0">
          {CATEGORIES.map((c, i) => (
            <button key={c.label} onClick={() => setCat(i)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                cat === i ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}>
              {c.label}
              {c.label === "Özel" && customCount > 0 && (
                <span className="ml-1 bg-emerald-500/20 text-emerald-400 px-1 rounded text-[10px]">{customCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Liste */}
        <div className="overflow-y-auto flex-1 px-4 pb-3 space-y-1">
          {filtered.map(ind => {
            const isCustom = ind.id.startsWith("custom_")
            const customDef = isCustom ? customInds.find(c => c.id === ind.id) : null

            return (
              <div key={ind.id}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  ind.enabled
                    ? "bg-blue-500/12 border border-blue-500/30"
                    : "hover:bg-slate-800/60 border border-transparent"
                }`}
                onClick={() => onToggle(ind.id)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Renk */}
                  <span className="w-3 h-3 rounded-sm border-2 shrink-0"
                    style={{ borderColor: ind.color || "#64748b", backgroundColor: (ind.color || "#64748b") + "30" }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-medium truncate ${ind.enabled ? "text-white" : "text-slate-300"}`}>
                        {ind.name}
                      </p>
                      {isCustom && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                          Özel
                        </span>
                      )}
                      {customDef?.producesSignals && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
                          ● Sinyal
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">
                      {ind.type === "overlay" ? "Grafik üzeri" : "Alt panel"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {/* Özel indikatörü menüden sil */}
                  {isCustom && (
                    <button
                      onClick={e => { e.stopPropagation(); removeCustom(ind.id) }}
                      className="text-slate-700 hover:text-red-400 text-sm transition-colors px-1"
                      title="Menüden kaldır"
                    >
                      ✕
                    </button>
                  )}

                  {/* Toggle */}
                  <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${
                    ind.enabled ? "bg-blue-600" : "bg-slate-700"
                  }`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      ind.enabled ? "translate-x-4" : "translate-x-0"
                    }`} />
                  </div>
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="text-center py-10">
              <p className="text-slate-500 text-sm">
                {cat === 3 ? "Henüz özel indikatör eklenmedi." : `"${search}" bulunamadı`}
              </p>
              {cat === 3 && (
                <p className="text-slate-700 text-xs mt-1">
                  Editörde kod yaz → "Menüye Ekle" butonuna bas.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Alt bilgi */}
        <div className="px-4 py-2.5 border-t border-slate-800 text-xs text-slate-500 flex justify-between shrink-0">
          <span>{activeCount} indikatör aktif</span>
          <span className="text-slate-600">Tıkla → aç/kapat</span>
        </div>
      </div>
    </div>
  )
}
