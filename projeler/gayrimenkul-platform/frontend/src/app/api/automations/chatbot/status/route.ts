import { NextResponse } from 'next/server'
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
  const { data: consultant } = await supabase
    .from('consultants')
    .select('id, wa_instance, wa_phone')
    .eq('user_id', user.id)
    .single()

  const { data: chatbotCfg } = await supabase
    .from('whatsapp_chatbot_config')
    .select('is_enabled, auto_reply_enabled, selected_model')
    .eq('consultant_id', consultant?.id || '')
    .single()

  const { data: birthdayCfg } = await supabase
    .from('birthday_automation_config')
    .select('selected_model')
    .eq('consultant_id', consultant?.id || '')
    .single()

  // Check if webhook is registered
  let webhookRegistered = false
  const evoUrl = process.env.EVOLUTION_API_URL
  const evoKey = process.env.EVOLUTION_API_KEY
  if (evoUrl && evoKey && consultant?.wa_instance) {
    try {
      const res = await fetch(`${evoUrl}/webhook/find/${consultant.wa_instance}`, {
        headers: { apikey: evoKey },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const data = await res.json()
        const url: string = data?.url || data?.webhook?.url || ''
        webhookRegistered = url.includes('/api/whatsapp/webhook')
      }
    } catch { /* ignore */ }
  }

  const activeModel = chatbotCfg?.selected_model || ''
  const chatbotEnabled = !!(chatbotCfg?.is_enabled && chatbotCfg?.auto_reply_enabled)

  // wa_connected: wa_instance varsa bağlı sayılır (wa_phone her zaman dolu olmayabilir)
  let waConnected = !!(consultant?.wa_instance)
  if (waConnected && evoUrl && evoKey) {
    try {
      const stateRes = await fetch(`${evoUrl}/instance/connectionState/${consultant!.wa_instance}`, {
        headers: { apikey: evoKey },
        signal: AbortSignal.timeout(5000),
      })
      if (stateRes.ok) {
        const stateData = await stateRes.json()
        const state: string = stateData?.instance?.state || stateData?.state || ''
        waConnected = state === 'open'
      }
    } catch { /* ignore, keep wa_instance based check */ }
  }

  return NextResponse.json({
    wa_connected: waConnected,
    wa_instance: consultant?.wa_instance || null,
    webhook_registered: webhookRegistered,
    chatbot_enabled: chatbotEnabled,
    model_selected: !!activeModel,
    active_model: activeModel,
    openrouter_configured: !!(process.env.OPENROUTER_API_KEY),
    ready: !!(consultant?.wa_instance && webhookRegistered && activeModel && process.env.OPENROUTER_API_KEY && chatbotEnabled),
  })
}
