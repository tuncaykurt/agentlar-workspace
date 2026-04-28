import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET() {
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

  // 1. Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Get consultant profile (only columns guaranteed to exist from migration 001 + 006)
  const { data: consultant } = await supabase
    .from('consultants')
    .select('id, role, credit_balance, is_active, full_name, phone, email, address, wa_phone')
    .eq('user_id', user.id)
    .single()

  if (!consultant) {
    return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })
  }

  // 3. Get all feature configs
  const { data: features } = await supabase
    .from('feature_config')
    .select('*')
    .order('sort_order')

  // 4. Get consultant-specific overrides
  const { data: overrides } = await supabase
    .from('consultant_feature_overrides')
    .select('feature_key, is_enabled')
    .eq('consultant_id', consultant.id)

  const overrideMap: Record<string, boolean> = {}
  for (const o of overrides || []) {
    overrideMap[o.feature_key] = o.is_enabled
  }

  // 5. Calculate enabled features
  const isAdmin = consultant.role === 'admin'
  const enabledFeatures: string[] = []

  for (const f of features || []) {
    if (isAdmin) {
      // Admin sees everything
      enabledFeatures.push(f.feature_key)
      continue
    }

    // Check consultant-specific override first
    if (overrideMap[f.feature_key] !== undefined) {
      if (overrideMap[f.feature_key]) enabledFeatures.push(f.feature_key)
      continue
    }

    // Check global config
    if (f.is_enabled && (f.enabled_for_roles || []).includes(consultant.role)) {
      enabledFeatures.push(f.feature_key)
    }
  }

  // 6. Get credit settings
  const { data: creditSettings } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['credit_cost_per_document', 'initial_free_credits'])

  const settings: Record<string, number> = {}
  for (const s of creditSettings || []) {
    settings[s.key] = parseInt(String(s.value).replace(/"/g, ''), 10) || 0
  }

  return NextResponse.json({
    consultant_id: consultant.id,
    consultant_full_name: consultant.full_name,
    consultant_wa_phone: consultant.wa_phone,
    consultant_phone: consultant.phone,
    consultant_email: consultant.email,
    consultant_address: consultant.address,
    role: consultant.role,
    credit_balance: consultant.credit_balance ?? 0,
    enabled_features: enabledFeatures,
    credit_cost_per_document: settings.credit_cost_per_document ?? 1,
    initial_free_credits: settings.initial_free_credits ?? 5,
    is_admin: isAdmin,
    is_active: consultant.is_active,
  })
}
