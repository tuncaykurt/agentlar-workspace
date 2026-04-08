"use client";
import { useState } from "react";
import type { Fixture, AnalysisResult } from "@/lib/api";
import { ChevronDown, ChevronUp, Brain, TrendingUp, AlertTriangle, Activity } from "lucide-react";

interface Props {
  fixture: Fixture;
  analysis?: AnalysisResult;
  analyzing: boolean;
  onAnalyze: () => void;
  statusLabel?: string;
}

const confColor: Record<string, string> = {
  high:   "text-green-400 bg-green-950/60 border-green-800/50",
  medium: "text-yellow-400 bg-yellow-950/60 border-yellow-800/50",
  low:    "text-red-400 bg-red-950/60 border-red-800/50",
};

function ProbBar({ label, value, highlight, odds, ev }: {
  label: string; value: number; highlight?: boolean;
  odds?: number; ev?: number;
}) {
  const pct = Math.round(value * 100);
  const color = pct >= 65 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-slate-600";
  const isValue = ev !== undefined && ev > 0.05;
  return (
    <div className={`rounded-lg p-2.5 ${highlight ? "bg-slate-700/70" : "bg-slate-800/50"} ${isValue ? "ring-1 ring-amber-500/50" : ""}`}>
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-400">{label}</span>
          {isValue && <span className="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1 rounded">VALUE</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {odds && <span className="text-[10px] text-slate-500">{odds.toFixed(2)}</span>}
          <span className={`text-sm font-bold ${pct >= 65 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-slate-400"}`}>
            %{pct}
          </span>
        </div>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {ev !== undefined && (
        <div className={`text-[10px] mt-1 ${ev > 0.05 ? "text-amber-400 font-semibold" : "text-slate-600"}`}>
          EV: {ev > 0 ? "+" : ""}{(ev * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function StandingBadge({ standing, label }: { standing: any; label: string }) {
  if (!standing || !standing.rank) return null;
  const rank = standing.rank;
  const total = standing.total_teams || 20;
  const ratio = rank / total;
  const color = ratio <= 0.15 ? "text-amber-400" : ratio >= 0.85 ? "text-red-400" : "text-slate-400";
  return (
    <div className="text-center">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`text-xs font-bold ${color}`}>{rank}. sıra</p>
      <p className="text-[10px] text-slate-500">{standing.points} pt</p>
    </div>
  );
}

export default function MatchCard({ fixture, analysis, analyzing, onAnalyze, statusLabel }: Props) {
  const [open, setOpen] = useState(false);
  const isLive = fixture.status === "1H" || fixture.status === "2H" || fixture.status === "HT";
  const p    = analysis?.statistical?.probabilities;
  const xg   = analysis?.statistical?.expected_goals;
  const recs = analysis?.ai?.data?.recommendations ?? [];
  const odds = (analysis as any)?.odds;
  const ev   = (analysis as any)?.ev;
  const standings = analysis?.statistical?.standings;
  const injuries  = analysis?.statistical?.injuries;

  const homeSt = standings?.home;
  const awaySt = standings?.away;

  const valueCount = ev ? Object.values(ev).filter((v: any) => v.value).length : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Maç başlığı */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-500">{fixture.league_name}</span>
          <div className="flex items-center gap-2">
            {valueCount > 0 && (
              <span className="text-[10px] font-bold text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-700/40">
                {valueCount} VALUE BET
              </span>
            )}
            {isLive && (
              <span className="flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-950/50 px-2 py-0.5 rounded-full border border-red-800/50">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                CANLI {fixture.elapsed}'
              </span>
            )}
            <span className={`text-xs font-medium ${
              fixture.status === "FT" || fixture.status === "AET" ? "text-slate-500" :
              isLive ? "text-red-400" : "text-slate-400"
            }`}>{statusLabel || fixture.date.slice(11, 16)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          {/* Ev Sahibi */}
          <div className="flex-1 text-center">
            {fixture.home.logo && (
              <img src={fixture.home.logo} alt="" className="w-8 h-8 mx-auto mb-1 object-contain" />
            )}
            <p className="text-sm font-semibold text-white leading-tight">{fixture.home.name}</p>
            {homeSt?.rank && (
              <p className="text-[10px] text-slate-500 mt-0.5">{homeSt.rank}. sıra · {homeSt.points}pt</p>
            )}
          </div>

          {/* Skor / VS */}
          <div className="px-4 text-center min-w-[60px]">
            {isLive || fixture.status === "FT" ? (
              <div className="text-xl font-bold text-white">
                {fixture.home.goals ?? 0} - {fixture.away.goals ?? 0}
              </div>
            ) : (
              <div className="text-slate-500 text-sm font-medium">VS</div>
            )}
            {p && (
              <div className="flex gap-1 mt-1 justify-center text-[10px]">
                <span className="text-green-400 font-bold">%{Math.round(p.home_win * 100)}</span>
                <span className="text-slate-500">-</span>
                <span className="text-slate-400">%{Math.round(p.draw * 100)}</span>
                <span className="text-slate-500">-</span>
                <span className="text-blue-400 font-bold">%{Math.round(p.away_win * 100)}</span>
              </div>
            )}
          </div>

          {/* Deplasman */}
          <div className="flex-1 text-center">
            {fixture.away.logo && (
              <img src={fixture.away.logo} alt="" className="w-8 h-8 mx-auto mb-1 object-contain" />
            )}
            <p className="text-sm font-semibold text-white leading-tight">{fixture.away.name}</p>
            {awaySt?.rank && (
              <p className="text-[10px] text-slate-500 mt-0.5">{awaySt.rank}. sıra · {awaySt.points}pt</p>
            )}
          </div>
        </div>
      </div>

      {/* Analiz butonu / özeti */}
      <div className="px-4 pb-4 space-y-3">
        {!analysis && (
          <button
            onClick={onAnalyze}
            disabled={analyzing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-violet-600/20 hover:bg-violet-600/30 border border-violet-700/40
                       text-violet-300 text-sm font-medium transition-all disabled:opacity-50"
          >
            <Brain size={15} className={analyzing ? "animate-pulse" : ""} />
            {analyzing ? "AI Analiz Ediliyor..." : "AI ile Analiz Et"}
          </button>
        )}

        {analysis && (
          <>
            {/* xG + Sakatlık özeti */}
            {xg && (
              <div className="flex gap-2 text-center">
                <div className="flex-1 bg-slate-800/60 rounded-xl p-2">
                  <p className="text-[10px] text-slate-500 mb-0.5">xG Ev</p>
                  <p className="text-base font-bold text-white">{xg.home}</p>
                </div>
                <div className="flex-1 bg-slate-800/60 rounded-xl p-2">
                  <p className="text-[10px] text-slate-500 mb-0.5">Toplam xG</p>
                  <p className="text-base font-bold text-violet-400">{xg.total}</p>
                </div>
                <div className="flex-1 bg-slate-800/60 rounded-xl p-2">
                  <p className="text-[10px] text-slate-500 mb-0.5">xG Dep</p>
                  <p className="text-base font-bold text-white">{xg.away}</p>
                </div>
              </div>
            )}

            {/* Odds satırı */}
            {odds?.available && (
              <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity size={12} className="text-amber-400" />
                  <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wide">
                    {odds.bookmaker} Oranları
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { key: "home_win", label: "1", oddsVal: odds.odds?.home },
                    { key: "draw",     label: "X", oddsVal: odds.odds?.draw },
                    { key: "away_win", label: "2", oddsVal: odds.odds?.away },
                  ].map(({ key, label, oddsVal }) => {
                    const evItem = ev?.[key];
                    const isVal = evItem?.value;
                    return (
                      <div key={key} className={`rounded-lg p-2 ${isVal ? "bg-amber-950/40 border border-amber-700/40" : "bg-slate-800/60"}`}>
                        <p className="text-[10px] text-slate-500">{label}</p>
                        <p className={`text-sm font-bold ${isVal ? "text-amber-400" : "text-white"}`}>{oddsVal?.toFixed(2)}</p>
                        {evItem && (
                          <p className={`text-[9px] ${isVal ? "text-amber-400 font-bold" : "text-slate-600"}`}>
                            EV {evItem.ev > 0 ? "+" : ""}{(evItem.ev * 100).toFixed(1)}%
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI Özeti */}
            {analysis.ai?.data?.summary && (
              <div className="bg-violet-950/30 border border-violet-800/30 rounded-xl p-3">
                <p className="text-xs text-violet-300 leading-relaxed">{analysis.ai.data.summary}</p>
              </div>
            )}

            {/* Top Öneri */}
            {recs[0] && (
              <div className={`border rounded-xl p-3 ${confColor[recs[0].confidence] || confColor.medium}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold">{recs[0].label}</span>
                  <span className="text-lg font-black">%{Math.round(recs[0].probability * 100)}</span>
                </div>
                <p className="text-[11px] opacity-80 leading-relaxed">{recs[0].reason}</p>
              </div>
            )}

            {/* Detay aç/kapat */}
            <button
              onClick={() => setOpen(o => !o)}
              className="w-full flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors py-1"
            >
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {open ? "Kapat" : `Tüm Analizler (${recs.length} öneri)`}
            </button>

            {open && (
              <div className="space-y-3 pt-1">
                {/* Puan tablosu */}
                {(homeSt?.rank || awaySt?.rank) && (
                  <div className="bg-slate-800/40 rounded-xl p-3">
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide mb-2">Puan Tablosu</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ st: homeSt, name: fixture.home.name }, { st: awaySt, name: fixture.away.name }].map(({ st, name }) =>
                        st?.rank ? (
                          <div key={name} className="text-center">
                            <p className="text-[10px] text-slate-400 font-medium truncate">{name}</p>
                            <p className="text-sm font-bold text-white">{st.rank}. sıra · {st.points}pt</p>
                            <p className="text-[10px] text-slate-500">{st.won}G {st.drawn}B {st.lost}M · AG{st.goal_diff > 0 ? "+" : ""}{st.goal_diff}</p>
                            {st.description && <p className="text-[9px] text-amber-400 mt-0.5">{st.description}</p>}
                            {st.form && <p className="text-[10px] font-mono tracking-wider mt-1">
                              {st.form.slice(-5).split("").map((c: string, i: number) => (
                                <span key={i} className={c === "W" ? "text-green-400" : c === "D" ? "text-yellow-400" : "text-red-400"}>{c}</span>
                              ))}
                            </p>}
                          </div>
                        ) : null
                      )}
                    </div>
                  </div>
                )}

                {/* Sakatlıklar */}
                {injuries && (injuries.home_count > 0 || injuries.away_count > 0) && (
                  <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-3">
                    <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wide mb-2">
                      Sakatlıklar (Ev: {injuries.home_count} · Dep: {injuries.away_count})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { list: injuries.home?.slice(0, 4), name: fixture.home.name },
                        { list: injuries.away?.slice(0, 4), name: fixture.away.name },
                      ].map(({ list, name }) => list?.length > 0 && (
                        <div key={name}>
                          <p className="text-[10px] text-slate-400 font-medium mb-1">{name}</p>
                          {list.map((inj: any, i: number) => (
                            <p key={i} className="text-[10px] text-red-300/70">• {inj.name}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Olasılık barları */}
                {p && (
                  <div className="grid grid-cols-2 gap-2">
                    <ProbBar label="Ev Kazanır" value={p.home_win} highlight={p.home_win > 0.5}
                      odds={odds?.odds?.home} ev={ev?.home_win?.ev} />
                    <ProbBar label="Beraberlik" value={p.draw}
                      odds={odds?.odds?.draw} ev={ev?.draw?.ev} />
                    <ProbBar label="Dep Kazanır" value={p.away_win} highlight={p.away_win > 0.5}
                      odds={odds?.odds?.away} ev={ev?.away_win?.ev} />
                    <ProbBar label="Karşılıklı Gol" value={p.btts} highlight={p.btts > 0.55} />
                    <ProbBar label="Üst 2.5" value={p.over_2_5} highlight={p.over_2_5 > 0.55} />
                    <ProbBar label="Üst 1.5" value={p.over_1_5} highlight={p.over_1_5 > 0.7} />
                    <ProbBar label="Çifte Şans 1X" value={p.double_1x} />
                    <ProbBar label="Çifte Şans X2" value={p.double_x2} />
                  </div>
                )}

                {/* Tüm AI önerileri */}
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">AI Önerileri</p>
                  {recs.map((r: any, i: number) => (
                    <div key={i} className={`border rounded-xl p-3 ${confColor[r.confidence] || confColor.medium}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">{r.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            r.risk === "low" ? "bg-green-950/60 text-green-400" :
                            r.risk === "high" ? "bg-red-950/60 text-red-400" :
                            "bg-yellow-950/60 text-yellow-400"
                          }`}>
                            {r.risk === "low" ? "Düşük Risk" : r.risk === "high" ? "Yüksek Risk" : "Orta Risk"}
                          </span>
                          <span className="text-base font-black">%{Math.round(r.probability * 100)}</span>
                        </div>
                      </div>
                      <p className="text-[11px] opacity-75 leading-relaxed">{r.reason}</p>
                    </div>
                  ))}
                </div>

                {/* Kaçınılacaklar */}
                {analysis.ai?.data?.avoid && analysis.ai.data.avoid.length > 0 && (
                  <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertTriangle size={13} className="text-red-400" />
                      <span className="text-xs text-red-400 font-semibold">Kaçınılacaklar</span>
                    </div>
                    {analysis.ai.data.avoid.map((a: string, i: number) => (
                      <p key={i} className="text-xs text-red-300/70 leading-relaxed">• {a}</p>
                    ))}
                  </div>
                )}

                {/* Model + güven */}
                <p className="text-[10px] text-slate-600 text-right">
                  Model: {analysis.ai?.model} · Güven: %{Math.round((analysis.ai?.data?.overall_confidence ?? analysis.statistical.confidence) * 100)}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
