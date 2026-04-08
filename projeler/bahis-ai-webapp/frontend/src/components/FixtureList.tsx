"use client";
import { useState, useEffect } from "react";
import { getFixturesByDate, getLeagues, analyzeMatch } from "@/lib/api";
import type { Fixture, AnalysisResult } from "@/lib/api";
import MatchCard from "./MatchCard";
import { ChevronDown, Search, Zap } from "lucide-react";

interface Props {
  model: string;
  onAnalyses: (a: AnalysisResult[]) => void;
}

export default function FixtureList({ model, onAnalyses }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]         = useState(today);
  const [leagueId, setLeagueId] = useState<number | undefined>();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading]   = useState(false);
  const [analyses, setAnalyses] = useState<Record<number, AnalysisResult>>({});
  const [analyzing, setAnalyzing] = useState<Record<number, boolean>>({});
  const [quota, setQuota]       = useState<{ current: number; limit_day: number } | null>(null);
  const [error, setError]       = useState("");

  useEffect(() => {
    loadFixtures();
  }, []);

  const leagues = [
    { name: "Tümü", id: 0 },
    { name: "Süper Lig", id: 203 },
    { name: "Premier League", id: 39 },
    { name: "La Liga", id: 140 },
    { name: "Serie A", id: 135 },
    { name: "Bundesliga", id: 78 },
    { name: "Champions League", id: 2 },
    { name: "Europa League", id: 3 },
  ];

  async function loadFixtures() {
    setLoading(true);
    setError("");
    setFixtures([]);
    setAnalyses({});
    try {
      const res = await getFixturesByDate(date, leagueId || undefined);
      setFixtures(res.fixtures);
      if (res.fixtures.length === 0) setError("Bu tarihte maç bulunamadı.");
    } catch (e) {
      setError("API bağlantı hatası. Backend çalışıyor mu?");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeOne(fix: Fixture) {
    setAnalyzing(p => ({ ...p, [fix.id]: true }));
    try {
      const res = await analyzeMatch({
        fixture_id: fix.id,
        home_id: fix.home.id,
        away_id: fix.away.id,
        home_name: fix.home.name,
        away_name: fix.away.name,
        league_id: fix.league_id,
        league_name: fix.league_name,
        match_date: date,
        model,
      });
      const updated = { ...analyses, [fix.id]: res };
      setAnalyses(updated);
      onAnalyses(Object.values(updated));
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzing(p => ({ ...p, [fix.id]: false }));
    }
  }

  async function analyzeAll() {
    for (const fix of fixtures.slice(0, 5)) {
      await analyzeOne(fix);
    }
  }

  return (
    <div className="py-4 space-y-4">
      {/* Filtreler */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5
                       text-sm text-white focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={loadFixtures}
            disabled={loading}
            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50
                       rounded-xl text-sm font-semibold transition-colors"
          >
            {loading ? "..." : <Search size={16} />}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {leagues.map(l => (
            <button
              key={l.id}
              onClick={() => setLeagueId(l.id || undefined)}
              className={"shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors " +
                (leagueId === (l.id || undefined)
                  ? "bg-violet-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white")}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-800 rounded-xl p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {fixtures.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">{fixtures.length} maç bulundu</span>
          <button
            onClick={analyzeAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-900/50 hover:bg-violet-800/50
                       border border-violet-700/50 rounded-lg text-xs text-violet-300 transition-colors"
          >
            <Zap size={12} />
            İlk 5'i Analiz Et
          </button>
        </div>
      )}

      {/* Maç listesi */}
      <div className="space-y-3">
        {fixtures.map(fix => (
          <MatchCard
            key={fix.id}
            fixture={fix}
            analysis={analyses[fix.id]}
            analyzing={analyzing[fix.id] || false}
            onAnalyze={() => analyzeOne(fix)}
          />
        ))}
      </div>
    </div>
  );
}
