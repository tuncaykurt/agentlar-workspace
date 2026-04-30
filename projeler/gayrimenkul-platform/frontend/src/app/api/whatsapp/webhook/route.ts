import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { BUILTIN_TOOLS, buildSystemPrompt, type ToolContext } from '@/lib/chatbot-tools'

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

async function fetchMediaBase64(messageKeyId: string, instance: string): Promise<{ base64?: string; mimetype?: string; error?: string }> {
  const baseUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!baseUrl || !apiKey) return { error: 'no Evolution config' }
  try {
    const res = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ message: { key: { id: messageKeyId } }, convertToMp4: false }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { error: `Evolution media fetch ${res.status}: ${txt.slice(0, 200)}` }
    }
    const data = await res.json()
    return { base64: data?.base64, mimetype: data?.mimetype }
  } catch (e: any) {
    return { error: e?.message || String(e) }
  }
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
  const messageKeyId: string = key?.id || ''

  // Detect message type & extract text/media
  const audioMessage = msg?.audioMessage || msg?.pttMessage
  const imageMessage = msg?.imageMessage
  const hasAudio = !!audioMessage
  const hasImage = !!imageMessage

  const textContent = msg?.conversation
    || msg?.extendedTextMessage?.text
    || msg?.imageMessage?.caption
    || ''

  // If no text AND no media, skip
  if (!textContent?.trim() && !hasAudio && !hasImage) {
    await logWebhook({ event, instance: instanceName, payload: body, result: 'skipped: no text or media' })
    return NextResponse.json({ ok: true, skipped: 'no content' })
  }

  // Fetch media base64 if present
  let mediaBase64 = ''
  let mediaMimetype = ''
  let mediaKind: 'audio' | 'image' | null = null
  if (hasAudio || hasImage) {
    const fetched = await fetchMediaBase64(messageKeyId, instanceName)
    if (fetched.base64) {
      mediaBase64 = fetched.base64
      mediaMimetype = fetched.mimetype || (hasAudio ? 'audio/ogg' : 'image/jpeg')
      mediaKind = hasAudio ? 'audio' : 'image'
    } else {
      await logWebhook({ event, instance: instanceName, result: `media fetch failed: ${fetched.error}` })
    }
  }

  // Build human-readable text for storage/history
  const text = textContent.trim()
    || (hasAudio ? '[Sesli mesaj]' : hasImage ? '[Fotoğraf]' : '')

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
      .select('is_enabled, auto_reply_enabled, system_prompt, selected_model, working_hours_enabled, working_hours_start, working_hours_end, outside_hours_message, max_history_messages, personality_preset, temperature, example_dialogues, enabled_tools')
      .eq('consultant_id', consultant.id)
      .single(),
    supabase
      .from('birthday_automation_config')
      .select('is_enabled, system_prompt, selected_model, personality_preset, temperature, example_dialogues, enabled_tools')
      .eq('consultant_id', consultant.id)
      .single(),
  ])

  // Decide which config to use
  let effectiveModel = ''
  let effectiveSystemPrompt = ''
  let configSource = ''
  let temperature = 0.7
  let enabledTools: string[] = []
  const maxHistory = chatbotCfg?.max_history_messages ?? 10

  if (hasPriorContact && birthdayCfg?.is_enabled && birthdayCfg?.selected_model) {
    effectiveModel = birthdayCfg.selected_model
    effectiveSystemPrompt = buildSystemPrompt({
      basePrompt: birthdayCfg.system_prompt || 'Sen yardımsever bir gayrimenkul danışmanı asistanısın.',
      preset: birthdayCfg.personality_preset || 'samimi',
      exampleDialogues: birthdayCfg.example_dialogues || '',
      consultantName: consultant.full_name,
    })
    temperature = Number(birthdayCfg.temperature) || 0.8
    enabledTools = (birthdayCfg.enabled_tools as string[]) || []
    configSource = 'birthday'
  } else if (chatbotCfg?.is_enabled && chatbotCfg?.auto_reply_enabled && chatbotCfg?.selected_model) {
    effectiveModel = chatbotCfg.selected_model
    effectiveSystemPrompt = buildSystemPrompt({
      basePrompt: chatbotCfg.system_prompt || 'Sen yardımsever bir gayrimenkul danışmanı asistanısın.',
      preset: chatbotCfg.personality_preset || 'samimi',
      exampleDialogues: chatbotCfg.example_dialogues || '',
      consultantName: consultant.full_name,
    })
    temperature = Number(chatbotCfg.temperature) || 0.7
    enabledTools = (chatbotCfg.enabled_tools as string[]) || []
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

  // ─── Debounce: ardarda gelen mesajları toplayıp tek cevap ver ────────────
  const debounceSeconds = (configSource === 'birthday'
    ? (birthdayCfg as any)?.debounce_seconds
    : (chatbotCfg as any)?.debounce_seconds) ?? 5

  if (debounceSeconds > 0) {
    const myTimestamp = new Date().toISOString()
    // Mark this consultant+customer as having a pending message
    await supabase.from('chatbot_message_queue').upsert({
      consultant_id: consultant.id,
      customer_phone: customerPhone,
      last_msg_at: myTimestamp,
    }, { onConflict: 'consultant_id,customer_phone' })

    // Wait debounceSeconds
    await new Promise(r => setTimeout(r, debounceSeconds * 1000))

    // Check if a newer message arrived during the wait
    const { data: queueRow } = await supabase
      .from('chatbot_message_queue')
      .select('last_msg_at')
      .eq('consultant_id', consultant.id)
      .eq('customer_phone', customerPhone)
      .single()

    if (queueRow && queueRow.last_msg_at !== myTimestamp) {
      // A newer message arrived; that handler will process. Exit silently.
      await logWebhook({
        event,
        instance: instanceName,
        result: `debounced: superseded by newer message at ${queueRow.last_msg_at}`,
      })
      return NextResponse.json({ ok: true, debounced: true })
    }
  }

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

  // Build tool definitions from enabled tools
  const toolDefs = enabledTools
    .map(name => BUILTIN_TOOLS[name])
    .filter(Boolean)
    .map(t => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))

  const toolCtx: ToolContext = {
    supabase,
    consultantId: consultant.id,
    customerPhone,
  }

  async function executeTool(name: string, argsJson: string): Promise<string> {
    const tool = BUILTIN_TOOLS[name]
    if (!tool) return `Tool ${name} bulunamadı.`
    try {
      const args = argsJson ? JSON.parse(argsJson) : {}
      return await tool.execute(args, toolCtx)
    } catch (e: any) {
      return `Tool hatası: ${e?.message || String(e)}`
    }
  }

  async function callOpenRouter(model: string): Promise<{ ok: boolean; reply?: string; status?: number; error?: string; toolCallsUsed?: number }> {
    try {
      // History (older messages, plain text)
      const historyMessages = messages.slice(0, -1).map((m: any) => ({ role: m.role, content: m.content }))

      // Latest user message: with multimodal content if media present
      let latestUserContent: any = text
      if (mediaKind && mediaBase64) {
        const parts: any[] = []
        if (textContent.trim()) parts.push({ type: 'text', text: textContent.trim() })
        if (mediaKind === 'image') {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${mediaMimetype};base64,${mediaBase64}` },
          })
          if (parts.length === 1) parts.unshift({ type: 'text', text: 'Bu fotoğrafa bir cevap yaz.' })
        } else if (mediaKind === 'audio') {
          parts.push({
            type: 'input_audio',
            input_audio: {
              data: mediaBase64,
              format: (mediaMimetype.includes('mp4') || mediaMimetype.includes('m4a')) ? 'm4a' : 'ogg',
            },
          })
          if (parts.length === 1) parts.unshift({ type: 'text', text: 'Bu sesli mesajı dinle ve içeriğine göre doğal bir cevap yaz.' })
        }
        latestUserContent = parts
      }

      const conversationMessages: any[] = [
        { role: 'system', content: effectiveSystemPrompt },
        ...historyMessages,
        { role: 'user', content: latestUserContent },
      ]
      let toolCallsUsed = 0
      const maxToolRounds = 3

      for (let round = 0; round < maxToolRounds; round++) {
        const reqBody: any = {
          model,
          max_tokens: 500,
          temperature,
          messages: conversationMessages,
        }
        if (toolDefs.length > 0) {
          reqBody.tools = toolDefs
          reqBody.tool_choice = 'auto'
        }

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://gayrimenkul.yapayzekaotomasyon.cloud',
            'X-Title': 'Gayrimenkul Platform Chatbot',
          },
          body: JSON.stringify(reqBody),
          signal: AbortSignal.timeout(45000),
        })

        if (!res.ok) {
          const errText = await res.text()
          return { ok: false, status: res.status, error: errText.slice(0, 300) }
        }

        const data = await res.json()
        const choice = data?.choices?.[0]
        const msg = choice?.message
        const toolCalls = msg?.tool_calls

        if (toolCalls && toolCalls.length > 0) {
          // Add assistant's tool call message
          conversationMessages.push(msg)
          // Execute each tool and add results
          for (const tc of toolCalls) {
            toolCallsUsed++
            const result = await executeTool(tc.function.name, tc.function.arguments)
            conversationMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: result,
            })
          }
          // Loop to get final response
          continue
        }

        const reply = msg?.content || ''
        return { ok: !!reply, reply, status: res.status, toolCallsUsed }
      }
      return { ok: false, error: 'max tool rounds exceeded', toolCallsUsed }
    } catch (e: any) {
      return { ok: false, error: `exception: ${e?.message || String(e)}` }
    }
  }

  if (openrouterKey) {
    // Multimodal models (image + audio capable) — prioritize when media present
    const MULTIMODAL_MODELS = [
      'google/gemini-2.5-flash',
      'openai/gpt-4o-mini',
      'anthropic/claude-haiku-4-5',
    ]

    // Bağımsız model: SADECE config'in kendi modelini kullan, cross-config fallback yok
    // Yedek olarak sadece genel ucuz/güvenilir modelleri ekliyoruz (provider çökerse diye)
    const baseModels = [
      effectiveModel,
      'google/gemini-2.5-flash',
      'anthropic/claude-haiku-4-5',
      'openai/gpt-4o-mini',
    ]
    const fallbackModels = (mediaKind
      ? [...MULTIMODAL_MODELS, ...baseModels]
      : baseModels
    ).filter((m, i, arr): m is string => !!m && arr.indexOf(m) === i)

    const attempts: string[] = []
    for (const model of fallbackModels) {
      const result = await callOpenRouter(model)
      attempts.push(`${model}=${result.ok ? `OK(tools:${result.toolCallsUsed || 0})` : `${result.status || 'err'}:${(result.error || '').slice(0, 80)}`}`)
      if (result.ok && result.reply) {
        aiReply = result.reply
        aiStatus = `success with ${model} (tools:${result.toolCallsUsed || 0})`
        break
      }
    }
    if (!aiReply) {
      aiStatus = `all models failed: ${attempts.join(' | ')}`
    }
  } else {
    aiStatus = 'no OPENROUTER_API_KEY'
  }

  // If AI failed, don't send fallback message — just log and skip
  if (!aiReply) {
    await logWebhook({ event, instance: instanceName, result: `no AI reply (${aiStatus})` })
    return NextResponse.json({ ok: false, error: 'AI unavailable', status: aiStatus })
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
  const mediaTag = mediaKind ? ` [${mediaKind}]` : ''
  await logWebhook({
    event,
    instance: instanceName,
    result: `replied via ${configSource}${mediaTag} (${aiStatus}, send=${JSON.stringify(sendRes)})`,
  })

  return NextResponse.json({ ok: true, replied: true })
}
