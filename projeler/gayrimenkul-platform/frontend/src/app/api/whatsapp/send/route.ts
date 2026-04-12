import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  let body: { phone?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  }

  const { phone, message } = body
  if (!phone || !message) {
    return NextResponse.json({ error: 'phone ve message gerekli.' }, { status: 400 })
  }

  // Normalize phone: remove spaces, +, dashes
  const normalizedPhone = phone.replace(/[\s\-+()]/g, '')

  // Get Evolution API settings from Supabase settings table
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

  // Also allow env var overrides
  const evolutionUrl = process.env.EVOLUTION_API_URL || cfg.evolution_api_url
  const evolutionKey = process.env.EVOLUTION_API_KEY || cfg.evolution_api_key
  const evolutionInstance = process.env.EVOLUTION_INSTANCE || cfg.evolution_instance

  if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
    return NextResponse.json(
      { error: 'Evolution API yapılandırması eksik. Lütfen Admin > Ayarlar sayfasından Evolution API bilgilerini girin.' },
      { status: 503 }
    )
  }

  try {
    const endpoint = `${evolutionUrl.replace(/\/$/, '')}/message/sendText/${evolutionInstance}`

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionKey,
      },
      body: JSON.stringify({
        number: normalizedPhone,
        text: message,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[whatsapp/send] Evolution API error:', res.status, errText)
      return NextResponse.json(
        { error: `Evolution API hatası: ${res.status}` },
        { status: 502 }
      )
    }

    const data = await res.json()
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[whatsapp/send] Network error:', err)
    return NextResponse.json({ error: 'Evolution API\'ye bağlanılamadı.' }, { status: 503 })
  }
}
