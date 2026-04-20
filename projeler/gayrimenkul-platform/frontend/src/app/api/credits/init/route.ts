import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

// POST /api/credits/init — Grant initial free credits if consultant has 0 balance and no transactions
// Called once on first dashboard load
export async function POST() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } },
  )

  // Get consultant
  const { data: consultant } = await serviceSupabase
    .from('consultants')
    .select('id, role, credit_balance')
    .eq('user_id', user.id)
    .single()

  if (!consultant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (consultant.role === 'admin') return NextResponse.json({ granted: false, reason: 'admin' })

  // Check if already received initial credits
  const { count } = await serviceSupabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('consultant_id', consultant.id)
    .eq('transaction_type', 'initial_grant')

  if ((count ?? 0) > 0) {
    return NextResponse.json({ granted: false, reason: 'already_granted' })
  }

  // Get initial credits setting
  const { data: setting } = await serviceSupabase
    .from('settings')
    .select('value')
    .eq('key', 'initial_free_credits')
    .single()

  const initialCredits = parseInt(String(setting?.value || '5').replace(/"/g, ''), 10) || 5
  if (initialCredits <= 0) return NextResponse.json({ granted: false, reason: 'initial_credits_zero' })

  const newBalance = (consultant.credit_balance ?? 0) + initialCredits

  // Grant credits
  await serviceSupabase
    .from('consultants')
    .update({ credit_balance: newBalance })
    .eq('id', consultant.id)

  await serviceSupabase.from('credit_transactions').insert({
    consultant_id: consultant.id,
    amount: initialCredits,
    balance_after: newBalance,
    transaction_type: 'initial_grant',
    description: `Hoş geldin kredisi (${initialCredits} kredi)`,
  })

  return NextResponse.json({ granted: true, amount: initialCredits, balance: newBalance })
}
