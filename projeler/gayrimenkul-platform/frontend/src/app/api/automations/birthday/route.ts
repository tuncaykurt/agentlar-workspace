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

  let { data: config } = await supabase
    .from('birthday_automation_config')
    .select('*')
    .eq('consultant_id', consultant.id)
    .single()

  // Auto-create default config if missing
  if (!config) {
    const { data: created } = await supabase
      .from('birthday_automation_config')
      .insert({
        consultant_id: consultant.id,
        is_enabled: false,
        trigger_time: '09:00',
        system_prompt: 'Müşterilerinin doğum gününü kutlarsın.',
        message_template: 'Merhaba {hitap} {ad}, doğum gününüz kutlu olsun! 🎂',
        contact_filter: 'all',
        selected_contact_ids: [],
        selected_model: 'google/gemini-2.5-flash',
        personality_preset: 'samimi',
        temperature: 0.8,
        example_dialogues: '',
        enabled_tools: [],
      })
      .select('*')
      .single()
    config = created
  }

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

  const { data: saved, error } = await supabase
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
      personality_preset: body.personality_preset || 'samimi',
      temperature: body.temperature ?? 0.8,
      example_dialogues: body.example_dialogues || '',
      enabled_tools: body.enabled_tools || [],
      debounce_seconds: body.debounce_seconds ?? 5,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'consultant_id' }).select('*').single()

  if (error) {
    console.error('[birthday save] error:', error)
    return NextResponse.json({ error: error.message, details: error }, { status: 500 })
  }
  return NextResponse.json({ success: true, config: saved })
}
