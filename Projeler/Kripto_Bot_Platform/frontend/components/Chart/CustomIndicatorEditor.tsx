"use client"

import { useState, useEffect } from "react"
import { Indicator } from "./ProChart"

// ─── Sabitler ─────────────────────────────────────────────────────────────────
export const LS_SAVED_CODES  = "prochart_saved_indicators"   // editördeki kod kayıtları
export const LS_CUSTOM_INDS  = "prochart_custom_indicators"  // menüye eklenmiş indikatörler

// ─── Tipler ───────────────────────────────────────────────────────────────────
export interface OHLCBar {
  open: number; high: number; low: number; close: number; color?: string
}

export interface CustomSeries {
  id: string
  // Seri tipi: line (varsayılan), candlestick, histogram, baseline
  type?: "line" | "candlestick" | "histogram" | "baseline"
  values: (number | null)[]
  // Candlestick için OHLC verisi
  ohlcValues?: (OHLCBar | null)[]
  upColor?: string
  downColor?: string
  // Baseline için: baz çizgisi Y değeri ve dolgu renkleri
  baselineValue?: number
  aboveColor?: string
  belowColor?: string
  // Her eleman ya sayı ya da { value, color } olabilir (histogram renklendirme için)
  coloredValues?: ({ value: number; color: string } | null)[]
  color: string
  title: string
  style: "solid" | "dashed" | "dotted" | "histogram" | "columns"
  lineWidth?: number
  width?: number  // backwards compatibility
  // İşaretçiler: Br, PIV, sinyal okları
  markers?: { index: number; position: "aboveBar" | "belowBar"; shape: "arrowUp" | "arrowDown" | "circle" | "square"; color: string; text: string }[]
  // panel: "main" = ana grafik, "sub" = alt panel (varsayılan)
  panel?: "main" | "sub"
}

export interface CustomSignal {
  type: "buy" | "sell"
  bar_index: number   // -1 = son mum, 0-based index
  price?: number
  reason?: string
  panel?: "main" | "sub"  // hangi panelde gösterilsin (varsayılan: main)
  value?: number           // alt panelde marker'ın y pozisyonu (RSI değeri vb.)
}

export interface CustomCodeResult {
  series: CustomSeries[]
  signals?: CustomSignal[]
  latestSignal?: "buy" | "sell" | null
}

// Menüde saklanacak özel indikatör
export interface CustomIndicatorDef {
  id: string
  name: string
  code: string
  color: string
  type: "overlay" | "oscillator"
  producesSignals: boolean
  savedAt: string
}

// Editör kayıt nesnesi
interface SavedCode {
  name: string
  code: string
  savedAt: string
}

// ─── Yardımcı fonksiyonlar ───────────────────────────────────────────────────
export const INDICATOR_HELPERS = {
  ema(arr: number[], period: number): (number | null)[] {
    const k = 2 / (period + 1)
    const res: (number | null)[] = []
    let val: number | null = null; let sum = 0; let cnt = 0
    for (const v of arr) {
      if (v == null) { res.push(null); continue }
      if (val === null) {
        sum += v; cnt++
        if (cnt >= period) { val = sum / period; res.push(val) }
        else res.push(null)
      } else { val = v * k + val * (1 - k); res.push(val) }
    }
    return res
  },
  sma(arr: number[], period: number): (number | null)[] {
    return arr.map((_, i) =>
      i < period - 1 ? null : arr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
    )
  },
  rsi(arr: number[], period = 14): (number | null)[] {
    const res: (number | null)[] = Array(period).fill(null)
    let ag = 0, al = 0
    for (let i = 1; i <= period; i++) {
      const d = arr[i] - arr[i - 1]
      ag += Math.max(d, 0); al += Math.max(-d, 0)
    }
    ag /= period; al /= period
    res.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al))
    for (let i = period + 1; i < arr.length; i++) {
      const d = arr[i] - arr[i - 1]
      ag = (ag * (period - 1) + Math.max(d, 0)) / period
      al = (al * (period - 1) + Math.max(-d, 0)) / period
      res.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al))
    }
    return res
  },
  highest(arr: number[], period: number): (number | null)[] {
    return arr.map((_, i) => i < period - 1 ? null : Math.max(...arr.slice(i - period + 1, i + 1)))
  },
  lowest(arr: number[], period: number): (number | null)[] {
    return arr.map((_, i) => i < period - 1 ? null : Math.min(...arr.slice(i - period + 1, i + 1)))
  },
  stdev(arr: number[], period: number): (number | null)[] {
    const sma = INDICATOR_HELPERS.sma(arr, period)
    return arr.map((_, i) => {
      const m = sma[i]
      if (m === null) return null
      const w = arr.slice(i - period + 1, i + 1)
      return Math.sqrt(w.reduce((s, x) => s + (x - m) ** 2, 0) / period)
    })
  },
  cross(a: (number | null)[], b: (number | null)[]): boolean[] {
    return a.map((v, i) => {
      if (i === 0 || v == null || a[i-1] == null || b[i] == null || b[i-1] == null) return false
      return (a[i-1]! < b[i-1]!) && (v > b[i]!)
    })
  },
  crossunder(a: (number | null)[], b: (number | null)[]): boolean[] {
    return a.map((v, i) => {
      if (i === 0 || v == null || a[i-1] == null || b[i] == null || b[i-1] == null) return false
      return (a[i-1]! > b[i-1]!) && (v < b[i]!)
    })
  },
  atr(ohlcv: {open:number;high:number;low:number;close:number}[], period = 14): (number | null)[] {
    const trs = ohlcv.map((c, i) => {
      if (i === 0) return c.high - c.low
      return Math.max(c.high - c.low, Math.abs(c.high - ohlcv[i-1].close), Math.abs(c.low - ohlcv[i-1].close))
    })
    const res: (number | null)[] = Array(period).fill(null)
    let atrVal = trs.slice(0, period).reduce((a, b) => a + b, 0) / period
    res.push(atrVal)
    for (let i = period; i < trs.length; i++) {
      atrVal = (atrVal * (period - 1) + trs[i]) / period
      res.push(atrVal)
    }
    return res
  },
}

