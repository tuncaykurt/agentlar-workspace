import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: settings } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['evolution_api_url', 'evolution_api_key', 'evolution_instance'])

  const cfg: Record<string, string> = {}
  for (const row of settings || []) {
    cfg[row.key] = String(row.value).replace(/^"|"$/g, '')
  }

  const evolutionUrl = process.env.EVOLUTION_API_URL || cfg.evolution_api_url
  const evolutionKey = process.env.EVOLUTION_API_KEY || cfg.evolution_api_key
  const evolutionInstance = process.env.EVOLUTION_INSTANCE || cfg.evolution_instance

  if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
    return NextResponse.json(
      { connected: false, error: 'Evolution API bilgileri eksik' },
      { status: 200 }
    )
  }

  try {
    const endpoint = `${evolutionUrl.replace(/\/$/, '')}/instance/fetchInstances`
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { apikey: evolutionKey },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return NextResponse.json({ connected: false, error: `API hatası: ${res.status}` })
    }

    const data = await res.json()
    // Evolution API returns array of instances
    const instances = Array.isArray(data) ? data : []
    const instance = instances.find((i: { instance?: { instanceName?: string } }) =>
      i?.instance?.instanceName === evolutionInstance
    )

    const isConnected = instance?.instance?.state === 'open'

    return NextResponse.json({
      connected: isConnected,
      instanceName: evolutionInstance,
      state: instance?.instance?.state || 'unknown',
      error: isConnected ? null : `Instance durumu: ${instance?.instance?.state || 'bulunamadı'}`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata'
    return NextResponse.json({ connected: false, error: `Bağlantı hatası: ${message}` })
  }
}
