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

  let { data: config } = await supabase
    .from('whatsapp_chatbot_config').select('*').eq('consultant_id', consultant.id).single()

  // Auto-create default config if missing
  if (!config) {
    const { data: created } = await supabase
      .from('whatsapp_chatbot_config')
      .insert({
        consultant_id: consultant.id,
        is_enabled: false,
        auto_reply_enabled: true,
        system_prompt: 'Sen bir gayrimenkul danışmanı asistanısın. Müşterilerin sorularını kısa, samimi ve profesyonel bir şekilde yanıtlıyorsun.',
        working_hours_enabled: false,
        working_hours_start: '09:00',
        working_hours_end: '18:00',
        outside_hours_message: 'Mesai saatlerimiz dışındasınız. Yarın size döneceğiz.',
        max_history_messages: 10,
        selected_model: 'google/gemini-2.5-flash',
        personality_preset: 'samimi',
        temperature: 0.7,
        example_dialogues: '',
        enabled_tools: [],
      })
      .select('*')
      .single()
    config = created
  }

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

  const { data: saved, error } = await supabase.from('whatsapp_chatbot_config').upsert({
    consultant_id: consultant.id,
    is_enabled: body.is_enabled,
    auto_reply_enabled: body.auto_reply_enabled,
    system_prompt: body.system_prompt,
    working_hours_enabled: body.working_hours_enabled,
    working_hours_start: body.working_hours_start,
    working_hours_end: body.working_hours_end,
    outside_hours_message: body.outside_hours_message,
    max_history_messages: body.max_history_messages,
    selected_model: body.selected_model,
    personality_preset: body.personality_preset || 'samimi',
    temperature: body.temperature ?? 0.7,
    example_dialogues: body.example_dialogues || '',
    enabled_tools: body.enabled_tools || [],
    debounce_seconds: body.debounce_seconds ?? 5,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'consultant_id' }).select('*').single()

  if (error) {
    console.error('[chatbot save] error:', error)
    return NextResponse.json({ error: error.message, details: error }, { status: 500 })
  }
  return NextResponse.json({ success: true, config: saved })
}
