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

  // The verified working workflow: OCR + LIVENESS (published, no FACE_MATCH)
  // UUID confirmed working via direct API test on 2026-04-26
  const VERIFIED_WORKFLOW_ID = 'ef6a29e5-b39f-4448-9163-7a53d0164400'

  // Check settings cache — key v3 to bypass stale v1/v2 cache
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'didit_workflow_id_v3')
    .maybeSingle()

  if (data?.value) {
    const val = String(data.value).replace(/^"|"$/g, '')
    if (val) {
      console.log('[didit] Using cached workflow_id:', val)
      return val
    }
  }

  // Verify the known working workflow still exists and is published
  const checkRes = await fetch(`${DIDIT_BASE}/workflows/${VERIFIED_WORKFLOW_ID}/`, {
    headers: { 'x-api-key': apiKey() },
  })

  if (checkRes.ok) {
    const w = await checkRes.json()
    if (w.status === 'published' && !String(w.features).includes('FACE_MATCH')) {
      console.log('[didit] Using verified workflow:', VERIFIED_WORKFLOW_ID)
      await supabase
        .from('settings')
        .upsert({ key: 'didit_workflow_id_v3', value: VERIFIED_WORKFLOW_ID }, { onConflict: 'key' })
      return VERIFIED_WORKFLOW_ID
    }
  }

  // Fallback: list published workflows without FACE_MATCH
  const listRes = await fetch(`${DIDIT_BASE}/workflows/`, {
    headers: { 'x-api-key': apiKey() },
  })

  if (listRes.ok) {
    const workflows = await listRes.json()
    const list: Array<{ uuid: string; status: string; features: string }> =
      Array.isArray(workflows) ? workflows : (workflows?.results ?? [])
    const suitable = list.find(
      w => w.status === 'published' && !String(w.features).includes('FACE_MATCH')
    )
    if (suitable?.uuid) {
      console.log('[didit] Found suitable workflow:', suitable.uuid)
      await supabase
        .from('settings')
        .upsert({ key: 'didit_workflow_id_v3', value: suitable.uuid }, { onConflict: 'key' })
      return suitable.uuid
    }
  }

  // Create new published workflow (OCR + LIVENESS only)
  const createRes = await fetch(`${DIDIT_BASE}/workflows/`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify({
      workflow_label: 'Kimlik Dogrulama KYC',
      features: [{ feature: 'OCR' }, { feature: 'LIVENESS' }],
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
    .upsert({ key: 'didit_workflow_id_v3', value: workflowId }, { onConflict: 'key' })

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
