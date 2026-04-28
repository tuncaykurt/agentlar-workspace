import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

const FIELDS = 'id, full_name, wa_phone, office_phone, ticari_yetki_belgesi_no, phone, email, address, role'

export async function GET() {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Try service role first (bypasses RLS — works if key is set)
  const serviceClient = getServiceClient()
  if (serviceClient) {
    const { data, error } = await serviceClient
      .from('consultants')
      .select(FIELDS)
      .order('full_name', { ascending: true })

    if (!error && data && data.length > 0) {
      return NextResponse.json({ consultants: data })
    }
    if (error) {
      console.error('[consultants/list] service role error:', error.message)
    }
  }

  // Fallback: fetch only the current user's own consultant record via anon key
  // (works even without service role key, because features API already does this)
  const { data: own, error: ownError } = await userSupabase
    .from('consultants')
    .select(FIELDS)
    .eq('user_id', user.id)
    .single()

  if (ownError) {
    console.error('[consultants/list] fallback error:', ownError.message)
    return NextResponse.json({ error: ownError.message }, { status: 500 })
  }

  return NextResponse.json({ consultants: own ? [own] : [] })
}
