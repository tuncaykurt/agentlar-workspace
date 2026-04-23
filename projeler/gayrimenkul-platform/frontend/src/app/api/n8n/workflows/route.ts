import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_USER_PROMPT = `Gönderen: {{ $('Webhook').item.json.body.data.pushName || 'Müşteri' }}
Mesaj: {{ $('Webhook').item.json.body.data.message.conversation || $('Webhook').item.json.body.data.message.extendedTextMessage?.text || '[Ses/görsel/çıkartma]' }}

Danışman olarak bu mesaja kısa ve doğal bir WhatsApp yanıtı yaz.`

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function getN8nConfig() {
  const supabase = getServiceClient()
  const { data: rows } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['n8n_url', 'n8n_api_key', 'evolution_api_url', 'evolution_api_key', 'smtp_user', 'smtp_pass', 'smtp_host', 'smtp_port', 'smtp_from_name', 'openrouter_api_key'])
  const cfg: Record<string, string> = {}
  for (const r of rows || []) cfg[r.key] = String(r.value || '').replace(/^"|"$/g, '')

  // Fallback to env variables for Evolution API
  if (!cfg.evolution_api_url) cfg.evolution_api_url = process.env.EVOLUTION_API_URL || ''
  if (!cfg.evolution_api_key) cfg.evolution_api_key = process.env.EVOLUTION_API_KEY || ''

  // Supabase config for workflow nodes that query the DB directly
  cfg.supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  cfg.supabase_service_key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  return cfg
}

async function n8nFetch(cfg: Record<string, string>, method: string, path: string, body?: object) {
  const base = cfg.n8n_url?.replace(/\/$/, '')
  const key = cfg.n8n_api_key
  if (!base || !key) throw new Error('n8n yapılandırılmamış')
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`n8n ${res.status}: ${(await res.text()).slice(0, 200)}`)
  if (res.status === 204) return {}
  return res.json()
}

// Ensure an SMTP credential exists in n8n, return its id
async function ensureSmtpCredential(
  cfg: Record<string, string>,
  smtpHost: string,
  smtpPort: string,
  smtpUser: string,
  smtpPass: string,
): Promise<string> {
  const credName = `SMTP ${smtpUser}`
  // List existing credentials and find by name
  try {
    const data = await n8nFetch(cfg, 'GET', '/credentials?limit=100')
    const creds: { id: string; name: string }[] = data.data || []
    const existing = creds.find(c => c.name === credName)
    if (existing) return existing.id
  } catch { /* if listing fails, try to create */ }

  // Create new SMTP credential
  const created = await n8nFetch(cfg, 'POST', '/credentials', {
    name: credName,
    type: 'smtp',
    data: {
      host: smtpHost,
      port: parseInt(smtpPort) || 587,
      user: smtpUser,
      password: smtpPass,
      secure: false,
    },
  })
  return created.id
}

// Find an existing credential by type or name keyword, return {id, name} or null
async function findCredentialByType(
  cfg: Record<string, string>,
  type: string,
  nameKeyword?: string,
): Promise<{ id: string; name: string } | null> {
  try {
    const data = await n8nFetch(cfg, 'GET', '/credentials?limit=100')
    const creds: { id: string; name: string; type?: string }[] = data.data || []
    // Try exact type match first
    const byType = creds.find(c => c.type === type)
    if (byType) return { id: byType.id, name: byType.name }
    // Fallback: name keyword match
    if (nameKeyword) {
      const byName = creds.find(c => c.name.toLowerCase().includes(nameKeyword.toLowerCase()))
      if (byName) return { id: byName.id, name: byName.name }
    }
    return null
  } catch {
    return null
  }
}

// Configure Evolution API webhook for an instance to forward inbound messages to n8n
async function setEvolutionWebhook(
  evolutionUrl: string,
  instanceName: string,
  instanceKey: string,
  webhookUrl: string,
): Promise<void> {
  const url = `${evolutionUrl}/webhook/set/${encodeURIComponent(instanceName)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: instanceKey,
    },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT'],
      },
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Evolution webhook ayarlanamadı: ${res.status} ${text.slice(0, 100)}`)
  }
}

