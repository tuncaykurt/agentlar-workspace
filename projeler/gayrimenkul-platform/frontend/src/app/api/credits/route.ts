import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    },
  )
}

async function getAuthConsultant(supabase: ReturnType<typeof createServerClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('consultants')
    .select('id, role, credit_balance')
    .eq('user_id', user.id)
    .single()
  return data
}

// GET /api/credits — Get credit balance and recent transactions
export async function GET() {
  const supabase = await getSupabase()
  const consultant = await getAuthConsultant(supabase)
  if (!consultant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: transactions } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('consultant_id', consultant.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({
    balance: consultant.credit_balance ?? 0,
    transactions: transactions || [],
  })
}

// POST /api/credits — Admin: grant/deduct credits for a consultant
export async function POST(req: NextRequest) {
  const supabase = await getSupabase()
  const admin = await getAuthConsultant(supabase)
  if (!admin || admin.role !== 'admin') {
    return NextResponse.json({ error: 'Yetkiniz yok' }, { status: 403 })
  }

  const { consultant_id, amount, description } = await req.json()

  if (!consultant_id || typeof amount !== 'number' || amount === 0) {
    return NextResponse.json({ error: 'Geçersiz parametreler' }, { status: 400 })
  }

  // Use service role for the update to bypass RLS
  const serviceSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } },
  )

  // Get current balance
  const { data: target } = await serviceSupabase
    .from('consultants')
    .select('id, credit_balance, full_name')
    .eq('id', consultant_id)
    .single()

  if (!target) {
    return NextResponse.json({ error: 'Danışman bulunamadı' }, { status: 404 })
  }

  const currentBalance = target.credit_balance ?? 0
  const newBalance = currentBalance + amount

  if (newBalance < 0) {
    return NextResponse.json({ error: 'Bakiye negatife düşemez' }, { status: 400 })
  }

  // Update balance
  const { error: updateErr } = await serviceSupabase
    .from('consultants')
    .update({ credit_balance: newBalance })
    .eq('id', consultant_id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Log transaction
  await serviceSupabase.from('credit_transactions').insert({
    consultant_id,
    amount,
    balance_after: newBalance,
    transaction_type: amount > 0 ? 'admin_grant' : 'admin_deduct',
    description: description || (amount > 0 ? 'Admin kredi yükleme' : 'Admin kredi düşme'),
    created_by: admin.id,
  })

  return NextResponse.json({
    success: true,
    new_balance: newBalance,
    consultant_name: target.full_name,
  })
}
