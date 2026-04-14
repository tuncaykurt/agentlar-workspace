"use client";
import { useState, useEffect, useRef } from "react";
import { getFixturesByDate, analyzeMatch } from "@/lib/api";
import type { Fixture, AnalysisResult } from "@/lib/api";
import MatchCard from "./MatchCard";
import { Search, Zap, Filter } from "lucide-react";

interface Props {
  model: string;
  onAnalyses: (a: AnalysisResult[]) => void;
  onFixtures?: (map: Record<number, string>) => void;
  statusFilter?: string;
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

const LIVE_STATUSES  = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE"]);
const DONE_STATUSES  = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

function toTurkeyTime(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    // Backend "YYYY-MM-DDTHH:MM" formatında UTC döndürür — Z ekleyerek parse et
    const utc = new Date(dateStr.length === 16 ? dateStr + ":00Z" : dateStr);
    const trMs = utc.getTime() + 3 * 60 * 60 * 1000;
    const tr = new Date(trMs);
    const h = String(tr.getUTCHours()).padStart(2, "0");
    const m = String(tr.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  } catch {
    return "—";
  }
}

function statusLabel(fix: Fixture): string {
  if (LIVE_STATUSES.has(fix.status)) return fix.status === "HT" ? "HT" : `${fix.elapsed || 0}'`;
  if (DONE_STATUSES.has(fix.status)) return "Bitti";
  return toTurkeyTime(fix.date);
}

const TIME_WINDOWS = [
  { label: "1 saat",   hours: 1 },
  { label: "2 saat",   hours: 2 },
  { label: "4 saat",   hours: 4 },
  { label: "6 saat",   hours: 6 },
  { label: "Bugün",    hours: 24 },
];

export default function FixtureList({ model, onAnalyses, onFixtures, statusFilter = "all" }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]         = useState(today);
  const [leagueId, setLeagueId] = useState(0);
  const [timeWindow, setTimeWindow] = useState(2); // saat — yaklaşan filtresi
  const [searchQuery, setSearchQuery] = useState("");
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading]   = useState(false);
  const [analyses, setAnalyses] = useState<Record<number, AnalysisResult>>({});
  const [analyzing, setAnalyzing] = useState<Record<number, boolean>>({});
  const [analyzeErrors, setAnalyzeErrors] = useState<Record<number, string>>({});
  const [error, setError]       = useState("");
  const analysesRef = useRef(analyses);
  analysesRef.current = analyses;

  useEffect(() => { loadFixtures(); }, []);

  function isUpcomingWithinWindow(fix: Fixture): boolean {
    if (LIVE_STATUSES.has(fix.status) || DONE_STATUSES.has(fix.status)) return false;
    try {
      const matchUtc = new Date(fix.date.length === 16 ? fix.date + ":00Z" : fix.date);
      const now = new Date();
      const diffHours = (matchUtc.getTime() - now.getTime()) / 3600000;
      return diffHours >= 0 && diffHours <= timeWindow;
    } catch { return false; }
  }

  const q = searchQuery.trim().toLowerCase();

  const filtered = fixtures.filter(fix => {
    if (statusFilter === "all")       { if (DONE_STATUSES.has(fix.status) || LIVE_STATUSES.has(fix.status)) return false; }
    else if (statusFilter === "upcoming")  { if (!isUpcomingWithinWindow(fix)) return false; }
    else if (statusFilter === "live")      { if (!LIVE_STATUSES.has(fix.status)) return false; }
    else if (statusFilter === "finished")  { if (!DONE_STATUSES.has(fix.status)) return false; }
    if (q) {
      const home = fix.home.name.toLowerCase();
      const away = fix.away.name.toLowerCase();
      if (!home.includes(q) && !away.includes(q)) return false;
    }
    return true;
  });

  async function loadFixtures() {
    setLoading(true);
    setError("");
    setFixtures([]);
    setAnalyses({});
    setAnalyzeErrors({});
    try {
      const res = await getFixturesByDate(date, leagueId || undefined);
      setFixtures(res.fixtures);
      if (onFixtures) {
        const map: Record<number, string> = {};
        res.fixtures.forEach(f => { map[f.id] = f.date; });
        onFixtures(map);
      }
      if (res.fixtures.length === 0) {
        setError("Bu tarihte maç bulunamadı.");
      } else {
        // Yaklaşan ilk 3 maçı otomatik analiz et
        const upcoming = res.fixtures.filter(
          f => !LIVE_STATUSES.has(f.status) && !DONE_STATUSES.has(f.status)
        ).slice(0, 3);
        for (const fix of upcoming) {
          analyzeOne(fix);
        }
      }
    } catch {
      setError("API bağlantı hatası. Backend çalışıyor mu?");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeOne(fix: Fixture) {
    setAnalyzing(p => ({ ...p, [fix.id]: true }));
    setAnalyzeErrors(p => { const n = {...p}; delete n[fix.id]; return n; });
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
      setAnalyses(prev => {
        const updated = { ...prev, [fix.id]: res };
        onAnalyses(Object.values(updated));
        return updated;
      });
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || "Analiz başarısız";
      setAnalyzeErrors(p => ({ ...p, [fix.id]: msg }));
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

  const analyzedCount = Object.keys(analyses).length;

  return (
    <div className="py-4 space-y-3">
      {/* Yaklaşan tabı → zaman penceresi filtresi */}
      {statusFilter === "upcoming" ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Önümüzdeki kaç saatteki maçları göster:</p>
          <div className="flex gap-2 flex-wrap">
            {TIME_WINDOWS.map(tw => (
              <button
                key={tw.hours}
                onClick={() => setTimeWindow(tw.hours)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  timeWindow === tw.hours
                    ? "bg-violet-600 text-white"
                    : "bg-slate-800 border border-slate-700 text-slate-400 hover:text-white"
                }`}
              >
                {tw.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Diğer tablar → tarih + arama */
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
      )}

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

      {/* Maç adı arama */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Takım adı ara..."
          className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-8 py-2.5
                     text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            ×
          </button>
        )}
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
            analyzeError={analyzeErrors[fix.id]}
            onAnalyze={() => analyzeOne(fix)}
            statusLabel={statusLabel(fix)}
          />
        ))}
      </div>
    </div>
  );
}
