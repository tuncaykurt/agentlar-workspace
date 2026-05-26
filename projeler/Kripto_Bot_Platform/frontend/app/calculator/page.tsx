"use client"
import { useState } from "react"

const fmt = (n: number, d = 2) =>
  isNaN(n) || !isFinite(n) ? "—" : n.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d })
const clr = (n: number) => n >= 0 ? "text-emerald-400" : "text-red-400"
const sign = (n: number) => n >= 0 ? "+" : ""

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><span className="text-lg">{icon}</span>{title}</h2>
      {children}
    </div>
  )
}
function Row({ label, value, color = "text-white", sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60 last:border-0">
      <div><span className="text-xs text-slate-500">{label}</span>{sub && <span className="text-xs text-slate-600 ml-1">({sub})</span>}</div>
      <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  )
}
function Inp({ label, value, onChange, suffix = "USDT", step = "0.01", min = "0" }: {
  label: string; value: string; onChange: (v: string) => void; suffix?: string; step?: string; min?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-500">{label}</label>
      <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <input type="number" value={value} onChange={e => onChange(e.target.value)} step={step} min={min}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white outline-none tabular-nums" />
        <span className="px-3 text-xs text-slate-500 shrink-0">{suffix}</span>
      </div>
    </div>
  )
}
function Sel({ label, value, onChange, opts }: {
  label: string; value: string; onChange: (v: string) => void; opts: { v: string; l: string }[]
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-500">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none">
        {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  )
}
function PnlBox({ label, value, pct }: { label: string; value: number; pct: number }) {
  const pos = value >= 0
  return (
    <div className={`rounded-xl p-3 border text-center ${pos ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${pos ? "text-emerald-400" : "text-red-400"}`}>{sign(value)}{fmt(value)} USDT</p>
      <p className={`text-xs mt-0.5 ${pos ? "text-emerald-600" : "text-red-600"}`}>ROE {sign(pct)}{fmt(pct)}%</p>
    </div>
  )
}

/* ══ 1. KALDIRAÇLI HESAPLAMA ══ */
function LeverageCalc() {
  const [margin, setMargin]     = useState("10")
  const [lev, setLev]           = useState("500")
  const [entry, setEntry]       = useState("2133")
  const [dir, setDir]           = useState("long")
  const [fee, setFee]           = useState("0.0")
  const [tp, setTp]             = useState("0.4")
  const [sl, setSl]             = useState("0.2")

  const m  = parseFloat(margin) || 0
  const lv = parseFloat(lev) || 1
  const ep = parseFloat(entry) || 1
  const f  = parseFloat(fee) / 100
  const tpP = parseFloat(tp) / 100
  const slP = parseFloat(sl) / 100

  const notional  = m * lv
  const qty       = notional / ep
  const feeCost   = notional * f * 2

  // TP/SL fiyatları
  const tpPrice = dir === "long" ? ep * (1 + tpP) : ep * (1 - tpP)
  const slPrice = dir === "long" ? ep * (1 - slP) : ep * (1 + slP)

  // PnL
  const tpRaw  = qty * Math.abs(tpPrice - ep)
  const slRaw  = qty * Math.abs(slPrice - ep)
  const tpNet  = tpRaw - feeCost
  const slNet  = -(slRaw + feeCost)
  const tpRoe  = (tpNet / m) * 100
  const slRoe  = (slNet / m) * 100

  // Break-even
  const beMovePct = f * 2 * 100
  const bePrice   = dir === "long" ? ep * (1 + f * 2) : ep * (1 - f * 2)
  const liqPct    = 100 / lv
  const liqPrice  = dir === "long" ? ep * (1 - liqPct / 100) : ep * (1 + liqPct / 100)

  return (
    <Card title="Kaldıraçlı İşlem Hesaplama" icon="📊">
      {/* Açıklama kutusu */}
      <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-3 text-xs text-slate-400 leading-relaxed">
        <span className="text-blue-300 font-semibold">Break-Even nedir? </span>
        İşlemi açıp kapattığında ödediğin komisyonları tam olarak karşılayan fiyat noktasıdır.
        Bu noktanın altında (long için) zarar edersin. Komisyon sıfırsa break-even = giriş fiyatıdır.
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Inp label="Teminat (Margin)" value={margin} onChange={setMargin} />
        <Inp label="Kaldıraç" value={lev} onChange={setLev} suffix="x" step="1" min="1" />
        <Inp label="Giriş Fiyatı" value={entry} onChange={setEntry} />
        <Sel label="Yön" value={dir} onChange={setDir} opts={[{ v: "long", l: "📈 Long" }, { v: "short", l: "📉 Short" }]} />
        <Inp label="TP %" value={tp} onChange={setTp} suffix="%" step="0.01" />
        <Inp label="SL %" value={sl} onChange={setSl} suffix="%" step="0.01" />
        <Inp label="İşlem Ücreti (Taker)" value={fee} onChange={setFee} suffix="%" step="0.01" />
      </div>

      {/* TP / SL sonuç kutuları */}
      <div className="grid grid-cols-2 gap-3">
        <PnlBox label={`🎯 TP Karı (%${tp} hareket)`} value={tpNet} pct={tpRoe} />
        <PnlBox label={`🛑 SL Zararı (%${sl} hareket)`} value={slNet} pct={slRoe} />
      </div>

      <div className="space-y-0">
        <Row label="Pozisyon Büyüklüğü" value={`${fmt(notional)} USDT`} />
        <Row label="Miktar (Qty)" value={fmt(qty, 6)} />
        <Row label="TP Fiyatı" value={`${fmt(tpPrice)} USDT`} color="text-emerald-400" sub={`+%${tp}`} />
        <Row label="SL Fiyatı" value={`${fmt(slPrice)} USDT`} color="text-red-400" sub={`-%${sl}`} />
        <Row label="Break-Even Fiyatı" value={`${fmt(bePrice)} USDT`} color="text-blue-300" sub={`%${fmt(beMovePct, 3)} hareket`} />
        <Row label="Tasfiye (Likidite) Fiyatı" value={`${fmt(liqPrice)} USDT`} color="text-red-500" sub={`-%${fmt(liqPct, 1)} teminattan`} />
        <Row label="Toplam Komisyon" value={`-${fmt(feeCost)} USDT`} color="text-orange-400" />
        <Row label="Risk/Ödül Oranı (R:R)" value={tpRaw > 0 && slRaw > 0 ? `1 : ${fmt(tpRaw / slRaw)}` : "—"} />
      </div>
    </Card>
  )
}

/* ══ 2. HEDGE MOD HESAPLAYICI ══ */
function HedgeCalc() {
  const [entry, setEntry]       = useState("2133")
  const [margin, setMargin]     = useState("10")
  const [lev, setLev]           = useState("500")
  const [fee, setFee]           = useState("0.0")
  const [ltp, setLtp]           = useState("0.4")
  const [lsl, setLsl]           = useState("0.2")
  const [stp, setStp]           = useState("0.4")
  const [ssl, setSsl]           = useState("0.2")
  const [scenario, setScenario] = useState("both_tp")

  const ep  = parseFloat(entry) || 1
  const m   = parseFloat(margin) || 0
  const lv  = parseFloat(lev) || 1
  const f   = parseFloat(fee) / 100

  // Her iki taraf aynı notional
  const notional  = m * lv
  const qty       = notional / ep
  const feeEach   = notional * f * 2 // açılış + kapanış

  const ltpP = parseFloat(ltp) / 100
  const lslP = parseFloat(lsl) / 100
  const stpP = parseFloat(stp) / 100
  const sslP = parseFloat(ssl) / 100

  // Fiyatlar
  const lTpPrice = ep * (1 + ltpP)
  const lSlPrice = ep * (1 - lslP)
  const sTpPrice = ep * (1 - stpP)
  const sSlPrice = ep * (1 + sslP)

  // Ham PnL
  const longTpPnl  = qty * (lTpPrice - ep) - feeEach
  const longSlPnl  = -(qty * (ep - lSlPrice) + feeEach)
  const shortTpPnl = qty * (ep - sTpPrice) - feeEach
  const shortSlPnl = -(qty * (sSlPrice - ep) + feeEach)

  const scenarios: Record<string, { label: string; longPnl: number; shortPnl: number }> = {
    both_tp:    { label: "İkisi de TP'ye ulaştı",         longPnl: longTpPnl,  shortPnl: shortTpPnl },
    both_sl:    { label: "İkisi de SL'ye ulaştı",         longPnl: longSlPnl,  shortPnl: shortSlPnl },
    long_tp_short_sl: { label: "Long TP / Short SL",      longPnl: longTpPnl,  shortPnl: shortSlPnl },
    long_sl_short_tp: { label: "Long SL / Short TP",      longPnl: longSlPnl,  shortPnl: shortTpPnl },
  }

  const cur = scenarios[scenario]
  const totalPnl   = cur.longPnl + cur.shortPnl
  const totalMargin = m * 2

  return (
    <Card title="Hedge Modu Hesaplama" icon="🔀">
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3 text-xs text-slate-400 leading-relaxed">
        <span className="text-yellow-300 font-semibold">Hedge Modu: </span>
        Aynı anda hem Long hem Short pozisyon açarak fiyat hareketinden her iki yönde de yararlanırsın.
        Toplam teminat 2x olur. Senaryo seçerek olası sonuçları hesapla.
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Inp label="Ortak Giriş Fiyatı" value={entry} onChange={setEntry} />
        <Inp label="Teminat (her pozisyon)" value={margin} onChange={setMargin} />
        <Inp label="Kaldıraç" value={lev} onChange={setLev} suffix="x" step="1" />
        <Inp label="İşlem Ücreti" value={fee} onChange={setFee} suffix="%" step="0.01" />
      </div>

      <div className="grid grid-cols-2 gap-3 border border-emerald-500/20 rounded-xl p-3 bg-emerald-500/3">
        <p className="col-span-2 text-xs font-semibold text-emerald-400">📈 Long Pozisyon</p>
        <Inp label="Long TP %" value={ltp} onChange={setLtp} suffix="%" step="0.01" />
        <Inp label="Long SL %" value={lsl} onChange={setLsl} suffix="%" step="0.01" />
      </div>

      <div className="grid grid-cols-2 gap-3 border border-red-500/20 rounded-xl p-3 bg-red-500/3">
        <p className="col-span-2 text-xs font-semibold text-red-400">📉 Short Pozisyon</p>
        <Inp label="Short TP %" value={stp} onChange={setStp} suffix="%" step="0.01" />
        <Inp label="Short SL %" value={ssl} onChange={setSsl} suffix="%" step="0.01" />
      </div>

      {/* Senaryo seçici */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500">Senaryo</label>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(scenarios).map(([k, v]) => (
            <button key={k} onClick={() => setScenario(k)}
              className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all text-left ${
                scenario === k ? "border-blue-500/60 bg-blue-500/10 text-blue-300" : "border-slate-700 text-slate-400 hover:border-slate-600"
              }`}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* Sonuçlar */}
      <div className={`rounded-xl p-4 border ${totalPnl >= 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
        <p className="text-xs text-slate-500 mb-1">Toplam Net PnL — {cur.label}</p>
        <p className={`text-3xl font-bold tabular-nums ${clr(totalPnl)}`}>{sign(totalPnl)}{fmt(totalPnl)} USDT</p>
        <p className="text-xs text-slate-500 mt-0.5">Toplam teminat: {fmt(totalMargin)} USDT · ROE {sign(totalPnl / totalMargin * 100)}{fmt(totalPnl / totalMargin * 100)}%</p>
      </div>

      <div className="space-y-0">
        <Row label="Long PnL" value={`${sign(cur.longPnl)}${fmt(cur.longPnl)} USDT`} color={clr(cur.longPnl)} />
        <Row label="Short PnL" value={`${sign(cur.shortPnl)}${fmt(cur.shortPnl)} USDT`} color={clr(cur.shortPnl)} />
        <Row label="Long TP Fiyatı" value={`${fmt(lTpPrice)}`} color="text-emerald-400" sub={`+%${ltp}`} />
        <Row label="Long SL Fiyatı" value={`${fmt(lSlPrice)}`} color="text-red-400" sub={`-%${lsl}`} />
        <Row label="Short TP Fiyatı" value={`${fmt(sTpPrice)}`} color="text-emerald-400" sub={`-%${stp}`} />
        <Row label="Short SL Fiyatı" value={`${fmt(sSlPrice)}`} color="text-red-400" sub={`+%${ssl}`} />
        <Row label="Notional (her taraf)" value={`${fmt(notional)} USDT`} />
        <Row label="Komisyon (her taraf)" value={`-${fmt(feeEach)} USDT`} color="text-orange-400" />
      </div>
    </Card>
  )
}

/* ══ 3. KOMİSYON HESAPLAYICI ══ */
const EXCHANGES = [
  { name: "MEXC",    maker: 0,    taker: 0    },
  { name: "Bitget",  maker: 0.02, taker: 0.06 },
  { name: "Binance", maker: 0.02, taker: 0.04 },
  { name: "Bybit",   maker: 0.01, taker: 0.06 },
  { name: "OKX",     maker: 0.02, taker: 0.05 },
]

function CommissionCalc() {
  const [notional, setNotional] = useState("10000")
  const [selEx, setSelEx]       = useState("MEXC")
  const [orderType, setOrderType] = useState("taker")

  const ex   = EXCHANGES.find(e => e.name === selEx) || EXCHANGES[0]
  const rate = orderType === "maker" ? ex.maker / 100 : ex.taker / 100
  const n    = parseFloat(notional) || 0
  const oneWay    = n * rate
  const roundTrip = oneWay * 2

  return (
    <Card title="Borsa Komisyon Karşılaştırması" icon="💸">
      <div className="grid grid-cols-2 gap-3">
        <Inp label="İşlem Hacmi (Notional)" value={notional} onChange={setNotional} />
        <Sel label="Emir Tipi" value={orderType} onChange={setOrderType}
          opts={[{ v: "taker", l: "Taker (Market)" }, { v: "maker", l: "Maker (Limit)" }]} />
      </div>
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="grid grid-cols-4 text-xs text-slate-500 px-3 py-2 bg-slate-800/40">
          <span>Borsa</span><span className="text-right">Maker</span><span className="text-right">Taker</span><span className="text-right">Round-trip</span>
        </div>
        {EXCHANGES.map(e => {
          const r  = orderType === "maker" ? e.maker / 100 : e.taker / 100
          const rt = n * r * 2
          const isZero = e.taker === 0
          return (
            <div key={e.name} onClick={() => setSelEx(e.name)}
              className={`grid grid-cols-4 text-xs px-3 py-2.5 border-t border-slate-800/40 cursor-pointer transition-colors ${selEx === e.name ? "bg-blue-500/10" : "hover:bg-slate-800/30"}`}>
              <span className={`font-medium ${isZero ? "text-emerald-400" : "text-white"}`}>{e.name}{isZero ? " ⭐" : ""}</span>
              <span className="text-right text-slate-400">{e.maker === 0 ? "Ücretsiz" : `%${e.maker}`}</span>
              <span className="text-right text-slate-400">{e.taker === 0 ? "Ücretsiz" : `%${e.taker}`}</span>
              <span className={`text-right font-semibold tabular-nums ${isZero ? "text-emerald-400" : "text-orange-400"}`}>{isZero ? "0 USDT" : `${fmt(rt)} USDT`}</span>
            </div>
          )
        })}
      </div>
      <div className="space-y-0">
        <Row label="Tek yön" value={`${fmt(oneWay)} USDT`} color="text-orange-400" />
        <Row label="Round-trip" value={`${fmt(roundTrip)} USDT`} color="text-orange-400" />
        <Row label="Oran" value={`%${(rate * 100).toFixed(3)}`} />
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 p-3">
        <p className="text-xs text-slate-500 mb-2 font-semibold">Günlük İşlem Maliyeti</p>
        <div className="grid grid-cols-5 gap-2">
          {[1,5,10,20,50].map(t => (
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

/* ══ ANA SAYFA ══ */
type Tab = "leverage" | "hedge" | "commission"
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "leverage",   label: "Kaldıraç",  icon: "📊" },
  { id: "hedge",      label: "Hedge",     icon: "🔀" },
  { id: "commission", label: "Komisyon",  icon: "💸" },
]

export default function CalculatorPage() {
  const [tab, setTab] = useState<Tab>("leverage")
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-20">
      <div className="section-header mb-6">
        <div className="section-header-icon">🧮</div>
        <div>
          <h1 className="section-title">İşlem Hesaplama</h1>
          <p className="section-subtitle">Kaldıraç, hedge ve komisyon hesapla</p>
        </div>
      </div>
      <div className="flex gap-1.5 mb-6 bg-slate-900 p-1 rounded-xl border border-slate-800">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${tab === t.id ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === "leverage"   && <LeverageCalc />}
      {tab === "hedge"      && <HedgeCalc />}
      {tab === "commission" && <CommissionCalc />}
      <p className="mt-6 text-xs text-slate-600 text-center">⚠ Hesaplamalar tahminidir. Gerçek borsa sonuçlarından farklı olabilir.</p>
    </div>
  )
}
