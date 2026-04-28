import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// GET — load config
export async function GET() {
  const userSb = await createServerSupabaseClient()
  const { data: { user } } = await userSb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = svc()
  const { data: consultant } = await supabase
    .from('consultants').select('id').eq('user_id', user.id).single()
  if (!consultant) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })

  const { data: config } = await supabase
    .from('birthday_automation_config')
    .select('*')
    .eq('consultant_id', consultant.id)
    .single()

  return NextResponse.json({ config: config || null, consultant_id: consultant.id })
}

// POST — save config
export async function POST(req: NextRequest) {
  const userSb = await createServerSupabaseClient()
  const { data: { user } } = await userSb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const supabase = svc()

  const { data: consultant } = await supabase
    .from('consultants').select('id').eq('user_id', user.id).single()
  if (!consultant) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })

  const { error } = await supabase
    .from('birthday_automation_config')
    .upsert({
      consultant_id: consultant.id,
      is_enabled: body.is_enabled,
      trigger_time: body.trigger_time,
      system_prompt: body.system_prompt,
      message_template: body.message_template,
      contact_filter: body.contact_filter,
      selected_contact_ids: body.selected_contact_ids || [],
      selected_model: body.selected_model || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'consultant_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
