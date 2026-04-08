"use client";
import { useState } from "react";
import FixtureList from "@/components/FixtureList";
import CombinationsPanel from "@/components/CombinationsPanel";
import LivePanel from "@/components/LivePanel";
import { Calendar, Target, Radio, Clock, CheckCircle } from "lucide-react";
import type { AnalysisResult } from "@/lib/api";

const MODELS = [
  { id: "claude-opus",   label: "Claude Opus" },
  { id: "claude-sonnet", label: "Claude Sonnet" },
  { id: "gpt-4o",        label: "GPT-4o" },
  { id: "gemini-pro",    label: "Gemini Pro" },
  { id: "llama-70b",     label: "Llama 70B" },
  { id: "deepseek",      label: "DeepSeek" },
];

const TABS = [
  { id: "all",      label: "Günlük",     icon: Calendar,    status: "all" },
  { id: "upcoming", label: "Yaklaşan",   icon: Clock,       status: "upcoming" },
  { id: "live",     label: "Canlı",      icon: Radio,       status: "live" },
  { id: "finished", label: "Bitti",      icon: CheckCircle, status: "finished" },
  { id: "combos",   label: "Kupon",      icon: Target,      status: null },
];

export default function Home() {
  const [tab, setTab]           = useState("all");
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [model, setModel]       = useState("claude-opus");

  const activeStatus = TABS.find(t => t.id === tab)?.status ?? "all";

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 px-4 bg-slate-950/95 backdrop-blur border-b border-slate-800/60">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center text-base">⚽</div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">Bahis AI</h1>
              <p className="text-[10px] text-slate-400 mt-0.5">Analiz Platformu</p>
            </div>
          </div>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="text-xs bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1.5
                       text-slate-300 focus:outline-none focus:border-violet-500 max-w-[130px]"
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24">
        {tab !== "combos"
          ? <FixtureList model={model} onAnalyses={setAnalyses} statusFilter={activeStatus} />
          : <CombinationsPanel analyses={analyses} />
        }
      </main>

      {/* Alt Navigasyon */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md
                      bg-slate-900/95 backdrop-blur border-t border-slate-800/60 z-50">
        <div className="flex">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={"flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors relative " +
                  (active ? "text-violet-400" : "text-slate-500 hover:text-slate-300")}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-violet-500 rounded-full" />
                )}
                <Icon size={18} />
                <span className="text-[10px] font-medium">{t.label}</span>
                {t.id === "combos" && analyses.length > 0 && (
                  <span className="absolute top-1.5 right-2 bg-violet-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {analyses.length}
                  </span>
                )}
                {t.id === "live" && (
                  <span className="absolute top-1.5 right-2 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
