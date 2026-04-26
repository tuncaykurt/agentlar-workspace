import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Called right after registration to stamp KVKK consent on the consultant record.
// Uses service role because the record was just created by trigger and RLS
// may block anon/authenticated writes at that instant.
export async function POST(req: NextRequest) {
  let body: { userId?: string; consentAt?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { userId, consentAt } = body
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const supabase = getServiceClient()

  const { error } = await supabase
    .from('consultants')
    .update({
      kvkk_consent: true,
      kvkk_consent_at: consentAt || new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (error) {
    console.error('[auth/consent] DB update error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
