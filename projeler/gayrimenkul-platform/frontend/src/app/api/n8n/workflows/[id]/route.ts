import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function getN8nConfig() {
  const supabase = getServiceClient()
  const { data: rows } = await supabase
    .from('settings').select('key, value')
    .in('key', ['n8n_url', 'n8n_api_key', 'evolution_api_url', 'evolution_api_key'])
  const cfg: Record<string, string> = {}
  for (const r of rows || []) cfg[r.key] = String(r.value || '').replace(/^"|"$/g, '')
  if (!cfg.evolution_api_url) cfg.evolution_api_url = process.env.EVOLUTION_API_URL || ''
  if (!cfg.evolution_api_key) cfg.evolution_api_key = process.env.EVOLUTION_API_KEY || ''
  return cfg
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

// PATCH /api/n8n/workflows/[id]
// { active: true/false }  → activate/deactivate
// { syncWebhook: true, consultantId: "..." } → re-sync Evolution API webhook
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()

    // Activate / deactivate
    if ('active' in body) {
      const path = body.active
        ? `/workflows/${params.id}/activate`
        : `/workflows/${params.id}/deactivate`
      const result = await n8nFetch('POST', path)
      return NextResponse.json({ workflow: result })
    }

    // Re-sync Evolution webhook for AI Bot
    if (body.syncWebhook && body.consultantId) {
      const supabase = getServiceClient()
      const cfg = await getN8nConfig()

      const { data: consultant } = await supabase
        .from('consultants')
        .select('id, wa_instance, evolution_instance_key')
        .eq('id', body.consultantId)
        .single()

      if (!consultant?.wa_instance) {
        return NextResponse.json({ error: 'Danışmana ait WA instance bulunamadı' }, { status: 400 })
      }

      const waInstance = consultant.wa_instance
      const evolutionUrl = cfg.evolution_api_url?.replace(/\/$/, '')

      // Resolve instance key:
      // 1) stored key in DB
      // 2) fetch from Evolution API /instance/fetchInstances
      // 3) fallback: use global evolution_api_key (works in most single-tenant setups)
      let instanceKey = consultant.evolution_instance_key || null
      if (!instanceKey && evolutionUrl && cfg.evolution_api_key) {
        try {
          const res = await fetch(`${evolutionUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(waInstance)}`, {
            headers: { apikey: cfg.evolution_api_key },
            signal: AbortSignal.timeout(8000),
          })
          if (res.ok) {
            const data = await res.json()
            const list: { instance?: { instanceName?: string }; hash?: { apikey?: string } }[] = Array.isArray(data) ? data : [data]
            const match = list.find(item => item.instance?.instanceName === waInstance)
            instanceKey = match?.hash?.apikey || null
            if (instanceKey) {
              await supabase.from('consultants').update({ evolution_instance_key: instanceKey }).eq('id', consultant.id)
            }
          }
        } catch { /* ignore */ }

        // Fallback: try global key (single-tenant Evolution setups use one key for everything)
        if (!instanceKey) instanceKey = cfg.evolution_api_key
      }

      if (!instanceKey || !evolutionUrl) {
        return NextResponse.json({ error: 'Evolution API yapılandırılmamış (URL veya key eksik)' }, { status: 400 })
      }

      // Get n8n base URL for webhook
      const n8nBase = cfg.n8n_url?.replace(/\/$/, '')
      const webhookUrl = `${n8nBase}/webhook/wa_aibot-${consultant.id}`

      // Set Evolution webhook
      const setRes = await fetch(`${evolutionUrl}/webhook/set/${encodeURIComponent(waInstance)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: instanceKey },
        body: JSON.stringify({
          url: webhookUrl,
          webhook_by_events: false,
          webhook_base64: false,
          events: ['MESSAGES_UPSERT'],
        }),
        signal: AbortSignal.timeout(8000),
      })

      if (!setRes.ok) {
        const text = await setRes.text().catch(() => '')
        return NextResponse.json({ error: `Evolution webhook hatası: ${setRes.status} ${text.slice(0, 100)}` }, { status: 500 })
      }

      return NextResponse.json({ success: true, webhookUrl })
    }

    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
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
