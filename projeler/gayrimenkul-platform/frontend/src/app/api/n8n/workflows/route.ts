import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    .in('key', ['n8n_url', 'n8n_api_key', 'evolution_api_url', 'evolution_api_key', 'smtp_user', 'smtp_pass', 'smtp_host', 'smtp_port', 'smtp_from_name'])
  const cfg: Record<string, string> = {}
  for (const r of rows || []) cfg[r.key] = String(r.value || '').replace(/^"|"$/g, '')

  // Fallback to env variables for Evolution API
  if (!cfg.evolution_api_url) cfg.evolution_api_url = process.env.EVOLUTION_API_URL || ''
  if (!cfg.evolution_api_key) cfg.evolution_api_key = process.env.EVOLUTION_API_KEY || ''

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

// Ensure a tag exists for the consultant, return its id
async function ensureTag(cfg: Record<string, string>, tagName: string): Promise<string> {
  const data = await n8nFetch(cfg, 'GET', '/tags?limit=100')
  const tags: { id: string; name: string }[] = data.data || []
  const existing = tags.find(t => t.name === tagName)
  if (existing) return existing.id
  const created = await n8nFetch(cfg, 'POST', '/tags', { name: tagName })
  return created.id
}

// Workflow template generator — WhatsApp
function buildWaWorkflow(
  templateId: string,
  workflowName: string,
  consultantId: string,
  waInstance: string,
  evolutionUrl: string,
  evolutionKey: string,
  message: string,
  tagId: string,
) {
  const evo = evolutionUrl.replace(/\/$/, '')
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
    name: 'WhatsApp Gönder',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [480, 300] as [number, number],
    parameters: {
      method: 'POST',
      url: `${evo}/message/sendText/${waInstance}`,
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: 'apikey', value: evolutionKey }],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: JSON.stringify({
        number: '={{ $json.body.phone }}',
        text: message,
      }),
    },
  }

  const triggerName = isCampaign ? 'Manuel Tetik' : 'Webhook'

  return {
    name: workflowName,
    nodes: [triggerNode, sendNode],
    connections: {
      [triggerName]: {
        main: [[{ node: 'WhatsApp Gönder', type: 'main', index: 0 }]],
      },
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
      toEmail: '={{ $json.body.email }}',
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
      .select('id, full_name, wa_instance')
      .eq('id', consultantId)
      .single()

    if (!consultant) return NextResponse.json({ error: 'Danışman bulunamadı' }, { status: 404 })

    const cfg = await getN8nConfig()
    const tagId = await ensureTag(cfg, consultant.full_name)

    // Get all workflows and filter by tag
    const data = await n8nFetch(cfg, 'GET', '/workflows?limit=100')
    const all: { id: string; name: string; active: boolean; tags?: { id: string }[] }[] = data.data || []
    const workflows = all.filter(w => w.tags?.some(t => t.id === tagId))

    return NextResponse.json({ workflows, tagId, consultantName: consultant.full_name })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Hata' }, { status: 500 })
  }
}

// ─── POST /api/n8n/workflows ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { consultantId, templateId, message, subject, workflowName } = await req.json()
    if (!consultantId || !templateId) {
      return NextResponse.json({ error: 'consultantId ve templateId gerekli' }, { status: 400 })
    }

    const isEmail = templateId.startsWith('email_')

    const supabase = getServiceClient()
    const { data: consultant } = await supabase
      .from('consultants')
      .select('id, full_name, wa_instance')
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
      email_welcome:    'Email Karşılama',
      email_followup:   'Email Takip',
      email_document:   'Email Belge Bildirimi',
    }

    const name = workflowName || `[${consultant.full_name}] ${TEMPLATE_LABELS[templateId] || templateId}`

    let workflow
    if (isEmail) {
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
        consultant.wa_instance!,
        cfg.evolution_api_url,
        cfg.evolution_api_key,
        message || 'Merhaba, size ulaşmak istedik.',
        tagId,
      )
    }

    const created = await n8nFetch(cfg, 'POST', '/workflows', workflow)

    // Assign tag separately — n8n doesn't accept tags in POST body
    try {
      await n8nFetch(cfg, 'PUT', `/workflows/${created.id}/tags`, [{ id: tagId }])
    } catch {
      // Tag assignment failure is non-fatal; workflow was created successfully
    }

    return NextResponse.json({ workflow: created })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Hata' }, { status: 500 })
  }
}
