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

  const [nameRes, logoRes] = await Promise.all([
    supabase.from('settings').select('value').eq('key', 'office_name').single(),
    supabase.from('settings').select('value').eq('key', 'office_logo').single(),
  ])

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
    officeName: nameRes.data?.value ? String(nameRes.data.value).replace(/^"|"$/g, '') : 'Ambiance Gayrimenkul',
    officeLogo: logoRes.data?.value ? String(logoRes.data.value).replace(/^"|"$/g, '') : null,
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

  // 6. Send WA notification to consultant
  try {
    // Get document + consultant info
    const { data: doc } = await supabase
      .from('documents')
      .select('id, title, consultant:consultants(id, full_name, phone, wa_instance)')
      .eq('id', sigReq.document_id)
      .single()

    // Use env vars (same as /api/whatsapp/send route)
    const evoUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '') || null
    const evoKey = process.env.EVOLUTION_API_KEY || null

    type ConsultantWA = { id: string; full_name: string; phone: string; wa_instance: string }
    const rawConsultant = doc?.consultant
    const consultant = (Array.isArray(rawConsultant) ? rawConsultant[0] : rawConsultant) as unknown as ConsultantWA | null

    if (consultant?.phone && consultant?.wa_instance && evoUrl && evoKey) {
      // Normalize phone: strip non-digits, convert 05... → 905...
      let phone = consultant.phone.replace(/\D/g, '')
      if (phone.startsWith('0')) phone = '90' + phone.slice(1)
      else if (!phone.startsWith('90') && phone.length === 10) phone = '90' + phone

      const docTitle = doc?.title || 'Belge'
      const signerInfo = `${sigReq.signer_name}${sigReq.signer_role ? ` (${sigReq.signer_role})` : ''}`

      let msg: string
      if (allSigned) {
        msg = `✅ *${docTitle}*\n\nTüm taraflar belgeyi imzaladı! 🎉\n\nSon imzalayan: ${signerInfo}`
      } else {
        msg = `✍️ *${docTitle}*\n\n${signerInfo} belgeyi imzaladı.\n\nDiğer imzalar bekleniyor.`
      }

      const waRes = await fetch(`${evoUrl}/message/sendText/${consultant.wa_instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': evoKey },
        body: JSON.stringify({ number: phone, text: msg }),
      })
      // Log failure to console for debugging (does not affect response)
      if (!waRes.ok) {
        console.error('[sign] WA notification failed:', waRes.status, await waRes.text().catch(() => ''))
      }
    } else {
      console.warn('[sign] WA notification skipped — missing:', {
        phone: !!consultant?.phone,
        wa_instance: !!consultant?.wa_instance,
        evoUrl: !!evoUrl,
        evoKey: !!evoKey,
      })
    }
  } catch {
    // Notification failure must not block the response
  }

  return NextResponse.json({ success: true, allSigned })
}
