import FreqtradeDashboard from "@/components/Freqtrade/FreqtradeDashboard"

export const metadata = {
  title: "Freqtrade Dashboard | Antigravity",
}

export default function FreqtradePage() {
  return (
    <main className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Freqtrade Motoru</h1>
        <p className="text-slate-400">
          Gelişmiş teknik analiz ve otonom trading motorunun canlı verileri.
        </p>
      </div>

      <FreqtradeDashboard />
    </main>
  )
}
