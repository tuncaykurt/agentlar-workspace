"use client";
import { useState, useEffect, useRef } from "react";
import { getFixturesByDate, analyzeMatch } from "@/lib/api";
import type { Fixture, AnalysisResult } from "@/lib/api";
import MatchCard from "./MatchCard";
import { Search, Zap, Filter } from "lucide-react";

interface Props {
  model: string;
  onAnalyses: (a: AnalysisResult[]) => void;
}

const LEAGUES = [
  { name: "Tüm Ligler", id: 0 },
  { name: "Süper Lig", id: 203 },
  { name: "Premier League", id: 39 },
  { name: "La Liga", id: 140 },
  { name: "Serie A", id: 135 },
  { name: "Bundesliga", id: 78 },
  { name: "Ligue 1", id: 61 },
  { name: "Champions League", id: 2 },
  { name: "Europa League", id: 3 },
];

const STATUS_FILTERS = [
  { label: "Tümü", value: "all" },
  { label: "Yaklaşan", value: "upcoming" },
  { label: "Canlı", value: "live" },
  { label: "Bitti", value: "finished" },
];

const LIVE_STATUSES  = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE"]);
const DONE_STATUSES  = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

function statusLabel(fix: Fixture): string {
  if (LIVE_STATUSES.has(fix.status)) return fix.status === "HT" ? "HT" : `${fix.elapsed || 0}'`;
  if (DONE_STATUSES.has(fix.status)) return "Bitti";
  // Yaklaşan — saat göster
  const t = fix.date?.slice(11, 16);
  return t && t !== "00:00" ? t : "—";
}

export default function FixtureList({ model, onAnalyses }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]         = useState(today);
  const [leagueId, setLeagueId] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading]   = useState(false);
  const [analyses, setAnalyses] = useState<Record<number, AnalysisResult>>({});
  const [analyzing, setAnalyzing] = useState<Record<number, boolean>>({});
  const [error, setError]       = useState("");
  const analysesRef = useRef(analyses);
  analysesRef.current = analyses;

  useEffect(() => { loadFixtures(); }, []);

  const filtered = fixtures.filter(fix => {
    if (statusFilter === "upcoming")  return !LIVE_STATUSES.has(fix.status) && !DONE_STATUSES.has(fix.status);
    if (statusFilter === "live")      return LIVE_STATUSES.has(fix.status);
    if (statusFilter === "finished")  return DONE_STATUSES.has(fix.status);
    return true;
  });

  async function loadFixtures() {
    setLoading(true);
    setError("");
    setFixtures([]);
    setAnalyses({});
    try {
      const res = await getFixturesByDate(date, leagueId || undefined);
      setFixtures(res.fixtures);
      if (res.fixtures.length === 0) {
        setError("Bu tarihte maç bulunamadı.");
      } else {
        // Yaklaşan ilk 3 maçı otomatik analiz et
        const upcoming = res.fixtures.filter(
          f => !LIVE_STATUSES.has(f.status) && !DONE_STATUSES.has(f.status)
        ).slice(0, 3);
        for (const fix of upcoming) {
          analyzeOne(fix, res.fixtures);
        }
      }
    } catch {
      setError("API bağlantı hatası. Backend çalışıyor mu?");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeOne(fix: Fixture, currentFixtures?: Fixture[]) {
    setAnalyzing(p => ({ ...p, [fix.id]: true }));
    try {
      const res = await analyzeMatch({
        fixture_id:  fix.id,
        home_id:     fix.home.id,
        away_id:     fix.away.id,
        home_name:   fix.home.name,
        away_name:   fix.away.name,
        league_id:   fix.league_id,
        league_name: fix.league_name,
        match_date:  date,
        model,
      });
      // Functional update — stale closure sorunu olmaz
      setAnalyses(prev => {
        const updated = { ...prev, [fix.id]: res };
        onAnalyses(Object.values(updated));
        return updated;
      });
    } catch (e) {
      console.error("Analiz hatası:", e);
    } finally {
      setAnalyzing(p => ({ ...p, [fix.id]: false }));
    }
  }

  async function analyzeAll() {
    const targets = filtered.filter(
      f => !DONE_STATUSES.has(f.status) && !analyses[f.id]
    ).slice(0, 5);
    for (const fix of targets) await analyzeOne(fix);
  }

  const liveCount     = fixtures.filter(f => LIVE_STATUSES.has(f.status)).length;
  const analyzedCount = Object.keys(analyses).length;

  return (
    <div className="py-4 space-y-3">
      {/* Tarih + Arama */}
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
                     rounded-xl text-sm font-semibold transition-colors flex items-center gap-1"
        >
          {loading ? <span className="animate-spin">⟳</span> : <Search size={16} />}
        </button>
      </div>

      {/* Lig dropdown */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            value={leagueId}
            onChange={e => setLeagueId(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-2.5
                       text-sm text-white focus:outline-none focus:border-violet-500 appearance-none"
          >
            {LEAGUES.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Durum filtresi */}
      <div className="flex gap-1.5">
        {STATUS_FILTERS.map(sf => (
          <button
            key={sf.value}
            onClick={() => setStatusFilter(sf.value)}
            className={"flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors " +
              (statusFilter === sf.value
                ? "bg-violet-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white")}
          >
            {sf.label}
            {sf.value === "live" && liveCount > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[9px] px-1 rounded-full">{liveCount}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-800 rounded-xl p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {filtered.length} maç
            {analyzedCount > 0 && <span className="ml-2 text-violet-400">{analyzedCount} analiz edildi</span>}
          </span>
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
        {filtered.map(fix => (
          <MatchCard
            key={fix.id}
            fixture={fix}
            analysis={analyses[fix.id]}
            analyzing={analyzing[fix.id] || false}
            onAnalyze={() => analyzeOne(fix)}
            statusLabel={statusLabel(fix)}
          />
        ))}
      </div>
    </div>
  );
}
