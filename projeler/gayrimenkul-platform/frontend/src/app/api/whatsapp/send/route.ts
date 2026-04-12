import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  // Normalize phone: remove all non-digit characters, then apply Turkey country code
  let normalizedPhone = phone.replace(/\D/g, '')
  if (normalizedPhone.startsWith('0')) {
    // 05xxxxxxxxx → 905xxxxxxxxx
    normalizedPhone = '90' + normalizedPhone.slice(1)
  } else if (normalizedPhone.startsWith('5') && normalizedPhone.length === 10) {
    // 5xxxxxxxxx → 905xxxxxxxxx
    normalizedPhone = '90' + normalizedPhone
  }
  // If already starts with 90 or is an international number, keep as is

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const evolutionUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
  const evolutionKey = process.env.EVOLUTION_API_KEY || ''

  // Instance priority: body param (consultant's) > global env
  const evolutionInstance =
    bodyInstance ||
    process.env.EVOLUTION_INSTANCE ||
    ''

  if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
    return NextResponse.json(
      { error: 'Evolution API yapılandırması eksik.' },
      { status: 503 }
    )
  }

  void supabase // suppress unused warning

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
