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
    .in('key', ['n8n_url', 'n8n_api_key', 'evolution_api_url', 'evolution_api_key'])
  const cfg: Record<string, string> = {}
  for (const r of rows || []) cfg[r.key] = String(r.value || '').replace(/^"|"$/g, '')
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

// Ensure a tag exists for the consultant, return its id
async function ensureTag(cfg: Record<string, string>, tagName: string): Promise<string> {
  const data = await n8nFetch(cfg, 'GET', '/tags?limit=100')
  const tags: { id: string; name: string }[] = data.data || []
  const existing = tags.find(t => t.name === tagName)
  if (existing) return existing.id
  const created = await n8nFetch(cfg, 'POST', '/tags', { name: tagName })
  return created.id
}

// Workflow template generator
function buildWorkflow(
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
    active: false,
    settings: { executionOrder: 'v1' },
    tags: [{ id: tagId }],
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
    const { consultantId, templateId, message, workflowName } = await req.json()
    if (!consultantId || !templateId) {
      return NextResponse.json({ error: 'consultantId ve templateId gerekli' }, { status: 400 })
    }

    const supabase = getServiceClient()
    const { data: consultant } = await supabase
      .from('consultants')
      .select('id, full_name, wa_instance')
      .eq('id', consultantId)
      .single()

    if (!consultant) return NextResponse.json({ error: 'Danışman bulunamadı' }, { status: 404 })
    if (!consultant.wa_instance) {
      return NextResponse.json({ error: 'Danışmanın WhatsApp instance\'ı yok. Önce WhatsApp bağlayın.' }, { status: 400 })
    }

    const cfg = await getN8nConfig()
    if (!cfg.evolution_api_url || !cfg.evolution_api_key) {
      return NextResponse.json({ error: 'Evolution API ayarları eksik' }, { status: 400 })
    }

    const tagId = await ensureTag(cfg, consultant.full_name)

    const TEMPLATE_LABELS: Record<string, string> = {
      wa_welcome:  'WA Karşılama',
      wa_followup: 'WA Takip',
      wa_document: 'WA Belge Bildirimi',
      wa_campaign: 'WA Kampanya',
    }

    const name = workflowName || `[${consultant.full_name}] ${TEMPLATE_LABELS[templateId] || templateId}`

    const workflow = buildWorkflow(
      templateId,
      name,
      consultant.id,
      consultant.wa_instance,
      cfg.evolution_api_url,
      cfg.evolution_api_key,
      message || 'Merhaba, size ulaşmak istedik.',
      tagId,
    )

    const created = await n8nFetch(cfg, 'POST', '/workflows', workflow)
    return NextResponse.json({ workflow: created })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Hata' }, { status: 500 })
  }
}
