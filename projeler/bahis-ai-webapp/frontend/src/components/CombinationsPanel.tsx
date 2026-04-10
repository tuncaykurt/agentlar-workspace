"use client";
import { useState, useEffect } from "react";
import { buildCombinations, getFixturesByDate } from "@/lib/api";
import type { AnalysisResult } from "@/lib/api";
import {
  Target, Zap, ChevronDown, ChevronUp, Bookmark, BookmarkCheck,
  Trash2, Info, RefreshCw, CheckCircle2, XCircle, Clock,
} from "lucide-react";

interface Props {
  analyses: AnalysisResult[];
  fixtureMap?: Record<number, string>; // fixture_id → UTC date string
}

interface Combo {
  selections: Array<{
    match: string;
    label: string;
    probability: number;
    confidence: string;
    reason: string;
  }>;
  size: number;
  total_prob: number;
  ev_score: number;
  min_single: number;
}

interface SavedSelection {
  match: string;
  label: string;
  probability: number;
  confidence: string;
  reason: string;
  fixture_id?: number;
  match_date?: string;
  match_datetime?: string; // "10.4 21:30" formatında TR saati
  result?: {
    home_goals: number;
    away_goals: number;
    status: string;
    won: boolean | null;
  };
}

interface SavedCoupon {
  id: string;
  savedAt: string;
  combo: {
    size: number;
    total_prob: number;
    ev_score: number;
    min_single: number;
    selections: SavedSelection[];
  };
  overall?: "won" | "lost" | "pending";
}

const STORAGE_KEY = "bahis_ai_saved_coupons";
const METRIC_TAGS = ["Form analizi", "Puan tablosu", "H2H geçmiş", "Sakatlık faktörü", "Motivasyon", "Poisson hesabı"];
const DONE_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

function loadSaved(): SavedCoupon[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveCoupons(coupons: SavedCoupon[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(coupons));
}

/* ── Kazanç hesapla ─────────────────────────────────────────── */
function checkWin(label: string, homeGoals: number, awayGoals: number): boolean | null {
  const total = homeGoals + awayGoals;
  const l = label.toLowerCase();
  if (l.includes("ev kazanır"))        return homeGoals > awayGoals;
  if (l.includes("dep kazanır"))       return awayGoals > homeGoals;
  if (l.includes("beraberlik") && !l.includes("çifte")) return homeGoals === awayGoals;
  if (l.includes("çifte şans 1x"))     return homeGoals >= awayGoals;
  if (l.includes("çifte şans x2"))     return awayGoals >= homeGoals;
  if (l.includes("karşılıklı gol"))    return homeGoals > 0 && awayGoals > 0;
  if (l.includes("üst 3.5"))           return total > 3.5;
  if (l.includes("alt 3.5"))           return total < 3.5;
  if (l.includes("üst 2.5"))           return total > 2.5;
  if (l.includes("alt 2.5"))           return total < 2.5;
  if (l.includes("üst 1.5"))           return total > 1.5;
  if (l.includes("alt 1.5"))           return total < 1.5;
  return null;
}

function comboOverall(sels: SavedSelection[]): "won" | "lost" | "pending" {
  const finished = sels.filter(s => s.result);
  if (finished.length === 0) return "pending";
  if (finished.some(s => s.result!.won === false)) return "lost";
  if (finished.length === sels.length && finished.every(s => s.result!.won === true)) return "won";
  return "pending";
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()}.${d.getMonth()+1} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  } catch { return ""; }
}

// UTC maç saatini Türkiye saatine (+3) çevirip "10.4 21:30" formatında döndürür
function formatMatchDateTime(utcStr: string): string {
  if (!utcStr) return "";
  try {
    const utc = new Date(utcStr.length === 16 ? utcStr + ":00Z" : utcStr);
    const tr = new Date(utc.getTime() + 3 * 60 * 60 * 1000);
    const day   = tr.getUTCDate();
    const month = tr.getUTCMonth() + 1;
    const h     = String(tr.getUTCHours()).padStart(2, "0");
    const m     = String(tr.getUTCMinutes()).padStart(2, "0");
    return `${day}.${month} ${h}:${m}`;
  } catch { return ""; }
}

const confBg: Record<string, string> = {
  high: "border-green-700/50 bg-green-950/30",
  medium: "border-yellow-700/50 bg-yellow-950/30",
  low: "border-slate-700 bg-slate-800/50",
};

