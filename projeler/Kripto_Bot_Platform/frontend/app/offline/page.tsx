export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-5xl">📡</div>
        <h1 className="text-xl font-bold text-white">Bağlantı Yok</h1>
        <p className="text-slate-400 text-sm">İnternet bağlantısı bekleniyor...</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
        >
          Yeniden Dene
        </button>
      </div>
    </div>
  )
}
