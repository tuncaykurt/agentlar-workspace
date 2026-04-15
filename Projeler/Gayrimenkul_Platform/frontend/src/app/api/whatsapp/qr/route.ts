import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

async function getEvolutionConfig() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['evolution_api_url', 'evolution_api_key', 'evolution_instance'])

  const cfg: Record<string, string> = {}
  for (const row of data || []) {
    cfg[row.key] = String(row.value).replace(/^"|"$/g, '')
  }

  return {
    url: process.env.EVOLUTION_API_URL || cfg.evolution_api_url || '',
    key: process.env.EVOLUTION_API_KEY || cfg.evolution_api_key || '',
    instance: process.env.EVOLUTION_INSTANCE || cfg.evolution_instance || '',
  }
}

// GET /api/whatsapp/qr — Fetch QR code from Evolution API
export async function GET() {
  const { url, key, instance } = await getEvolutionConfig()

  if (!url || !key || !instance) {
    return NextResponse.json({ error: 'Evolution API bilgileri eksik' }, { status: 503 })
  }

  try {
    const endpoint = `${url.replace(/\/$/, '')}/instance/connect/${instance}`
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { apikey: key },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `API hatası ${res.status}: ${text}` }, { status: 502 })
    }

    const data = await res.json()

    // Evolution API v1 & v2 both return base64 at different paths
    const base64 =
      data?.base64 ||
      data?.qrcode?.base64 ||
      data?.code?.base64 ||
      null

    if (!base64) {
      // Instance might already be connected
      return NextResponse.json({ connected: true, base64: null })
    }

    return NextResponse.json({ connected: false, base64 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
