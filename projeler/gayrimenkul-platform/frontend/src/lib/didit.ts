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

  // Create new workflow
  const createRes = await fetch(`${DIDIT_BASE}/workflows/`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'KYC Kimlik Doğrulama',
      features: {
        id_verification: true,
        passive_liveness: true,
        face_match: true,
        aml_screening: false,
        nfc: false,
        ip_analysis: true,
        phone_verification: false,
        email_verification: false,
        proof_of_address: false,
        age_estimation: false,
        database_validation: false,
        questionnaire: false,
      },
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
    callback: `${appUrl}/api/didit/webhook`,
  }

  console.log('[didit] Creating session, workflow_id:', workflowId, 'callback:', body.callback)

  // Try without trailing slash first (some proxies reject POST with trailing slash)
  const res = await fetch(`${DIDIT_BASE}/sessions`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  const resText = await res.text()
  console.log('[didit] POST /sessions status:', res.status, 'body:', resText.slice(0, 500))

  if (!res.ok) {
    // Retry with trailing slash
    if (res.status === 405) {
      console.log('[didit] 405 without slash, retrying with trailing slash...')
      const res2 = await fetch(`${DIDIT_BASE}/sessions/`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey(), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const res2Text = await res2.text()
      console.log('[didit] POST /sessions/ status:', res2.status, 'body:', res2Text.slice(0, 500))
      if (!res2.ok) {
        throw new Error(`DiDit session creation failed: ${res2Text}`)
      }
      return JSON.parse(res2Text)
    }
    throw new Error(`DiDit session creation failed: ${resText}`)
  }

  return JSON.parse(resText)
}