// Auto-fetch per-instance API key from Evolution API and save to Supabase
async function resolveEvolutionInstanceKey(
  cfg: Record<string, string>,
  consultantId: string,
  waInstance: string,
  storedKey: string | null,
): Promise<string | null> {
  // Use stored key if already present
  if (storedKey) return storedKey

  const evolutionUrl = cfg.evolution_api_url?.replace(/\/$/, '')
  const globalKey = cfg.evolution_api_key
  if (!evolutionUrl || !globalKey || !waInstance) return null

  try {
    const res = await fetch(`${evolutionUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(waInstance)}`, {
      headers: { apikey: globalKey },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      // Response: array of { instance: {...}, hash: { apikey: "..." } }
      const list: { instance?: { instanceName?: string }; hash?: { apikey?: string } }[] = Array.isArray(data) ? data : [data]
      const match = list.find(item => item.instance?.instanceName === waInstance)
      const instanceKey = match?.hash?.apikey || null
      if (instanceKey) {
        // Persist so future requests skip this fetch
        const supabase = getServiceClient()
        await supabase.from('consultants').update({ evolution_instance_key: instanceKey }).eq('id', consultantId)
        return instanceKey
      }
    }
  } catch { /* ignore */ }

  // Fallback: use global key (single-tenant Evolution setups use one key for everything)
  return globalKey
}

// Ensure OpenRouter credential exists in n8n
async function ensureOpenRouterCredential(cfg: Record<string, string>): Promise<{ id: string; name: string } | null> {
  if (!cfg.openrouter_api_key) return null
  const existing = await findCredentialByType(cfg, 'openRouterApi')
  if (existing) return existing
  try {
    const created = await n8nFetch(cfg, 'POST', '/credentials', {
      name: 'OpenRouter account',
      type: 'openRouterApi',
      data: { apiKey: cfg.openrouter_api_key },
    })
    return { id: created.id, name: created.name }
  } catch {
    return null
  }
}

// Ensure a tag exists for the consultant, return its id
async function ensureTag(cfg: Record<string, string>, tagName: string): Promise<string> {
  const data = await n8nFetch(cfg, 'GET', '/tags?limit=100')
  const tags: { id: string; name: string }[] = data.data || []
  const existing = tags.find(t => t.name === tagName)
  if (existing) return existing.id
  const created = await n8nFetch(cfg, 'POST', '/tags', { name: tagName })
  return created.id
}

// Workflow template generator — WhatsApp (outbound, HTTP Request to Evolution API)
function buildWaWorkflow(
  templateId: string,
  workflowName: string,
  consultantId: string,
  waInstance: string,
  message: string,
  evolutionUrl: string,
  evolutionKey: string,
) {
  const webhookPath = `${templateId}-${consultantId}`
  const isCampaign = templateId === 'wa_campaign'

  const triggerNode = isCampaign
    ? {
        id: crypto.randomUUID(),
        name: 'Manuel Tetik',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [240, 300] as [number, number],
        parameters: {},
      }
    : {
        id: crypto.randomUUID(),
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [240, 300] as [number, number],
        webhookId: crypto.randomUUID(),
        parameters: {
          httpMethod: 'POST',
          path: webhookPath,
          responseMode: 'onReceived',
          responseData: 'noData',
        },
      }

  const sendNode = {
    id: crypto.randomUUID(),
    name: 'Mesaj Gönder',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [480, 300] as [number, number],
    parameters: {
      method: 'POST',
      url: `=${evolutionUrl.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(waInstance)}`,
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'apikey', value: evolutionKey }],
      },
      sendBody: true,
      contentType: 'json',
      bodyParameters: {
        parameters: [
          { name: 'number', value: '={{ $json.phone + "@s.whatsapp.net" }}' },
          { name: 'text', value: message },
        ],
      },
      options: {},
    },
  }

  const triggerName = isCampaign ? 'Manuel Tetik' : 'Webhook'

  return {
    name: workflowName,
    nodes: [triggerNode, sendNode],
    connections: {
      [triggerName]: {
        main: [[{ node: 'Mesaj Gönder', type: 'main', index: 0 }]],
      },
    },
    settings: { executionOrder: 'v1' },
  }
}

