import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Build deterministic instance name from consultant ID — same formula as /api/whatsapp/consultant
function deriveInstance(consultantId: string) {
  return `gayr-${consultantId.replace(/-/g, '').slice(0, 12)}`
}

// Resolve which Evolution instance to use:
// 1. body param (passed from document page)
// 2. logged-in consultant's wa_instance from DB
// 3. derived from consultant ID (deterministic)
// 4. EVOLUTION_INSTANCE env var (last resort)
async function resolveInstance(req: NextRequest, bodyInstance?: string): Promise<string> {
  if (bodyInstance) return bodyInstance

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return process.env.EVOLUTION_INSTANCE || ''

    const { data: consultant } = await serviceClient()
      .from('consultants')
      .select('id, wa_instance')
      .eq('user_id', user.id)
      .single()

    if (!consultant) return process.env.EVOLUTION_INSTANCE || ''

    return consultant.wa_instance || deriveInstance(consultant.id)
  } catch {
    return process.env.EVOLUTION_INSTANCE || ''
  }
}

export async function POST(req: NextRequest) {
  let body: { phone?: string; message?: string; instanceName?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  }

  const { phone, message, instanceName: bodyInstance } = body
  if (!phone || !message) {
    return NextResponse.json({ error: 'phone ve message gerekli.' }, { status: 400 })
  }

  // Normalize phone
  let normalizedPhone = phone.replace(/\D/g, '')
  if (normalizedPhone.startsWith('0')) {
    normalizedPhone = '90' + normalizedPhone.slice(1)
  } else if (normalizedPhone.startsWith('5') && normalizedPhone.length === 10) {
    normalizedPhone = '90' + normalizedPhone
  }

  const evolutionUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
  const evolutionKey = process.env.EVOLUTION_API_KEY || ''

  if (!evolutionUrl || !evolutionKey) {
    return NextResponse.json({ error: 'Evolution API yapılandırılmamış.' }, { status: 503 })
  }

  const evolutionInstance = await resolveInstance(req, bodyInstance)

  if (!evolutionInstance) {
    return NextResponse.json({ error: 'WhatsApp instance bulunamadı. Önce WhatsApp bağlantısını kurun.' }, { status: 503 })
  }

  try {
    const endpoint = `${evolutionUrl}/message/sendText/${evolutionInstance}`

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
      body: JSON.stringify({ number: normalizedPhone, text: message }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[whatsapp/send] Evolution error:', res.status, errText, '| instance:', evolutionInstance, '| phone:', normalizedPhone)
      let detail = ''
      try { detail = JSON.parse(errText)?.message || JSON.parse(errText)?.error || '' } catch { /* ignore */ }
      return NextResponse.json(
        { error: `Evolution API ${res.status}${detail ? ': ' + detail : ''}`, detail: errText, instance: evolutionInstance, phone: normalizedPhone },
        { status: 502 }
      )
    }

    const data = await res.json()
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[whatsapp/send] Network error:', err)
    return NextResponse.json({ error: "Evolution API'ye bağlanılamadı." }, { status: 503 })
  }
}
