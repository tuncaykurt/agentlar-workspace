import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function logWebhook(opts: { event?: string; instance?: string; payload?: any; result: string }) {
  try {
    await svc().from('webhook_logs').insert({
      source: 'whatsapp',
      event: opts.event || null,
      instance: opts.instance || null,
      payload: opts.payload || null,
      result: opts.result,
    })
  } catch { /* ignore */ }
}

function nowTR() {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const hh = String(now.getUTCHours()).padStart(2, '0')
  const mm = String(now.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function isInWorkingHours(start: string, end: string): boolean {
  const current = nowTR()
  return current >= start && current <= end
}

async function sendWhatsApp(phone: string, message: string, instance: string) {
  const baseUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!baseUrl || !apiKey) return { ok: false, error: 'no Evolution config' }

  let num = phone.replace(/\D/g, '')
  if (num.startsWith('0')) num = '90' + num.slice(1)
  else if (num.startsWith('5') && num.length === 10) num = '90' + num
  else if (!num.startsWith('90')) num = '90' + num

  try {
    const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: num + '@s.whatsapp.net', text: message }),
    })
    const txt = await res.text().catch(() => '')
    return { ok: res.ok, status: res.status, body: txt.slice(0, 200) }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

// GET — Evolution API pings this to verify the webhook URL is reachable
export async function GET() {
  return NextResponse.json({ ok: true, service: 'whatsapp-webhook' })
}

