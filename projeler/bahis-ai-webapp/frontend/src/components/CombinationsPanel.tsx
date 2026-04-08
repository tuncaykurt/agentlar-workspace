"use client";
import { useState } from "react";
import { buildCombinations } from "@/lib/api";
import type { AnalysisResult } from "@/lib/api";
import { Target, Zap, ChevronDown, ChevronUp } from "lucide-react";

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

export default function CombinationsPanel({ analyses }: Props) {
  const [comboSize, setComboSize]   = useState(3);
  const [minProb, setMinProb]       = useState(0.60);
  const [topN, setTopN]             = useState(5);
  const [combos, setCombos]         = useState<Combo[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [openIdx, setOpenIdx]       = useState<number | null>(0);

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
    } catch (e) {
      setError("Kombinasyon oluşturulamadı.");
    } finally {
      setLoading(false);
    }
  }

  const confBg: Record<string, string> = {
    high: "border-green-700/50 bg-green-950/30",
    medium: "border-yellow-700/50 bg-yellow-950/30",
    low: "border-slate-700 bg-slate-800/50",
  };

  return (
    <div className="py-4 space-y-4">
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

        {/* Combo büyüklüğü */}
        <div>
          <label className="text-xs text-slate-400 mb-2 block">Kombinasyon Büyüklüğü: <span className="text-white font-bold">{comboSize}</span></label>
          <input type="range" min={2} max={6} value={comboSize} onChange={e => setComboSize(+e.target.value)}
            className="w-full accent-violet-500" />
          <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
            <span>2'li</span><span>3'lü</span><span>4'lü</span><span>5'li</span><span>6'lı</span>
          </div>
        </div>

        {/* Min olasılık */}
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

        {/* Sonuç sayısı */}
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

      {/* Sonuçlar */}
      {combos.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">{combos.length} kombinasyon bulundu</p>
          {combos.map((combo, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              {/* Header */}
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
                    <p className="text-xs text-slate-500">
                      En düşük: %{Math.round(combo.min_single * 100)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
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
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{sel.reason.slice(0, 100)}</p>
                      )}
                    </div>
                  ))}

                  <div className="flex justify-between pt-2 border-t border-slate-800 text-xs">
                    <span className="text-slate-500">EV Skoru: {combo.ev_score.toFixed(4)}</span>
                    <span className="text-violet-400 font-bold">Toplam: %{(combo.total_prob * 100).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
