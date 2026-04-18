'use client'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
      <div className="text-center space-y-4">
        <div className="text-5xl">📡</div>
        <h1 className="text-xl font-bold">Bağlantı Yok</h1>
        <p className="text-slate-400 text-sm">
          İnternet bağlantınızı kontrol edip tekrar deneyin.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-blue-600 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  )
}
