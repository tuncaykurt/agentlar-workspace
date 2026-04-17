import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'all'
  const search = searchParams.get('q') || ''

  let query = supabase
    .from('market_listings')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('last_seen_at', { ascending: false })
    .limit(100)

  if (status !== 'all') {
    query = query.eq('contact_status', status)
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,city.ilike.%${search}%,district.ilike.%${search}%,seller_name.ilike.%${search}%`)
  }

  const { data, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ listings: data || [], count: count || 0 })
}
