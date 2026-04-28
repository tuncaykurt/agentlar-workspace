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

export async function GET() {
  const userSb = await createServerSupabaseClient()
  const { data: { user } } = await userSb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = svc()
  const { data: consultant } = await supabase.from('consultants').select('id').eq('user_id', user.id).single()
  if (!consultant) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })

  const { data: config } = await supabase
    .from('whatsapp_chatbot_config').select('*').eq('consultant_id', consultant.id).single()

  return NextResponse.json({ config: config || null, consultant_id: consultant.id })
}

export async function POST(req: NextRequest) {
  const userSb = await createServerSupabaseClient()
  const { data: { user } } = await userSb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const supabase = svc()
  const { data: consultant } = await supabase.from('consultants').select('id').eq('user_id', user.id).single()
  if (!consultant) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 })

  const { error } = await supabase.from('whatsapp_chatbot_config').upsert({
    consultant_id: consultant.id,
    is_enabled: body.is_enabled,
    auto_reply_enabled: body.auto_reply_enabled,
    system_prompt: body.system_prompt,
    working_hours_enabled: body.working_hours_enabled,
    working_hours_start: body.working_hours_start,
    working_hours_end: body.working_hours_end,
    outside_hours_message: body.outside_hours_message,
    max_history_messages: body.max_history_messages,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'consultant_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
