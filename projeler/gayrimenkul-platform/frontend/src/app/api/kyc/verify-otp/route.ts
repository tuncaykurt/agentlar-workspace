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
  const { token, otp } = await req.json()
  if (!token || !otp) return NextResponse.json({ error: 'Eksik parametre' }, { status: 400 })

  const supabase = serviceClient()

  const { data: sigReq, error } = await supabase
    .from('signature_requests')
    .select('id, otp_code, otp_expires_at, kyc_status')
    .eq('token', token)
    .single()

  if (error || !sigReq) return NextResponse.json({ error: 'Geçersiz link' }, { status: 404 })
  if (sigReq.kyc_status === 'approved') return NextResponse.json({ approved: true })

  if (!sigReq.otp_code) {
    return NextResponse.json({ error: 'Önce doğrulama kodu gönderilmesi gerekiyor.' }, { status: 400 })
  }

  if (new Date(sigReq.otp_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Kodun süresi doldu. Lütfen yeni kod isteyin.' }, { status: 400 })
  }

  if (sigReq.otp_code !== String(otp).trim()) {
    return NextResponse.json({ error: 'Kod hatalı. Lütfen tekrar deneyin.' }, { status: 400 })
  }

  await supabase
    .from('signature_requests')
    .update({
      kyc_status: 'approved',
      kyc_verified_at: new Date().toISOString(),
      otp_code: null,
      otp_expires_at: null,
    })
    .eq('id', sigReq.id)

  return NextResponse.json({ approved: true })
}
