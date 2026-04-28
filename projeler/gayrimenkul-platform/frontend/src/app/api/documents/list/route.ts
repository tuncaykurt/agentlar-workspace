import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const userSupabase = await createServerSupabaseClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()

  // Get consultant record to check role and filter
  const { data: consultant } = await supabase
    .from('consultants')
    .select('id, role')
    .eq('user_id', user.id)
    .single()

  const isAdmin = consultant?.role === 'admin'

  const { searchParams } = new URL(req.url)
  const filterStatus = searchParams.get('status')

  let query = supabase
    .from('documents')
    .select('*, client:clients(full_name), property:properties(title)')
    .order('created_at', { ascending: false })

  // Non-admins only see their own documents
  if (!isAdmin && consultant?.id) {
    query = query.eq('consultant_id', consultant.id)
  }

  if (filterStatus && filterStatus !== 'all') {
    query = query.eq('signature_status', filterStatus)
  }

  const { data, error } = await query

  if (error) {
    console.error('[documents/list] Query error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ documents: data || [] })
}
