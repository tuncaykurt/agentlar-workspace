"use client";
import { useState, useEffect } from "react";
import { buildCombinations } from "@/lib/api";
import type { AnalysisResult } from "@/lib/api";
import { Target, Zap, ChevronDown, ChevronUp, Bookmark, BookmarkCheck, Trash2, Info } from "lucide-react";

interface Props {
  analyses: AnalysisResult[];
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

interface SavedCoupon {
  id: string;
  savedAt: string;
  combo: Combo;
}

const STORAGE_KEY = "bahis_ai_saved_coupons";
const METRIC_TAGS = ["Form analizi", "Puan tablosu", "H2H geçmiş", "Sakatlık faktörü", "Motivasyon", "Poisson hesabı"];

function loadSaved(): SavedCoupon[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

function saveCoupons(coupons: SavedCoupon[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(coupons));
}

export default function CombinationsPanel({ analyses }: Props) {
  const [comboSize, setComboSize]   = useState(3);
  const [minProb, setMinProb]       = useState(0.60);
  const [topN, setTopN]             = useState(5);
  const [combos, setCombos]         = useState<Combo[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [openIdx, setOpenIdx]       = useState<number | null>(0);
  const [savedCoupons, setSavedCoupons] = useState<SavedCoupon[]>([]);
  const [savedOpenIdx, setSavedOpenIdx] = useState<number | null>(null);
  const [showSaved, setShowSaved]   = useState(false);

  useEffect(() => {
    setSavedCoupons(loadSaved());
  }, []);

  async function generate() {
    if (analyses.length === 0) {
      setError("Önce Günlük sekmesinden maç analizi yapın.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await buildCombinations({ analyses, combo_size: comboSize, min_probability: minProb, top_n: topN });
      if (res.combos.length === 0) {
        setError(res.message || "Yeterli seçenek bulunamadı. Min. olasılığı düşürün.");
      }
      setCombos(res.combos);
      setOpenIdx(0);
    } catch {
      setError("Kombinasyon oluşturulamadı.");
    } finally {
      setLoading(false);
    }
  }

  function saveCoupon(combo: Combo, idx: number) {
    const already = savedCoupons.find(c => c.id === comboId(combo));
    if (already) return;
    const newCoupon: SavedCoupon = {
      id: comboId(combo),
      savedAt: new Date().toISOString(),
      combo,
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

  function comboId(combo: Combo): string {
    return combo.selections.map(s => s.match + s.label).join("|");
  }

  function isSaved(combo: Combo): boolean {
    return savedCoupons.some(c => c.id === comboId(combo));
  }

  function formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return `${d.getDate()}.${d.getMonth()+1} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    } catch { return ""; }
  }

  const confBg: Record<string, string> = {
    high: "border-green-700/50 bg-green-950/30",
    medium: "border-yellow-700/50 bg-yellow-950/30",
    low: "border-slate-700 bg-slate-800/50",
  };

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
          <input type="range" min={2} max={6} value={comboSize} onChange={e => setComboSize(+e.target.value)}
            className="w-full accent-violet-500" />
          <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
            <span>2'li</span><span>3'lü</span><span>4'lü</span><span>5'li</span><span>6'lı</span>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-2 block">
            Min. Tekil Olasılık: <span className="text-white font-bold">%{Math.round(minProb * 100)}</span>
          </label>
          <input type="range" min={50} max={85} value={Math.round(minProb * 100)}
            onChange={e => setMinProb(+e.target.value / 100)}
            className="w-full accent-violet-500" />
          <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
            <span>%50</span><span>%60</span><span>%70</span><span>%85</span>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-2 block">Kaç Kombinasyon: <span className="text-white font-bold">{topN}</span></label>
          <input type="range" min={3} max={10} value={topN} onChange={e => setTopN(+e.target.value)}
            className="w-full accent-violet-500" />
        </div>

        <button
          onClick={generate}
          disabled={loading || analyses.length === 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                     bg-violet-600 hover:bg-violet-500 disabled:opacity-40
                     text-white font-bold transition-colors"
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

          {/* Metrik özeti — her zaman göster */}
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Info size={12} className="text-violet-400" />
              <span className="text-[10px] text-violet-400 font-semibold uppercase tracking-wide">Kullanılan Metrikler</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {METRIC_TAGS.map(tag => (
                <span key={tag} className="text-[10px] bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-2">
              Her seçim için min. %{Math.round(minProb*100)} tekil olasılık eşiği uygulandı.
              Kombinasyonlar EV skoru × toplam olasılığa göre sıralandı.
            </p>
          </div>

          {combos.map((combo, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="w-full p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-violet-900/50 border border-violet-700/50 rounded-lg
                                  flex items-center justify-center text-violet-300 font-bold text-sm">
                    #{i + 1}
                  </div>
                  <div className="text-left">
                    <p className="text-white font-bold text-sm">{combo.size}'lü Kombinasyon</p>
                    <p className="text-xs text-slate-500">En düşük: %{Math.round(combo.min_single * 100)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Kaydet butonu */}
                  <button
                    onClick={e => { e.stopPropagation(); saveCoupon(combo, i); }}
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
                    <p className="text-violet-400 font-black text-lg leading-none">
                      %{(combo.total_prob * 100).toFixed(1)}
                    </p>
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

                  {/* Kaydet butonu — açık durumda da göster */}
                  {!isSaved(combo) && (
                    <button
                      onClick={() => saveCoupon(combo, i)}
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
          <button
            onClick={() => setShowSaved(s => !s)}
            className="w-full flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-3"
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

          {showSaved && savedCoupons.map((saved, i) => (
            <div key={saved.id} className="bg-slate-900 border border-amber-900/30 rounded-2xl overflow-hidden">
              <button
                onClick={() => setSavedOpenIdx(savedOpenIdx === i ? null : i)}
                className="w-full p-4 flex items-center justify-between"
              >
                <div className="text-left">
                  <p className="text-white font-bold text-sm">{saved.combo.size}'lü Kupon</p>
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
                  {saved.combo.selections.map((sel, j) => (
                    <div key={j} className="border border-slate-700/50 bg-slate-800/40 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-slate-500">{sel.match}</span>
                        <span className="text-xs font-bold text-amber-400">%{Math.round(sel.probability * 100)}</span>
                      </div>
                      <p className="text-sm font-semibold text-white">{sel.label}</p>
                    </div>
                  ))}

                  {/* Metrik özeti */}
                  <div className="bg-slate-800/30 rounded-xl p-2.5">
                    <p className="text-[10px] text-slate-500 mb-1.5">Bu kupon şu metriklerle oluşturuldu:</p>
                    <div className="flex flex-wrap gap-1">
                      {METRIC_TAGS.map(tag => (
                        <span key={tag} className="text-[9px] bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
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
          ))}
        </div>
      )}
    </div>
  );
}
