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

  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'didit_workflow_id')
    .maybeSingle()

  if (data?.value) {
    const val = String(data.value).replace(/^"|"$/g, '')
    if (val) return val
  }

  // Try existing workflows first
  const listRes = await fetch(`${DIDIT_BASE}/workflows/`, {
    headers: { 'x-api-key': apiKey() },
  })

  if (listRes.ok) {
    const workflows = await listRes.json()
    const list = Array.isArray(workflows) ? workflows : (workflows?.results ?? [])
    const existing = list[0]
    if (existing?.uuid) {
      await supabase
        .from('settings')
        .upsert({ key: 'didit_workflow_id', value: existing.uuid }, { onConflict: 'key' })
      return existing.uuid
    }
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

  if (!createRes.ok) {
    const err = await createRes.text()
    throw new Error(`DiDit workflow creation failed: ${err}`)
  }

  const workflow = await createRes.json()
  const workflowId: string = workflow.uuid || workflow.id
  if (!workflowId) throw new Error('DiDit workflow ID missing in response')

  await supabase
    .from('settings')
    .upsert({ key: 'didit_workflow_id', value: workflowId }, { onConflict: 'key' })

  return workflowId
}

export async function createVerificationSession(signToken: string): Promise<{
  session_id: string
  session_token: string
  url: string
}> {
  const workflowId = await getOrCreateWorkflow()
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

  const res = await fetch(`${DIDIT_BASE}/sessions/`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify({
      workflow_id: workflowId,
      vendor_data: signToken,
      callback: `${appUrl}/api/didit/webhook`,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DiDit session creation failed: ${err}`)
  }

  return res.json()
}
