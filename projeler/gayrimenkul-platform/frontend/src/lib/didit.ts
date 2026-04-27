// DiDit Identity Verification API client
// Docs: https://docs.didit.me  |  Base: https://verification.didit.me/v3

const DIDIT_BASE = 'https://verification.didit.me/v3'

function apiKey(): string {
  const key = process.env.DIDIT_API_KEY
  if (!key) throw new Error('DIDIT_API_KEY not configured')
  return key
}

function serviceClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function ensureWebhookRegistered(appUrl: string): Promise<void> {
  const supabase = serviceClient()
  const webhookUrl = `${appUrl}/api/didit/webhook`

  // Check if already registered
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'didit_webhook_url')
    .maybeSingle()

  const cached = data?.value ? String(data.value).replace(/^"|"$/g, '') : ''
  if (cached === webhookUrl) {
    console.log('[didit] Webhook already registered:', webhookUrl)
    return
  }

  // List existing destinations to avoid duplicates
  const listRes = await fetch(`${DIDIT_BASE}/webhook/destinations/`, {
    headers: { 'x-api-key': apiKey() },
  })

  if (listRes.ok) {
    const listBody = await listRes.json()
    const destinations = Array.isArray(listBody) ? listBody : (listBody?.results ?? [])
    const existing = destinations.find((d: { url?: string }) => d.url === webhookUrl)
    if (existing) {
      console.log('[didit] Webhook destination already exists:', existing.uuid)
      await supabase.from('settings').upsert({ key: 'didit_webhook_url', value: webhookUrl }, { onConflict: 'key' })
      return
    }
  }

  // Register new webhook destination
  const regRes = await fetch(`${DIDIT_BASE}/webhook/destinations/`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify({
      label: 'Gayrimenkul Platform KYC Webhook',
      url: webhookUrl,
      subscribed_events: ['status.updated'],
      enabled: true,
      webhook_version: 'v3',
    }),
  })

  const regBody = await regRes.text()
  console.log('[didit] Webhook registration status:', regRes.status, 'body:', regBody.slice(0, 300))

  if (regRes.ok) {
    await supabase.from('settings').upsert({ key: 'didit_webhook_url', value: webhookUrl }, { onConflict: 'key' })
    console.log('[didit] Webhook registered successfully:', webhookUrl)
  } else {
    console.warn('[didit] Webhook registration failed (non-fatal):', regBody)
  }
}

async function getOrCreateWorkflow(): Promise<string> {
  const supabase = serviceClient()

  // Check settings cache — v7 forces fresh workflow with proper OCR+LIVENESS+FACE_MATCH config
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'didit_workflow_id_v7')
    .maybeSingle()

  if (data?.value) {
    const val = String(data.value).replace(/^"|"$/g, '')
    if (val) {
      console.log('[didit] Using cached workflow_id:', val)
      return val
    }
  }

  // Create new published workflow (OCR + LIVENESS + FACE_MATCH — Standard KYC per Didit docs)
  const createRes = await fetch(`${DIDIT_BASE}/workflows/`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify({
      workflow_label: 'Gayrimenkul KYC',
      features: [
        { feature: 'OCR', config: { duplicated_user_action: 'review' } },
        { feature: 'LIVENESS', config: { face_liveness_method: 'passive' } },
        { feature: 'FACE_MATCH' },
      ],
    }),
  })

  const createBody = await createRes.text()
  console.log('[didit] POST /workflows/ status:', createRes.status, 'body:', createBody.slice(0, 200))

  if (!createRes.ok) {
    throw new Error(`DiDit workflow creation failed (${createRes.status}): ${createBody}`)
  }

  const workflow = JSON.parse(createBody)
  const workflowId: string = workflow.uuid || workflow.id
  if (!workflowId) throw new Error(`DiDit workflow ID missing. Response: ${createBody}`)

  await supabase
    .from('settings')
    .upsert({ key: 'didit_workflow_id_v7', value: workflowId }, { onConflict: 'key' })

  console.log('[didit] Created workflow:', workflowId)
  return workflowId
}

export async function createVerificationSession(signToken: string): Promise<{
  session_id: string
  session_token: string
  url: string
}> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  await ensureWebhookRegistered(appUrl)
  const workflowId = await getOrCreateWorkflow()

  const body = {
    workflow_id: workflowId,
    vendor_data: signToken,
    callback: `${appUrl}/sign/${signToken}`,
    callback_method: 'both',
    language: 'tr',
  }

  console.log('[didit] Creating session, workflow_id:', workflowId, 'callback:', body.callback)

  // Correct endpoint: POST /v3/session/ (singular, trailing slash required)
  const res = await fetch(`${DIDIT_BASE}/session/`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  const resText = await res.text()
  console.log('[didit] POST /session/ status:', res.status, 'body:', resText.slice(0, 500))

  if (!res.ok) {
    throw new Error(`DiDit session creation failed (${res.status}): ${resText}`)
  }

  return JSON.parse(resText)
}
