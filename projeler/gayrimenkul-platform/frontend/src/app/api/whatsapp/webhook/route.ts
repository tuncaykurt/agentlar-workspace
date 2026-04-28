import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

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

  // Load chatbot config
  const { data: config } = await supabase
    .from('whatsapp_chatbot_config')
    .select('*')
    .eq('consultant_id', consultant.id)
    .single()

  if (!config?.is_enabled || !config?.auto_reply_enabled) {
    return NextResponse.json({ ok: true, skipped: 'chatbot disabled' })
  }

  // Check working hours
  if (config.working_hours_enabled) {
    if (!isInWorkingHours(config.working_hours_start, config.working_hours_end)) {
      await sendWhatsApp(customerPhone, config.outside_hours_message, instanceName)
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
    .limit(config.max_history_messages || 10)

  const messages = (history || []).reverse()

  // Generate AI response
  let aiReply = ''
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (anthropicKey) {
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey })
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: config.system_prompt,
        messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
      })
      aiReply = (response.content[0] as any)?.text || ''
    } catch (e) {
      console.error('[chatbot] Anthropic error:', e)
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
