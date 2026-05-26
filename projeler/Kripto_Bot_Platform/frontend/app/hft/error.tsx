"use client"

export default function HftError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-8 text-center min-h-screen bg-[#020817] flex flex-col items-center justify-center">
      <h2 className="text-red-400 text-xl font-bold mb-4">HFT Sayfa Hatasi</h2>
      <pre className="bg-slate-900 text-red-300 p-4 rounded-lg text-left text-xs overflow-auto max-h-60 mb-4 max-w-2xl w-full">
        {error.message}{"\n"}{error.stack}
      </pre>
      <div className="flex gap-3">
        <button onClick={() => { localStorage.removeItem("hft_sim_state"); reset() }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500">
          Sifirla ve Tekrar Dene
        </button>
        <button onClick={reset}
          className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600">
          Tekrar Dene
        </button>
      </div>
    </div>
  )
}