// POST — Evolution API calls this when a message arrives
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    await logWebhook({ result: 'invalid json' })
    return NextResponse.json({ ok: false })
  }

  const event = body?.event
  const instanceName: string = body?.instance || body?.instanceName || ''

  // Only handle incoming messages
  if (event !== 'messages.upsert' && event !== 'message' && event !== 'MESSAGES_UPSERT') {
    await logWebhook({ event, instance: instanceName, payload: body, result: `skipped: event=${event}` })
    return NextResponse.json({ ok: true, skipped: true })
  }

  const data = body?.data
  const key = data?.key
  if (!key || key.fromMe) {
    await logWebhook({ event, instance: instanceName, payload: body, result: 'skipped: fromMe or no key' })
    return NextResponse.json({ ok: true, skipped: 'fromMe' })
  }

  const msg = data?.message
  const text = msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || ''
  if (!text?.trim()) {
    await logWebhook({ event, instance: instanceName, payload: body, result: 'skipped: no text' })
    return NextResponse.json({ ok: true, skipped: 'no text' })
  }

  const remoteJid: string = key?.remoteJid || ''
  if (remoteJid.endsWith('@g.us')) {
    await logWebhook({ event, instance: instanceName, result: 'skipped: group' })
    return NextResponse.json({ ok: true, skipped: 'group' })
  }
  const customerPhone = remoteJid.replace('@s.whatsapp.net', '')

  if (!instanceName) {
    await logWebhook({ event, payload: body, result: 'no instance in payload' })
    return NextResponse.json({ ok: false, error: 'no instance' })
  }

  const supabase = svc()

  // Find consultant by wa_instance
  const { data: consultantByInstance } = await supabase
    .from('consultants')
    .select('id, full_name, wa_instance')
    .eq('wa_instance', instanceName)
    .single()
  let consultant = consultantByInstance

  // Fallback: find any consultant with wa_instance set
  if (!consultant) {
    const { data: all } = await supabase
      .from('consultants')
      .select('id, full_name, wa_instance')
      .not('wa_instance', 'is', null)
      .limit(1)
    consultant = all?.[0] || null
  }

  if (!consultant) {
    await logWebhook({ event, instance: instanceName, result: 'no consultant found' })
    return NextResponse.json({ ok: false, error: 'no consultant with wa_instance found' })
  }

  // Check if this customer received a birthday message previously
  const { data: priorMsgs } = await supabase
    .from('whatsapp_chat_history')
    .select('id')
    .eq('consultant_id', consultant.id)
    .eq('customer_phone', customerPhone)
    .eq('role', 'assistant')
    .limit(1)
  const hasPriorContact = (priorMsgs?.length ?? 0) > 0

  // Load both configs
  const [{ data: chatbotCfg }, { data: birthdayCfg }] = await Promise.all([
    supabase
      .from('whatsapp_chatbot_config')
      .select('is_enabled, auto_reply_enabled, system_prompt, selected_model, working_hours_enabled, working_hours_start, working_hours_end, outside_hours_message, max_history_messages')
      .eq('consultant_id', consultant.id)
      .single(),
    supabase
      .from('birthday_automation_config')
      .select('is_enabled, system_prompt, selected_model')
      .eq('consultant_id', consultant.id)
      .single(),
  ])

  // Decide which config to use:
  // - If customer received birthday msg AND birthday config enabled → use birthday config
  // - Else if general chatbot enabled → use chatbot config
  // - Else skip
  let effectiveModel = ''
  let effectiveSystemPrompt = ''
  let configSource = ''
  const maxHistory = chatbotCfg?.max_history_messages ?? 10

  if (hasPriorContact && birthdayCfg?.is_enabled && birthdayCfg?.selected_model) {
    effectiveModel = birthdayCfg.selected_model
    effectiveSystemPrompt = birthdayCfg.system_prompt || 'Sen yardımsever bir gayrimenkul danışmanı asistanısın.'
    configSource = 'birthday'
  } else if (chatbotCfg?.is_enabled && chatbotCfg?.auto_reply_enabled && chatbotCfg?.selected_model) {
    effectiveModel = chatbotCfg.selected_model
    effectiveSystemPrompt = chatbotCfg.system_prompt || 'Sen yardımsever bir gayrimenkul danışmanı asistanısın.'
    configSource = 'chatbot'
  } else {
    await logWebhook({
      event,
      instance: instanceName,
      result: `skipped: no matching config (hasPriorContact=${hasPriorContact}, birthday_enabled=${birthdayCfg?.is_enabled}, chatbot_enabled=${chatbotCfg?.is_enabled})`,
    })
    return NextResponse.json({ ok: true, skipped: 'no matching config' })
  }

  if (chatbotCfg?.working_hours_enabled && configSource === 'chatbot') {
    const start = chatbotCfg.working_hours_start || '09:00'
    const end = chatbotCfg.working_hours_end || '18:00'
    if (!isInWorkingHours(start, end)) {
      const outsideMsg = chatbotCfg.outside_hours_message || 'Mesai saatlerimiz dışındasınız.'
      const sendRes = await sendWhatsApp(customerPhone, outsideMsg, instanceName)
      await logWebhook({ event, instance: instanceName, result: `outside hours, sent=${JSON.stringify(sendRes)}` })
      return NextResponse.json({ ok: true, outside_hours: true })
    }
  }

  try {
    await supabase.from('whatsapp_chat_history').insert({
      consultant_id: consultant.id,
      customer_phone: customerPhone,
      role: 'user',
      content: text.trim(),
    })
  } catch { /* ignore */ }

  const { data: history } = await supabase
    .from('whatsapp_chat_history')
    .select('role, content')
    .eq('consultant_id', consultant.id)
    .eq('customer_phone', customerPhone)
    .order('created_at', { ascending: false })
    .limit(maxHistory)

  const messages = (history || []).reverse()

  let aiReply = ''
  let aiStatus = ''
  const openrouterKey = process.env.OPENROUTER_API_KEY

  if (openrouterKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://gayrimenkul.yapayzekaotomasyon.cloud',
          'X-Title': 'Gayrimenkul Platform Chatbot',
        },
        body: JSON.stringify({
          model: effectiveModel,
          max_tokens: 500,
          messages: [
            { role: 'system', content: effectiveSystemPrompt },
            ...messages.map((m: any) => ({ role: m.role, content: m.content })),
          ],
        }),
        signal: AbortSignal.timeout(30000),
      })
      aiStatus = `openrouter status=${res.status}`
      if (res.ok) {
        const data = await res.json()
        aiReply = data?.choices?.[0]?.message?.content || ''
      } else {
        const errText = await res.text()
        aiStatus = `openrouter ${res.status}: ${errText.slice(0, 200)}`
        aiReply = 'Şu anda size yardımcı olamıyorum, lütfen daha sonra tekrar deneyin.'
      }
    } catch (e: any) {
      aiStatus = `openrouter exception: ${e?.message}`
      aiReply = 'Şu anda size yardımcı olamıyorum, lütfen daha sonra tekrar deneyin.'
    }
  } else {
    aiStatus = 'no OPENROUTER_API_KEY'
    aiReply = 'Mesajınızı aldık, en kısa sürede size döneceğiz.'
  }

  if (!aiReply) {
    await logWebhook({ event, instance: instanceName, result: `no AI reply (${aiStatus})` })
    return NextResponse.json({ ok: false, error: 'no AI reply' })
  }

  try {
    await supabase.from('whatsapp_chat_history').insert({
      consultant_id: consultant.id,
      customer_phone: customerPhone,
      role: 'assistant',
      content: aiReply,
    })
  } catch { /* ignore */ }

  const sendRes = await sendWhatsApp(customerPhone, aiReply, instanceName)
  await logWebhook({
    event,
    instance: instanceName,
    result: `replied via ${configSource} (${aiStatus}, send=${JSON.stringify(sendRes)})`,
  })

  return NextResponse.json({ ok: true, replied: true })
}
