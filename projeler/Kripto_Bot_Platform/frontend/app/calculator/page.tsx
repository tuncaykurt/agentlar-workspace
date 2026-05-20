"use client"

import { useState, useCallback } from "react"

/* ─── küçük yardımcılar ─── */
const fmt = (n: number, d = 2) =>
  isNaN(n) || !isFinite(n) ? "—" : n.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d })

const pct = (n: number) => (isNaN(n) || !isFinite(n) ? "—" : (n >= 0 ? "+" : "") + fmt(n, 2) + "%")

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
        <span className="text-lg">{icon}</span>{title}
      </h2>
      {children}
    </div>
  )
}

function Row({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  )
}

function Input({
  label, value, onChange, suffix = "USDT", step = "0.01", min = "0"
}: { label: string; value: string; onChange: (v: string) => void; suffix?: string; step?: string; min?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-500">{label}</label>
      <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <input
          type="number" value={value} onChange={e => onChange(e.target.value)}
          step={step} min={min}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white outline-none tabular-nums"
        />
        <span className="px-3 text-xs text-slate-500 shrink-0">{suffix}</span>
      </div>
    </div>
  )
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void
  options: { v: string; l: string }[]
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-500">{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none"
      >
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   1. KALDIRAÇLI KAR / ZARAR HESAPLAYICI
══════════════════════════════════════════════════════ */
function LeverageCalc() {
  const [margin, setMargin]     = useState("100")
  const [leverage, setLeverage] = useState("10")
  const [entry, setEntry]       = useState("50000")
  const [exit, setExit]         = useState("51000")
  const [dir, setDir]           = useState("long")
  const [fee, setFee]           = useState("0.05")

  const m = parseFloat(margin) || 0
  const lev = parseFloat(leverage) || 1
  const ep = parseFloat(entry) || 1
  const xp = parseFloat(exit) || 1
  const f = parseFloat(fee) / 100 || 0

  const notional = m * lev
  const qty = notional / ep
  const priceDiff = dir === "long" ? xp - ep : ep - xp
  const rawPnl = qty * priceDiff
  const feeCost = notional * f * 2 // açılış + kapanış
  const netPnl = rawPnl - feeCost
  const roePct = (netPnl / m) * 100
  const liqPct = dir === "long" ? -(100 / lev) : 100 / lev
  const liqPrice = dir === "long"
    ? ep * (1 + liqPct / 100)
    : ep * (1 - liqPct / 100)

  const isProfit = netPnl >= 0

  return (
    <Card title="Kaldıraçlı İşlem Hesaplama" icon="📊">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Teminat (Margin)" value={margin} onChange={setMargin} />
        <Input label="Kaldıraç" value={leverage} onChange={setLeverage} suffix="x" step="1" min="1" />
        <Input label="Giriş Fiyatı" value={entry} onChange={setEntry} />
        <Input label="Çıkış Fiyatı" value={exit} onChange={setExit} />
        <Input label="İşlem Ücreti" value={fee} onChange={setFee} suffix="%" step="0.01" />
        <Select label="Yön" value={dir} onChange={setDir}
          options={[{ v: "long", l: "📈 Long" }, { v: "short", l: "📉 Short" }]} />
      </div>

      <div className={`rounded-xl p-4 border ${isProfit ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
        <p className="text-xs text-slate-500 mb-1">Net Kar / Zarar</p>
        <p className={`text-3xl font-bold tabular-nums ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
          {isProfit ? "+" : ""}{fmt(netPnl)} USDT
        </p>
        <p className={`text-sm mt-0.5 ${isProfit ? "text-emerald-500" : "text-red-500"}`}>ROE {pct(roePct)}</p>
      </div>

      <div className="space-y-0">
        <Row label="Pozisyon Büyüklüğü (Notional)" value={`${fmt(notional)} USDT`} />
        <Row label="Miktar (Qty)" value={fmt(qty, 6)} />
        <Row label="Ham Kar/Zarar" value={`${rawPnl >= 0 ? "+" : ""}${fmt(rawPnl)} USDT`} color={rawPnl >= 0 ? "text-emerald-400" : "text-red-400"} />
        <Row label="Toplam Komisyon (x2)" value={`-${fmt(feeCost)} USDT`} color="text-orange-400" />
        <Row label="Tasfiye Fiyatı (≈)" value={`${fmt(liqPrice)} USDT`} color="text-red-400" />
        <Row label="Fiyat Değişimi" value={pct(((xp - ep) / ep) * 100)} />
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════
   2. HEDGE MOD HESAPLAYICI
══════════════════════════════════════════════════════ */
function HedgeCalc() {
  const [longEntry, setLongEntry]   = useState("50000")
  const [longSize, setLongSize]     = useState("100")
  const [longLev, setLongLev]       = useState("10")
  const [shortEntry, setShortEntry] = useState("50500")
  const [shortSize, setShortSize]   = useState("100")
  const [shortLev, setShortLev]     = useState("10")
  const [closePrice, setClosePrice] = useState("51000")
  const [fee, setFee]               = useState("0.05")

  const f = parseFloat(fee) / 100 || 0
  const cp = parseFloat(closePrice) || 0

  const lEp = parseFloat(longEntry) || 1
  const lSz = parseFloat(longSize) || 0
  const lLv = parseFloat(longLev) || 1
  const sEp = parseFloat(shortEntry) || 1
  const sSz = parseFloat(shortSize) || 0
  const sLv = parseFloat(shortLev) || 1

  const lNotional = lSz * lLv
  const sNotional = sSz * sLv
  const lQty = lNotional / lEp
  const sQty = sNotional / sEp

  const longPnl  = lQty * (cp - lEp) - (lNotional * f * 2)
  const shortPnl = sQty * (sEp - cp) - (sNotional * f * 2)
  const totalPnl = longPnl + shortPnl
  const totalMargin = lSz + sSz

  return (
    <Card title="Hedge Modu Hesaplama" icon="🔀">
      <div className="grid grid-cols-1 gap-3">
        <p className="text-xs text-slate-500 -mb-1 font-semibold uppercase tracking-wider text-emerald-400">📈 Long Pozisyon</p>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Giriş" value={longEntry} onChange={setLongEntry} />
          <Input label="Teminat" value={longSize} onChange={setLongSize} />
          <Input label="Kaldıraç" value={longLev} onChange={setLongLev} suffix="x" step="1" />
        </div>
        <p className="text-xs text-slate-500 -mb-1 font-semibold uppercase tracking-wider text-red-400">📉 Short Pozisyon</p>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Giriş" value={shortEntry} onChange={setShortEntry} />
          <Input label="Teminat" value={shortSize} onChange={setShortSize} />
          <Input label="Kaldıraç" value={shortLev} onChange={setShortLev} suffix="x" step="1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Kapanış Fiyatı" value={closePrice} onChange={setClosePrice} />
          <Input label="İşlem Ücreti" value={fee} onChange={setFee} suffix="%" step="0.01" />
        </div>
      </div>

      <div className={`rounded-xl p-4 border ${totalPnl >= 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
        <p className="text-xs text-slate-500 mb-1">Toplam Net PnL</p>
        <p className={`text-3xl font-bold tabular-nums ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {totalPnl >= 0 ? "+" : ""}{fmt(totalPnl)} USDT
        </p>
        <p className="text-sm text-slate-500 mt-0.5">Toplam teminat: {fmt(totalMargin)} USDT</p>
      </div>

      <div className="space-y-0">
        <Row label="Long PnL" value={`${longPnl >= 0 ? "+" : ""}${fmt(longPnl)} USDT`} color={longPnl >= 0 ? "text-emerald-400" : "text-red-400"} />
        <Row label="Short PnL" value={`${shortPnl >= 0 ? "+" : ""}${fmt(shortPnl)} USDT`} color={shortPnl >= 0 ? "text-emerald-400" : "text-red-400"} />
        <Row label="Long Notional" value={`${fmt(lNotional)} USDT`} />
        <Row label="Short Notional" value={`${fmt(sNotional)} USDT`} />
        <Row label="Hedge Farkı (spread)" value={`${fmt(Math.abs(lEp - sEp))} USDT`} />
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════
   3. KOMİSYON HESAPLAYICI
══════════════════════════════════════════════════════ */
const EXCHANGES = [
  { name: "MEXC",    maker: 0, taker: 0,    zero: true  },
  { name: "Bitget",  maker: 0.02, taker: 0.06, zero: false },
  { name: "Binance", maker: 0.02, taker: 0.04, zero: false },
  { name: "Bybit",   maker: 0.01, taker: 0.06, zero: false },
  { name: "OKX",     maker: 0.02, taker: 0.05, zero: false },
  { name: "Özel",    maker: 0.02, taker: 0.05, zero: false },
]

function CommissionCalc() {
  const [notional, setNotional] = useState("10000")
  const [selEx, setSelEx]       = useState("MEXC")
  const [customMaker, setCustomMaker] = useState("0.02")
  const [customTaker, setCustomTaker] = useState("0.05")
  const [orderType, setOrderType] = useState("taker")

  const ex = EXCHANGES.find(e => e.name === selEx) || EXCHANGES[0]
  const makerRate = selEx === "Özel" ? parseFloat(customMaker) / 100 : ex.maker / 100
  const takerRate = selEx === "Özel" ? parseFloat(customTaker) / 100 : ex.taker / 100
  const n = parseFloat(notional) || 0
  const rate = orderType === "maker" ? makerRate : takerRate

  const oneWay = n * rate
  const roundTrip = oneWay * 2
  const dailyTrades = [1, 5, 10, 20, 50]

  return (
    <Card title="Borsa Komisyon Hesaplama" icon="💸">
      <div className="grid grid-cols-2 gap-3">
        <Input label="İşlem Hacmi (Notional)" value={notional} onChange={setNotional} />
        <Select label="Borsa" value={selEx} onChange={setSelEx}
          options={EXCHANGES.map(e => ({ v: e.name, l: e.zero ? `${e.name} ⭐ Sıfır Fee` : e.name }))} />
        <Select label="Emir Tipi" value={orderType} onChange={setOrderType}
          options={[{ v: "taker", l: "Taker (Market)" }, { v: "maker", l: "Maker (Limit)" }]} />
        {selEx === "Özel" && <>
          <Input label="Maker Fee" value={customMaker} onChange={setCustomMaker} suffix="%" step="0.001" />
          <Input label="Taker Fee" value={customTaker} onChange={setCustomTaker} suffix="%" step="0.001" />
        </>}
      </div>

      {/* Borsa karşılaştırması */}
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="grid grid-cols-4 text-xs text-slate-500 px-3 py-2 bg-slate-800/40">
          <span>Borsa</span><span className="text-right">Maker</span><span className="text-right">Taker</span><span className="text-right">Round-trip</span>
        </div>
        {EXCHANGES.filter(e => e.name !== "Özel").map(e => {
          const rt = n * (e.taker / 100) * 2
          return (
            <div key={e.name}
              className={`grid grid-cols-4 text-xs px-3 py-2.5 border-t border-slate-800/40 transition-colors cursor-pointer ${selEx === e.name ? "bg-blue-500/10" : "hover:bg-slate-800/30"}`}
              onClick={() => setSelEx(e.name)}>
              <span className={`font-medium ${e.zero ? "text-emerald-400" : "text-white"}`}>{e.name}{e.zero ? " ⭐" : ""}</span>
              <span className="text-right text-slate-400">{e.maker === 0 ? "Ücretsiz" : `%${e.maker}`}</span>
              <span className="text-right text-slate-400">{e.taker === 0 ? "Ücretsiz" : `%${e.taker}`}</span>
              <span className={`text-right font-semibold tabular-nums ${e.zero ? "text-emerald-400" : "text-orange-400"}`}>{e.zero ? "0 USDT" : `${fmt(rt)} USDT`}</span>
            </div>
          )
        })}
      </div>

      <div className="space-y-0">
        <Row label={`Tek yön (${selEx})`} value={`${fmt(oneWay)} USDT`} color="text-orange-400" />
        <Row label="Round-trip (açılış+kapanış)" value={`${fmt(roundTrip)} USDT`} color="text-orange-400" />
        <Row label={`Oran (%${(rate * 100).toFixed(3)})`} value={`${(rate * 100).toFixed(3)}%`} />
      </div>

      <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-3">
        <p className="text-xs text-slate-500 mb-2 font-semibold">Günlük İşlem Maliyeti</p>
        <div className="grid grid-cols-5 gap-2">
          {dailyTrades.map(t => (
            <div key={t} className="text-center bg-slate-800 rounded-lg p-2">
              <p className="text-xs text-slate-500">{t}x</p>
              <p className="text-xs font-bold text-orange-400 tabular-nums">{fmt(roundTrip * t)}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════
   4. BREAK-EVEN HESAPLAYICI
══════════════════════════════════════════════════════ */
function BreakEvenCalc() {
  const [entry, setEntry]     = useState("50000")
  const [fee, setFee]         = useState("0.05")
  const [leverage, setLeverage] = useState("10")
  const [dir, setDir]         = useState("long")

  const ep = parseFloat(entry) || 0
  const f = parseFloat(fee) / 100 || 0
  const lev = parseFloat(leverage) || 1

  // Break-even = giriş fiyatı + 2 * taker_fee * entry (kaldıraçsız)
  // Kaldıraçlı: break-even hareket = 2*f / 1 (notional üzerinden)
  const beMove = (2 * f) // % cinsinden
  const beLong  = ep * (1 + beMove)
  const beShort = ep * (1 - beMove)
  const bePrice = dir === "long" ? beLong : beShort
  const beMovePts = Math.abs(bePrice - ep)

  const tpTargets = [0.5, 1, 2, 3, 5]

  return (
    <Card title="Break-Even & TP Hesaplama" icon="🎯">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Giriş Fiyatı" value={entry} onChange={setEntry} />
        <Input label="Kaldıraç" value={leverage} onChange={setLeverage} suffix="x" step="1" />
        <Input label="Taker Fee" value={fee} onChange={setFee} suffix="%" step="0.01" />
        <Select label="Yön" value={dir} onChange={setDir}
          options={[{ v: "long", l: "📈 Long" }, { v: "short", l: "📉 Short" }]} />
      </div>

      <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-4">
        <p className="text-xs text-slate-500 mb-1">Break-Even Fiyatı</p>
        <p className="text-2xl font-bold text-blue-300 tabular-nums">{fmt(bePrice)} USDT</p>
        <p className="text-xs text-slate-500 mt-0.5">{fmt(beMovePts)} USDT hareket ({(beMove * 100).toFixed(3)}%)</p>
      </div>

      <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-3">
        <p className="text-xs text-slate-500 mb-2 font-semibold">Kaldıraçlı ROE Hedefleri</p>
        <div className="space-y-0">
          {tpTargets.map(t => {
            const priceMoveDir = dir === "long" ? ep * (1 + t / 100) : ep * (1 - t / 100)
            const roe = t * lev
            return (
              <div key={t} className="flex items-center justify-between py-1.5 border-b border-slate-700/40 last:border-0">
                <span className="text-xs text-slate-400">%{t} fiyat hareketi → {fmt(priceMoveDir)} USDT</span>
                <span className="text-sm font-bold text-emerald-400">ROE %{fmt(roe, 1)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════
   ANA SAYFA
══════════════════════════════════════════════════════ */
type Tab = "leverage" | "hedge" | "commission" | "breakeven"

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "leverage",   label: "Kaldıraç",   icon: "📊" },
  { id: "hedge",      label: "Hedge",      icon: "🔀" },
  { id: "commission", label: "Komisyon",   icon: "💸" },
  { id: "breakeven",  label: "Break-Even", icon: "🎯" },
]

export default function CalculatorPage() {
  const [tab, setTab] = useState<Tab>("leverage")

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-20">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">🧮 İşlem Hesaplama</h1>
        <p className="text-sm text-slate-500 mt-1">Kaldıraç, hedge, komisyon ve break-even hesapla</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 mb-6 bg-slate-900 p-1 rounded-xl border border-slate-800">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
              tab === t.id
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* İçerik */}
      {tab === "leverage"   && <LeverageCalc />}
      {tab === "hedge"      && <HedgeCalc />}
      {tab === "commission" && <CommissionCalc />}
      {tab === "breakeven"  && <BreakEvenCalc />}

      {/* Uyarı */}
      <p className="mt-6 text-xs text-slate-600 text-center">
        ⚠ Hesaplamalar tahminidir. Gerçek borsa sonuçlarından farklı olabilir.
      </p>
    </div>
  )
}