// ─── Şablonlar ────────────────────────────────────────────────────────────────
const TEMPLATES: Record<string, string> = {
  "UT Bot Alert": `// ══════════════════════════════════════════════════════════════
// UT BOT ALERT — ATR Trailing Stop Sinyal İndikatörü
// ══════════════════════════════════════════════════════════════
// Pro Chart'taki yerleşik "UT Bot" butonu ile aynı algoritma.
// Bu şablon özel kodda çalıştırılabilir, bot sinyali üretir.
//
// Görsel: Amber/sarı trail çizgisi + ▲▼ ok işaretleri
// Sinyal: Fiyat trail'i yukarı keser → AL
//         Fiyat trail'i aşağı keser → SAT
// ══════════════════════════════════════════════════════════════

const ATR_P    = 10     // ATR periyodu (varsayılan: 10)
const ATR_MULT = 3.0    // ATR çarpanı  (varsayılan: 3.0)

const n = candles.length
if (n < ATR_P + 5) return { series: [], signals: [] }

// ATR hesapla
const atrV = atr(candles, ATR_P)

// ── Trailing stop (UT Bot orijinal algoritması) ───────────────
const trail = new Array(n).fill(null)
trail[ATR_P] = closes[ATR_P]

for (let i = ATR_P + 1; i < n; i++) {
  const nLoss    = (atrV[i] ?? 0) * ATR_MULT
  const prev     = trail[i - 1] ?? closes[i]
  const c        = closes[i]
  const cp       = closes[i - 1]

  if (c > prev && cp > prev) {
    // Yukarı trend — trail yükselir ama geri düşmez
    trail[i] = Math.max(prev, c - nLoss)
  } else if (c < prev && cp < prev) {
    // Aşağı trend — trail düşer ama geri çıkmaz
    trail[i] = Math.min(prev, c + nLoss)
  } else if (c > prev) {
    // Trend dönüşü: aşağıdan yukarıya
    trail[i] = c - nLoss
  } else {
    // Trend dönüşü: yukarıdan aşağıya
    trail[i] = c + nLoss
  }
}

// ── Sinyal tespiti ────────────────────────────────────────────
const signals = [], markers = []

for (let i = ATR_P + 2; i < n; i++) {
  const t  = trail[i],     tp = trail[i - 1]
  const c  = closes[i],    cp = closes[i - 1]
  if (t == null || tp == null) continue

  const crossUp   = cp <= tp && c > t   // fiyat trail'i yukarı kesti
  const crossDown = cp >= tp && c < t   // fiyat trail'i aşağı kesti

  if (crossUp) {
    signals.push({ type: 'buy',  bar_index: i - n, reason: \`UT Bot ▲ ATR(\${ATR_P})×\${ATR_MULT}\` })
    markers.push({ index: i, position: 'belowBar', shape: 'arrowUp',   color: '#22c55e', text: '▲' })
  } else if (crossDown) {
    signals.push({ type: 'sell', bar_index: i - n, reason: \`UT Bot ▼ ATR(\${ATR_P})×\${ATR_MULT}\` })
    markers.push({ index: i, position: 'aboveBar', shape: 'arrowDown', color: '#ef4444', text: '▼' })
  }
}

// ── Çıktı ─────────────────────────────────────────────────────
return {
  series: [
    {
      title:   'UT Trail',
      values:  trail,
      color:   '#f59e0b',  // amber — orijinal UT Bot rengiyle aynı
      style:   'solid',
      panel:   'main',
      markers,             // ▲▼ ok işaretleri trail çizgisi üzerinde
    }
  ],
  signals,
}`,

  "Temel Örnek": `// Değişkenler: candles, closes, highs, lows, opens, volumes, times
// Fonksiyonlar: ema sma rsi highest lowest stdev atr cross crossunder
//
// Dönüş formatı A — sadece çizgi:
// return [{ values, color, title, style:"solid"|"dashed"|"dotted" }]
//
// Dönüş formatı B — çizgi + sinyal (bot entegrasyonu):
// return {
//   series: [{ values, color, title }],
//   signals: [{ type:"buy"|"sell", bar_index:-1, reason:"..." }]
// }

const tp = candles.map(c => (c.high + c.low + c.close) / 3)
return [{ values: tp, color: "#06b6d4", title: "Typical Price" }]`,

  "VWAP Bantları": `// VWAP Standart Sapma Bantları — Sinyal Üretir
// Fiyat +2σ üstü → SELL | -2σ altı → BUY

const tp = candles.map(c => (c.high + c.low + c.close) / 3)
let cumVol = 0, cumTpVol = 0, cumTpSq = 0
const vwapArr = [], stdArr = []

for (let i = 0; i < candles.length; i++) {
  cumVol   += volumes[i]
  cumTpVol += tp[i] * volumes[i]
  cumTpSq  += tp[i] * tp[i] * volumes[i]
  const vwap     = cumVol > 0 ? cumTpVol / cumVol : tp[i]
  const variance = cumVol > 0 ? Math.max(0, cumTpSq / cumVol - vwap * vwap) : 0
  vwapArr.push(vwap)
  stdArr.push(Math.sqrt(variance))
}

const upper2 = vwapArr.map((v,i) => v + 2 * stdArr[i])
const lower2 = vwapArr.map((v,i) => v - 2 * stdArr[i])

// Sinyal: son mumda band dışına çıkış
const last = candles.length - 1
const signals = []
if (closes[last] < lower2[last] && closes[last-1] >= lower2[last-1])
  signals.push({ type: "buy",  bar_index: -1, reason: "VWAP -2σ altına düştü" })
if (closes[last] > upper2[last] && closes[last-1] <= upper2[last-1])
  signals.push({ type: "sell", bar_index: -1, reason: "VWAP +2σ üzerine çıktı" })

return {
  series: [
    { title: "VWAP",     values: vwapArr, color: "#f59e0b", style: "solid"  },
    { title: "VWAP +2σ", values: upper2,  color: "#a78bfa", style: "dotted" },
    { title: "VWAP -2σ", values: lower2,  color: "#a78bfa", style: "dotted" },
  ],
  signals,
}`,

  "EMA Cross Sinyal": `// EMA Çaprazlama — Sinyal Üretir
// Hızlı EMA yavaş EMA'yı yukarı keser → BUY
// Hızlı EMA yavaş EMA'yı aşağı keser → SELL

const fast = ema(closes, 9)
const slow  = ema(closes, 21)

const bullCross = cross(fast, slow)
const bearCross = crossunder(fast, slow)

const signals = []
const last = candles.length - 1

if (bullCross[last])
  signals.push({ type: "buy",  bar_index: -1, reason: "EMA 9 × EMA 21 yukarı kesti" })
if (bearCross[last])
  signals.push({ type: "sell", bar_index: -1, reason: "EMA 9 × EMA 21 aşağı kesti" })

return {
  series: [
    { title: "EMA 9",  values: fast, color: "#3b82f6", style: "solid" },
    { title: "EMA 21", values: slow, color: "#f97316", style: "solid" },
  ],
  signals,
}`,

  "RSI Sinyal": `// RSI Aşırı Alım/Satım — Sinyal Üretir
// RSI 30'dan yukarı döner → BUY
// RSI 70'ten aşağı döner → SELL

const rsiVals = rsi(closes, 14)
const last = candles.length - 1

const signals = []
if (rsiVals[last] !== null && rsiVals[last-1] !== null) {
  if (rsiVals[last-1] < 30 && rsiVals[last] >= 30)
    signals.push({ type: "buy",  bar_index: -1, reason: \`RSI aşırı satımdan döndü: \${rsiVals[last].toFixed(1)}\` })
  if (rsiVals[last-1] > 70 && rsiVals[last] <= 70)
    signals.push({ type: "sell", bar_index: -1, reason: \`RSI aşırı alımdan döndü: \${rsiVals[last].toFixed(1)}\` })
}

return {
  series: [{ title: "RSI(14)", values: rsiVals, color: "#8b5cf6" }],
  signals,
}`,

  "Supertrend Sinyal": `// Supertrend — Sinyal Üretir
const period = 10, mult = 3

const atr14 = atr(candles, period)
const hl2 = candles.map(c => (c.high + c.low) / 2)

const upperBand = hl2.map((h,i) => atr14[i] !== null ? h + mult * atr14[i] : null)
const lowerBand = hl2.map((h,i) => atr14[i] !== null ? h - mult * atr14[i] : null)

// Supertrend hesapla
const st = upperBand.map((u, i) => {
  if (u === null) return null
  return closes[i] > (lowerBand[i] || 0) ? lowerBand[i] : u
})

const last = candles.length - 1
const signals = []

if (st[last] !== null && st[last-1] !== null) {
  const prevAbove = closes[last-1] > st[last-1]
  const currAbove = closes[last] > st[last]
  if (!prevAbove && currAbove)
    signals.push({ type: "buy",  bar_index: -1, reason: "Fiyat Supertrend'i yukarı kesti" })
  if (prevAbove && !currAbove)
    signals.push({ type: "sell", bar_index: -1, reason: "Fiyat Supertrend'i aşağı kesti" })
}

return {
  series: [{ title: "Supertrend", values: st, color: "#fbbf24" }],
  signals,
}`,

  "Hull MA": `// Hull Moving Average — Düşük gecikmeli trend
const period = 20

const wma = (arr, p) => {
  const res = []
  for (let i = 0; i < arr.length; i++) {
    if (i < p - 1) { res.push(null); continue }
    let num = 0, den = 0
    for (let j = 0; j < p; j++) { num += (p - j) * arr[i - j]; den += (p - j) }
    res.push(num / den)
  }
  return res
}

const half  = wma(closes, Math.floor(period / 2))
const full  = wma(closes, period)
const diff  = half.map((h, i) => h !== null && full[i] !== null ? 2 * h - full[i] : null)
const hma   = wma(diff.filter(v => v !== null), Math.floor(Math.sqrt(period)))
const offset = closes.length - hma.length
const aligned = Array(offset).fill(null).concat(hma)

return [{ values: aligned, color: "#a78bfa", title: \`HMA(\${period})\` }]`,

  "Keltner Kanalı": `// Keltner Channel
const period = 20, mult = 2
const basis = ema(closes, period)
const atr14  = atr(candles, period)
const upper = basis.map((b, i) => b !== null && atr14[i] !== null ? b + mult * atr14[i] : null)
const lower = basis.map((b, i) => b !== null && atr14[i] !== null ? b - mult * atr14[i] : null)

return [
  { values: upper, color: "#f87171", title: "KC Upper" },
  { values: basis, color: "#60a5fa", title: "KC Mid", style: "dashed" },
  { values: lower, color: "#4ade80", title: "KC Lower" },
]`,

  "SMART SIGNAL v2.0": `// ══════════════════════════════════════════════════════════════
// SMART SIGNAL v2.0 — Daha Az Ama Daha Güçlü Sinyaller
// ══════════════════════════════════════════════════════════════
// v1.0'dan farklar:
//  • Supertrend yönü ZORUNLU filtre (ters yönde sinyal yok)
//  • Hacim ZORUNLU (ort. %80 altıysa sinyal atlanır)
//  • ATR filtresi: çok düşük volatilite (yatay piyasa) → sinyal yok
//  • EMA çapraz = 2 puan, RSI diverjans = 2 puan (ağırlıklı)
//  • MACD: histogram yerine sinyal çizgisi kesişimi (daha güvenilir)
//  • Cooldown: aynı yönde son 5 barda sinyal varsa geçilir
//  • MIN_SCORE = 6/8 (%75 eşik — v1.0: 5/10 = %50)
// ══════════════════════════════════════════════════════════════

// ── PARAMETRELER ─────────────────────────────────────────────
const F = 9, S = 21, T = 55
const RSI_P = 14, OB = 70, OS = 30
const BB_P = 20, BB_M = 2.0
const ATR_P = 14
const STOCH_K = 14, STOCH_D = 3
const MIN_SCORE = 6        // 8 üzerinden (EMA+Div=2 puan, diğerleri 1)
const COOLDOWN  = 5        // aynı yönde sinyal arası min bar

const n = candles.length
if (n < 80) return { series: [], signals: [] }

// ── HESAPLAMALAR ─────────────────────────────────────────────
const emaF = ema(closes, F)
const emaS = ema(closes, S)
const emaT = ema(closes, T)
const rsiV = rsi(closes, RSI_P)

const macdFast = ema(closes, 12)
const macdSlow = ema(closes, 26)
const macdLine = macdFast.map((v,i) => v!=null&&macdSlow[i]!=null ? v-macdSlow[i] : null)
const macdSig  = ema(macdLine.map(v=>v??0), 9)

const bMid   = sma(closes, BB_P)
const bStd   = stdev(closes, BB_P)
const bUpper = bMid.map((v,i) => v!=null&&bStd[i]!=null ? v+BB_M*bStd[i] : null)
const bLower = bMid.map((v,i) => v!=null&&bStd[i]!=null ? v-BB_M*bStd[i] : null)

const atrV   = atr(candles, ATR_P)
const atrAvg = sma(atrV.map(v=>v??0), 20)
const volAvg = sma(volumes, 20)

const stochK = closes.map((c,i) => {
  if(i<STOCH_K-1) return null
  const lo=Math.min(...lows.slice(i-STOCH_K+1,i+1))
  const hi=Math.max(...highs.slice(i-STOCH_K+1,i+1))
  return hi===lo?50:(c-lo)/(hi-lo)*100
})
const stochD = sma(stochK.map(v=>v??0), STOCH_D)

// Supertrend (trailing stop yöntemi — daha doğru yön tespiti)
const hl2  = candles.map(c=>(c.high+c.low)/2)
const stUp = hl2.map((h,i)=>atrV[i]!=null?h-3*atrV[i]:null)
const stDn = hl2.map((h,i)=>atrV[i]!=null?h+3*atrV[i]:null)
const stDir = new Array(n).fill(1)
for(let i=1;i<n;i++){
  const pu=stUp[i]??0, pd=stDn[i]??0
  const fu=stUp[i-1]??0, fd=stDn[i-1]??0
  const finalUp  = stDir[i-1]=== 1 ? Math.max(pu,fu) : pu
  const finalDn  = stDir[i-1]===-1 ? Math.min(pd,fd) : pd
  stDir[i] = stDir[i-1]===1 ? (closes[i]<finalUp?-1:1) : (closes[i]>finalDn?1:-1)
}

// RSI Pivot diverjans (lb=5 daha güvenilir pivot)
function isPivLow(arr,idx,lb=5){
  if(idx<lb||idx+lb>=arr.length||arr[idx]==null) return false
  for(let k=idx-lb;k<=idx+lb;k++) if(k!==idx&&arr[k]!=null&&arr[k]<=arr[idx]) return false
  return true
}
function isPivHigh(arr,idx,lb=5){
  if(idx<lb||idx+lb>=arr.length||arr[idx]==null) return false
  for(let k=idx-lb;k<=idx+lb;k++) if(k!==idx&&arr[k]!=null&&arr[k]>=arr[idx]) return false
  return true
}
const pLows=[], pHighs=[]
for(let i=5;i<n-5;i++){
  if(isPivLow(rsiV,i,5))  pLows.push(i)
  if(isPivHigh(rsiV,i,5)) pHighs.push(i)
}

// ── SINYAL ÜRETİMİ ───────────────────────────────────────────
const signals=[], chartMarkers=[]
let lastBull=-999, lastBear=-999

for(let i=Math.max(80,STOCH_K+STOCH_D+10);i<n;i++){
  const av=atrV[i]??0, aa=atrAvg[i]??0
  const vol=volumes[i]??0, va=volAvg[i]??0

  // ── ZORUNLU FİLTRELER (skor dışı) ────────────────────────
  if(vol<va*0.8)   continue   // hacim çok düşük → sahte sinyal riski
  if(av<aa*0.4)    continue   // volatilite çok düşük → yatay piyasa

  const ef=emaF[i], es=emaS[i], et=emaT[i]
  const efp=emaF[i-1], esp=emaS[i-1]
  const ml=macdLine[i], ms=macdSig[i], mlp=macdLine[i-1], msp=macdSig[i-1]
  const r=rsiV[i], rp=rsiV[i-1]
  const bu=bUpper[i], bl=bLower[i]
  const sk=stochK[i], sd_=stDir[i]
  const sdK=stochD[i]

  let bull=0, bear=0, reasons=[]

  // 1. EMA 9/21 Çapraz (2 puan — en güvenilir trend dönüşü)
  if(ef!=null&&es!=null&&efp!=null&&esp!=null){
    if(efp<=esp&&ef>es){ bull+=2; reasons.push('EMA✓') }
    if(efp>=esp&&ef<es){ bear+=2; reasons.push('EMA✓') }
  }
  // 2. EMA 55 trend filtresi (fiyat EMA55 üstü/altı)
  if(et!=null){ closes[i]>et ? bull++ : bear++ }

  // 3. RSI Bullish/Bearish Diverjans (2 puan — çok güvenilir)
  if(pLows.length>=2){
    const a=pLows[pLows.length-2], b=pLows[pLows.length-1]
    if(Math.abs(b-i)<=4 && closes[b]<closes[a] && rsiV[b]!=null && rsiV[a]!=null && rsiV[b]>rsiV[a]){
      bull+=2; reasons.push('Div✓')
    }
  }
  if(pHighs.length>=2){
    const a=pHighs[pHighs.length-2], b=pHighs[pHighs.length-1]
    if(Math.abs(b-i)<=4 && closes[b]>closes[a] && rsiV[b]!=null && rsiV[a]!=null && rsiV[b]<rsiV[a]){
      bear+=2; reasons.push('Div✓')
    }
  }

  // 4. RSI aşırı bölgeden çıkış
  if(r!=null&&rp!=null){
    if(rp<=OS&&r>OS){ bull++; reasons.push('RSI') }
    if(rp>=OB&&r<OB){ bear++; reasons.push('RSI') }
  }

  // 5. MACD sinyal çizgisi kesişimi (histogram değil — daha güvenilir)
  if(ml!=null&&ms!=null&&mlp!=null&&msp!=null){
    if(mlp<msp&&ml>ms){ bull++; reasons.push('MACD') }
    if(mlp>msp&&ml<ms){ bear++; reasons.push('MACD') }
  }

  // 6. Supertrend yönü (puanlama AND zorunlu filtre olarak kullanılır)
  if(sd_=== 1) bull++
  if(sd_===-1) bear++

  // 7. Stochastic aşırı bölgeden çıkış + kesişim
  if(sk!=null&&sdK!=null){
    const skp2=stochK[i-1]??0, sdKp=stochD[i-1]??0
    if(skp2<20&&sk>20&&sk>sdK){ bull++; reasons.push('Stoch') }
    if(skp2>80&&sk<80&&sk<sdK){ bear++; reasons.push('Stoch') }
  }

  // 8. Bollinger bant kırılımı (kapanış)
  if(bu!=null&&bl!=null){
    if(closes[i-1]!=null&&closes[i-1]<=bl&&closes[i]>bl){ bull++; reasons.push('BB') }
    if(closes[i-1]!=null&&closes[i-1]>=bu&&closes[i]<bu){ bear++; reasons.push('BB') }
  }

  // ── KARAR ────────────────────────────────────────────────
  // Supertrend yönü sinyal yönüyle ZORUNLU eşleşmeli (filtre)
  const bullOk = bull>=MIN_SCORE && bull>bear && sd_=== 1 && i-lastBull>=COOLDOWN
  const bearOk = bear>=MIN_SCORE && bear>bull && sd_===-1 && i-lastBear>=COOLDOWN

  if(bullOk){
    signals.push({ type:'buy', bar_index:i-n, reason:\`SMART ▲ \${bull}/8 — \${reasons.join(' ')}\` })
    chartMarkers.push({ index:i, position:'belowBar', shape:'arrowUp', color:'#22c55e', text:\`▲\${bull}\` })
    lastBull=i
  } else if(bearOk){
    signals.push({ type:'sell', bar_index:i-n, reason:\`SMART ▼ \${bear}/8 — \${reasons.join(' ')}\` })
    chartMarkers.push({ index:i, position:'aboveBar', shape:'arrowDown', color:'#ef4444', text:\`▼\${bear}\` })
    lastBear=i
  }
}

// ── ÇIKTI ────────────────────────────────────────────────────
return {
  series: [
    { title:'EMA '+F, values:emaF, color:'#3b82f6', style:'solid',  panel:'main', markers:[] },
    { title:'EMA '+S, values:emaS, color:'#f97316', style:'solid',  panel:'main', markers:[] },
    { title:'EMA '+T, values:emaT, color:'#a855f7', style:'dashed', panel:'main', markers:chartMarkers },
  ],
  signals,
}`,

  "ARMY-RSI": `// ══════════════════════════════════════════════════════════════
// ARMY-RSI  —  Alt panel osilatör, sinyal üretir
// Indikatörü menüye eklerken: Tür = "Alt Panel (Osilatör)" seç!
// ══════════════════════════════════════════════════════════════
// Görsel:  RSI histogram (renk kodlu) + OB/OS yatay çizgiler
//          Bullish/Bearish Divergence → "Br" marker
//          Pivot High/Low → "PIV" marker
// Sinyal:  RSI OS'tan çıkış → BUY | OB'dan çıkış → SELL
//          Bullish Div → BUY | Bearish Div → SELL (sadece son bar)
// ══════════════════════════════════════════════════════════════

const RSI_LEN  = 14
const OB       = 70
const OS       = 30
const LOOKBACK = 4
const RSI_DIFF = 3

const rsiArr = rsi(closes, RSI_LEN)
const n = candles.length

// ── Pivot tespiti ──────────────────────────────────────────────
function isPivotHigh(arr, idx, lb) {
  if (idx < lb || idx + lb >= arr.length || arr[idx] == null) return false
  for (let i = idx - lb; i <= idx + lb; i++)
    if (i !== idx && arr[i] != null && arr[i] >= arr[idx]) return false
  return true
}
function isPivotLow(arr, idx, lb) {
  if (idx < lb || idx + lb >= arr.length || arr[idx] == null) return false
  for (let i = idx - lb; i <= idx + lb; i++)
    if (i !== idx && arr[i] != null && arr[i] <= arr[idx]) return false
  return true
}

const pivotHighs = [], pivotLows = []
for (let i = LOOKBACK; i < n - LOOKBACK; i++) {
  if (isPivotHigh(rsiArr, i, LOOKBACK)) pivotHighs.push(i)
  if (isPivotLow(rsiArr, i, LOOKBACK))  pivotLows.push(i)
}

// ── RSI renkli histogram ───────────────────────────────────────
const coloredRSI = rsiArr.map((v, i) => {
  if (v == null) return null
  const pv = i > 0 ? rsiArr[i-1] : v
  let color
  if (v >= OB)      color = '#fbbf24'   // sarı  — OB bölgesi
  else if (v <= OS) color = '#ef444466' // koyu kırmızı — OS bölgesi
  else if (v >= 50) color = v >= (pv ?? v) ? '#22c55e' : '#86efac'  // yeşil tonu
  else              color = v <= (pv ?? v) ? '#ef4444' : '#fca5a5'  // kırmızı tonu
  return { value: v, color }
})

// ── Seviye çizgileri ──────────────────────────────────────────
const obLine  = rsiArr.map(v => v != null ? OB : null)
const osLine  = rsiArr.map(v => v != null ? OS : null)
const midLine = rsiArr.map(v => v != null ? 50 : null)

// ── Divergence marker'ları ────────────────────────────────────
const rsiMarkers = []

// Bullish divergence → yeşil "Br" aşağı ok (dipte)
for (let k = 1; k < pivotLows.length; k++) {
  const pl1 = pivotLows[k-1], pl2 = pivotLows[k]
  const r1 = rsiArr[pl1], r2 = rsiArr[pl2]
  if (r1 != null && r2 != null && closes[pl2] < closes[pl1] && r2 > r1 && (r2-r1) >= RSI_DIFF)
    rsiMarkers.push({ index: pl2, position: 'belowBar', shape: 'square', color: '#22c55e', text: 'Br' })
}

// Bearish divergence → kırmızı "Br" yukarı ok (tepede)
for (let k = 1; k < pivotHighs.length; k++) {
  const ph1 = pivotHighs[k-1], ph2 = pivotHighs[k]
  const r1 = rsiArr[ph1], r2 = rsiArr[ph2]
  if (r1 != null && r2 != null && closes[ph2] > closes[ph1] && r2 < r1 && (r1-r2) >= RSI_DIFF)
    rsiMarkers.push({ index: ph2, position: 'aboveBar', shape: 'square', color: '#ef4444', text: 'Br' })
}

// Pivot marker'ları → gri "PIV"
pivotHighs.forEach(i => rsiMarkers.push({ index: i, position: 'aboveBar', shape: 'circle', color: '#64748b', text: 'PIV' }))
pivotLows.forEach(i  => rsiMarkers.push({ index: i, position: 'belowBar', shape: 'circle', color: '#64748b', text: 'PIV' }))

// ── Sinyaller (SADECE son completed bar) ──────────────────────
const signals = []
const last = n - 1
const r  = rsiArr[last],  rp = rsiArr[last-1]

if (r != null && rp != null) {
  // RSI crossover
  if (rp <= OS && r > OS)
    signals.push({ type: 'buy',  bar_index: -1, reason: \`RSI \${r.toFixed(1)} — Aşırı Satım Bölgesinden Çıkış\` })
  if (rp >= OB && r < OB)
    signals.push({ type: 'sell', bar_index: -1, reason: \`RSI \${r.toFixed(1)} — Aşırı Alım Bölgesinden Çıkış\` })
}

// Son divergence kontrol (sadece en yeni pivot çifti)
if (pivotLows.length >= 2) {
  const pl1 = pivotLows[pivotLows.length-2], pl2 = pivotLows[pivotLows.length-1]
  const r1 = rsiArr[pl1], r2 = rsiArr[pl2]
  if (r1!=null && r2!=null && pl2 >= n-3 &&
      closes[pl2] < closes[pl1] && r2 > r1 && (r2-r1) >= RSI_DIFF)
    signals.push({ type: 'buy', bar_index: -1, reason: \`Bullish Divergence (Br) RSI: \${r1.toFixed(0)}→\${r2.toFixed(0)}\` })
}
if (pivotHighs.length >= 2) {
  const ph1 = pivotHighs[pivotHighs.length-2], ph2 = pivotHighs[pivotHighs.length-1]
  const r1 = rsiArr[ph1], r2 = rsiArr[ph2]
  if (r1!=null && r2!=null && ph2 >= n-3 &&
      closes[ph2] > closes[ph1] && r2 < r1 && (r1-r2) >= RSI_DIFF)
    signals.push({ type: 'sell', bar_index: -1, reason: \`Bearish Divergence (Br) RSI: \${r1.toFixed(0)}→\${r2.toFixed(0)}\` })
}

return {
  series: [
    // 1. RSI histogram (renkli)
    {
      title: 'RSI', style: 'histogram', color: '#8b5cf6',
      values: coloredRSI.map(v => v?.value ?? null),
      coloredValues: coloredRSI,
      markers: rsiMarkers,
    },
    // 2. OB/OS seviye çizgileri
    { title: 'OB 70', values: obLine,  color: '#fbbf2470', style: 'dashed' },
    { title: 'OS 30', values: osLine,  color: '#ef444470', style: 'dashed' },
    { title: 'Mid',   values: midLine, color: '#33415540', style: 'dotted' },
  ],
  signals,
}`,

  "MULTI-KONFIRMASYON v3": `// ══════════════════════════════════════════════════════════
//  MULTI-KONFIRMASYON STRATEJİSİ v3 (DÜZELTİLMİŞ)
//  ✅ Tüm barlarda tarama
//  ✅ Grafik üstünde BUY/SELL okları
// ══════════════════════════════════════════════════════════

const FAST_P = 9, SLOW_P = 21, RSI_P = 14
const RSI_OB = 70, RSI_OS = 30
const MACD_F = 12, MACD_S = 26, MACD_SIG = 9, VOL_P = 20

function calcEma(src, len) {
  const out = Array(src.length).fill(null)
  if (src.length < len) return out
  const k = 2 / (len + 1)
  let s = 0
  for (let i = 0; i < len; i++) s += src[i]
  let prev = s / len
  out[len - 1] = prev
  for (let i = len; i < src.length; i++) {
    prev = (src[i] - prev) * k + prev
    out[i] = prev
  }
  return out
}

function calcSma(src, len) {
  const out = Array(src.length).fill(null)
  for (let i = len - 1; i < src.length; i++) {
    let s = 0
    for (let j = 0; j < len; j++) s += src[i - j]
    out[i] = s / len
  }
  return out
}

function calcRsi(src, len) {
  const out = Array(src.length).fill(null)
  if (src.length < len + 1) return out
  let aG = 0, aL = 0
  for (let i = 1; i <= len; i++) {
    const d = src[i] - src[i - 1]
    if (d > 0) aG += d; else aL -= d
  }
  aG /= len; aL /= len
  out[len] = 100 - 100 / (1 + (aL === 0 ? 9999 : aG / aL))
  for (let i = len + 1; i < src.length; i++) {
    const d = src[i] - src[i - 1]
    aG = (aG * (len - 1) + (d > 0 ? d : 0)) / len
    aL = (aL * (len - 1) + (d < 0 ? -d : 0)) / len
    out[i] = 100 - 100 / (1 + (aL === 0 ? 9999 : aG / aL))
  }
  return out
}

function calcMacd(src, fL, sL, sigL) {
  const fE = calcEma(src, fL)
  const sE = calcEma(src, sL)
  const mL = src.map((_, i) =>
    fE[i] !== null && sE[i] !== null ? fE[i] - sE[i] : null
  )
  // MACD signal: EMA(9) sadece geçerli değerler üzerinden
  const validIdx = []
  const validVals = []
  mL.forEach((v, i) => { if (v !== null) { validIdx.push(i); validVals.push(v) } })
  const sigRaw = calcEma(validVals, sigL)
  const sigLine = Array(src.length).fill(null)
  validIdx.forEach((origI, j) => { sigLine[origI] = sigRaw[j] })
  return { mL, sigLine }
}

// ── Ana hesaplamalar ─────────────────────────────────────
const fastEma = calcEma(closes, FAST_P)
const slowEma = calcEma(closes, SLOW_P)
const rsiVals = calcRsi(closes, RSI_P)
const { mL: macdLine, sigLine } = calcMacd(closes, MACD_F, MACD_S, MACD_SIG)
const volMa   = calcSma(volumes, VOL_P)

// ── Sinyal tarama ────────────────────────────────────────
const markers = []
const signals = []
const start = Math.max(SLOW_P, MACD_S + MACD_SIG, RSI_P + 1, VOL_P)

for (let i = start; i < closes.length; i++) {
  const bullCross = fastEma[i] > slowEma[i] && fastEma[i-1] <= slowEma[i-1]
  const bearCross = fastEma[i] < slowEma[i] && fastEma[i-1] >= slowEma[i-1]
  if (!bullCross && !bearCross) continue

  const r  = rsiVals[i]
  const ml = macdLine[i]
  const sl = sigLine[i]
  const v  = volumes[i]
  const vm = volMa[i]

  // FIX: candles obje, dizi değil → .low / .high kullan
  const lo = lows[i]
  const hi = highs[i]

  if (bullCross) {
    const ok = (r === null || r < RSI_OB) &&
               (ml === null || sl === null || ml > sl) &&
               (vm === null || v > vm * 0.8)
    if (ok) {
      markers.push({
        time:     times[i],
        position: 'belowBar',
        shape:    'arrowUp',
        color:    '#22c55e',
        text:     'AL' + (r !== null ? ' RSI ' + r.toFixed(0) : ''),
        size:     2,
      })
      signals.push({
        type: 'buy', bar_index: i, price: lo,
        reason: 'EMA' + FAST_P + '×EMA' + SLOW_P + ' ↑' +
                (r  !== null ? ' | RSI '  + r.toFixed(1)  : '') +
                (ml !== null ? ' | MACD ' + ml.toFixed(2) : '') +
                (vm !== null ? ' | Vol '  + (v/vm*100).toFixed(0) + '%' : ''),
      })
    }
  }

  if (bearCross) {
    const ok = (r === null || r > RSI_OS) &&
               (ml === null || sl === null || ml < sl) &&
               (vm === null || v > vm * 0.8)
    if (ok) {
      markers.push({
        time:     times[i],
        position: 'aboveBar',
        shape:    'arrowDown',
        color:    '#ef4444',
        text:     'SAT' + (r !== null ? ' RSI ' + r.toFixed(0) : ''),
        size:     2,
      })
      signals.push({
        type: 'sell', bar_index: i, price: hi,
        reason: 'EMA' + FAST_P + '×EMA' + SLOW_P + ' ↓' +
                (r  !== null ? ' | RSI '  + r.toFixed(1)  : '') +
                (ml !== null ? ' | MACD ' + ml.toFixed(2) : '') +
                (vm !== null ? ' | Vol '  + (v/vm*100).toFixed(0) + '%' : ''),
      })
    }
  }
}

return {
  series: [
    { title: 'EMA ' + FAST_P, values: fastEma, color: '#3b82f6', style: 'solid', panel: 'main' },
    { title: 'EMA ' + SLOW_P, values: slowEma, color: '#f97316', style: 'solid', panel: 'main', markers },
  ],
  signals,
}`,

  "CONFLUENCE HUNTER": `// ══════════════════════════════════════════════════════════════
// CONFLUENCE HUNTER — Çok Katmanlı Sinyal Sistemi
// ══════════════════════════════════════════════════════════════
// 6 indikatörün aynı anda hemfikir olduğu anları yakalar:
//   EMA 20/50 trend  ·  RSI bölge  ·  MACD momentum
//   Supertrend yön   ·  Hacim onayı  ·  Bollinger kırılma
//
// Görsel çıktı:
//   — EMA 20 (mavi)  /  EMA 50 (turuncu)
//   — Supertrend çizgisi (yeşil=bull, kırmızı=bear)
//   — ▲ Yeşil ok (AL)  /  ▼ Kırmızı ok (SAT)
//   — Giriş noktası: ok üstünde kaç puan kazanıldığı
//
// Parametreler (buradan değiştir):
const EMA_FAST   = 20    // Hızlı EMA
const EMA_SLOW   = 50    // Yavaş EMA
const RSI_P      = 14    // RSI periyodu
const ST_MULT    = 3.0   // Supertrend ATR çarpanı
const ST_ATR     = 14    // Supertrend ATR periyodu
const VOL_RATIO  = 1.15  // Min hacim (20-bar ortalamasının kaçı)
const MIN_SCORE  = 5     // Kaç puan gerekli (maks 7)
const COOLDOWN   = 4     // Ardışık sinyal arası min bar
// ══════════════════════════════════════════════════════════════

const n = candles.length
if (n < EMA_SLOW + 30) return { series: [], signals: [] }

// ── EMA ──────────────────────────────────────────────────────
const ema20 = ema(closes, EMA_FAST)
const ema50 = ema(closes, EMA_SLOW)

// ── RSI ──────────────────────────────────────────────────────
const rsiArr = rsi(closes, RSI_P)

// ── MACD (12,26,9) ───────────────────────────────────────────
const emaF = ema(closes, 12)
const emaS = ema(closes, 26)
const macdLine = emaF.map((v, i) =>
  v !== null && emaS[i] !== null ? v - emaS[i] : null
)
// Signal line: EMA9 of MACD (sadece geçerli değerler üzerinden)
const macdValid = macdLine.map(v => v ?? 0)
const macdSig9  = ema(macdValid, 9)
const macdHist  = macdLine.map((v, i) =>
  v !== null && macdSig9[i] !== null ? v - macdSig9[i] : null
)

// ── ATR + Supertrend ─────────────────────────────────────────
const atrArr = atr(candles, ST_ATR)
const stLine = new Array(n).fill(null)  // trail çizgisi
const stDir  = new Array(n).fill(0)    // 1=bull -1=bear

for (let i = ST_ATR + 1; i < n; i++) {
  if (atrArr[i] === null) continue
  const hl2  = (highs[i] + lows[i]) / 2
  const band = ST_MULT * atrArr[i]
  const up   = hl2 - band   // bull band (altında → sinyal)
  const dn   = hl2 + band   // bear band (üstünde → sinyal)

  const prevLine = stLine[i-1]
  const prevDir  = stDir[i-1]

  let newLine, newDir
  if (prevDir >= 0) {
    newLine = closes[i-1] > (prevLine ?? up) ? Math.max(up, prevLine ?? up) : up
    newDir  = closes[i] < newLine ? -1 : 1
  } else {
    newLine = closes[i-1] < (prevLine ?? dn) ? Math.min(dn, prevLine ?? dn) : dn
    newDir  = closes[i] > newLine ? 1 : -1
  }
  stLine[i] = newLine
  stDir[i]  = newDir
}

// ── Bollinger Bantları (20, 2σ) ───────────────────────────────
const bb20  = sma(closes, 20)
const bbStd = stdev(closes, 20)
const bbUp  = bb20.map((v, i) => v !== null && bbStd[i] !== null ? v + 2 * bbStd[i] : null)
const bbLow = bb20.map((v, i) => v !== null && bbStd[i] !== null ? v - 2 * bbStd[i] : null)

// ── Hacim ortalaması ─────────────────────────────────────────
const volMA = sma(volumes, 20)

// ── Sinyal döngüsü ───────────────────────────────────────────
const markers = []
const signals = []
let lastSig = -COOLDOWN

for (let i = EMA_SLOW + 10; i < n; i++) {
  const e20 = ema20[i], e50 = ema50[i]
  const r   = rsiArr[i]
  const mh  = macdHist[i], mhp = macdHist[i-1]
  const sd  = stDir[i]
  const vm  = volMA[i]
  const bu  = bbUp[i], bl = bbLow[i]

  if (e20===null||e50===null||r===null||mh===null||sd===0||vm===null) continue
  if ((i - lastSig) < COOLDOWN) continue

  let buyScore = 0, sellScore = 0

  // 1. EMA trend yönü (1 pt)
  if (e20 > e50) buyScore++; else sellScore++

  // 2. EMA kesişim — yeni crossover (2 pt bonus)
  const pe20 = ema20[i-1], pe50 = ema50[i-1]
  if (pe20!==null && pe50!==null) {
    if (pe20 <= pe50 && e20 > e50) buyScore  += 2
    if (pe20 >= pe50 && e20 < e50) sellScore += 2
  }

  // 3. RSI bölgesi (1 pt)
  if (r > 45 && r < 70) buyScore++
  if (r < 55 && r > 30) sellScore++
  if (r < 30) buyScore++   // aşırı satım
  if (r > 70) sellScore++  // aşırı alım

  // 4. MACD momentum (1 pt)
  if (mhp !== null) {
    if (mh > 0 && mh > mhp) buyScore++
    if (mh < 0 && mh < mhp) sellScore++
  }

  // 5. Supertrend yönü — ZORUNLU filtre
  if (sd === 1)  buyScore++
  if (sd === -1) sellScore++

  // 6. Bollinger kırılma (1 pt)
  if (bl !== null && closes[i] <= bl) buyScore++   // alt band altı → dönüş beklenti
  if (bu !== null && closes[i] >= bu) sellScore++  // üst band üstü → dönüş beklenti

  // 7. Hacim onayı (1 pt)
  if (volumes[i] >= vm * VOL_RATIO) { buyScore++; sellScore++ }

  const t = times[i]

  if (buyScore >= MIN_SCORE && sd === 1) {
    markers.push({
      time: t, position: 'belowBar', shape: 'arrowUp',
      color: '#22c55e',
      text: '▲ ' + buyScore + '/7',
      size: buyScore >= 6 ? 3 : 2,
    })
    signals.push({
      type: 'buy', bar_index: i,
      price: closes[i],
      reason: 'Confluence ' + buyScore + '/7 • EMA+RSI+MACD+ST',
    })
    lastSig = i
  } else if (sellScore >= MIN_SCORE && sd === -1) {
    markers.push({
      time: t, position: 'aboveBar', shape: 'arrowDown',
      color: '#ef4444',
      text: '▼ ' + sellScore + '/7',
      size: sellScore >= 6 ? 3 : 2,
    })
    signals.push({
      type: 'sell', bar_index: i,
      price: closes[i],
      reason: 'Confluence ' + sellScore + '/7 • EMA+RSI+MACD+ST',
    })
    lastSig = i
  }
}

// ── Supertrend çizgisi (bull=yeşil, bear=kırmızı) ────────────
const stBull = stLine.map((v, i) => stDir[i] === 1  ? v : null)
const stBear = stLine.map((v, i) => stDir[i] === -1 ? v : null)

return {
  series: [
    {
      title: 'EMA ' + EMA_FAST,
      values: ema20, color: '#3b82f6',
      style: 'solid', panel: 'main',
    },
    {
      title: 'EMA ' + EMA_SLOW,
      values: ema50, color: '#f97316',
      style: 'solid', panel: 'main',
    },
    {
      title: 'ST Bull',
      values: stBull, color: '#22c55e',
      style: 'solid', panel: 'main',
      markers: markers.filter(m => signals.find(s => s.type==='buy' && times[s.bar_index]===m.time)),
    },
    {
      title: 'ST Bear',
      values: stBear, color: '#ef4444',
      style: 'solid', panel: 'main',
    },
  ],
  markers,
  signals,
}`,
}

