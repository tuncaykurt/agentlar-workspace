/**
 * /api/whatsapp/consultant
 *
 * GET    — Returns consultant's WA instance status
 * POST   — Creates instance (if not exists) and returns QR code
 * DELETE — Disconnects and removes instance
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Service-role client (bypasses RLS)
function serviceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Get Evolution API config from env
function evoConfig() {
  return {
    url: (process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''),
    key: process.env.EVOLUTION_API_KEY || '',
  }
}

// Register webhook — tries both v1 and v2 payload formats
async function registerWebhook(evoUrl: string, evoKey: string, instName: string) {
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/webhook`
  const payload = {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: false,
    events: ['MESSAGES_UPSERT'],
  }
  // Try PUT (v2 manager format)
  const resPut = await fetch(`${evoUrl}/webhook/set/${instName}`, {
    method: 'PUT',
    headers: { apikey: evoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  if (resPut?.ok) return
  // Try POST (v1 format)
  await fetch(`${evoUrl}/webhook/set/${instName}`, {
    method: 'POST',
    headers: { apikey: evoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
}

// Get the logged-in consultant record
async function getConsultant() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const svc = serviceClient()
  const { data } = await svc
    .from('consultants')
    .select('id, full_name, wa_instance, wa_phone, wa_connected_at')
    .eq('user_id', user.id)
    .single()
  return data || null
}

// Build instance name from consultant id
function instanceName(consultantId: string) {
  return `gayr-${consultantId.replace(/-/g, '').slice(0, 12)}`
}

// ─── GET: Status ──────────────────────────────────────────────────────────────

export async function GET() {
  const consultant = await getConsultant()
  if (!consultant) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { url, key } = evoConfig()
  if (!url || !key) return NextResponse.json({ error: 'Evolution API yapılandırılmamış' }, { status: 503 })

  const instName = consultant.wa_instance || instanceName(consultant.id)

  try {
    const res = await fetch(`${url}/instance/connectionState/${instName}`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(8000),
    })

    if (res.status === 404) {
      return NextResponse.json({ exists: false, connected: false, instanceName: instName })
    }

    const data = await res.json()
    const state = data?.instance?.state || data?.state || 'unknown'
    const connected = state === 'open'

    // If connected but no phone saved yet, try to get it
    if (connected && !consultant.wa_phone) {
      try {
        const infoRes = await fetch(`${url}/instance/fetchInstances`, {
          headers: { apikey: key },
          signal: AbortSignal.timeout(5000),
        })
        const instances = await infoRes.json()
        const inst = (Array.isArray(instances) ? instances : [])
          .find((i: { instance?: { instanceName?: string; owner?: string } }) =>
            i?.instance?.instanceName === instName
          )
        const phone = inst?.instance?.owner?.replace('@s.whatsapp.net', '') || null
        if (phone) {
          await serviceClient()
            .from('consultants')
            .update({ wa_phone: phone, wa_connected_at: new Date().toISOString() })
            .eq('id', consultant.id)
        }
      } catch { /* non-critical */ }
    }

    return NextResponse.json({
      exists: true,
      connected,
      state,
      instanceName: instName,
      phone: consultant.wa_phone || null,
      connectedAt: consultant.wa_connected_at || null,
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err), exists: false, connected: false })
  }
}

// ─── POST: Create instance + get QR ──────────────────────────────────────────

export async function POST() {
  const consultant = await getConsultant()
  if (!consultant) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { url, key } = evoConfig()
  if (!url || !key) return NextResponse.json({ error: 'Evolution API yapılandırılmamış' }, { status: 503 })

  const instName = consultant.wa_instance || instanceName(consultant.id)

  // Save instance name to consultant record
  if (!consultant.wa_instance) {
    await serviceClient()
      .from('consultants')
      .update({ wa_instance: instName })
      .eq('id', consultant.id)
  }

  // Try to get QR from existing instance first
  try {
    const connectRes = await fetch(`${url}/instance/connect/${instName}`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10000),
    })

    if (connectRes.ok) {
      const connectData = await connectRes.json()
      const base64 = connectData?.base64 || connectData?.qrcode?.base64 || null

      // Always ensure webhook is registered
      registerWebhook(url, key, instName).catch(() => {})

      if (base64) {
        return NextResponse.json({ instanceName: instName, base64, created: false })
      }
      // No QR = already connected
      return NextResponse.json({ instanceName: instName, base64: null, connected: true, created: false })
    }
  } catch { /* instance might not exist yet, create it */ }

  // Create new instance
  try {
    const createRes = await fetch(`${url}/instance/create`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instanceName: instName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      return NextResponse.json({ error: `Instance oluşturulamadı: ${createRes.status} ${errText}` }, { status: 502 })
    }

    const createData = await createRes.json()
    const base64 =
      createData?.qrcode?.base64 ||
      createData?.base64 ||
      null

    // Auto-register webhook for this instance
    registerWebhook(url, key, instName).catch(() => {})

    return NextResponse.json({ instanceName: instName, base64, created: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 503 })
  }
}

// ─── DELETE: Disconnect / remove instance ────────────────────────────────────

export async function DELETE() {
  const consultant = await getConsultant()
  if (!consultant) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { url, key } = evoConfig()
  if (!url || !key) return NextResponse.json({ error: 'Evolution API yapılandırılmamış' }, { status: 503 })

  const instName = consultant.wa_instance
  if (!instName) return NextResponse.json({ success: true }) // nothing to delete

  try {
    // Logout (disconnect WhatsApp without deleting instance)
    await fetch(`${url}/instance/logout/${instName}`, {
      method: 'DELETE',
      headers: { apikey: key },
      signal: AbortSignal.timeout(8000),
    }).catch(() => { /* ignore */ })

    // Delete instance
    await fetch(`${url}/instance/delete/${instName}`, {
      method: 'DELETE',
      headers: { apikey: key },
      signal: AbortSignal.timeout(8000),
    }).catch(() => { /* ignore */ })
  } catch { /* ignore errors, still clear DB */ }

  // Clear from DB
  await serviceClient()
    .from('consultants')
    .update({ wa_instance: null, wa_phone: null, wa_connected_at: null })
    .eq('id', consultant.id)

  return NextResponse.json({ success: true })
}
