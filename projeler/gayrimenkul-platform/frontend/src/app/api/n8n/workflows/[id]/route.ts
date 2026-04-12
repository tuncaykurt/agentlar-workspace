import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function n8nFetch(method: string, path: string, body?: object) {
  const supabase = getServiceClient()
  const { data: rows } = await supabase
    .from('settings').select('key, value').in('key', ['n8n_url', 'n8n_api_key'])
  const cfg: Record<string, string> = {}
  for (const r of rows || []) cfg[r.key] = String(r.value || '').replace(/^"|"$/g, '')
  const base = cfg.n8n_url?.replace(/\/$/, '')
  const key = cfg.n8n_api_key
  if (!base || !key) throw new Error('n8n yapılandırılmamış')
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`n8n ${res.status}: ${(await res.text()).slice(0, 200)}`)
  if (res.status === 204) return {}
  return res.json()
}

// PATCH /api/n8n/workflows/[id] — { active: true/false }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { active } = await req.json()
    const path = active
      ? `/workflows/${params.id}/activate`
      : `/workflows/${params.id}/deactivate`
    const result = await n8nFetch('POST', path)
    return NextResponse.json({ workflow: result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Hata' }, { status: 500 })
  }
}

// DELETE /api/n8n/workflows/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await n8nFetch('DELETE', `/workflows/${params.id}`)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Hata' }, { status: 500 })
  }
}