// ─── Kod çalıştırma motoru ────────────────────────────────────────────────────
export function runCustomCode(
  code: string,
  candles: {time:number;open:number;high:number;low:number;close:number}[],
  volume: {value:number}[],
): CustomCodeResult & { error?: string } {
  try {
    const closes  = candles.map(c => c.close)
    const highs   = candles.map(c => c.high)
    const lows    = candles.map(c => c.low)
    const opens   = candles.map(c => c.open)
    const volumes = volume.map(v => v.value)
    const times   = candles.map(c => c.time)

    // eslint-disable-next-line no-new-func
    const fn = new Function(
      "candles","closes","highs","lows","opens","volumes","times",
      "ema","sma","rsi","highest","lowest","stdev","cross","crossunder","atr",
      // IIFE wrapper: kullanıcı kodu parametre isimlerini yeniden tanımlayabilir (const closes = ...)
      `return (function(){\n"use strict";\n${code}\n})()`
    )

    const raw = fn(
      candles, closes, highs, lows, opens, volumes, times,
      INDICATOR_HELPERS.ema, INDICATOR_HELPERS.sma, INDICATOR_HELPERS.rsi,
      INDICATOR_HELPERS.highest, INDICATOR_HELPERS.lowest, INDICATOR_HELPERS.stdev,
      INDICATOR_HELPERS.cross, INDICATOR_HELPERS.crossunder, INDICATOR_HELPERS.atr,
    )

    if (!raw) return { series: [], signals: [] }

    // Marker shape/position isimlerini Lightweight Charts formatına çevir
    function normalizeMarkers(mks: any[]): any[] {
      if (!Array.isArray(mks)) return []
      const shapeMap: Record<string, string> = {
        triangle_up: "arrowUp", triangle_down: "arrowDown",
        flag: "circle", diamond: "square",
        arrowUp: "arrowUp", arrowDown: "arrowDown",
        circle: "circle", square: "square",
      }
      const posMap: Record<string, string> = {
        below: "belowBar", above: "aboveBar",
        belowBar: "belowBar", aboveBar: "aboveBar",
        inBar: "inBar",
      }
      return mks
        .filter(m => m != null && (m.time != null || m.index != null || m.bar != null))
        .map(m => {
          // time yoksa index/bar'dan candles üzerinden bul
          let t = m.time
          if (t == null) {
            const idx = m.index ?? m.bar
            const c = candles[idx < 0 ? candles.length + idx : idx]
            if (!c) return null
            t = c.time
          }
          return {
            time:     t,
            position: posMap[m.position] || "belowBar",
            color:    m.color || "#ffffff",
            shape:    shapeMap[m.shape] || "circle",
            text:     m.text || m.label || "",
            size:     m.size || 1,
          }
        })
        .filter(Boolean)
    }

    // colors[] dizisini coloredValues[] formatına çevir
    function colorsToColoredValues(values: (number|null)[], colors: string[]): { value: number | null; color: string }[] {
      return values.map((v, i) => ({ value: v, color: colors[i] || "#ffffff" }))
    }

    // Bir seriyi normalize eden yardımcı
    function parseSeries(item: any, i: number) {
      const serType: "line" | "candlestick" | "histogram" = item.type || "line"
      const isCandlestick = serType === "candlestick"
      const isHistogramType = serType === "histogram"

      // Candlestick: values OHLC dizisi
      const ohlcValues = isCandlestick ? (item.values || []) as (OHLCBar | null)[] : undefined
      const values     = isCandlestick ? [] : (item.values || []) as (number | null)[]

      // Histogram: pozitif/negatif otomatik renk
      const coloredValues = isHistogramType
        ? (item.values || []).map((v: number | null) =>
            v !== null ? { value: v, color: v >= 0 ? (item.upColor || item.color || "#26a69a") : (item.downColor || "#ef5350") } : null
          )
        : (item.coloredValues || (Array.isArray(item.colors) ? colorsToColoredValues(values, item.colors) : undefined))

      return {
        id:          `custom_${Date.now()}_${i}`,
        type:        serType,
        values,
        ohlcValues,
        coloredValues,
        upColor:       item.upColor       || "#26a69a",
        downColor:     item.downColor     || "#ef5350",
        baselineValue: item.baselineValue,
        aboveColor:    item.aboveColor,
        belowColor:    item.belowColor,
        color:         item.color         || "#ffffff",
        title:         item.title         || `Özel ${i + 1}`,
        style:         (isHistogramType ? "histogram" : item.style) || "solid",
        lineWidth:     item.lineWidth ?? item.width,
        markers:       item.markers ? normalizeMarkers(item.markers) : undefined,
        panel:         item.panel,
      }
    }

    // Format A: dizi döndürdü
    if (Array.isArray(raw)) {
      return {
        series: raw.map(parseSeries),
        signals: [],
        latestSignal: null,
      }
    }

    // Format B: { series, signals, markers? } döndürdü
    const seriesList = (raw.series || []).map(parseSeries)

    // Top-level markers → ilk overlay seriye ekle
    if (Array.isArray(raw.markers) && raw.markers.length > 0) {
      const normalized = normalizeMarkers(raw.markers)
      const firstOverlay = seriesList.find((s: any) => !s.panel || s.panel === "main")
      if (firstOverlay) {
        firstOverlay.markers = [...(firstOverlay.markers || []), ...normalized]
      } else if (seriesList.length > 0) {
        seriesList[0].markers = [...(seriesList[0].markers || []), ...normalized]
      }
    }

    const signals: CustomSignal[] = (raw.signals || []).map((s: any) => ({
      type:      s.type === "sell" ? "sell" : "buy",
      bar_index: s.bar_index ?? -1,
      price:     s.price,
      reason:    s.reason,
      panel:     s.panel,   // "main" | "sub" — korunması şart
      value:     s.value,   // alt panel y pozisyonu
    }))

    // En son sinyal (son mum için)
    const latestSignal = signals.length > 0 ? signals[signals.length - 1].type : null

    return { series: seriesList, signals, latestSignal }

  } catch (e: any) {
    return { series: [], signals: [], error: e.message }
  }
}

