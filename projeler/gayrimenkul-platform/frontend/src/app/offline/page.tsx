'use client'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface p-6">
      <div className="text-center space-y-4">
        <div className="text-5xl">📡</div>
        <h1 className="text-xl font-bold">Bağlantı Yok</h1>
        <p className="text-on-surface-variant text-sm">
          İnternet bağlantınızı kontrol edip tekrar deneyin.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-primary rounded-lg text-sm font-medium hover:bg-primary-hover"
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  )
}
