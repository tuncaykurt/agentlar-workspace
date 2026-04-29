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

async function tryRegister(evoUrl: string, evoKey: string, instName: string, payload: any, method: 'POST' | 'PUT') {
  try {
    const res = await fetch(`${evoUrl}/webhook/set/${instName}`, {
      method,
      headers: { apikey: evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })
    const text = await res.text()
    return { status: res.status, ok: res.ok, body: text.slice(0, 500) }
  } catch (e: any) {
    return { error: e?.message || String(e) }
  }
}

async function verifyRegistration(evoUrl: string, evoKey: string, instName: string) {
  try {
    const res = await fetch(`${evoUrl}/webhook/find/${instName}`, {
      headers: { apikey: evoKey },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { ok: false, status: res.status }
    const data = await res.json()
    const enabled = data?.enabled === true
    const events: string[] = data?.events || []
    const hasUpsert = events.some(e => String(e).toUpperCase() === 'MESSAGES_UPSERT')
    return { ok: enabled && hasUpsert, enabled, events, registration: data }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
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

  const camelCasePayload = {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: false,
    events: ['MESSAGES_UPSERT'],
  }
  const nestedPayload = {
    webhook: {
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhookBase64: false,
      events: ['MESSAGES_UPSERT'],
    },
  }
  const snakeCasePayload = {
    enabled: true,
    url: webhookUrl,
    webhook_by_events: false,
    webhook_base64: false,
    events: ['MESSAGES_UPSERT'],
  }

  const attempts: Record<string, any> = {}

  // Try every combination, verify with /find after each
  const variants: Array<[string, 'POST' | 'PUT', any]> = [
    ['POST_camel', 'POST', camelCasePayload],
    ['POST_nested', 'POST', nestedPayload],
    ['PUT_camel', 'PUT', camelCasePayload],
    ['PUT_nested', 'PUT', nestedPayload],
    ['POST_snake', 'POST', snakeCasePayload],
    ['PUT_snake', 'PUT', snakeCasePayload],
  ]

  for (const [name, method, payload] of variants) {
    const setRes = await tryRegister(evoUrl, evoKey, instName, payload, method)
    const verify = await verifyRegistration(evoUrl, evoKey, instName)
    attempts[name] = { set: setRes, verify }
    if (verify.ok) {
      return NextResponse.json({
        ok: true,
        method: name,
        webhookUrl,
        instance: instName,
        registration: verify.registration,
      })
    }
  }

  return NextResponse.json({
    ok: false,
    webhookUrl,
    instance: instName,
    attempts,
    hint: 'Hiçbir format webhook\'u enabled=true ve MESSAGES_UPSERT event\'i ile kaydedemedi. attempts içinden Evolution API yanıtlarını inceleyin.',
  }, { status: 500 })
}
