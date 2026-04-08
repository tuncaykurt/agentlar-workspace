"use client";
import { useState } from "react";
import type { Fixture, AnalysisResult } from "@/lib/api";
import { ChevronDown, ChevronUp, Brain, AlertTriangle, Activity, MapPin, User, Trophy } from "lucide-react";

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

// xG sayısını sade Türkçeye çevir
function xgLabel(val: number): string {
  if (val >= 2.5) return `${val} gol (çok yüksek)`;
  if (val >= 1.8) return `${val} gol (yüksek)`;
  if (val >= 1.2) return `${val} gol (orta)`;
  if (val >= 0.7) return `${val} gol (düşük)`;
  return `${val} gol (çok düşük)`;
}

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
          {isValue && <span className="text-[9px] font-bold text-amber-400 bg-amber-950/60 px-1 rounded">DEĞER</span>}
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
          Beklenen kazanç: {ev > 0 ? "+" : ""}{(ev * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

export default function MatchCard({ fixture, analysis, analyzing, onAnalyze, statusLabel }: Props) {
  const [open, setOpen] = useState(false);
  const isLive    = new Set(["1H","2H","HT","ET","BT","P","LIVE"]).has(fixture.status);
  const isFinished = new Set(["FT","AET","PEN"]).has(fixture.status);
  const p       = analysis?.statistical?.probabilities;
  const xg      = analysis?.statistical?.expected_goals;
  const conf    = analysis?.statistical?.confidence ?? 0;
  const recs    = analysis?.ai?.data?.recommendations ?? [];
  const odds    = (analysis as any)?.odds;
  const ev      = (analysis as any)?.ev;
  const standings  = analysis?.statistical?.standings;
  const injuries   = analysis?.statistical?.injuries;
  const adjustments = analysis?.statistical?.adjustments;

  const homeSt = standings?.home;
  const awaySt = standings?.away;
  const valueCount = ev ? Object.values(ev).filter((v: any) => v.value).length : 0;
  const lowData = conf < 0.3 && analysis;

  return (
    <div className={`bg-slate-900 border rounded-2xl overflow-hidden ${
      isLive ? "border-red-800/40" : isFinished ? "border-slate-800/50" : "border-slate-800"
    }`}>
      {/* Maç başlığı */}
      <div className="p-4">
        {/* Lig + durum */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            {fixture.league_flag && (
              <img src={fixture.league_flag} alt="" className="w-3.5 h-3.5 object-contain" />
            )}
            <span className="text-xs text-slate-500">{fixture.league_name}</span>
            {fixture.round && (
              <span className="text-[10px] text-slate-600">· {fixture.round}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {valueCount > 0 && (
              <span className="text-[10px] font-bold text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-700/40">
                {valueCount} DEĞER
              </span>
            )}
            {isLive && (
              <span className="flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-950/50 px-2 py-0.5 rounded-full border border-red-800/50">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                CANLI {fixture.elapsed}'
              </span>
            )}
            <span className={`text-xs font-medium ${
              isFinished ? "text-slate-500" : isLive ? "text-red-400" : "text-violet-300"
            }`}>{statusLabel || fixture.date.slice(11,16)}</span>
          </div>
        </div>

        {/* Takımlar + skor */}
        <div className="flex items-center justify-between">
          <div className="flex-1 text-center">
            {fixture.home.logo && (
              <img src={fixture.home.logo} alt="" className="w-10 h-10 mx-auto mb-1 object-contain" />
            )}
            <p className={`text-sm font-semibold leading-tight ${fixture.home.winner ? "text-green-400" : "text-white"}`}>
              {fixture.home.name}
            </p>
            {homeSt?.rank && (
              <p className="text-[10px] text-slate-500 mt-0.5">{homeSt.rank}. sıra · {homeSt.points}pt</p>
            )}
          </div>

          <div className="px-3 text-center min-w-[70px]">
            {(isLive || isFinished) ? (
              <div>
                <div className="text-2xl font-bold text-white tracking-tight">
                  {fixture.home.goals ?? 0} – {fixture.away.goals ?? 0}
                </div>
                {fixture.halftime && isFinished && (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    İY: {fixture.halftime.home ?? 0}–{fixture.halftime.away ?? 0}
                  </div>
                )}
                {isFinished && <div className="text-[10px] text-slate-500 mt-0.5">Bitti</div>}
              </div>
            ) : (
              <div className="text-slate-500 font-medium">VS</div>
            )}
            {p && (
              <div className="flex gap-0.5 mt-1.5 justify-center text-[10px]">
                <span className="text-green-400 font-bold">%{Math.round(p.home_win * 100)}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">%{Math.round(p.draw * 100)}</span>
                <span className="text-slate-600">·</span>
                <span className="text-blue-400 font-bold">%{Math.round(p.away_win * 100)}</span>
              </div>
            )}
          </div>

          <div className="flex-1 text-center">
            {fixture.away.logo && (
              <img src={fixture.away.logo} alt="" className="w-10 h-10 mx-auto mb-1 object-contain" />
            )}
            <p className={`text-sm font-semibold leading-tight ${fixture.away.winner ? "text-green-400" : "text-white"}`}>
              {fixture.away.name}
            </p>
            {awaySt?.rank && (
              <p className="text-[10px] text-slate-500 mt-0.5">{awaySt.rank}. sıra · {awaySt.points}pt</p>
            )}
          </div>
        </div>

        {/* Stadyum + Hakem */}
        {(fixture.venue || fixture.referee) && (
          <div className="flex items-center justify-center gap-3 mt-2.5">
            {fixture.venue && (
              <div className="flex items-center gap-1">
                <MapPin size={10} className="text-slate-600" />
                <span className="text-[10px] text-slate-600">{fixture.venue}{fixture.venue_city ? `, ${fixture.venue_city}` : ""}</span>
              </div>
            )}
            {fixture.referee && (
              <div className="flex items-center gap-1">
                <User size={10} className="text-slate-600" />
                <span className="text-[10px] text-slate-600">{fixture.referee}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Analiz bölümü */}
      <div className="px-4 pb-4 space-y-3">
        {/* Düşük veri uyarısı */}
        {lowData && (
          <div className="bg-orange-950/30 border border-orange-800/40 rounded-xl p-2.5 flex items-start gap-2">
            <AlertTriangle size={13} className="text-orange-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-orange-300/80">
              Bu maç için yeterli geçmiş veri yok (%{Math.round(conf*100)} güven). Tahminler daha az güvenilir.
            </p>
          </div>
        )}

        {!analysis && !isFinished && (
          <button
            onClick={onAnalyze}
            disabled={analyzing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-violet-600/20 hover:bg-violet-600/30 border border-violet-700/40
                       text-violet-300 text-sm font-medium transition-all disabled:opacity-50"
          >
            <Brain size={15} className={analyzing ? "animate-pulse" : ""} />
            {analyzing ? "Analiz Ediliyor..." : "AI ile Analiz Et"}
          </button>
        )}

        {analysis && (
          <>
            {/* Tahmini goller */}
            {xg && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-800/60 rounded-xl p-2">
                  <p className="text-[10px] text-slate-500 mb-0.5">{fixture.home.name.split(" ")[0]}</p>
                  <p className="text-base font-bold text-white">{xg.home}</p>
                  <p className="text-[9px] text-slate-600">tahmini gol</p>
                </div>
                <div className="bg-violet-900/30 rounded-xl p-2 border border-violet-800/30">
                  <p className="text-[10px] text-slate-500 mb-0.5">Toplam</p>
                  <p className="text-base font-bold text-violet-400">{xg.total}</p>
                  <p className="text-[9px] text-slate-600">tahmini gol</p>
                </div>
                <div className="bg-slate-800/60 rounded-xl p-2">
                  <p className="text-[10px] text-slate-500 mb-0.5">{fixture.away.name.split(" ")[0]}</p>
                  <p className="text-base font-bold text-white">{xg.away}</p>
                  <p className="text-[9px] text-slate-600">tahmini gol</p>
                </div>
              </div>
            )}

            {/* Odds */}
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
                    { key: "home_win", label: "Ev Kazanır", oddsVal: odds.odds?.home },
                    { key: "draw",     label: "Beraberlik", oddsVal: odds.odds?.draw },
                    { key: "away_win", label: "Dep Kazanır", oddsVal: odds.odds?.away },
                  ].map(({ key, label, oddsVal }) => {
                    const evItem = ev?.[key];
                    const isVal = evItem?.value;
                    return (
                      <div key={key} className={`rounded-lg p-2 ${isVal ? "bg-amber-950/40 border border-amber-700/40" : "bg-slate-800/60"}`}>
                        <p className="text-[10px] text-slate-500">{label}</p>
                        <p className={`text-sm font-bold ${isVal ? "text-amber-400" : "text-white"}`}>{oddsVal?.toFixed(2)}</p>
                        {evItem && (
                          <p className={`text-[9px] ${isVal ? "text-amber-400 font-bold" : "text-slate-600"}`}>
                            {evItem.ev > 0 ? "+" : ""}{(evItem.ev * 100).toFixed(1)}%
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI özeti */}
            {analysis.ai?.data?.summary && (
              <div className="bg-violet-950/30 border border-violet-800/30 rounded-xl p-3">
                <p className="text-xs text-violet-300 leading-relaxed">{analysis.ai.data.summary}</p>
              </div>
            )}

            {/* Öne çıkan öneri */}
            {recs[0] && (
              <div className={`border rounded-xl p-3 ${confColor[recs[0].confidence] || confColor.medium}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold">{recs[0].label}</span>
                  <span className="text-lg font-black">%{Math.round(recs[0].probability * 100)}</span>
                </div>
                <p className="text-[11px] opacity-80 leading-relaxed">{recs[0].reason}</p>
              </div>
            )}

            {/* Detay */}
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
                    <div className="flex items-center gap-1.5 mb-2">
                      <Trophy size={11} className="text-amber-400" />
                      <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wide">Lig Durumu</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { st: homeSt, name: fixture.home.name },
                        { st: awaySt, name: fixture.away.name }
                      ].map(({ st, name }) => st?.rank ? (
                        <div key={name} className="text-center">
                          <p className="text-[10px] text-slate-400 font-medium truncate">{name}</p>
                          <p className="text-sm font-bold text-white">{st.rank}. sıra · {st.points}pt</p>
                          <p className="text-[10px] text-slate-500">{st.won}G {st.drawn}B {st.lost}M</p>
                          {st.description && <p className="text-[9px] text-amber-400 mt-0.5">{st.description}</p>}
                          {st.form && (
                            <p className="text-[10px] font-mono tracking-wider mt-1">
                              {st.form.slice(-5).split("").map((c: string, i: number) => (
                                <span key={i} className={c==="W" ? "text-green-400" : c==="D" ? "text-yellow-400" : "text-red-400"}>{c}</span>
                              ))}
                            </p>
                          )}
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )}

                {/* Motivasyon / Sakatlık faktörleri */}
                {adjustments && (
                  <div className="bg-slate-800/30 rounded-xl p-3 space-y-1.5">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-2">Düzeltme Faktörleri</p>
                    {[
                      { label: `${fixture.home.name} motivasyon`, val: adjustments.home_motivation },
                      { label: `${fixture.away.name} motivasyon`, val: adjustments.away_motivation },
                      { label: `${fixture.home.name} sakatlık etkisi`, val: adjustments.home_injury_factor },
                      { label: `${fixture.away.name} sakatlık etkisi`, val: adjustments.away_injury_factor },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-500">{label}</span>
                        <span className={`text-[10px] font-semibold ${val > 1 ? "text-green-400" : val < 1 ? "text-red-400" : "text-slate-400"}`}>
                          {val > 1 ? "+" : ""}{((val - 1) * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sakatlıklar */}
                {injuries && (injuries.home_count > 0 || injuries.away_count > 0) && (
                  <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-3">
                    <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wide mb-2">
                      Sakatlık / Ceza (Ev: {injuries.home_count} · Dep: {injuries.away_count})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { list: injuries.home?.slice(0,4), name: fixture.home.name },
                        { list: injuries.away?.slice(0,4), name: fixture.away.name },
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
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Olasılıklar</p>
                    <div className="grid grid-cols-2 gap-2">
                      <ProbBar label="Ev Kazanır" value={p.home_win} highlight={p.home_win > 0.5}
                        odds={odds?.odds?.home} ev={ev?.home_win?.ev} />
                      <ProbBar label="Beraberlik" value={p.draw}
                        odds={odds?.odds?.draw} ev={ev?.draw?.ev} />
                      <ProbBar label="Dep Kazanır" value={p.away_win} highlight={p.away_win > 0.5}
                        odds={odds?.odds?.away} ev={ev?.away_win?.ev} />
                      <ProbBar label="Karşılıklı Gol" value={p.btts} highlight={p.btts > 0.55} />
                      <ProbBar label="Üst 2.5 Gol" value={p.over_2_5} highlight={p.over_2_5 > 0.55} />
                      <ProbBar label="Alt 2.5 Gol" value={p.under_2_5} highlight={p.under_2_5 > 0.55} />
                      <ProbBar label="Üst 1.5 Gol" value={p.over_1_5} highlight={p.over_1_5 > 0.7} />
                      <ProbBar label="Üst 3.5 Gol" value={p.over_3_5} highlight={p.over_3_5 > 0.45} />
                      <ProbBar label="Çifte Şans 1X" value={p.double_1x} />
                      <ProbBar label="Çifte Şans X2" value={p.double_x2} />
                    </div>
                  </div>
                )}

                {/* Tüm AI önerileri */}
                {recs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">AI Önerileri</p>
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
                              {r.risk === "low" ? "Az riskli" : r.risk === "high" ? "Yüksek risk" : "Orta risk"}
                            </span>
                            <span className="text-base font-black">%{Math.round(r.probability * 100)}</span>
                          </div>
                        </div>
                        <p className="text-[11px] opacity-75 leading-relaxed">{r.reason}</p>
                      </div>
                    ))}
                  </div>
                )}

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

                {/* Alt bilgi */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[9px] text-slate-600">
                    Veri güveni: %{Math.round(conf * 100)}
                    {conf < 0.3 ? " · Az veri" : conf < 0.6 ? " · Orta" : " · İyi"}
                  </span>
                  <span className="text-[9px] text-slate-600">{analysis.ai?.model?.split("/").pop()}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
