"use client";
import { useState, useEffect } from "react";
import { getLiveFixtures, analyzeMatch, getLiveStats } from "@/lib/api";
import type { Fixture, AnalysisResult } from "@/lib/api";
import { RefreshCw, Radio } from "lucide-react";

interface Props { model: string; }

export default function LivePanel({ model }: Props) {
  const [fixtures, setFixtures]     = useState<Fixture[]>([]);
  const [analyses, setAnalyses]     = useState<Record<number, AnalysisResult>>({});
  const [stats, setStats]           = useState<Record<number, any>>({});
  const [loading, setLoading]       = useState(false);
  const [analyzing, setAnalyzing]   = useState<Record<number, boolean>>({});
  const [lastUpdate, setLastUpdate] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await getLiveFixtures();
      setFixtures(res.fixtures);
      setLastUpdate(new Date().toLocaleTimeString("tr-TR"));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function analyze(fix: Fixture) {
    setAnalyzing(p => ({ ...p, [fix.id]: true }));
    try {
      const [analysis, liveStats] = await Promise.all([
        analyzeMatch({
          fixture_id: fix.id, home_id: fix.home.id, away_id: fix.away.id,
          home_name: fix.home.name, away_name: fix.away.name,
          league_id: fix.league_id, league_name: fix.league_name, model,
        }),
        getLiveStats(fix.id),
      ]);
      setAnalyses(p => ({ ...p, [fix.id]: analysis }));
      setStats(p => ({ ...p, [fix.id]: liveStats }));
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzing(p => ({ ...p, [fix.id]: false }));
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-red-400 animate-pulse" />
          <h2 className="font-bold text-white">Canlı Maçlar</h2>
          {fixtures.length > 0 && (
            <span className="bg-red-950/50 border border-red-800/50 text-red-400 text-xs px-2 py-0.5 rounded-full">
              {fixtures.length}
            </span>
          )}
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors">
          <RefreshCw size={15} className={`text-slate-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {lastUpdate && (
        <p className="text-[11px] text-slate-600">Son güncelleme: {lastUpdate}</p>
      )}

      {fixtures.length === 0 && !loading && (
        <div className="text-center py-16 space-y-3">
          <Radio size={48} className="text-slate-700 mx-auto" />
          <p className="text-slate-500">Şu an canlı maç yok</p>
          <button onClick={load} className="text-violet-400 text-sm hover:text-violet-300">Yenile</button>
        </div>
      )}

      <div className="space-y-4">
        {fixtures.map(fix => {
          const a = analyses[fix.id];
          const s = stats[fix.id];
          const recs = a?.ai?.data?.recommendations ?? [];
          const homeStats = s?.stats?.[0]?.statistics ?? [];
          const awayStats = s?.stats?.[1]?.statistics ?? [];

          const getStat = (arr: any[], type: string) =>
            arr.find((x: any) => x.type === type)?.value ?? "-";

          return (
            <div key={fix.id} className="bg-slate-900 border border-red-900/30 rounded-2xl overflow-hidden">
              {/* Skor */}
              <div className="p-4 bg-gradient-to-b from-red-950/20 to-transparent">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">{fix.league_name}</span>
                  <span className="flex items-center gap-1 text-xs font-bold text-red-400">
                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                    {fix.elapsed}'
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="flex-1 text-center font-bold text-white text-sm">{fix.home.name}</p>
                  <div className="px-4 text-center">
                    <p className="text-2xl font-black text-white tracking-widest">
                      {fix.home.goals ?? 0} - {fix.away.goals ?? 0}
                    </p>
                  </div>
                  <p className="flex-1 text-center font-bold text-white text-sm">{fix.away.name}</p>
                </div>
              </div>

              {/* Canlı istatistikler */}
              {homeStats.length > 0 && (
                <div className="px-4 pb-3 space-y-1.5">
                  {[
                    "Ball Possession", "Total Shots", "Shots on Goal", "Corner Kicks", "Yellow Cards"
                  ].map(type => {
                    const h = getStat(homeStats, type);
                    const a = getStat(awayStats, type);
                    return (
                      <div key={type} className="flex items-center gap-2 text-xs">
                        <span className="text-green-400 font-bold w-8 text-right">{h}</span>
                        <div className="flex-1 text-center text-slate-500 text-[10px]">{type}</div>
                        <span className="text-blue-400 font-bold w-8">{a}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Analiz */}
              <div className="px-4 pb-4 space-y-2">
                {!a && (
                  <button onClick={() => analyze(fix)} disabled={analyzing[fix.id]}
                    className="w-full py-2.5 rounded-xl bg-violet-600/20 border border-violet-700/40
                               text-violet-300 text-sm font-medium hover:bg-violet-600/30 transition-all
                               disabled:opacity-50">
                    {analyzing[fix.id] ? "Analiz Ediliyor..." : "Canlı Analiz Yap"}
                  </button>
                )}

                {a && recs.slice(0, 3).map((r, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-800/60 rounded-xl px-3 py-2">
                    <span className="text-sm text-white">{r.label}</span>
                    <span className={`text-sm font-black ${r.probability >= 0.70 ? "text-green-400" : "text-yellow-400"}`}>
                      %{Math.round(r.probability * 100)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
