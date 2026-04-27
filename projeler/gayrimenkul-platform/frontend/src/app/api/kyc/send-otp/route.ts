import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'token gerekli' }, { status: 400 })

  const supabase = serviceClient()

  const { data: sigReq, error } = await supabase
    .from('signature_requests')
    .select('id, signer_name, signer_phone, kyc_status, document_id')
    .eq('token', token)
    .single()

  if (error || !sigReq) return NextResponse.json({ error: 'Geçersiz link' }, { status: 404 })
  if (sigReq.kyc_status === 'approved') return NextResponse.json({ already_approved: true })
  if (!sigReq.signer_phone) {
    return NextResponse.json({ error: 'Telefon numarası kayıtlı değil. Danışmanınızla iletişime geçin.' }, { status: 400 })
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await supabase
    .from('signature_requests')
    .update({ otp_code: otp, otp_expires_at: expiresAt })
    .eq('id', sigReq.id)

  const { data: doc } = await supabase
    .from('documents')
    .select('consultant:consultants(wa_instance)')
    .eq('id', sigReq.document_id)
    .single()

  const rawC = doc?.consultant
  const consultant = (Array.isArray(rawC) ? rawC[0] : rawC) as { wa_instance?: string } | null
  const evoUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
  const evoKey = process.env.EVOLUTION_API_KEY || ''
  const instance = consultant?.wa_instance || process.env.EVOLUTION_INSTANCE || ''

  if (!evoUrl || !evoKey || !instance) {
    return NextResponse.json({ error: 'WhatsApp yapılandırılmamış. Danışmanınızla iletişime geçin.' }, { status: 500 })
  }

  let phone = sigReq.signer_phone.replace(/\D/g, '')
  if (phone.startsWith('0')) phone = '90' + phone.slice(1)
  else if (!phone.startsWith('90') && phone.length === 10) phone = '90' + phone

  const text = `🔐 Kimlik doğrulama kodunuz: *${otp}*\n\nBu kod 10 dakika geçerlidir. Kimsenizle paylaşmayın.`

  const waRes = await fetch(`${evoUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: evoKey },
    body: JSON.stringify({ number: phone, text }),
  })

  if (!waRes.ok) {
    console.error('[kyc/send-otp] WA error:', await waRes.text())
    return NextResponse.json({ error: 'WhatsApp mesajı gönderilemedi. Lütfen tekrar deneyin.' }, { status: 500 })
  }

  const masked = sigReq.signer_phone.replace(/(\d{3})\d{4}(\d{3,4})$/, '$1****$2')
  return NextResponse.json({ sent: true, masked_phone: masked })
}
