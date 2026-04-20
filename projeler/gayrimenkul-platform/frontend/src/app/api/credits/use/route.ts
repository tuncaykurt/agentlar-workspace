import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

// POST /api/credits/use — Deduct credits for document creation
// Called before document is saved. Returns success or insufficient balance.
export async function POST(req: NextRequest) {
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

  const { document_id, document_title } = await req.json()

  // Use service role for atomic update
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

  if (!consultant) return NextResponse.json({ error: 'Danışman bulunamadı' }, { status: 404 })

  // Admin doesn't need credits
  if (consultant.role === 'admin') {
    return NextResponse.json({ success: true, balance: consultant.credit_balance ?? 0, admin_bypass: true })
  }

  // Get credit cost setting
  const { data: costSetting } = await serviceSupabase
    .from('settings')
    .select('value')
    .eq('key', 'credit_cost_per_document')
    .single()

  const cost = parseInt(String(costSetting?.value || '1').replace(/"/g, ''), 10) || 1
  const currentBalance = consultant.credit_balance ?? 0

  if (currentBalance < cost) {
    return NextResponse.json({
      error: 'Yetersiz kredi',
      balance: currentBalance,
      cost,
      needed: cost - currentBalance,
    }, { status: 402 })
  }

  const newBalance = currentBalance - cost

  // Deduct
  const { error: updateErr } = await serviceSupabase
    .from('consultants')
    .update({ credit_balance: newBalance })
    .eq('id', consultant.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Log
  await serviceSupabase.from('credit_transactions').insert({
    consultant_id: consultant.id,
    amount: -cost,
    balance_after: newBalance,
    transaction_type: 'document_usage',
    description: `Belge oluşturma: ${document_title || 'Belge'}`,
    reference_id: document_id || null,
  })

  return NextResponse.json({
    success: true,
    balance: newBalance,
    cost,
  })
}
