import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

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
    .select('id, status, signer_name, signer_phone')
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

  // 6. Send WA notification to consultant and signers
  try {
    // Get document + consultant info
    const { data: doc } = await supabase
      .from('documents')
      .select('id, title, consultant:consultants(id, full_name, phone, email, wa_instance)')
      .eq('id', sigReq.document_id)
      .single()

    // Use env vars
    const evoUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '') || null
    const evoKey = process.env.EVOLUTION_API_KEY || null

    type ConsultantWA = { id: string; full_name: string; phone: string; email?: string; wa_instance: string }
    const rawConsultant = doc?.consultant
    const consultant = (Array.isArray(rawConsultant) ? rawConsultant[0] : rawConsultant) as unknown as ConsultantWA | null
    const evolutionInstance = consultant?.wa_instance || process.env.EVOLUTION_INSTANCE || ''

    if (evolutionInstance && evoUrl && evoKey) {
      const docTitle = doc?.title || 'Belge'
      const signerInfo = `${sigReq.signer_name}${sigReq.signer_role ? ` (${sigReq.signer_role})` : ''}`

      // Helper to send message safely
      const sendWaMsg = async (targetPhone: string, text: string) => {
        let p = targetPhone.replace(/\D/g, '')
        if (p.startsWith('0')) p = '90' + p.slice(1)
        else if (!p.startsWith('90') && p.length === 10) p = '90' + p
        if (p.length < 10) return
        
        await fetch(`${evoUrl}/message/sendText/${evolutionInstance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': evoKey },
          body: JSON.stringify({ number: p, text }),
        }).catch(err => console.error('[sign] WA fetch err:', err))
      }

      // --- Notify Consultant ---
      if (consultant?.phone) {
        let msg = allSigned 
          ? `✅ *${docTitle}*\n\nTüm taraflar belgeyi imzaladı! 🎉\n\nSon imzalayan: ${signerInfo}`
          : `✍️ *${docTitle}*\n\n${signerInfo} belgeyi imzaladı.\n\nDiğer imzalar bekleniyor.`
        await sendWaMsg(consultant.phone, msg)
      }

      // --- Notify Current Signer ---
      if (sigReq.signer_phone) {
        let sMsg = allSigned
          ? `✅ *${docTitle}*\n\nSayın ${sigReq.signer_name}, imza işleminiz başarıyla tamamlandı! Belge tüm taraflarca sağlandı. 🎉\nBildirimdeki linke tekrar tıklayarak PDF kopyasını görüntüleyebilir ve indirebilirsiniz.`
          : `✍️ *${docTitle}*\n\nSayın ${sigReq.signer_name}, imzanız başarıyla sistemimize kaydedildi! Teşekkür ederiz.\nTüm taraflar imzaladığında size bir bilgilendirme daha göndereceğiz.`
        await sendWaMsg(sigReq.signer_phone, sMsg)
      }

      // --- Notify OTHER Signers if all are completed ---
      if (allSigned && allRequests && allRequests.length > 1) {
        for (const req of allRequests) {
          if (req.id !== sigReq.id && req.signer_phone) {
             const oMsg = `✅ *${docTitle}*\n\nSayın ${req.signer_name}, daha önce imzaladığınız belge tüm taraflarca da imzalanarak tamamlanmıştır! 🎉\nSize gönderilen linke tekrar tıklayarak belgenin PDF kopyasını görüntüleyebilir ve indirebilirsiniz.`
             await sendWaMsg(req.signer_phone, oMsg)
          }
        }
      }

    } else {
      console.warn('[sign] WA notification skipped — missing API configs:', {
        evolutionInstance: !!evolutionInstance,
        evoUrl: !!evoUrl,
        evoKey: !!evoKey,
      })
    }
  } catch (e) {
    console.error('[sign] WA TryCatch error:', e)
  }

  // 7. Send email notification to consultant
  try {
    const smtpSettings = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from_name'])

    const smtp: Record<string, string> = {}
    for (const row of smtpSettings.data || []) {
      // Handle JSON-encoded values (some are stored as "\"value\"")
      let val = String(row.value || '')
      // Remove surrounding quotes at any depth
      while (val.startsWith('"') && val.endsWith('"') && val.length > 1) {
        val = val.slice(1, -1)
      }
      smtp[row.key] = val
    }

    console.log('[sign] SMTP config:', { host: smtp.smtp_host, port: smtp.smtp_port, user: smtp.smtp_user, passLen: smtp.smtp_pass?.length || 0 })

    if (smtp.smtp_host && smtp.smtp_user && smtp.smtp_pass) {
      // Get consultant email + doc title
      const { data: emailDoc } = await supabase
        .from('documents')
        .select('title, consultant:consultants(full_name, email)')
        .eq('id', sigReq.document_id)
        .single()

      const rawC = emailDoc?.consultant
      const cons = (Array.isArray(rawC) ? rawC[0] : rawC) as { full_name: string; email?: string } | null
      const consultantEmail = cons?.email

      console.log('[sign] Consultant email:', consultantEmail, '| Doc:', emailDoc?.title)

      if (consultantEmail) {
        const port = parseInt(smtp.smtp_port || '587')
        const transporter = nodemailer.createTransport({
          host: smtp.smtp_host,
          port,
          secure: port === 465,
          auth: { user: smtp.smtp_user, pass: smtp.smtp_pass },
        })

        // Verify SMTP connection
        await transporter.verify()
        console.log('[sign] SMTP connection verified')

        const docTitle = emailDoc?.title || 'Belge'
        const signerInfo = `${sigReq.signer_name} (${sigReq.signer_role || 'İmzacı'})`
        const fromName = smtp.smtp_from_name || 'Ambiance Gayrimenkul'
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || ''

        const subject = allSigned
          ? `${docTitle} — Tüm İmzalar Tamamlandı`
          : `${docTitle} — Yeni İmza: ${sigReq.signer_name}`

        const html = allSigned
          ? `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
              <h2 style="color:#16a34a;margin-bottom:8px;">Tüm İmzalar Tamamlandı!</h2>
              <p style="color:#333;font-size:15px;line-height:1.6;">
                <strong>${docTitle}</strong> belgesi tüm taraflarca imzalanarak tamamlanmıştır.
              </p>
              <p style="color:#555;font-size:14px;">Son imzalayan: <strong>${signerInfo}</strong></p>
              ${appUrl ? `<a href="${appUrl}/documents/${sigReq.document_id}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;">Belgeyi Görüntüle</a>` : ''}
              <p style="color:#999;font-size:12px;margin-top:24px;">${fromName}</p>
            </div>`
          : `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;">
              <h2 style="color:#2563eb;margin-bottom:8px;">Yeni İmza Bildirimi</h2>
              <p style="color:#333;font-size:15px;line-height:1.6;">
                <strong>${docTitle}</strong> belgesini <strong>${signerInfo}</strong> imzaladı.
              </p>
              <p style="color:#555;font-size:14px;">Diğer imzalar bekleniyor.</p>
              ${appUrl ? `<a href="${appUrl}/documents/${sigReq.document_id}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;">Belgeyi Görüntüle</a>` : ''}
              <p style="color:#999;font-size:12px;margin-top:24px;">${fromName}</p>
            </div>`

        const info = await transporter.sendMail({
          from: `"${fromName}" <${smtp.smtp_user}>`,
          to: consultantEmail,
          subject,
          html,
        })
        console.log('[sign] Email sent to', consultantEmail, '| messageId:', info.messageId)
      } else {
        console.warn('[sign] Email skipped — consultant has no email address')
      }
    } else {
      console.warn('[sign] Email skipped — SMTP not configured:', { host: !!smtp.smtp_host, user: !!smtp.smtp_user, pass: !!smtp.smtp_pass })
    }
  } catch (e) {
    console.error('[sign] Email error:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ success: true, allSigned })
}
