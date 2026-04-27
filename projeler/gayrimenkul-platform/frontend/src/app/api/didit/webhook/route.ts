import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DIDIT_BASE = 'https://verification.didit.me/v3'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// DiDit v3 webhook payload can be nested under "data" or flat
// vendor_data = our sign token, status is the session status
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  console.log('[didit-webhook] Received payload:', JSON.stringify(body).slice(0, 500))

  // v3 wraps payload under "data", older versions are flat
  const payload = (body.data as Record<string, unknown>) ?? body

  // Extract vendor_data (= our sign token) — try multiple paths
  const signToken = (
    payload.vendor_data ??
    body.vendor_data ??
    (payload.session as Record<string, unknown>)?.vendor_data
  ) as string | undefined

  // Extract session_id for identity retrieval
  const sessionId = (
    payload.session_id ??
    body.session_id ??
    (payload.session as Record<string, unknown>)?.id
  ) as string | undefined

  // Extract status
  const status = (payload.status ?? body.status) as string | undefined

  console.log('[didit-webhook] Parsed — token:', signToken, '| status:', status, '| session_id:', sessionId)

  if (!signToken || !status) {
    console.warn('[didit-webhook] Missing vendor_data or status in payload:', JSON.stringify(body).slice(0, 300))
    return NextResponse.json({ received: true })
  }

  const kycStatus =
    status === 'Approved'  ? 'approved'  :
    status === 'Declined'  ? 'declined'  :
    status === 'Expired'   ? 'expired'   :
    status === 'In Review' ? 'in_review' : 'pending'

  const supabase = getServiceClient()

  // Retrieve identity data + photos from DiDit when approved
  let kycIdentityData: Record<string, unknown> | null = null
  if (kycStatus === 'approved' && sessionId && process.env.DIDIT_API_KEY) {
    try {
      const sessionRes = await fetch(`${DIDIT_BASE}/session/${sessionId}/`, {
        headers: { 'x-api-key': process.env.DIDIT_API_KEY },
      })
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json()
        console.log('[didit-webhook] Session data retrieved for identity extract')
        const idVerification = (sessionData.id_verifications?.[0] ?? {}) as Record<string, unknown>
        const livenessCheck = (Array.isArray(sessionData.liveness_checks) ? sessionData.liveness_checks[0] : null) ?? {} as Record<string, unknown>
        kycIdentityData = {
          session_id: sessionId,
          full_name: idVerification.full_name,
          first_name: idVerification.first_name,
          last_name: idVerification.last_name,
          document_type: idVerification.document_type,
          document_number: idVerification.document_number,
          personal_number: idVerification.personal_number,
          date_of_birth: idVerification.date_of_birth,
          nationality: idVerification.nationality,
          gender: idVerification.gender,
          expiration_date: idVerification.expiration_date,
        }
        Object.keys(kycIdentityData).forEach(k => {
          if ((kycIdentityData as Record<string, unknown>)[k] == null) delete (kycIdentityData as Record<string, unknown>)[k]
        })
        console.log('[didit-webhook] Identity data:', JSON.stringify(kycIdentityData))

        // Download ID photos + selfie → save to Supabase Storage
        const { data: sigReqRow } = await supabase
          .from('signature_requests')
          .select('id')
          .eq('token', signToken)
          .single()

        if (sigReqRow) {
          const { error: bucketErr } = await supabase.storage.createBucket('kyc-media', {
            public: true,
            fileSizeLimit: 5242880,
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          })
          if (bucketErr && !bucketErr.message.includes('already exists')) {
            console.warn('[didit-webhook] Bucket create warning:', bucketErr.message)
          }

          const imagesToSave = [
            { key: 'id_front', url: idVerification.front_image as string | undefined },
            { key: 'id_back',  url: idVerification.back_image  as string | undefined },
            { key: 'selfie',   url: livenessCheck.reference_image as string | undefined },
          ]

          for (const img of imagesToSave) {
            if (!img.url) continue
            try {
              const imgRes = await fetch(img.url)
              if (!imgRes.ok) { console.warn(`[didit-webhook] Image fetch failed ${img.key}: ${imgRes.status}`); continue }
              const buffer = Buffer.from(await imgRes.arrayBuffer())
              const ext = img.url.split('?')[0].endsWith('.png') ? 'png' : 'jpg'
              const storagePath = `${sigReqRow.id}/${img.key}.${ext}`
              const { error: upErr } = await supabase.storage
                .from('kyc-media')
                .upload(storagePath, buffer, { contentType: `image/${ext}`, upsert: true })
              if (!upErr) {
                const { data: urlData } = supabase.storage.from('kyc-media').getPublicUrl(storagePath)
                ;(kycIdentityData as Record<string, unknown>)[`${img.key}_url`] = urlData.publicUrl
                console.log(`[didit-webhook] Saved ${img.key}:`, urlData.publicUrl)
              } else {
                console.warn(`[didit-webhook] Storage upload error ${img.key}:`, upErr.message)
              }
            } catch (imgErr) {
              console.warn(`[didit-webhook] Failed saving ${img.key}:`, imgErr)
            }
          }
        }
      }
    } catch (e) {
      console.warn('[didit-webhook] Failed to retrieve identity data:', e)
    }
  }

  const updatePayload: Record<string, unknown> = {
    kyc_status: kycStatus,
    kyc_verified_at: kycStatus === 'approved' ? new Date().toISOString() : null,
  }
  if (kycIdentityData) updatePayload.kyc_data = kycIdentityData

  const { error } = await supabase
    .from('signature_requests')
    .update(updatePayload)
    .eq('token', signToken)

  if (error) {
    console.error('[didit-webhook] DB update error:', error.message)
  } else {
    console.log(`[didit-webhook] token=${signToken} didit_status=${status} → kyc_status=${kycStatus}`)
  }

  return NextResponse.json({ received: true })
}
