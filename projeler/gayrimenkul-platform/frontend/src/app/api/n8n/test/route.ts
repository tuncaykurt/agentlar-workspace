import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET() {
  try {
    // 1. Read n8n settings from DB
    const supabase = getServiceClient()
    const { data: rows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['n8n_url', 'n8n_api_key'])

    const settings: Record<string, string> = {}
    for (const row of rows || []) {
      settings[row.key] = String(row.value || '').replace(/^"|"$/g, '')
    }

    const n8nUrl = settings.n8n_url?.replace(/\/$/, '')
    const n8nKey = settings.n8n_api_key

    if (!n8nUrl || !n8nKey) {
      return NextResponse.json({ connected: false, error: 'n8n URL veya API Key girilmemiş' }, { status: 400 })
    }

    // 2. Test connection — fetch workflows list
    const res = await fetch(`${n8nUrl}/api/v1/workflows?limit=50`, {
      headers: {
        'X-N8N-API-KEY': n8nKey,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ connected: false, error: `n8n yanıt hatası: ${res.status} — ${text.slice(0, 120)}` }, { status: 502 })
    }

    const data = await res.json()
    const workflows = (data.data || []) as { id: string; name: string; active: boolean }[]

    return NextResponse.json({
      connected: true,
      workflowCount: workflows.length,
      activeCount: workflows.filter(w => w.active).length,
      workflows: workflows.map(w => ({ id: w.id, name: w.name, active: w.active })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Bilinmeyen hata'
    return NextResponse.json({ connected: false, error: `Bağlantı kurulamadı: ${msg}` }, { status: 502 })
  }
}
