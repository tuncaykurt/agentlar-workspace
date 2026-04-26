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

async function getOrCreateWorkflow(): Promise<string> {
  const supabase = serviceClient()

  // Check settings cache first
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'didit_workflow_id')
    .maybeSingle()

  if (data?.value) {
    const val = String(data.value).replace(/^"|"$/g, '')
    if (val) {
      console.log('[didit] Using cached workflow_id:', val)
      return val
    }
  }

  // List existing workflows
  const listRes = await fetch(`${DIDIT_BASE}/workflows/`, {
    headers: { 'x-api-key': apiKey() },
  })

  console.log('[didit] GET /workflows/ status:', listRes.status)

  if (listRes.ok) {
    const workflows = await listRes.json()
    console.log('[didit] Workflows response:', JSON.stringify(workflows).slice(0, 300))
    const list = Array.isArray(workflows) ? workflows : (workflows?.results ?? [])
    const existing = list[0]
    if (existing?.uuid) {
      console.log('[didit] Found existing workflow:', existing.uuid)
      await supabase
        .from('settings')
        .upsert({ key: 'didit_workflow_id', value: existing.uuid }, { onConflict: 'key' })
      return existing.uuid
    }
  } else {
    const listErr = await listRes.text()
    console.warn('[didit] GET /workflows/ failed:', listRes.status, listErr)
  }

  // Create new workflow — features is an ordered array of objects (not a boolean map)
  const createRes = await fetch(`${DIDIT_BASE}/workflows/`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify({
      workflow_label: 'KYC Kimlik Doğrulama',
      features: [
        { feature: 'OCR' },
        { feature: 'LIVENESS' },
        { feature: 'FACE_MATCH' },
      ],
    }),
  })

  const createBody = await createRes.text()
  console.log('[didit] POST /workflows/ status:', createRes.status, 'body:', createBody.slice(0, 300))

  if (!createRes.ok) {
    throw new Error(`DiDit workflow creation failed (${createRes.status}): ${createBody}`)
  }

  const workflow = JSON.parse(createBody)
  const workflowId: string = workflow.uuid || workflow.id
  if (!workflowId) throw new Error(`DiDit workflow ID missing. Response: ${createBody}`)

  await supabase
    .from('settings')
    .upsert({ key: 'didit_workflow_id', value: workflowId }, { onConflict: 'key' })

  console.log('[didit] Created workflow:', workflowId)
  return workflowId
}

export async function createVerificationSession(signToken: string): Promise<{
  session_id: string
  session_token: string
  url: string
}> {
  const workflowId = await getOrCreateWorkflow()
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

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