export default function CombinationsPanel({ analyses, fixtureMap = {} }: Props) {
  const [comboSize, setComboSize]         = useState(3);
  const [minProb, setMinProb]             = useState(0.60);
  const [topN, setTopN]                   = useState(5);
  const [combos, setCombos]               = useState<Combo[]>([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");
  const [openIdx, setOpenIdx]             = useState<number | null>(0);
  const [savedCoupons, setSavedCoupons]   = useState<SavedCoupon[]>([]);
  const [savedOpenIdx, setSavedOpenIdx]   = useState<number | null>(null);
  const [showSaved, setShowSaved]         = useState(false);
  const [refreshing, setRefreshing]       = useState(false);

  useEffect(() => { setSavedCoupons(loadSaved()); }, []);

  async function generate() {
    if (analyses.length === 0) { setError("Önce Günlük sekmesinden maç analizi yapın."); return; }
    setLoading(true); setError("");
    try {
      const res = await buildCombinations({ analyses, combo_size: comboSize, min_probability: minProb, top_n: topN });
      if (res.combos.length === 0) setError(res.message || "Yeterli seçenek bulunamadı. Min. olasılığı düşürün.");
      setCombos(res.combos);
      setOpenIdx(0);
    } catch { setError("Kombinasyon oluşturulamadı."); }
    finally { setLoading(false); }
  }

  function comboId(combo: Combo): string {
    return combo.selections.map(s => s.match + s.label).join("|");
  }
  function isSaved(combo: Combo): boolean {
    return savedCoupons.some(c => c.id === comboId(combo));
  }

  function saveCoupon(combo: Combo) {
    if (isSaved(combo)) return;
    const today = new Date().toISOString().slice(0, 10);

    const enriched: SavedSelection[] = combo.selections.map(sel => {
      const analysis = analyses.find(a => {
        const name = `${a.home} vs ${a.away}`;
        return name === sel.match || sel.match.includes(a.home) || sel.match.includes(a.away);
      });
      const fid = analysis?.fixture_id;
      const rawDate = fid ? fixtureMap[fid] : undefined;
      return {
        ...sel,
        fixture_id:     fid,
        match_date:     today,
        match_datetime: rawDate ? formatMatchDateTime(rawDate) : undefined,
      };
    });

    const newCoupon: SavedCoupon = {
      id: comboId(combo),
      savedAt: new Date().toISOString(),
      combo: { ...combo, selections: enriched },
      overall: "pending",
    };
    const updated = [newCoupon, ...savedCoupons];
    setSavedCoupons(updated);
    saveCoupons(updated);
  }

  function deleteCoupon(id: string) {
    const updated = savedCoupons.filter(c => c.id !== id);
    setSavedCoupons(updated);
    saveCoupons(updated);
  }

  /* ── Sonuçları API'den güncelle ──────────────────────────── */
  async function refreshResults() {
    setRefreshing(true);
    try {
      // Benzersiz tarihleri topla
      const dates = new Set<string>();
      savedCoupons.forEach(c =>
        c.combo.selections.forEach(s => { if (s.match_date) dates.add(s.match_date); })
      );

      // Her tarih için fixture'ları çek
      const fixtureMap = new Map<number, { home_goals: number; away_goals: number; status: string }>();
      for (const date of dates) {
        try {
          const data = await getFixturesByDate(date);
          data.fixtures.forEach(f => {
            if (DONE_STATUSES.has(f.status)) {
              fixtureMap.set(f.id, {
                home_goals: f.home.goals ?? 0,
                away_goals: f.away.goals ?? 0,
                status: f.status,
              });
            }
          });
        } catch {}
      }

      // Kuponu güncelle
      const updated = savedCoupons.map(coupon => {
        const newSels: SavedSelection[] = coupon.combo.selections.map(sel => {
          if (!sel.fixture_id || sel.result) return sel; // zaten sonuçlandı
          const res = fixtureMap.get(sel.fixture_id);
          if (!res) return sel;
          return {
            ...sel,
            result: {
              home_goals: res.home_goals,
              away_goals: res.away_goals,
              status: res.status,
              won: checkWin(sel.label, res.home_goals, res.away_goals),
            },
          };
        });
        return {
          ...coupon,
          combo: { ...coupon.combo, selections: newSels },
          overall: comboOverall(newSels),
        };
      });

      setSavedCoupons(updated);
      saveCoupons(updated);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="py-4 space-y-4">
      {/* Ayarlar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-violet-400" />
          <h2 className="font-bold text-white">Kombinasyon Ayarları</h2>
        </div>

        {analyses.length > 0 ? (
          <p className="text-xs text-green-400 bg-green-950/30 border border-green-800/30 rounded-lg px-3 py-2">
            {analyses.length} analiz hazır — kombinasyon oluşturulabilir
          </p>
        ) : (
          <p className="text-xs text-slate-500 bg-slate-800/50 rounded-lg px-3 py-2">
            Günlük sekmesinden en az 2 maç analiz edin.
          </p>
        )}

        <div>
          <label className="text-xs text-slate-400 mb-2 block">Kombinasyon Büyüklüğü: <span className="text-white font-bold">{comboSize}</span></label>
          <input type="range" min={2} max={6} value={comboSize} onChange={e => setComboSize(+e.target.value)} className="w-full accent-violet-500" />
          <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
            <span>2'li</span><span>3'lü</span><span>4'lü</span><span>5'li</span><span>6'lı</span>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-2 block">Min. Tekil Olasılık: <span className="text-white font-bold">%{Math.round(minProb * 100)}</span></label>
          <input type="range" min={50} max={85} value={Math.round(minProb * 100)} onChange={e => setMinProb(+e.target.value / 100)} className="w-full accent-violet-500" />
          <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
            <span>%50</span><span>%60</span><span>%70</span><span>%85</span>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-2 block">Kaç Kombinasyon: <span className="text-white font-bold">{topN}</span></label>
          <input type="range" min={3} max={10} value={topN} onChange={e => setTopN(+e.target.value)} className="w-full accent-violet-500" />
        </div>

        <button
          onClick={generate}
          disabled={loading || analyses.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                     bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold transition-colors"
        >
          <Zap size={16} className={loading ? "animate-pulse" : ""} />
          {loading ? "Oluşturuluyor..." : "Kombinasyon Oluştur"}
        </button>

        {error && (
          <p className="text-xs text-red-400 bg-red-950/30 border border-red-800/30 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>

      {/* Kombinasyon Sonuçları */}
      {combos.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">{combos.length} kombinasyon bulundu</p>

          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Info size={12} className="text-violet-400" />
              <span className="text-[10px] text-violet-400 font-semibold uppercase tracking-wide">Kullanılan Metrikler</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {METRIC_TAGS.map(tag => (
                <span key={tag} className="text-[10px] bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-2">
              Her seçim için min. %{Math.round(minProb*100)} tekil olasılık eşiği uygulandı.
            </p>
          </div>

          {combos.map((combo, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <button onClick={() => setOpenIdx(openIdx === i ? null : i)} className="w-full p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-violet-900/50 border border-violet-700/50 rounded-lg flex items-center justify-center text-violet-300 font-bold text-sm">
                    #{i + 1}
                  </div>
                  <div className="text-left">
                    <p className="text-white font-bold text-sm">{combo.size}'lü Kombinasyon</p>
                    <p className="text-xs text-slate-500">En düşük: %{Math.round(combo.min_single * 100)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={e => { e.stopPropagation(); saveCoupon(combo); }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      isSaved(combo)
                        ? "text-amber-400 bg-amber-950/40 border border-amber-700/40"
                        : "text-slate-500 hover:text-amber-400 bg-slate-800 border border-slate-700"
                    }`}
                    title={isSaved(combo) ? "Kaydedildi" : "Kuponu Kaydet"}
                  >
                    {isSaved(combo) ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                  </button>
                  <div className="text-right">
                    <p className="text-violet-400 font-black text-lg leading-none">%{(combo.total_prob * 100).toFixed(1)}</p>
                    <p className="text-[10px] text-slate-600">toplam</p>
                  </div>
                  {openIdx === i ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                </div>
              </button>

              {openIdx === i && (
                <div className="px-4 pb-4 space-y-2 border-t border-slate-800 pt-3">
                  {combo.selections.map((sel, j) => (
                    <div key={j} className={`border rounded-xl p-3 ${confBg[sel.confidence] || confBg.medium}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-400 leading-tight">{sel.match}</span>
                        <span className={`text-sm font-black ${sel.probability >= 0.70 ? "text-green-400" : "text-yellow-400"}`}>
                          %{Math.round(sel.probability * 100)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white">{sel.label}</p>
                      {sel.reason && (
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{sel.reason.slice(0, 120)}</p>
                      )}
                    </div>
                  ))}

                  <div className="flex justify-between pt-2 border-t border-slate-800 text-xs">
                    <span className="text-slate-500">EV Skoru: {combo.ev_score.toFixed(4)}</span>
                    <span className="text-violet-400 font-bold">Toplam: %{(combo.total_prob * 100).toFixed(2)}</span>
                  </div>

                  {!isSaved(combo) && (
                    <button
                      onClick={() => saveCoupon(combo)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl
                                 bg-amber-950/30 hover:bg-amber-950/50 border border-amber-800/40
                                 text-amber-400 text-xs font-medium transition-colors"
                    >
                      <Bookmark size={13} />
                      Kuponu Kaydet
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Kayıtlı Kuponlar */}
      {savedCoupons.length > 0 && (
        <div className="space-y-3">
          {/* Başlık + Güncelle butonu */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaved(s => !s)}
              className="flex-1 flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-3"
            >
              <div className="flex items-center gap-2">
                <BookmarkCheck size={15} className="text-amber-400" />
                <span className="text-sm font-bold text-white">Kayıtlı Kuponlar</span>
                <span className="bg-amber-900/50 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {savedCoupons.length}
                </span>
              </div>
              {showSaved ? <ChevronUp size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
            </button>
            <button
              onClick={refreshResults}
              disabled={refreshing}
              title="Maç sonuçlarını güncelle"
              className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-violet-400 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>

          {showSaved && savedCoupons.map((saved, i) => {
            const overall = saved.overall ?? "pending";
            const headerBorder =
              overall === "won"  ? "border-green-700/50" :
              overall === "lost" ? "border-red-700/50"   : "border-amber-900/30";
            const headerBg =
              overall === "won"  ? "bg-green-950/20" :
              overall === "lost" ? "bg-red-950/20"   : "";

            return (
              <div key={saved.id} className={`bg-slate-900 border ${headerBorder} rounded-2xl overflow-hidden`}>
                <button
                  onClick={() => setSavedOpenIdx(savedOpenIdx === i ? null : i)}
                  className={`w-full p-4 flex items-center justify-between ${headerBg}`}
                >
                  <div className="text-left">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-white font-bold text-sm">{saved.combo.size}'lü Kupon</p>
                      {/* Genel durum rozeti */}
                      {overall === "won"  && <span className="text-[10px] font-bold text-green-400 bg-green-950/50 border border-green-700/40 px-1.5 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 size={9} />TUTTU</span>}
                      {overall === "lost" && <span className="text-[10px] font-bold text-red-400 bg-red-950/50 border border-red-700/40 px-1.5 py-0.5 rounded-full flex items-center gap-1"><XCircle size={9} />TUTMADI</span>}
                      {overall === "pending" && <span className="text-[10px] font-bold text-slate-500 bg-slate-800/50 border border-slate-700/40 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Clock size={9} />BEKLEMEDE</span>}
                    </div>
                    <p className="text-xs text-slate-500">Kaydedildi: {formatDate(saved.savedAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-amber-400 font-black text-base leading-none">
                        %{(saved.combo.total_prob * 100).toFixed(1)}
                      </p>
                      <p className="text-[10px] text-slate-600">toplam</p>
                    </div>
                    {savedOpenIdx === i ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                  </div>
                </button>

                {savedOpenIdx === i && (
                  <div className="px-4 pb-4 space-y-2 border-t border-slate-800 pt-3">
                    {saved.combo.selections.map((sel, j) => {
                      const won = sel.result?.won;
                      const selBorder =
                        won === true  ? "border-green-700/60 bg-green-950/20" :
                        won === false ? "border-red-700/60 bg-red-950/20"     :
                        "border-slate-700/50 bg-slate-800/40";

                      return (
                        <div key={j} className={`border rounded-xl p-3 ${selBorder}`}>
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex-1 mr-2">
                              <span className="text-[10px] text-slate-500">{sel.match}</span>
                              {sel.match_datetime && (
                                <span className="ml-1.5 text-[9px] text-violet-400 font-semibold">{sel.match_datetime}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Skor */}
                              {sel.result && (
                                <span className="text-xs font-bold text-white bg-slate-700/60 px-1.5 py-0.5 rounded">
                                  {sel.result.home_goals} – {sel.result.away_goals}
                                </span>
                              )}
                              {/* Kazandı/Kaybetti ikonu */}
                              {won === true  && <CheckCircle2 size={14} className="text-green-400" />}
                              {won === false && <XCircle size={14} className="text-red-400" />}
                              {won === null  && sel.result && <span className="text-[9px] text-slate-500">?</span>}
                              <span className="text-xs font-bold text-amber-400">%{Math.round(sel.probability * 100)}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">{sel.label}</p>
                            {!sel.result && (
                              <span className="text-[9px] text-slate-600 ml-2">Oynanmadı</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Metrik özeti */}
                    <div className="bg-slate-800/30 rounded-xl p-2.5">
                      <p className="text-[10px] text-slate-500 mb-1.5">Bu kupon şu metriklerle oluşturuldu:</p>
                      <div className="flex flex-wrap gap-1">
                        {METRIC_TAGS.map(tag => (
                          <span key={tag} className="text-[9px] bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded">{tag}</span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => deleteCoupon(saved.id)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl
                                 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30
                                 text-red-400 text-xs font-medium transition-colors"
                    >
                      <Trash2 size={12} />
                      Kuponu Sil
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
