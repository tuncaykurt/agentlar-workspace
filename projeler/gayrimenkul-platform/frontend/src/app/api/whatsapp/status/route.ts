import { NextResponse } from 'next/server'

// Sadece Evolution API'ye ulaşılabiliyor mu diye kontrol eder.
// Instance gerektirmez — tüm instance listesini çeker, sayısını döner.
export async function GET() {
  const evolutionUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
  const evolutionKey = process.env.EVOLUTION_API_KEY || ''

  if (!evolutionUrl || !evolutionKey) {
    return NextResponse.json(
      { reachable: false, error: 'Evolution API yapılandırılmamış' },
      { status: 200 }
    )
  }

  try {
    const res = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
      headers: { apikey: evolutionKey },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return NextResponse.json({ reachable: false, error: `API hatası: ${res.status}` })
    }

    const data = await res.json()
    const instances = Array.isArray(data) ? data : []
    const connectedCount = instances.filter(
      (i: { instance?: { state?: string } }) => i?.instance?.state === 'open'
    ).length

    return NextResponse.json({
      reachable: true,
      instanceCount: instances.length,
      connectedCount,
      url: evolutionUrl,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata'
    return NextResponse.json({ reachable: false, error: `Bağlantı hatası: ${message}` })
  }
}
