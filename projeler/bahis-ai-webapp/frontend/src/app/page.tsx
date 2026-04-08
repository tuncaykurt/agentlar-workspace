"use client";
import { useState } from "react";
import FixtureList from "@/components/FixtureList";
import CombinationsPanel from "@/components/CombinationsPanel";
import LivePanel from "@/components/LivePanel";
import { Calendar, Target, Tv } from "lucide-react";
import type { AnalysisResult } from "@/lib/api";

const TABS = [
  { id: "daily",  label: "Günlük",      icon: Calendar },
  { id: "live",   label: "Canlı",       icon: Tv },
  { id: "combos", label: "Kombinasyon", icon: Target },
];

export default function Home() {
  const [tab, setTab]           = useState("daily");
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [model, setModel]       = useState("claude-opus");

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto">
      <header className="sticky top-0 z-50 px-4 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚽</span>
            <div>
              <h1 className="text-lg font-bold text-white leading-none">Bahis AI</h1>
              <p className="text-xs text-slate-400">Analiz Platformu</p>
            </div>
          </div>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300"
          >
            <option value="claude-opus">Claude Opus</option>
            <option value="claude-sonnet">Claude Sonnet</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="gemini-pro">Gemini Pro</option>
            <option value="llama-70b">Llama 70B</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24">
        {tab === "daily"  && <FixtureList model={model} onAnalyses={setAnalyses} />}
        {tab === "live"   && <LivePanel model={model} />}
        {tab === "combos" && <CombinationsPanel analyses={analyses} />}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-slate-900/95 backdrop-blur border-t border-slate-800">
        <div className="flex">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={"flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors " +
                  (active ? "text-violet-400" : "text-slate-500 hover:text-slate-300")}>
                <Icon size={20} />
                <span className="font-medium">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
