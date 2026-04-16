"use client"

import { useState } from "react"
import { Indicator, EMALine } from "./ProChart"

type Tab = "inputs" | "style" | "visibility"

// ─── Şema tipleri ─────────────────────────────────────────────────────────────
type FieldBase = { key: string; label: string; info?: string }
type NumberField   = FieldBase & { type: "number";  min?: number; max?: number; step?: number; default?: number }
type BooleanField  = FieldBase & { type: "boolean"; default?: boolean }
type SelectField   = FieldBase & { type: "select";  options: string[]; default?: string }
type ColorField    = FieldBase & { type: "color";   default?: string }
type SectionField  = { type: "section"; label: string }
type InfoField     = { type: "info"; text: string }
type RowField      = { type: "row"; label: string; fields: Array<ColorField | BooleanField> }

type ParamField = NumberField | BooleanField | SelectField | ColorField | SectionField | InfoField | RowField

// ─── Yardımcı ─────────────────────────────────────────────────────────────────
const PALETTES: Record<string, string[]> = {
  bull: ["#ffffff", "#1a56db", "#22c55e"],
  bear: ["#fbbf24", "#f97316", "#e11d48"],
  neutral: ["#3b82f6", "#f97316", "#a855f7", "#e11d48", "#22c55e", "#fbbf24", "#06b6d4", "#f43f5e"],
  line: ["#3b82f6", "#f97316", "#a855f7", "#e11d48", "#22c55e", "#fbbf24", "#06b6d4", "#14b8a6", "#8b5cf6", "#10b981", "#ec4899", "#f43f5e"],
}

const TF_LABELS: Record<string, string> = {
  "1s": "1 Saniye", "5s": "5 Saniye", "15s": "15 Saniye", "30s": "30 Saniye",
  "1d": "1 Dakika", "3d": "3 Dakika", "5d": "5 Dakika", "15d": "15 Dakika", "30d": "30 Dakika",
  "1sa": "1 Saat", "4sa": "4 Saat",
  "1g": "1 Gün", "1h": "1 Hafta", "1ay": "1 Ay",
}

const TIMEFRAMES = Object.keys(TF_LABELS)

const LINE_WIDTHS = [1, 2, 3, 4]
const LINE_STYLES = [
  { label: "──", value: "solid" },
  { label: "- -", value: "dashed" },
  { label: "···", value: "dotted" },
]

// ─── Parametre şemaları ───────────────────────────────────────────────────────
const PARAM_SCHEMA: Record<string, ParamField[]> = {
  sma20: [
    { type: "number", key: "period", label: "Periyot", min: 2, max: 500, default: 20 },
  ],
  vwap: [],
  bb: [
    { type: "section", label: "Bollinger Bantları Ayarları" },
    { type: "number", key: "period", label: "Periyot",         min: 5,   max: 200,          default: 20 },
    { type: "number", key: "mult",   label: "Standart Sapma",  min: 0.5, max: 4, step: 0.5, default: 2  },
  ],
  rsi: [
    { type: "section", label: "RSI Ayarları" },
    { type: "number",  key: "period",      label: "Uzunluk",          min: 2,  max: 100, default: 14 },
    { type: "number",  key: "overbought",  label: "Fazla Alınmış",    min: 50, max: 95,  default: 70 },
    { type: "number",  key: "oversold",    label: "Fazla Satılmış",   min: 5,  max: 50,  default: 30 },
    { type: "section", label: "Görsel" },
    { type: "boolean", key: "showLevels",  label: "Seviyeleri Göster", default: true },
    { type: "boolean", key: "showMid",     label: "Orta Çizgi (50)",   default: true },
  ],
  macd: [
    { type: "section", label: "MACD Ayarları" },
    { type: "number", key: "fast",   label: "Hızlı EMA",  min: 2,  max: 50,  default: 12 },
    { type: "number", key: "slow",   label: "Yavaş EMA",  min: 5,  max: 200, default: 26 },
    { type: "number", key: "signal", label: "Sinyal",     min: 2,  max: 50,  default: 9  },
  ],
  stoch: [
    { type: "section", label: "Stochastic Ayarları" },
    { type: "number", key: "k", label: "K Periyot", min: 2, max: 100, default: 14 },
    { type: "number", key: "d", label: "D Periyot", min: 2, max: 20,  default: 3  },
    { type: "number", key: "overbought", label: "Fazla Alınmış", min: 50, max: 95, default: 80 },
    { type: "number", key: "oversold",   label: "Fazla Satılmış", min: 5, max: 50, default: 20 },
  ],
  cci: [
    { type: "number", key: "period", label: "Periyot", min: 5, max: 200, default: 20 },
  ],
  williams: [
    { type: "number", key: "period", label: "Periyot", min: 2, max: 100, default: 14 },
  ],
  atr: [
    { type: "number", key: "period", label: "Periyot", min: 2, max: 100, default: 14 },
  ],
  obv: [],
  mfi: [
    { type: "number", key: "period", label: "Periyot", min: 2, max: 100, default: 14 },
  ],
  lrc: [
    { type: "section", label: "Linear Regresyon Kanalı" },
    { type: "number",  key: "period",   label: "Periyot",        min: 10, max: 500, default: 100 },
    { type: "number",  key: "devMult",  label: "Sapma Çarpanı",  min: 0.5, max: 5, step: 0.5, default: 2 },
    { type: "boolean", key: "showBands", label: "Band Göster",   default: true },
  ],
  vp: [
    { type: "section", label: "Volume Profile" },
    { type: "number",  key: "rows",   label: "Satır Sayısı",    min: 10, max: 100, default: 30 },
    { type: "boolean", key: "showPoc", label: "POC Çizgisi",    default: true },
    { type: "select",  key: "side",   label: "Konum",           options: ["Sağ", "Sol"], default: "Sağ" },
  ],
}

