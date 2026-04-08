"use client";
import { useState } from "react";
import FixtureList from "@/components/FixtureList";
import CombinationsPanel from "@/components/CombinationsPanel";
import LivePanel from "@/components/LivePanel";
import { Calendar, Target, Radio } from "lucide-react";
import type { AnalysisResult } from "@/lib/api";

const MODELS = [
  { id: "claude-opus",   label: "Claude Opus" },
  { id: "claude-sonnet", label: "Claude Sonnet" },
  { id: "gpt-4o",        label: "GPT-4o" },
  { id: "gemini-pro",    label: "Gemini Pro" },
  { id: "llama-70b",     label: "Llama 70B" },
  { id: "deepseek",      label: "DeepSeek" },
];

export default function Home() {
  const [tab, setTab]           = useState("daily");
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [model, setModel]       = useState("claude-opus");

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

        {/* Tab bar — header içinde */}
        <div className="flex gap-1 pb-3">
          {[
            { id: "daily",  label: "Günlük",      icon: Calendar },
            { id: "live",   label: "Canlı",        icon: Radio },
            { id: "combos", label: "Kombinasyon",  icon: Target },
          ].map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={"flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all " +
                  (active
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-900/40"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60")}
              >
                <Icon size={14} />
                {t.label}
                {t.id === "combos" && analyses.length > 0 && (
                  <span className="bg-violet-400/30 text-violet-300 text-[9px] px-1.5 rounded-full">
                    {analyses.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <main className="flex-1 px-4 pb-6">
        {tab === "daily"  && <FixtureList model={model} onAnalyses={setAnalyses} />}
        {tab === "live"   && <LivePanel model={model} />}
        {tab === "combos" && <CombinationsPanel analyses={analyses} />}
      </main>
    </div>
  );
}
