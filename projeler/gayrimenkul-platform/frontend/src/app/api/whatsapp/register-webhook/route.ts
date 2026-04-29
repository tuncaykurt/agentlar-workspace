import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST() {
  const userSb = await createServerSupabaseClient()
  const { data: { user } } = await userSb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = svc()
  const { data: consultant } = await supabase
    .from('consultants')
    .select('id, wa_instance')
    .eq('user_id', user.id)
    .single()

  if (!consultant?.wa_instance) {
    return NextResponse.json({ error: 'WhatsApp bağlı değil' }, { status: 400 })
  }

  const evoUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
  const evoKey = process.env.EVOLUTION_API_KEY || ''
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

  if (!evoUrl || !evoKey) {
    return NextResponse.json({ error: 'Evolution API yapılandırılmamış' }, { status: 500 })
  }

  const webhookUrl = `${appUrl}/api/whatsapp/webhook`
  const instName = consultant.wa_instance

  const results: Record<string, any> = {}

  // Try v2 POST
  try {
    const res = await fetch(`${evoUrl}/webhook/set/${instName}`, {
      method: 'POST',
      headers: { apikey: evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: ['MESSAGES_UPSERT'],
      }),
      signal: AbortSignal.timeout(10000),
    })
    const text = await res.text()
    results.post_v2 = { status: res.status, ok: res.ok, body: text.slice(0, 300) }
    if (res.ok) {
      return NextResponse.json({ ok: true, method: 'POST v2', webhookUrl, instance: instName, response: text.slice(0, 300) })
    }
  } catch (e: any) {
    results.post_v2 = { error: e?.message }
  }

  // Try v2 PUT
  try {
    const res = await fetch(`${evoUrl}/webhook/set/${instName}`, {
      method: 'PUT',
      headers: { apikey: evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: ['MESSAGES_UPSERT'],
      }),
      signal: AbortSignal.timeout(10000),
    })
    const text = await res.text()
    results.put_v2 = { status: res.status, ok: res.ok, body: text.slice(0, 300) }
    if (res.ok) {
      return NextResponse.json({ ok: true, method: 'PUT v2', webhookUrl, instance: instName, response: text.slice(0, 300) })
    }
  } catch (e: any) {
    results.put_v2 = { error: e?.message }
  }

  // Try v1 POST (camelCase)
  try {
    const res = await fetch(`${evoUrl}/webhook/set/${instName}`, {
      method: 'POST',
      headers: { apikey: evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT'],
      }),
      signal: AbortSignal.timeout(10000),
    })
    const text = await res.text()
    results.post_v1 = { status: res.status, ok: res.ok, body: text.slice(0, 300) }
    if (res.ok) {
      return NextResponse.json({ ok: true, method: 'POST v1', webhookUrl, instance: instName, response: text.slice(0, 300) })
    }
  } catch (e: any) {
    results.post_v1 = { error: e?.message }
  }

  return NextResponse.json({ ok: false, webhookUrl, instance: instName, attempts: results }, { status: 500 })
}