const DEFAULT_PARAMS: Record<string, Record<string, number | boolean | string>> = {
  sma20:   { period: 20 },
  bb:      { period: 20, mult: 2 },
  rsi:     { period: 14, overbought: 70, oversold: 30, showLevels: true, showMid: true },
  macd:    { fast: 12, slow: 26, signal: 9 },
  stoch:   { k: 14, d: 3, overbought: 80, oversold: 20 },
  cci:     { period: 20 },
  williams:{ period: 14 },
  atr:     { period: 14 },
  mfi:     { period: 14 },
  lrc:     { period: 100, devMult: 2, showBands: true },
  vp:      { rows: 30, showPoc: true, side: "Sağ" },
}

// ─── ColorSwatch bileşeni ─────────────────────────────────────────────────────
function ColorSwatch({ value, onChange, palette = "line" }: {
  value: string; onChange: (c: string) => void; palette?: string
}) {
  const [open, setOpen] = useState(false)
  const colors = PALETTES[palette] ?? PALETTES.line
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-6 rounded border-2 border-slate-600 hover:border-slate-400 transition-colors shrink-0"
        style={{ backgroundColor: value }}
        title={value}
      />
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-[#0d1117] border border-slate-700 rounded-xl p-3 shadow-2xl w-52"
          onClick={e => e.stopPropagation()}>
          <div className="grid grid-cols-6 gap-1.5 mb-2">
            {colors.map(c => (
              <button key={c}
                onClick={() => { onChange(c); setOpen(false) }}
                className="w-6 h-6 rounded border-2 hover:scale-110 transition-transform"
                style={{ backgroundColor: c, borderColor: value === c ? "white" : "transparent" }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
            <input type="color" value={value}
              onChange={e => onChange(e.target.value)}
              className="w-8 h-7 rounded border border-slate-700 cursor-pointer p-0.5 bg-slate-900"
            />
            <span className="text-slate-500 text-[10px] font-mono flex-1">{value}</span>
            <button onClick={() => setOpen(false)} className="text-slate-600 hover:text-white text-xs">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────
export default function IndicatorSettings({
  indicator, onSave, onRemove, onClose,
}: {
  indicator: Indicator
  onSave:    (updated: Indicator) => void
  onRemove:  () => void
  onClose:   () => void
}) {
  const isEMA = indicator.id === "ema"

  const [tab,       setTab]       = useState<Tab>("inputs")
  const [color,     setColor]     = useState(indicator.color     ?? "#3b82f6")
  const [color2,    setColor2]    = useState(indicator.color2    ?? "#f97316")
  const [lineWidth, setLineWidth] = useState(indicator.lineWidth ?? 1)
  const [lineStyle, setLineStyle] = useState(indicator.lineStyle ?? "solid")
  const [params,    setParams]    = useState<Record<string, number | boolean | string>>(
    { ...(DEFAULT_PARAMS[indicator.id] ?? {}), ...(indicator.params ?? {}) }
  )
  const [periods,   setPeriods]   = useState<EMALine[]>(
    indicator.periods ?? [{ period: 9, color: "#3b82f6" }, { period: 21, color: "#f97316" }]
  )
  const [hiddenTFs, setHiddenTFs] = useState<string[]>(indicator.hiddenTFs ?? [])

  const schema = PARAM_SCHEMA[indicator.id] ?? []

  const addPeriod = () => {
    const next = (periods[periods.length - 1]?.period ?? 20) + 20
    setPeriods(p => [...p, { period: Math.min(next, 500), color: PALETTES.line[p.length % PALETTES.line.length] }])
  }
  const removePeriod = (idx: number) => setPeriods(p => p.filter((_, i) => i !== idx))
  const updatePeriod = (idx: number, patch: Partial<EMALine>) =>
    setPeriods(p => p.map((item, i) => i === idx ? { ...item, ...patch } : item))

  const setParam = (key: string, val: number | boolean | string) =>
    setParams(p => ({ ...p, [key]: val }))

  const toggleTF = (tf: string) =>
    setHiddenTFs(p => p.includes(tf) ? p.filter(t => t !== tf) : [...p, tf])

  const handleSave = () => {
    onSave({ ...indicator, color, color2, lineWidth, lineStyle, params, periods, hiddenTFs })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-[#131722] border border-slate-700/60 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 520, maxHeight: "calc(100vh - 4rem)" }}
        onClick={e => e.stopPropagation()}>

        {/* ── Başlık ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0 bg-[#1a2035]">
          <span className="text-white font-semibold text-sm">{indicator.name}</span>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg leading-none transition-colors">✕</button>
        </div>

        {/* ── Sekmeler ── */}
        <div className="flex border-b border-slate-800 shrink-0 bg-[#131722]">
          {(["inputs", "style", "visibility"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-blue-500 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}>
              {t === "inputs" ? "Girdiler" : t === "style" ? "Stil" : "Görünürlük"}
            </button>
          ))}
        </div>

        {/* ── İçerik ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-0">

          {/* ─── GİRDİLER ─── */}
          {tab === "inputs" && (
            <div>
              {isEMA ? (
                <EMAInputs
                  periods={periods}
                  lineWidth={lineWidth}
                  onAdd={addPeriod}
                  onUpdate={updatePeriod}
                  onRemove={removePeriod}
                  onWidthChange={setLineWidth}
                />
              ) : schema.length === 0 ? (
                <p className="text-slate-600 text-sm text-center py-8">Bu indikatörün ayarlanabilir parametresi yok.</p>
              ) : (
                <SchemaFields schema={schema} params={params} onChange={setParam} />
              )}
            </div>
          )}

          {/* ─── STİL ─── */}
          {tab === "style" && (
            <div className="space-y-0">
              {isEMA ? (
                <EMAStyle periods={periods} lineWidth={lineWidth} onWidthChange={setLineWidth} />
              ) : (
                <StyleTab
                  color={color} color2={color2}
                  lineWidth={lineWidth} lineStyle={lineStyle}
                  hasColor2={indicator.color2 !== undefined}
                  onColor={setColor} onColor2={setColor2}
                  onWidth={setLineWidth} onStyle={setLineStyle}
                />
              )}
            </div>
          )}

          {/* ─── GÖRÜNÜRLÜK ─── */}
          {tab === "visibility" && (
            <VisibilityTab hiddenTFs={hiddenTFs} onToggle={toggleTF} />
          )}
        </div>

        {/* ── Alt butonlar ── */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-800 bg-[#1a2035] shrink-0">
          <button onClick={onRemove}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors px-2">
            Kaldır
          </button>
          <div className="flex-1" />
          <button onClick={onClose}
            className="px-4 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-white text-xs transition-colors">
            İptal
          </button>
          <button onClick={handleSave}
            className="px-5 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors">
            Tamam
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── EMA Girdiler ─────────────────────────────────────────────────────────────
function EMAInputs({ periods, lineWidth, onAdd, onUpdate, onRemove, onWidthChange }: {
  periods: EMALine[]; lineWidth: number
  onAdd: () => void
  onUpdate: (idx: number, p: Partial<EMALine>) => void
  onRemove: (idx: number) => void
  onWidthChange: (w: number) => void
}) {
  return (
    <div className="space-y-1">
      <SectionHeader label="EMA Periyotları" />
      {periods.map((p, idx) => (
        <SettingsRow key={idx} label={`EMA ${p.period}`}>
          <div className="flex items-center gap-2">
            <input type="number" min={2} max={500} value={p.period}
              onChange={e => onUpdate(idx, { period: parseInt(e.target.value) || 2 })}
              className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm text-center focus:outline-none focus:border-blue-500"
            />
            <ColorSwatch value={p.color} onChange={c => onUpdate(idx, { color: c })} />
            {periods.length > 1 && (
              <button onClick={() => onRemove(idx)}
                className="text-slate-600 hover:text-red-400 text-base leading-none transition-colors">✕</button>
            )}
          </div>
        </SettingsRow>
      ))}
      <div className="flex items-center gap-2 py-2">
        <button onClick={onAdd}
          className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-500/60 px-3 py-1 rounded transition-colors">
          + Periyot Ekle
        </button>
        <div className="flex gap-1">
          {[9,21,50,100,200].filter(n => !periods.find(p => p.period === n)).map(n => (
            <button key={n} onClick={() => {}}
              className="text-[10px] text-slate-600 hover:text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded transition-colors">
              {n}
            </button>
          ))}
        </div>
      </div>
      <SectionHeader label="Çizgi" />
      <SettingsRow label="Kalınlık">
        <WidthPicker value={lineWidth} onChange={onWidthChange} />
      </SettingsRow>
    </div>
  )
}

// ─── Schema alanları ──────────────────────────────────────────────────────────
function SchemaFields({ schema, params, onChange }: {
  schema: ParamField[]
  params: Record<string, number | boolean | string>
  onChange: (key: string, val: number | boolean | string) => void
}) {
  return (
    <div className="space-y-0">
      {schema.map((field, i) => {
        if (field.type === "section") return <SectionHeader key={i} label={field.label} />
        if (field.type === "info")    return <InfoRow key={i} text={field.text} />

        if (field.type === "number") return (
          <SettingsRow key={field.key} label={field.label} info={field.info}>
            <input
              type="number" min={field.min} max={field.max} step={field.step ?? 1}
              value={(params[field.key] as number) ?? field.default ?? 0}
              onChange={e => onChange(field.key, parseFloat(e.target.value) || field.min || 0)}
              className="w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm text-right focus:outline-none focus:border-blue-500 transition-colors"
            />
          </SettingsRow>
        )

        if (field.type === "boolean") return (
          <SettingsRow key={field.key} label={field.label}>
            <Checkbox
              checked={!!params[field.key] ?? !!field.default}
              onChange={v => onChange(field.key, v)}
            />
          </SettingsRow>
        )

        if (field.type === "select") return (
          <SettingsRow key={field.key} label={field.label} info={field.info}>
            <select
              value={(params[field.key] as string) ?? field.default ?? ""}
              onChange={e => onChange(field.key, e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500 min-w-[100px]"
            >
              {field.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </SettingsRow>
        )

        if (field.type === "color") return (
          <SettingsRow key={field.key} label={field.label}>
            <ColorSwatch
              value={(params[field.key] as string) ?? field.default ?? "#3b82f6"}
              onChange={v => onChange(field.key, v)}
            />
          </SettingsRow>
        )

        return null
      })}
    </div>
  )
}

// ─── Stil sekmesi ─────────────────────────────────────────────────────────────
function StyleTab({ color, color2, lineWidth, lineStyle, hasColor2, onColor, onColor2, onWidth, onStyle }: {
  color: string; color2: string; lineWidth: number; lineStyle: string; hasColor2: boolean
  onColor: (c: string) => void; onColor2: (c: string) => void
  onWidth: (w: number) => void; onStyle: (s: string) => void
}) {
  return (
    <div className="space-y-0">
      <SectionHeader label="Çizgi" />
      <SettingsRow label="Renk">
        <ColorSwatch value={color} onChange={onColor} />
      </SettingsRow>
      {hasColor2 && (
        <SettingsRow label="İkinci Renk">
          <ColorSwatch value={color2} onChange={onColor2} />
        </SettingsRow>
      )}
      <SettingsRow label="Kalınlık">
        <WidthPicker value={lineWidth} onChange={onWidth} />
      </SettingsRow>
      <SettingsRow label="Stil">
        <StylePicker value={lineStyle} onChange={onStyle} />
      </SettingsRow>
      {/* Önizleme */}
      <div className="mt-4 p-3 rounded-lg bg-slate-900/50 border border-slate-800">
        <p className="text-slate-600 text-[10px] uppercase tracking-wider mb-2">Önizleme</p>
        <svg width="100%" height="36" viewBox="0 0 400 36">
          <polyline
            points="0,28 60,20 120,24 180,10 240,18 300,12 360,20 400,14"
            fill="none" stroke={color} strokeWidth={lineWidth * 1.5}
            strokeDasharray={lineStyle === "dashed" ? "8,4" : lineStyle === "dotted" ? "2,4" : undefined}
          />
        </svg>
      </div>
    </div>
  )
}

// ─── EMA Stil ─────────────────────────────────────────────────────────────────
function EMAStyle({ periods, lineWidth, onWidthChange }: {
  periods: EMALine[]; lineWidth: number; onWidthChange: (w: number) => void
}) {
  return (
    <div className="space-y-0">
      <SectionHeader label="Çizgi" />
      <SettingsRow label="Kalınlık">
        <WidthPicker value={lineWidth} onChange={onWidthChange} />
      </SettingsRow>
      <div className="mt-4 p-3 rounded-lg bg-slate-900/50 border border-slate-800">
        <p className="text-slate-600 text-[10px] uppercase tracking-wider mb-2">Önizleme</p>
        <svg width="100%" height={Math.max(40, periods.length * 14)} viewBox={`0 0 400 ${Math.max(40, periods.length * 14)}`}>
          {periods.map((p, i) => {
            const y1 = 30 - i * 8; const y2 = 8 - i * 2
            return <polyline key={i}
              points={`0,${y1} 100,${(y1+y2)/2+4} 200,${(y1+y2)/2} 300,${y2+4} 400,${y2}`}
              fill="none" stroke={p.color} strokeWidth={lineWidth * 1.5}
            />
          })}
        </svg>
        <div className="flex flex-wrap gap-3 mt-2">
          {periods.map((p, i) => (
            <span key={i} className="flex items-center gap-1 text-[10px]" style={{ color: p.color }}>
              <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke={p.color} strokeWidth="2"/></svg>
              EMA {p.period}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Görünürlük sekmesi ───────────────────────────────────────────────────────
function VisibilityTab({ hiddenTFs, onToggle }: { hiddenTFs: string[]; onToggle: (tf: string) => void }) {
  return (
    <div>
      <SectionHeader label="Zaman Dilimleri" />
      <div className="space-y-0">
        {TIMEFRAMES.map(tf => (
          <SettingsRow key={tf} label={TF_LABELS[tf]}>
            <Checkbox checked={!hiddenTFs.includes(tf)} onChange={() => onToggle(tf)} />
          </SettingsRow>
        ))}
      </div>
    </div>
  )
}

// ─── Küçük yardımcı bileşenler ────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="pt-4 pb-1.5 first:pt-2">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{label}</p>
    </div>
  )
}

function SettingsRow({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/50 min-h-[38px]">
      <div className="flex items-center gap-1.5">
        <span className="text-slate-300 text-sm">{label}</span>
        {info && (
          <span title={info} className="text-slate-600 hover:text-slate-400 cursor-help text-xs">ⓘ</span>
        )}
      </div>
      <div className="flex items-center gap-2 ml-4">
        {children}
      </div>
    </div>
  )
}

function InfoRow({ text }: { text: string }) {
  return (
    <div className="py-2 px-3 my-1 rounded-lg bg-slate-900/50 border border-slate-800">
      <p className="text-slate-500 text-xs leading-relaxed">{text}</p>
    </div>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
        checked ? "bg-blue-600 border-blue-600" : "border-slate-600 hover:border-slate-400"
      }`}
    >
      {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5"/>
      </svg>}
    </button>
  )
}

function WidthPicker({ value, onChange }: { value: number; onChange: (w: number) => void }) {
  return (
    <div className="flex gap-1">
      {LINE_WIDTHS.map(w => (
        <button key={w} onClick={() => onChange(w)}
          className={`w-8 h-7 rounded border text-[10px] transition-colors flex items-center justify-center ${
            value === w
              ? "border-blue-500 bg-blue-500/20 text-blue-300"
              : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-white"
          }`}>
          <svg width="18" height={w * 2 + 2} viewBox={`0 0 18 ${w * 2 + 2}`}>
            <line x1="0" y1={w + 1} x2="18" y2={w + 1} stroke="currentColor" strokeWidth={w} />
          </svg>
        </button>
      ))}
    </div>
  )
}

function StylePicker({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <div className="flex gap-1">
      {LINE_STYLES.map(s => (
        <button key={s.value} onClick={() => onChange(s.value)}
          className={`px-2.5 py-1 rounded border text-xs font-mono transition-colors ${
            value === s.value
              ? "border-blue-500 bg-blue-500/20 text-blue-300"
              : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-white"
          }`}>
          {s.label}
        </button>
      ))}
    </div>
  )
}