// Workflow template generator — WA AI Bot (Evolution API + AI Agent + OpenRouter + Memory)
function buildAiBotWorkflow(
  workflowName: string,
  consultantId: string,
  waInstance: string,
  systemPrompt: string,
  userPromptTemplate: string,
  evolutionUrl: string,
  evolutionKey: string,
  openRouterCred: { id: string; name: string } | null,
) {
  const webhookNode = {
    id: crypto.randomUUID(),
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2.1,
    position: [-520, -48] as [number, number],
    webhookId: crypto.randomUUID(),
    parameters: {
      httpMethod: 'POST',
      path: `wa_aibot-${consultantId}`,
      options: {},
    },
  }

  // Filter out bot's own sent messages to prevent infinite loop
  const filterNode = {
    id: crypto.randomUUID(),
    name: 'Kendi Mesajı mı?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [-304, -48] as [number, number],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{
          id: crypto.randomUUID(),
          leftValue: '={{ $json.body.data.key.fromMe }}',
          rightValue: false,
          operator: { type: 'boolean', operation: 'equals' },
        }],
        combinator: 'and',
      },
    },
  }

  const aiAgentNode: Record<string, unknown> = {
    id: crypto.randomUUID(),
    name: 'AI Agent',
    type: '@n8n/n8n-nodes-langchain.agent',
    typeVersion: 3.1,
    position: [-96, -48] as [number, number],
    parameters: {
      promptType: 'define',
      text: userPromptTemplate,
      options: {
        systemMessage: systemPrompt,
      },
    },
  }

  const openRouterNode: Record<string, unknown> = {
    id: crypto.randomUUID(),
    name: 'OpenRouter Chat Model',
    type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
    typeVersion: 1,
    position: [-144, 176] as [number, number],
    parameters: {
      model: 'google/gemini-2.5-pro',
      options: {},
    },
  }
  if (openRouterCred) {
    openRouterNode.credentials = { openRouterApi: { id: openRouterCred.id, name: openRouterCred.name } }
  }

  const memoryNode = {
    id: crypto.randomUUID(),
    name: 'Simple Memory',
    type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
    typeVersion: 1.3,
    position: [0, 176] as [number, number],
    parameters: {
      sessionIdType: 'customKey',
      sessionKey: "={{ $('Webhook').item.json.body.data.key.remoteJid }}",
      contextWindowLength: 15,
    },
  }

  // Use HTTP Request instead of Evolution API node — no credential needed, key is inline
  const sendNode = {
    id: crypto.randomUUID(),
    name: 'Send text',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [256, -48] as [number, number],
    parameters: {
      method: 'POST',
      url: `=${evolutionUrl.replace(/\/$/, '')}/message/sendText/${encodeURIComponent(waInstance)}`,
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'apikey', value: evolutionKey }],
      },
      sendBody: true,
      contentType: 'json',
      bodyParameters: {
        parameters: [
          { name: 'number', value: "={{ $('Webhook').item.json.body.data.key.remoteJid }}" },
          { name: 'text', value: '={{ $json.output }}' },
        ],
      },
      options: {},
    },
  }

  return {
    name: workflowName,
    nodes: [webhookNode, filterNode, aiAgentNode, openRouterNode, memoryNode, sendNode],
    connections: {
      Webhook: { main: [[{ node: 'Kendi Mesajı mı?', type: 'main', index: 0 }]] },
      'Kendi Mesajı mı?': { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] },
      'AI Agent': { main: [[{ node: 'Send text', type: 'main', index: 0 }]] },
      'OpenRouter Chat Model': { ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]] },
      'Simple Memory': { ai_memory: [[{ node: 'AI Agent', type: 'ai_memory', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  }
}

// Workflow template generator — Hedefli WA Kampanyası (Supabase'den müşteri çekip gönder)
function buildTargetedCampaignWorkflow(
  workflowName: string,
  consultantId: string,
  waInstance: string,
  message: string,
  clientIds: string[],
  supabaseUrl: string,
  supabaseKey: string,
  evolutionUrl: string,
  evolutionKey: string,
) {
  const sbBase = supabaseUrl.replace(/\/$/, '')
  const evBase = evolutionUrl.replace(/\/$/, '')
  const idsFilter = clientIds.map(id => `"${id}"`).join(',')

  const triggerNode = {
    id: crypto.randomUUID(),
    name: 'Manuel Tetik',
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position: [-480, 0] as [number, number],
    parameters: {},
  }

  const fetchNode = {
    id: crypto.randomUUID(),
    name: 'Müşterileri Getir',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [-240, 0] as [number, number],
    parameters: {
      method: 'GET',
      url: `${sbBase}/rest/v1/clients?select=id,full_name,wa_phone,phone&id=in.(${idsFilter})`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: supabaseKey },
          { name: 'Authorization', value: `Bearer ${supabaseKey}` },
        ],
      },
      options: {},
    },
  }

  const splitNode = {
    id: crypto.randomUUID(),
    name: 'Müşterileri Ayır',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [0, 0] as [number, number],
    parameters: {
      jsCode: `const clients = $input.first().json;\nif (!Array.isArray(clients)) return [{ json: clients }];\nreturn clients.map(c => ({ json: c }));`,
    },
  }

  const sendNode = {
    id: crypto.randomUUID(),
    name: 'WA Gönder',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [240, 0] as [number, number],
    parameters: {
      method: 'POST',
      url: `${evBase}/message/sendText/${encodeURIComponent(waInstance)}`,
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'apikey', value: evolutionKey }],
      },
      sendBody: true,
      contentType: 'json',
      bodyParameters: {
        parameters: [
          { name: 'number', value: "={{ $json.wa_phone || ($json.phone + '@s.whatsapp.net') }}" },
          { name: 'text', value: message },
        ],
      },
      options: {},
    },
  }

  const logNode = {
    id: crypto.randomUUID(),
    name: 'Etkileşim Kaydet',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [480, 0] as [number, number],
    parameters: {
      method: 'POST',
      url: `${sbBase}/rest/v1/interactions`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: supabaseKey },
          { name: 'Authorization', value: `Bearer ${supabaseKey}` },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=minimal' },
        ],
      },
      sendBody: true,
      contentType: 'json',
      bodyParameters: {
        parameters: [
          { name: 'client_id', value: '={{ $json.id }}' },
          { name: 'consultant_id', value: consultantId },
          { name: 'channel', value: 'whatsapp' },
          { name: 'direction', value: 'outbound' },
          { name: 'content', value: message },
        ],
      },
      options: {},
    },
  }

  return {
    name: workflowName,
    nodes: [triggerNode, fetchNode, splitNode, sendNode, logNode],
    connections: {
      'Manuel Tetik': { main: [[{ node: 'Müşterileri Getir', type: 'main', index: 0 }]] },
      'Müşterileri Getir': { main: [[{ node: 'Müşterileri Ayır', type: 'main', index: 0 }]] },
      'Müşterileri Ayır': { main: [[{ node: 'WA Gönder', type: 'main', index: 0 }]] },
      'WA Gönder': { main: [[{ node: 'Etkileşim Kaydet', type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  }
}

// Workflow template generator — Mülk Pazarlama Botu (Supabase'den mülk çekip AI ile yanıtla)
function buildPropertyMarketingBotWorkflow(
  workflowName: string,
  consultantId: string,
  waInstance: string,
  propertyId: string,
  systemPrompt: string,
  supabaseUrl: string,
  supabaseKey: string,
  evolutionUrl: string,
  evolutionKey: string,
  openRouterCred: { id: string; name: string } | null,
) {
  const sbBase = supabaseUrl.replace(/\/$/, '')
  const evBase = evolutionUrl.replace(/\/$/, '')

  const webhookNode = {
    id: crypto.randomUUID(),
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2.1,
    position: [-720, 0] as [number, number],
    webhookId: crypto.randomUUID(),
    parameters: {
      httpMethod: 'POST',
      path: `wa_property-${consultantId}-${propertyId}`,
      options: {},
    },
  }

  const filterNode = {
    id: crypto.randomUUID(),
    name: 'Kendi Mesajı mı?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: [-480, 0] as [number, number],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{
          id: crypto.randomUUID(),
          leftValue: '={{ $json.body.data.key.fromMe }}',
          rightValue: false,
          operator: { type: 'boolean', operation: 'equals' },
        }],
        combinator: 'and',
      },
    },
  }

  const fetchPropertyNode = {
    id: crypto.randomUUID(),
    name: 'Mülk Bilgilerini Getir',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [-240, 0] as [number, number],
    parameters: {
      method: 'GET',
      url: `${sbBase}/rest/v1/properties?select=title,price,property_type,city,district,neighborhood,m2_gross,m2_net,room_count,floor,total_floors,age,description,features&id=eq.${propertyId}`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: supabaseKey },
          { name: 'Authorization', value: `Bearer ${supabaseKey}` },
        ],
      },
      options: {},
    },
  }

  const aiAgentNode: Record<string, unknown> = {
    id: crypto.randomUUID(),
    name: 'AI Agent',
    type: '@n8n/n8n-nodes-langchain.agent',
    typeVersion: 3.1,
    position: [0, 0] as [number, number],
    parameters: {
      promptType: 'define',
      text: `Mülk Bilgileri (Supabase'den):
{{ JSON.stringify($('Mülk Bilgilerini Getir').first().json[0] || {}) }}

Müşteri Mesajı:
Gönderen: {{ $('Webhook').item.json.body.data.pushName || 'Müşteri' }}
Mesaj: {{ $('Webhook').item.json.body.data.message.conversation || $('Webhook').item.json.body.data.message.extendedTextMessage?.text || '[Ses/görsel]' }}

Bu mülk hakkında danışman olarak kısa ve doğal bir WhatsApp yanıtı yaz.`,
      options: { systemMessage: systemPrompt },
    },
  }

  const openRouterNode: Record<string, unknown> = {
    id: crypto.randomUUID(),
    name: 'OpenRouter Chat Model',
    type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
    typeVersion: 1,
    position: [-96, 200] as [number, number],
    parameters: { model: 'google/gemini-2.5-pro', options: {} },
  }
  if (openRouterCred) {
    openRouterNode.credentials = { openRouterApi: { id: openRouterCred.id, name: openRouterCred.name } }
  }

  const memoryNode = {
    id: crypto.randomUUID(),
    name: 'Simple Memory',
    type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
    typeVersion: 1.3,
    position: [96, 200] as [number, number],
    parameters: {
      sessionIdType: 'customKey',
      sessionKey: "={{ $('Webhook').item.json.body.data.key.remoteJid }}",
      contextWindowLength: 10,
    },
  }

  const sendNode = {
    id: crypto.randomUUID(),
    name: 'Yanıt Gönder',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [256, 0] as [number, number],
    parameters: {
      method: 'POST',
      url: `${evBase}/message/sendText/${encodeURIComponent(waInstance)}`,
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'apikey', value: evolutionKey }],
      },
      sendBody: true,
      contentType: 'json',
      bodyParameters: {
        parameters: [
          { name: 'number', value: "={{ $('Webhook').item.json.body.data.key.remoteJid }}" },
          { name: 'text', value: '={{ $json.output }}' },
        ],
      },
      options: {},
    },
  }

  return {
    name: workflowName,
    nodes: [webhookNode, filterNode, fetchPropertyNode, aiAgentNode, openRouterNode, memoryNode, sendNode],
    connections: {
      Webhook: { main: [[{ node: 'Kendi Mesajı mı?', type: 'main', index: 0 }]] },
      'Kendi Mesajı mı?': { main: [[{ node: 'Mülk Bilgilerini Getir', type: 'main', index: 0 }]] },
      'Mülk Bilgilerini Getir': { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] },
      'AI Agent': { main: [[{ node: 'Yanıt Gönder', type: 'main', index: 0 }]] },
      'OpenRouter Chat Model': { ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]] },
      'Simple Memory': { ai_memory: [[{ node: 'AI Agent', type: 'ai_memory', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  }
}

// Workflow template generator — Email (Gmail SMTP)
function buildEmailWorkflow(
  templateId: string,
  workflowName: string,
  consultantId: string,
  smtpUser: string,
  fromName: string,
  message: string,
  subject: string,
  credentialId: string,
  credentialName: string,
) {
  const webhookPath = `${templateId}-${consultantId}`

  const triggerNode = {
    id: crypto.randomUUID(),
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [240, 300] as [number, number],
    webhookId: crypto.randomUUID(),
    parameters: {
      httpMethod: 'POST',
      path: webhookPath,
      responseMode: 'onReceived',
      responseData: 'noData',
    },
  }

  const emailNode: Record<string, unknown> = {
    id: crypto.randomUUID(),
    name: 'Email Gönder',
    type: 'n8n-nodes-base.emailSend',
    typeVersion: 2.1,
    position: [480, 300] as [number, number],
    parameters: {
      fromEmail: `${fromName} <${smtpUser}>`,
      toEmail: '={{ $json.email }}',
      subject,
      emailType: 'text',
      text: message,
      options: {},
    },
  }
  if (credentialId) {
    emailNode.credentials = {
      smtp: { id: credentialId, name: credentialName },
    }
  }

  return {
    name: workflowName,
    nodes: [triggerNode, emailNode],
    connections: {
      Webhook: {
        main: [[{ node: 'Email Gönder', type: 'main', index: 0 }]],
      },
    },
    settings: { executionOrder: 'v1' },
  }
}

// ─── GET /api/n8n/workflows?consultantId=xxx ─────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const consultantId = req.nextUrl.searchParams.get('consultantId')
    if (!consultantId) return NextResponse.json({ error: 'consultantId gerekli' }, { status: 400 })

    const supabase = getServiceClient()
    const { data: consultant } = await supabase
      .from('consultants')
      .select('id, full_name, wa_instance, evolution_instance_key')
      .eq('id', consultantId)
      .single()

    if (!consultant) return NextResponse.json({ error: 'Danışman bulunamadı' }, { status: 404 })

    const cfg = await getN8nConfig()
    const tagId = await ensureTag(cfg, consultant.full_name)

    // Get all workflows and filter by tag
    const data = await n8nFetch(cfg, 'GET', '/workflows?limit=100')
    const all: { id: string; name: string; active: boolean; tags?: { id: string }[] }[] = data.data || []
    const filtered = all.filter(w => w.tags?.some(t => t.id === tagId))

    // Enrich each workflow with its webhook URL by fetching full details
    const n8nBase = cfg.n8n_url?.replace(/\/$/, '')
    const workflows = await Promise.all(filtered.map(async (wf) => {
      try {
        const detail = await n8nFetch(cfg, 'GET', `/workflows/${wf.id}`)
        const webhookNode = (detail.nodes || []).find(
          (n: any) => n.type === 'n8n-nodes-base.webhook'
        )
        const webhookPath = webhookNode?.parameters?.path || ''
        const webhookUrl = webhookPath ? `${n8nBase}/webhook/${webhookPath}` : ''
        return { ...wf, webhookUrl }
      } catch {
        return { ...wf, webhookUrl: '' }
      }
    }))

    return NextResponse.json({ workflows, tagId, consultantName: consultant.full_name })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Hata' }, { status: 500 })
  }
}

