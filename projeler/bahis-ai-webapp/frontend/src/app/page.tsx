"use client";
"use client";
import { useState, useEffect } from "react";
import FixtureList from "@/components/FixtureList";
import CombinationsPanel from "@/components/CombinationsPanel";
import { Calendar, Target, Radio, Clock, CheckCircle, Info, X, Sun, Moon } from "lucide-react";
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

const METRICS_INFO = [
  {
    title: "Form Skoru",
    desc: "Son 6 maçtaki performans. Galibiyet=1.0, Beraberlik=0.4, Mağlubiyet=0.0. Son maçlar daha ağırlıklı sayılır. Maksimum 1.0.",
  },
  {
    title: "Tahmini Gol (xG)",
    desc: "Her takımın bu maçta kaç gol atabileceğinin tahmini. Takımın sezon ortalaması, rakibin yendiği gol ortalaması, form ve düzeltme faktörleri birleştirilerek hesaplanır.",
  },
  {
    title: "Poisson Olasılıkları",
    desc: "Tahmini gol sayıları kullanılarak olası tüm skor kombinasyonlarının olasılığı hesaplanır. Buradan maç sonucu, üst/alt, karşılıklı gol gibi bahis olasılıkları üretilir.",
  },
  {
    title: "Motivasyon Faktörü",
    desc: "Puan tablosundaki konuma göre takımın motivasyon çarpanı. Şampiyonluk yarışı veya düşme hattındaki takımlar ×1.08–1.12, orta sıra takımlar ×1.00 alır.",
  },
  {
    title: "Sakatlık Faktörü",
    desc: "Pozisyona göre ağırlıklı: Golcü sakatlığı -%12, Orta saha -%6, Defans -%4, Kaleci -%3. Maksimum %25 düşüş uygulanır.",
  },
  {
    title: "H2H (Kafa Kafaya)",
    desc: "Son 8 karşılaşmanın sonuçları ve gol ortalamaları analiz edilir. Güven skorunun %20'sini oluşturur.",
  },
  {
    title: "Güven Skoru",
    desc: "Ev sahibi maç verisi (%40) + Deplasman maç verisi (%40) + H2H verisi (%20) kombinasyonu. Düşük veri = düşük güven = tahminler daha az güvenilir.",
  },
  {
    title: "EV (Beklenen Değer)",
    desc: "EV = Bizim olasılığımız × Bahis oranı − 1. EV > %5 ise bahis teorik olarak değerli sayılır (VALUE etiketi). Oranlar bookmaker'dan çekilir.",
  },
];

export default function Home() {
  const [tab, setTab]           = useState("all");
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [model, setModel]       = useState("claude-opus");
  const [showInfo, setShowInfo] = useState(false);
  const [light, setLight]       = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("bahis_ai_theme");
    if (saved === "light") { setLight(true); document.body.classList.add("light"); }
  }, []);

  function toggleTheme() {
    const next = !light;
    setLight(next);
    if (next) { document.body.classList.add("light"); localStorage.setItem("bahis_ai_theme", "light"); }
    else       { document.body.classList.remove("light"); localStorage.setItem("bahis_ai_theme", "dark"); }
  }

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
          <div className="flex items-center gap-1.5">
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="text-xs bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1.5
                         text-slate-300 focus:outline-none focus:border-violet-500 max-w-[120px]"
            >
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-400 hover:text-violet-300 transition-colors"
              title={light ? "Koyu tema" : "Açık tema"}
            >
              {light ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <button
              onClick={() => setShowInfo(true)}
              className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-400 hover:text-violet-300 transition-colors"
              title="Analiz metrikleri hakkında"
            >
              <Info size={15} />
            </button>
          </div>
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

      {/* Metrik Bilgi Modalı */}
      {showInfo && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-end justify-center max-w-md mx-auto"
             onClick={() => setShowInfo(false)}>
          <div className="w-full bg-slate-900 border-t border-slate-700 rounded-t-2xl max-h-[80vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-800">
              <h2 className="font-bold text-white text-sm">Analizde Kullanılan Metrikler</h2>
              <button onClick={() => setShowInfo(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {METRICS_INFO.map(m => (
                <div key={m.title} className="bg-slate-800/50 rounded-xl p-3">
                  <p className="text-xs font-bold text-violet-300 mb-1">{m.title}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{m.desc}</p>
                </div>
              ))}
              <div className="bg-violet-950/40 border border-violet-800/30 rounded-xl p-3">
                <p className="text-xs text-violet-300 leading-relaxed">
                  <span className="font-bold">AI Yorumu:</span> Tüm metrikler seçtiğiniz yapay zeka modeline gönderilir.
                  AI, sayısal verileri yorumlayarak sade Türkçe bahis önerileri üretir.
                  AI önerileri yatırım tavsiyesi değildir.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
