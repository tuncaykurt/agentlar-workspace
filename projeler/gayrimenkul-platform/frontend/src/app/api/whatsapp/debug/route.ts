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

  // Find consultant
  const { data: consultant } = await supabase
    .from('consultants')
    .select('id, full_name, wa_instance, wa_phone')
    .eq('user_id', user.id)
    .single()

  // Find chatbot config
  const { data: chatbotCfg } = await supabase
    .from('whatsapp_chatbot_config')
    .select('*')
    .eq('consultant_id', consultant?.id || '')
    .single()

  // Recent webhook logs (last 30)
  const { data: logs } = await supabase
    .from('webhook_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)

  // Recent chat history (last 20)
  const { data: chatHistory } = await supabase
    .from('whatsapp_chat_history')
    .select('*')
    .eq('consultant_id', consultant?.id || '')
    .order('created_at', { ascending: false })
    .limit(20)

  // Check Evolution API webhook registration
  const evoUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
  const evoKey = process.env.EVOLUTION_API_KEY || ''
  let webhookRegistration: any = null
  if (evoUrl && evoKey && consultant?.wa_instance) {
    try {
      const res = await fetch(`${evoUrl}/webhook/find/${consultant.wa_instance}`, {
        headers: { apikey: evoKey },
        signal: AbortSignal.timeout(8000),
      })
      const text = await res.text()
      try {
        webhookRegistration = JSON.parse(text)
      } catch {
        webhookRegistration = { raw: text.slice(0, 500), status: res.status }
      }
    } catch (e: any) {
      webhookRegistration = { error: e?.message || String(e) }
    }
  }

  // Check Evolution API connection state
  let connectionState: any = null
  if (evoUrl && evoKey && consultant?.wa_instance) {
    try {
      const res = await fetch(`${evoUrl}/instance/connectionState/${consultant.wa_instance}`, {
        headers: { apikey: evoKey },
        signal: AbortSignal.timeout(8000),
      })
      connectionState = await res.json()
    } catch (e: any) {
      connectionState = { error: e?.message || String(e) }
    }
  }

  return NextResponse.json({
    consultant: consultant ? { id: consultant.id, full_name: consultant.full_name, wa_instance: consultant.wa_instance, wa_phone: consultant.wa_phone } : null,
    chatbot_config: chatbotCfg,
    expected_webhook_url: `${(process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')}/api/whatsapp/webhook`,
    evolution_webhook_registration: webhookRegistration,
    evolution_connection_state: connectionState,
    env: {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || null,
      EVOLUTION_API_URL: evoUrl || null,
      OPENROUTER_API_KEY_set: !!process.env.OPENROUTER_API_KEY,
    },
    recent_webhook_logs: logs,
    recent_chat_history: chatHistory,
  })
}