// ─── POST /api/n8n/workflows ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { consultantId, templateId, message, subject, systemPrompt, workflowName, clientIds, propertyId } = await req.json()
    if (!consultantId || !templateId) {
      return NextResponse.json({ error: 'consultantId ve templateId gerekli' }, { status: 400 })
    }

    const isEmail = templateId.startsWith('email_')
    const isAiBot = templateId === 'wa_aibot'
    const isTargeted = templateId === 'wa_targeted'
    const isPropertyBot = templateId === 'wa_property_bot'

    const supabase = getServiceClient()
    const { data: consultant } = await supabase
      .from('consultants')
      .select('id, full_name, wa_instance, evolution_instance_key')
      .eq('id', consultantId)
      .single()

    if (!consultant) return NextResponse.json({ error: 'Danışman bulunamadı' }, { status: 404 })

    const cfg = await getN8nConfig()

    // WhatsApp templates require Evolution API + wa_instance
    if (!isEmail) {
      if (!consultant.wa_instance) {
        return NextResponse.json({ error: 'Danışmanın WhatsApp instance\'ı yok. Önce WhatsApp bağlayın.' }, { status: 400 })
      }
      if (!cfg.evolution_api_url || !cfg.evolution_api_key) {
        return NextResponse.json({ error: 'WhatsApp (Evolution) API ayarları eksik. Ayarlar sekmesinden yapılandırın veya sunucu ortam değişkenlerini kontrol edin.' }, { status: 400 })
      }
    }

    // Email templates require SMTP config
    if (isEmail) {
      if (!cfg.smtp_user || !cfg.smtp_pass) {
        return NextResponse.json({ error: 'Email (SMTP) ayarları eksik. Ayarlar sekmesinden Gmail adresinizi ve Uygulama Şifrenizi girin.' }, { status: 400 })
      }
    }

    const tagId = await ensureTag(cfg, consultant.full_name)

    const TEMPLATE_LABELS: Record<string, string> = {
      wa_welcome:       'WA Karşılama',
      wa_followup:      'WA Takip',
      wa_document:      'WA Belge Bildirimi',
      wa_campaign:      'WA Kampanya',
      wa_aibot:         'WA AI Bot',
      wa_targeted:      'WA Hedefli İletişim',
      wa_property_bot:  'WA Mülk Pazarlama Botu',
      email_welcome:    'Email Karşılama',
      email_followup:   'Email Takip',
      email_document:   'Email Belge Bildirimi',
    }

    const name = workflowName || `[${consultant.full_name}] ${TEMPLATE_LABELS[templateId] || templateId}`

    const waInstance = consultant.wa_instance || consultant.full_name

    // Resolve per-instance Evolution key (fetches from Evolution API if not stored, falls back to global)
    const evolutionUrl = cfg.evolution_api_url?.replace(/\/$/, '') || ''
    const resolvedKey = !isEmail
      ? await resolveEvolutionInstanceKey(cfg, consultant.id, waInstance, consultant.evolution_instance_key || null)
      : null
    const evolutionKey = resolvedKey || cfg.evolution_api_key || ''

    let workflow
    if (isTargeted) {
      if (!clientIds || clientIds.length === 0) {
        return NextResponse.json({ error: 'En az bir müşteri seçmelisiniz' }, { status: 400 })
      }
      workflow = buildTargetedCampaignWorkflow(
        name,
        consultant.id,
        waInstance,
        message || 'Merhaba, size ulaşmak istedik.',
        clientIds,
        cfg.supabase_url,
        cfg.supabase_service_key,
        evolutionUrl,
        evolutionKey,
      )
    } else if (isPropertyBot) {
      if (!propertyId) {
        return NextResponse.json({ error: 'Bir mülk seçmelisiniz' }, { status: 400 })
      }
      const openRouterCred = await findCredentialByType(cfg, 'openRouterApi', 'openrouter') || await ensureOpenRouterCredential(cfg)
      workflow = buildPropertyMarketingBotWorkflow(
        name,
        consultant.id,
        waInstance,
        propertyId,
        systemPrompt || '',
        cfg.supabase_url,
        cfg.supabase_service_key,
        evolutionUrl,
        evolutionKey,
        openRouterCred,
      )
    } else if (isAiBot) {
      const openRouterCred = await findCredentialByType(cfg, 'openRouterApi', 'openrouter') || await ensureOpenRouterCredential(cfg)
      workflow = buildAiBotWorkflow(
        name,
        consultant.id,
        waInstance,
        systemPrompt || '',
        message || DEFAULT_USER_PROMPT,
        evolutionUrl,
        evolutionKey,
        openRouterCred,
      )
    } else if (isEmail) {
      const smtpHost = cfg.smtp_host || 'smtp.gmail.com'
      const smtpPort = cfg.smtp_port || '587'
      const credName = `SMTP ${cfg.smtp_user}`

      // Try to create SMTP credential; non-fatal if it fails
      let credId = ''
      try {
        credId = await ensureSmtpCredential(cfg, smtpHost, smtpPort, cfg.smtp_user, cfg.smtp_pass)
      } catch {
        // Credential creation failed — workflow will be created without it
        // User can add it manually in n8n
      }

      workflow = buildEmailWorkflow(
        templateId,
        name,
        consultant.id,
        cfg.smtp_user,
        cfg.smtp_from_name || 'Ambiance Gayrimenkul',
        message || 'Merhaba, size ulaşmak istedik.',
        subject || 'Ambiance Gayrimenkul',
        credId,
        credName,
      )
    } else {
      workflow = buildWaWorkflow(
        templateId,
        name,
        consultant.id,
        waInstance,
        message || 'Merhaba, size ulaşmak istedik.',
        evolutionUrl,
        evolutionKey,
      )
    }

    // Check for conflicting workflows with same webhook path and remove them
    try {
      const webhookNode: any = (workflow.nodes || []).find(
        (n: any) => n.type === 'n8n-nodes-base.webhook'
      )
      const newWebhookPath = webhookNode?.parameters?.path
      if (newWebhookPath) {
        const existing = await n8nFetch(cfg, 'GET', '/workflows?limit=200')
        const allWfs: { id: string; active: boolean }[] = existing.data || []
        for (const wf of allWfs) {
          try {
            const detail = await n8nFetch(cfg, 'GET', `/workflows/${wf.id}`)
            const wh = (detail.nodes || []).find(
              (n: any) => n.type === 'n8n-nodes-base.webhook'
            )
            if (wh?.parameters?.path === newWebhookPath) {
              if (wf.active) {
                await n8nFetch(cfg, 'POST', `/workflows/${wf.id}/deactivate`).catch(() => {})
              }
              await n8nFetch(cfg, 'DELETE', `/workflows/${wf.id}`).catch(() => {})
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* non-fatal */ }

    const created = await n8nFetch(cfg, 'POST', '/workflows', workflow)

    // Assign tag separately — n8n doesn't accept tags in POST body
    try {
      await n8nFetch(cfg, 'PUT', `/workflows/${created.id}/tags`, [{ id: tagId }])
    } catch {
      // Tag assignment failure is non-fatal
    }

    // Auto-activate the workflow so it starts running immediately
    try {
      await n8nFetch(cfg, 'POST', `/workflows/${created.id}/activate`)
    } catch {
      // Non-fatal — workflow created, user can activate manually
    }

    // For AI Bot / Property Bot: auto-configure Evolution webhook to forward inbound messages to n8n
    if (isAiBot || isPropertyBot) {
      const n8nBase = cfg.n8n_url?.replace(/\/$/, '')
      const evolutionBase = cfg.evolution_api_url?.replace(/\/$/, '')
      const webhookPath = isPropertyBot ? `wa_property-${consultant.id}-${propertyId}` : `wa_aibot-${consultant.id}`
      const webhookUrl = `${n8nBase}/webhook/${webhookPath}`
      const keyForWebhook = resolvedKey || cfg.evolution_api_key
      if (evolutionBase && keyForWebhook) {
        try {
          await setEvolutionWebhook(evolutionBase, waInstance, keyForWebhook, webhookUrl)
        } catch {
          // Non-fatal — webhook can be synced with the refresh button
        }
      }
    }

    return NextResponse.json({ workflow: created })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Hata' }, { status: 500 })
  }
}
