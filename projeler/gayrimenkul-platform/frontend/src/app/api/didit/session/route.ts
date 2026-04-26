import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createVerificationSession } from '@/lib/didit'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }

  const { token } = body
  if (!token) return NextResponse.json({ error: 'Token gerekli' }, { status: 400 })

  const supabase = getServiceClient()

  const { data: sigReq } = await supabase
    .from('signature_requests')
    .select('id, kyc_status, kyc_session_id, document_id')
    .eq('token', token)
    .single()

  if (!sigReq) return NextResponse.json({ error: 'Geçersiz imzalama linki' }, { status: 404 })

  const { data: doc } = await supabase
    .from('documents')
    .select('kyc_required')
    .eq('id', sigReq.document_id)
    .single()

  if (!doc?.kyc_required) {
    return NextResponse.json({ error: 'Bu belge KYC gerektirmiyor' }, { status: 400 })
  }

  if (sigReq.kyc_status === 'approved') {
    return NextResponse.json({ already_approved: true })
  }

  try {
    const session = await createVerificationSession(token)

    await supabase
      .from('signature_requests')
      .update({ kyc_session_id: session.session_id, kyc_status: 'pending' })
      .eq('id', sigReq.id)

    return NextResponse.json({ url: session.url, session_id: session.session_id })
  } catch (e) {
    console.error('[didit] Session creation error:', e)
    return NextResponse.json({ error: 'Doğrulama oturumu oluşturulamadı' }, { status: 500 })
  }
}
