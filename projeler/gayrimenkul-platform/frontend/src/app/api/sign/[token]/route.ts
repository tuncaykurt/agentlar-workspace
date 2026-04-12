import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

// GET /api/sign/[token] — Get signing request + document info (uses service_role, no RLS issues)
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = getServiceClient()

  const { data: sigReq, error } = await supabase
    .from('signature_requests')
    .select('id, signer_name, signer_phone, signer_role, status, document_id, viewed_at, signed_at, token')
    .eq('token', params.token)
    .single()

  if (error || !sigReq) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, doc_type, template_data, client:clients(full_name, salutation), property:properties(title, city)')
    .eq('id', sigReq.document_id)
    .single()

  const { data: setting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'office_name')
    .single()

  // Mark as viewed if pending
  if (sigReq.status === 'pending') {
    await supabase
      .from('signature_requests')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', sigReq.id)
  }

  return NextResponse.json({
    sigReq,
    doc,
    officeName: setting?.value ? String(setting.value).replace(/^"|"$/g, '') : 'Gayrimenkul Ofisi',
  })
}

// POST /api/sign/[token] — Submit signature
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = getServiceClient()

  // 1. Get signature request
  const { data: sigReq, error: reqErr } = await supabase
    .from('signature_requests')
    .select('*')
    .eq('token', params.token)
    .single()

  if (reqErr || !sigReq) {
    return NextResponse.json({ error: 'Geçersiz imzalama linki.' }, { status: 404 })
  }

  if (sigReq.status === 'signed') {
    return NextResponse.json({ error: 'Bu belge zaten imzalanmış.' }, { status: 409 })
  }

  // 2. Parse body
  let body: { signatureData?: string; signatureType?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  }

  const { signatureData, signatureType } = body

  if (!signatureData) {
    return NextResponse.json({ error: 'İmza verisi eksik.' }, { status: 400 })
  }

  // Basic validation: typed signatures must be at least 2 chars, drawn must be base64 PNG
  if (signatureType === 'typed' && signatureData.trim().length < 2) {
    return NextResponse.json({ error: 'İsim çok kısa.' }, { status: 400 })
  }
  if (signatureType === 'drawn' && !signatureData.startsWith('data:image/png;base64,')) {
    return NextResponse.json({ error: 'Geçersiz imza verisi.' }, { status: 400 })
  }

  // 3. Collect request metadata
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  const userAgent = req.headers.get('user-agent') || 'unknown'
  const now = new Date().toISOString()

  // 4. Save signature
  const { error: updateErr } = await supabase
    .from('signature_requests')
    .update({
      status: 'signed',
      signature_data: signatureData,
      signature_type: signatureType,
      signed_at: now,
      ip_address: ip,
      user_agent: userAgent,
    })
    .eq('id', sigReq.id)

  if (updateErr) {
    return NextResponse.json({ error: 'İmza kaydedilemedi.' }, { status: 500 })
  }

  // 5. Check if all signature requests for this document are signed
  const { data: allRequests } = await supabase
    .from('signature_requests')
    .select('status')
    .eq('document_id', sigReq.document_id)

  const allSigned = (allRequests || []).every(r => r.status === 'signed')

  if (allSigned) {
    // Update document signature_status to 'signed'
    await supabase
      .from('documents')
      .update({ signature_status: 'signed', signed_at: now })
      .eq('id', sigReq.document_id)
  } else {
    // At least one person signed, update to 'viewed' if still draft
    await supabase
      .from('documents')
      .update({ signature_status: 'viewed' })
      .eq('id', sigReq.document_id)
      .eq('signature_status', 'draft')
  }

  return NextResponse.json({ success: true, allSigned })
}
