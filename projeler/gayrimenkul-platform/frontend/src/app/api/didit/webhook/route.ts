import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// DiDit sends POST when session status changes.
// vendor_data = our sign token, status = DiDit session status.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const signToken = body.vendor_data as string | undefined
  const status = body.status as string | undefined

  if (!signToken || !status) {
    console.warn('[didit-webhook] Missing vendor_data or status:', JSON.stringify(body))
    return NextResponse.json({ received: true })
  }

  const kycStatus =
    status === 'Approved' ? 'approved' :
    status === 'Declined' ? 'declined' :
    status === 'Expired'  ? 'expired'  : 'pending'

  const supabase = getServiceClient()

  const { error } = await supabase
    .from('signature_requests')
    .update({
      kyc_status: kycStatus,
      kyc_verified_at: kycStatus === 'approved' ? new Date().toISOString() : null,
    })
    .eq('token', signToken)

  if (error) {
    console.error('[didit-webhook] DB update error:', error.message)
  } else {
    console.log(`[didit-webhook] token=${signToken} didit_status=${status} → kyc_status=${kycStatus}`)
  }

  return NextResponse.json({ received: true })
}
