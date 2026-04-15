import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  timeout: 180000, // 3 dakika — ilk analizde DB cache yok, 7+ API çağrısı + AI süresi
});

export interface Fixture {
  id: number;
  date: string;
  status: string;
  elapsed?: number;
  league_id: number;
  league_name: string;
  league_logo?: string;
  league_flag?: string;
  season: number;
  round?: string;
  venue?: string;
  venue_city?: string;
  referee?: string;
  halftime?: { home: number | null; away: number | null };
  home: { id: number; name: string; logo: string; goals?: number; winner?: boolean };
  away: { id: number; name: string; logo: string; goals?: number; winner?: boolean };
}

export interface AnalysisResult {
  fixture_id: number;
  home: string;
  away: string;
  league: string;
  statistical: {
    probabilities: Record<string, number>;
    expected_goals: { home: number; away: number; total: number };
    form: { home: number; away: number };
    h2h: { total: number; home_wins: number; draws: number; away_wins: number; avg_goals: number };
    standings?: {
      home: Record<string, any>;
      away: Record<string, any>;
    };
    injuries?: {
      home: Array<{ name: string; type: string; reason: string }>;
      away: Array<{ name: string; type: string; reason: string }>;
      home_count: number;
      away_count: number;
    };
    adjustments?: {
      home_motivation: number;
      away_motivation: number;
      home_injury_factor: number;
      away_injury_factor: number;
    };
    averages?: {
      home: { scored: number; conceded: number; total: number };
      away: { scored: number; conceded: number; total: number };
    };
    confidence: number;
  };
  odds?: {
    available: boolean;
    bookmaker?: string;
    odds?: { home: number; draw: number; away: number };
    implied_probs?: { home: number; draw: number; away: number };
    overround?: number;
  };
  ev?: Record<string, { ev: number; value: boolean; odds: number; our_prob: number }>;
  ai: {
    success: boolean;
    model: string;
    data?: {
      summary: string;
      key_factors: string[];
      recommendations: Array<{
        type: string; label: string; probability: number;
        confidence: string; reason: string; risk: string;
      }>;
      avoid: string[];
      overall_confidence: number;
    };
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────
export const getFixturesByDate = (date: string, leagueId?: number) =>
  api.get<{ date: string; count: number; fixtures: Fixture[] }>(
    `/fixtures/date/${date}`,
    { params: leagueId ? { league_id: leagueId } : {} }
  ).then(r => r.data);

export const getLiveFixtures = (leagueId?: number) =>
  api.get<{ count: number; fixtures: Fixture[] }>(
    "/fixtures/live",
    { params: leagueId ? { league_id: leagueId } : {} }
  ).then(r => r.data);

export const getLeagues = () =>
  api.get<Array<{ name: string; id: number }>>("/fixtures/leagues").then(r => r.data);

export const getQuota = () =>
  api.get<{ current: number; limit_day: number }>("/fixtures/quota").then(r => r.data);

// ── Analysis ──────────────────────────────────────────────────────────────
export const analyzeMatch = (payload: {
  fixture_id: number; home_id: number; away_id: number;
  home_name: string; away_name: string; league_id: number;
  league_name: string; match_date?: string; model?: string;
}) => api.post<AnalysisResult>("/analysis/match", payload).then(r => r.data);

export const getModels = () =>
  api.get<Array<{ id: string; model: string }>>("/analysis/models").then(r => r.data);

export const getLiveStats = (fixtureId: number) =>
  api.get(`/analysis/live-stats/${fixtureId}`).then(r => r.data);

// ── Combinations ──────────────────────────────────────────────────────────
export const buildCombinations = (payload: {
  analyses: AnalysisResult[];
  combo_size: number;
  min_probability: number;
  top_n: number;
}) => api.post("/combinations/build", payload).then(r => r.data);