// ─── localStorage yardımcıları ────────────────────────────────────────────────
function loadSavedCodes(): SavedCode[] {
  try { return JSON.parse(localStorage.getItem(LS_SAVED_CODES) || "[]") } catch { return [] }
}
function saveCodes(list: SavedCode[]) {
  localStorage.setItem(LS_SAVED_CODES, JSON.stringify(list))
}
export function loadCustomInds(): CustomIndicatorDef[] {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM_INDS) || "[]") } catch { return [] }
}
export function saveCustomInds(list: CustomIndicatorDef[]) {
  localStorage.setItem(LS_CUSTOM_INDS, JSON.stringify(list))
}

// ─── Editor Modal ─────────────────────────────────────────────────────────────
export default function CustomIndicatorEditor({
  onApply, onClose,
}: {
  onApply: (series: CustomSeries[], code: string) => void
  onClose: () => void
}) {
  const [code,         setCode]         = useState(TEMPLATES["EMA Cross Sinyal"])
  const [template,     setTemplate]     = useState("EMA Cross Sinyal")
  const [error,        setError]        = useState<string | null>(null)
  const [success,      setSuccess]      = useState<string | null>(null)
  const [tab,          setTab]          = useState<"editor"|"saved">("editor")
  const [savedCodes,   setSavedCodes]   = useState<SavedCode[]>([])
  const [customInds,   setCustomInds]   = useState<CustomIndicatorDef[]>([])
  const [saveCodeName, setSaveCodeName] = useState("")
  const [showAddToMenu,setShowAddToMenu]= useState(false)
  const [menuName,     setMenuName]     = useState("")
  const [menuType,     setMenuType]     = useState<"overlay"|"oscillator">("overlay")
  const [menuColor,    setMenuColor]    = useState("#60a5fa")
  const [menuSignals,  setMenuSignals]  = useState(true)
  const [testResult,   setTestResult]   = useState<{ signals: CustomSignal[] } | null>(null)

  useEffect(() => {
    setSavedCodes(loadSavedCodes())
    setCustomInds(loadCustomInds())
  }, [])

  const persistCodes = (list: SavedCode[]) => { setSavedCodes(list); saveCodes(list) }
  const persistInds  = (list: CustomIndicatorDef[]) => { setCustomInds(list); saveCustomInds(list) }

  // Test Et
  const handleTest = () => {
    setError(null); setSuccess(null); setTestResult(null)
    const dummies = Array(50).fill(null).map((_, i) => {
      const base = 100 + Math.sin(i * 0.3) * 10
      return { time: i * 60, open: base - 1, high: base + 2, low: base - 2, close: base + Math.random() * 2 - 1 }
    })
    const dummyVol = dummies.map(() => ({ value: 1000 + Math.random() * 500 }))
    const result = runCustomCode(code, dummies, dummyVol)
    if (result.error) { setError(result.error); return }
    if (!result.series.length) { setError("Kod çalıştı ama seri döndürmedi. return [...] ekle."); return }
    setTestResult({ signals: result.signals || [] })
    const sigMsg = result.signals?.length
      ? ` • ${result.signals.length} sinyal tespit edildi (${result.signals.map(s => s.type.toUpperCase()).join(", ")})`
      : " • Sinyal yok (normal, son mumda tetiklenecek)"
    setSuccess(`✓ Syntax doğru • ${result.series.length} seri${sigMsg}`)
  }

  // Grafiğe Uygula
  const handleApply = () => {
    onApply(
      [{ id: `custom_${Date.now()}`, values: [], color: "#fff", title: "pending", style: "solid", _code: code } as any],
      code
    )
    onClose()
  }

  // Kodu Kaydet (editör listesi + menüye otomatik ekle)
  const handleSaveCode = () => {
    const name = saveCodeName.trim()
    if (!name) return
    
    // 1. Editör listesine kaydet
    const existing = savedCodes.findIndex(s => s.name === name)
    const entry: SavedCode = { name, code, savedAt: new Date().toLocaleString("tr-TR") }
    const next = existing >= 0
      ? savedCodes.map((s, i) => i === existing ? entry : s)
      : [entry, ...savedCodes]
    persistCodes(next)
    
    // 2. Otomatik olarak Menüye Ekle (bot kullanımı için)
    const id = `custom_${Date.now()}`
    const def: CustomIndicatorDef = {
      id, name, code,
      color: menuColor,
      type: menuType,
      producesSignals: true,  // Bot kullanımı için true
      savedAt: new Date().toLocaleString("tr-TR"),
    }
    persistInds([def, ...customInds.filter(c => c.name !== name)])
    
    setSuccess(`"${name}" kaydedildi ve bot menüsüne eklendi ✓`)
    setTimeout(() => setSuccess(null), 3000)
  }

  // İndikatör Menüsüne Ekle
  const handleAddToMenu = () => {
    if (!menuName.trim()) return
    const id = `custom_${Date.now()}`
    const def: CustomIndicatorDef = {
      id, name: menuName.trim(), code,
      color: menuColor,
      type: menuType,
      producesSignals: testResult && testResult.signals.length > 0 ? true : menuSignals,
      savedAt: new Date().toLocaleString("tr-TR"),
    }
    persistInds([def, ...customInds.filter(c => c.name !== menuName.trim())])
    setSuccess(`"${menuName}" indikatör menüsüne eklendi`)
    setShowAddToMenu(false)
    setMenuName("")
    setTimeout(() => setSuccess(null), 2500)
  }

  // Menüden sil
  const removeFromMenu = (id: string) => persistInds(customInds.filter(c => c.id !== id))

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="bg-[#0d1117] border border-slate-700 rounded-xl w-[860px] max-h-[92vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Başlık */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 shrink-0">
          <div>
            <span className="text-white font-semibold">Özel İndikatör Editörü</span>
            <span className="ml-2 text-xs text-slate-500">JS · Sinyal Üretimi Destekli</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setTab("editor")}
              className={`px-3 py-1 rounded text-xs border transition-colors ${tab === "editor" ? "bg-blue-600/30 border-blue-500/40 text-blue-300" : "border-slate-700 text-slate-400 hover:text-white"}`}>
              Editör
            </button>
            <button onClick={() => { setTab("saved"); setSavedCodes(loadSavedCodes()); setCustomInds(loadCustomInds()) }}
              className={`px-3 py-1 rounded text-xs border transition-colors ${tab === "saved" ? "bg-blue-600/30 border-blue-500/40 text-blue-300" : "border-slate-700 text-slate-400 hover:text-white"}`}>
              Kaydedilenler
              {(savedCodes.length + customInds.length) > 0 &&
                <span className="ml-1 bg-slate-600 px-1 rounded text-[10px]">{savedCodes.length + customInds.length}</span>}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none ml-1">×</button>
          </div>
        </div>

        {/* ── EDITÖR SEKMESİ ── */}
        {tab === "editor" && (
          <>
            {/* Şablonlar */}
            <div className="flex gap-1.5 px-5 pt-3 pb-2 flex-wrap shrink-0">
              <span className="text-xs text-slate-500 self-center mr-1">Şablon:</span>
              {Object.keys(TEMPLATES).map(name => (
                <button key={name} onClick={() => { setTemplate(name); setCode(TEMPLATES[name]); setError(null); setSuccess(null); setTestResult(null) }}
                  className={`px-2 py-0.5 rounded text-xs border transition-colors ${template === name ? "bg-blue-600/30 border-blue-500/50 text-blue-300" : "border-slate-700 text-slate-400 hover:text-white"}`}>
                  {name}
                  {["VWAP Bantları","EMA Cross Sinyal","RSI Sinyal","Supertrend Sinyal","SMART SIGNAL v2.0","CONFLUENCE HUNTER","UT Bot Alert"].includes(name) &&
                    <span className="ml-1 text-[9px] text-emerald-400">● sinyal</span>}
                </button>
              ))}
            </div>

            {/* Yardım */}
            <div className="mx-5 mb-2 px-3 py-2 rounded bg-slate-900/50 border border-slate-800 text-xs text-slate-500 shrink-0">
              <span className="text-slate-400 font-medium">Değişkenler:</span> candles · closes · highs · lows · opens ·{" "}
              <span className="text-yellow-400">volumes</span> · times &nbsp;|&nbsp;
              <span className="text-slate-400 font-medium">Fonksiyonlar:</span> ema sma rsi highest lowest stdev atr cross crossunder
              <br/>
              <span className="text-slate-400 font-medium">Sinyal çıktısı:</span>{" "}
              <code className="text-emerald-300">return {"{"} series:[...], signals:[{"{"} type:"buy"|"sell", bar_index:-1, reason:"..." {"}"}] {"}"}</code>
            </div>

            {/* Kod alanı */}
            <div className="flex-1 min-h-0 px-5 pb-2">
              <textarea
                value={code}
                onChange={e => { setCode(e.target.value); setError(null); setSuccess(null); setTestResult(null) }}
                spellCheck={false}
                className="w-full h-full min-h-[280px] bg-[#020817] border border-slate-800 rounded-lg p-4 text-sm font-mono text-slate-200 focus:outline-none focus:border-blue-500/50 resize-none leading-relaxed"
                style={{ tabSize: 2 }}
                onKeyDown={e => {
                  if (e.key === "Tab") {
                    e.preventDefault()
                    const s = e.currentTarget, st = s.selectionStart, en = s.selectionEnd
                    setCode(code.substring(0, st) + "  " + code.substring(en))
                    setTimeout(() => { s.selectionStart = s.selectionEnd = st + 2 }, 0)
                  }
                }}
              />
            </div>

            {/* Test sonucu */}
            {testResult && testResult.signals.length > 0 && (
              <div className="mx-5 mb-2 px-3 py-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs shrink-0">
                <span className="text-emerald-400 font-medium">Sinyal tespiti:</span>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {testResult.signals.map((s, i) => (
                    <span key={i} className={`px-2 py-0.5 rounded border text-xs font-medium ${
                      s.type === "buy" ? "border-green-500/40 text-green-400 bg-green-500/10"
                                       : "border-red-500/40 text-red-400 bg-red-500/10"
                    }`}>
                      {s.type === "buy" ? "▲ AL" : "▼ SAT"} {s.reason ? `— ${s.reason}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="mx-5 mb-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-400 font-mono shrink-0">
                ⚠ {error}
              </div>
            )}
            {success && !error && (
              <div className="mx-5 mb-2 px-3 py-2 rounded bg-green-500/10 border border-green-500/30 text-xs text-green-400 shrink-0">
                {success}
              </div>
            )}

            {/* Menüye Ekle Paneli */}
            {showAddToMenu && (
              <div className="mx-5 mb-2 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 shrink-0 space-y-3">
                <p className="text-xs text-blue-400 font-medium">İndikatör Menüsüne Ekle</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">İndikatör Adı</label>
                    <input value={menuName} onChange={e => setMenuName(e.target.value)}
                      placeholder="Örn: VWAP Bantları"
                      className="w-full px-2.5 py-1.5 rounded border border-slate-700 bg-slate-900 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Renk</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={menuColor} onChange={e => setMenuColor(e.target.value)}
                        className="w-8 h-7 rounded border border-slate-700 bg-slate-800 cursor-pointer p-0.5"
                      />
                      <span className="text-xs text-slate-500 font-mono">{menuColor}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Tür</label>
                    <div className="flex gap-2">
                      {(["overlay","oscillator"] as const).map(t => (
                        <button key={t} onClick={() => setMenuType(t)}
                          className={`flex-1 py-1.5 rounded border text-xs transition-colors ${menuType === t ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-slate-700 text-slate-500 hover:text-white"}`}>
                          {t === "overlay" ? "Grafik Üzeri" : "Alt Panel"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Sinyal Üretir</label>
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => setMenuSignals(v => !v)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${menuSignals ? "bg-emerald-600" : "bg-slate-700"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${menuSignals ? "left-5" : "left-0.5"}`} />
                      </button>
                      <span className="text-xs text-slate-500">{menuSignals ? "Evet (bot kullanabilir)" : "Hayır (sadece görsel)"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddToMenu}
                    disabled={!menuName.trim()}
                    className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium transition-colors">
                    Menüye Ekle
                  </button>
                  <button onClick={() => setShowAddToMenu(false)}
                    className="px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-white text-xs transition-colors">
                    İptal
                  </button>
                </div>
              </div>
            )}

            {/* Alt bar */}
            <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-800 shrink-0 flex-wrap">
              <button onClick={handleTest}
                className="px-4 py-1.5 rounded border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 text-xs transition-colors">
                ▶ Test Et
              </button>
              <button onClick={handleApply}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors">
                Grafiğe Uygula
              </button>

              <div className="w-px h-5 bg-slate-700 mx-1" />

              {/* Kodu kaydet */}
              <input value={saveCodeName} onChange={e => setSaveCodeName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSaveCode()}
                placeholder="Kod adı..."
                className="px-2.5 py-1.5 rounded border border-slate-700 bg-slate-900 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500 w-32"
              />
              <button onClick={handleSaveCode}
                className="px-3 py-1.5 rounded border border-slate-600 text-slate-400 hover:text-white text-xs transition-colors">
                💾 Kodu Kaydet
              </button>

              <div className="w-px h-5 bg-slate-700 mx-1" />

              {/* İndikatör menüsüne ekle */}
              <button onClick={() => setShowAddToMenu(v => !v)}
                className={`px-3 py-1.5 rounded border text-xs transition-colors ${showAddToMenu ? "border-blue-500/50 text-blue-400 bg-blue-500/10" : "border-slate-600 text-slate-400 hover:text-white"}`}>
                + Menüye Ekle
              </button>

              <button onClick={onClose} className="ml-auto text-slate-500 hover:text-white text-xs px-3 py-1.5 rounded border border-slate-700 transition-colors">
                Kapat
              </button>
            </div>
          </>
        )}

        {/* ── KAYDEDİLENLER SEKMESİ ── */}
        {tab === "saved" && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

            {/* Editör Kayıtları */}
            <div className="px-5 pt-4 pb-2 shrink-0">
              <p className="text-xs text-slate-400 font-medium mb-2">Kod Kayıtları</p>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 min-h-0">
              {savedCodes.length === 0 && customInds.length === 0 && (
                <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
                  Henüz kayıtlı içerik yok.
                </div>
              )}

              {/* Kod listesi */}
              {savedCodes.map(item => (
                <div key={item.name} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-800/30 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium">📄 {item.name}</span>
                      <span className="text-[10px] text-slate-600">{item.savedAt}</span>
                    </div>
                    <pre className="text-[10px] text-slate-600 mt-0.5 truncate">
                      {item.code.split("\n").find(l => l.trim() && !l.trim().startsWith("//")) ?? ""}
                    </pre>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => { setCode(item.code); setTemplate(""); setTab("editor"); setError(null); setSuccess(null) }}
                      className="px-2.5 py-1 rounded border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 text-xs">Yükle</button>
                    <button onClick={() => { setCode(item.code); setTemplate(""); setTab("editor"); handleApply() }}
                      className="px-2.5 py-1 rounded border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs">Uygula</button>
                    <button onClick={() => persistCodes(savedCodes.filter(s => s.name !== item.name))}
                      className="px-2 py-1 rounded border border-slate-700 text-slate-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                </div>
              ))}

              {/* İndikatör menüsüne eklenmiş olanlar */}
              {customInds.length > 0 && (
                <>
                  <div className="px-5 py-2 bg-slate-900/50">
                    <p className="text-xs text-slate-500 font-medium">İndikatör Menüsüne Eklenmiş</p>
                  </div>
                  {customInds.map(ind => (
                    <div key={ind.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-800/30 group">
                      <div className="w-3 h-3 rounded-sm mt-1 shrink-0" style={{ backgroundColor: ind.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-white font-medium">{ind.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                            {ind.type === "overlay" ? "Overlay" : "Osilatör"}
                          </span>
                          {ind.producesSignals && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              ● Sinyal Üretir
                            </span>
                          )}
                          <span className="text-[10px] text-slate-600">{ind.savedAt}</span>
                        </div>
                        <pre className="text-[10px] text-slate-600 mt-0.5 truncate">
                          {ind.code.split("\n").find(l => l.trim() && !l.trim().startsWith("//")) ?? ""}
                        </pre>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => { setCode(ind.code); setTemplate(""); setTab("editor"); setError(null) }}
                          className="px-2.5 py-1 rounded border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 text-xs">Düzenle</button>
                        <button onClick={() => removeFromMenu(ind.id)}
                          className="px-2 py-1 rounded border border-slate-700 text-slate-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100">✕</button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-800 shrink-0 flex justify-end">
              <button onClick={onClose} className="text-slate-500 hover:text-white text-xs px-3 py-1.5 rounded border border-slate-700 transition-colors">
                Kapat
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
