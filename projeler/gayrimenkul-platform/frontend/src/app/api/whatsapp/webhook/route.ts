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
  if (!baseUrl || !apiKey) return

  let num = phone.replace(/\D/g, '')
  if (num.startsWith('0')) num = '90' + num.slice(1)
  else if (num.startsWith('5') && num.length === 10) num = '90' + num
  else if (!num.startsWith('90')) num = '90' + num

  await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number: num + '@s.whatsapp.net', text: message }),
  }).catch(() => {})
}

// POST — Evolution API calls this when a message arrives
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }) }

  // Only handle incoming messages
  const event = body?.event
  if (event !== 'messages.upsert' && event !== 'message') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const data = body?.data
  const key = data?.key
  if (!key || key.fromMe) return NextResponse.json({ ok: true, skipped: 'fromMe' })

  // Extract message text
  const msg = data?.message
  const text = msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || ''
  if (!text?.trim()) return NextResponse.json({ ok: true, skipped: 'no text' })

  // Extract customer phone (remove @s.whatsapp.net suffix)
  const remoteJid: string = key?.remoteJid || ''
  if (remoteJid.endsWith('@g.us')) return NextResponse.json({ ok: true, skipped: 'group' })
  const customerPhone = remoteJid.replace('@s.whatsapp.net', '')

  // Determine which instance received this
  const instanceName: string = body?.instance || body?.instanceName || ''
  if (!instanceName) return NextResponse.json({ ok: false, error: 'no instance' })

  const supabase = svc()

  // Find consultant by wa_instance
  const { data: consultant } = await supabase
    .from('consultants')
    .select('id, full_name, wa_instance')
    .eq('wa_instance', instanceName)
    .single()

  if (!consultant) return NextResponse.json({ ok: false, error: 'consultant not found for instance' })

  // Load chatbot config — whatsapp_chatbot_config önce, yoksa birthday_automation_config'e bak
  const { data: chatbotConfig } = await supabase
    .from('whatsapp_chatbot_config')
    .select('*')
    .eq('consultant_id', consultant.id)
    .single()

  const { data: birthdayConfig } = await supabase
    .from('birthday_automation_config')
    .select('system_prompt, selected_model')
    .eq('consultant_id', consultant.id)
    .single()

  // Chatbot aktif mi? whatsapp_chatbot_config veya birthday ayarlarından birinde model varsa devam et
  const hasChatbotConfig = chatbotConfig?.is_enabled && chatbotConfig?.auto_reply_enabled
  const hasBirthdayModel = !!(birthdayConfig?.selected_model)

  if (!hasChatbotConfig && !hasBirthdayModel) {
    return NextResponse.json({ ok: true, skipped: 'chatbot disabled' })
  }

  // Ayarları birleştir: chatbot_config öncelikli, yoksa birthday_config
  const effectiveSystemPrompt = chatbotConfig?.system_prompt || birthdayConfig?.system_prompt || 'Sen yardımsever bir gayrimenkul danışmanı asistanısın.'
  const effectiveModel = chatbotConfig?.selected_model || birthdayConfig?.selected_model || 'anthropic/claude-haiku-4-5'
  const effectiveMaxHistory = chatbotConfig?.max_history_messages ?? 10

  // Çalışma saati kontrolü (sadece chatbot_config varsa)
  if (chatbotConfig?.working_hours_enabled) {
    if (!isInWorkingHours(chatbotConfig.working_hours_start, chatbotConfig.working_hours_end)) {
      await sendWhatsApp(customerPhone, chatbotConfig.outside_hours_message, instanceName)
      return NextResponse.json({ ok: true, sent: 'outside hours message' })
    }
  }

  // Save customer message to history
  await supabase.from('whatsapp_chat_history').insert({
    consultant_id: consultant.id,
    customer_phone: customerPhone,
    role: 'user',
    content: text.trim(),
  })

  // Load recent history for context
  const { data: history } = await supabase
    .from('whatsapp_chat_history')
    .select('role, content')
    .eq('consultant_id', consultant.id)
    .eq('customer_phone', customerPhone)
    .order('created_at', { ascending: false })
    .limit(effectiveMaxHistory)

  const messages = (history || []).reverse()

  // Generate AI response via OpenRouter
  let aiReply = ''
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
      if (res.ok) {
        const data = await res.json()
        aiReply = data?.choices?.[0]?.message?.content || ''
      } else {
        console.error('[chatbot] OpenRouter error:', res.status, await res.text())
        aiReply = 'Şu anda size yardımcı olamıyorum, lütfen daha sonra tekrar deneyin.'
      }
    } catch (e) {
      console.error('[chatbot] OpenRouter fetch error:', e)
      aiReply = 'Şu anda size yardımcı olamıyorum, lütfen daha sonra tekrar deneyin.'
    }
  } else {
    aiReply = 'Mesajınızı aldık, en kısa sürede size döneceğiz.'
  }

  if (!aiReply) return NextResponse.json({ ok: false, error: 'no AI reply' })

  // Save AI reply to history
  await supabase.from('whatsapp_chat_history').insert({
    consultant_id: consultant.id,
    customer_phone: customerPhone,
    role: 'assistant',
    content: aiReply,
  })

  // Send the reply
  await sendWhatsApp(customerPhone, aiReply, instanceName)

  return NextResponse.json({ ok: true, replied: true })
}
