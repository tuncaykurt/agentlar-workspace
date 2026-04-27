import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DIDIT_BASE = 'https://verification.didit.me/v3'

function apiKey() {
  return process.env.DIDIT_API_KEY || ''
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET() {
  const apikey = apiKey()
  if (!apikey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  const results: Record<string, unknown> = {}

  // 1. Get cached workflow from settings
  const supabase = serviceClient()
  const { data: cachedV4 } = await supabase.from('settings').select('value').eq('key', 'didit_workflow_id_v4').maybeSingle()
  results.cached_workflow_v4 = cachedV4?.value ?? null

  // 2. List all workflows
  const listRes = await fetch(`${DIDIT_BASE}/workflows/`, {
    headers: { 'x-api-key': apikey },
  })
  const listBody = listRes.ok ? await listRes.json() : { error: listRes.status }
  results.workflows_list_status = listRes.status
  results.workflows = listBody

  // 3. Create sessions for all 3 KYC TR workflows to get live test URLs
  const kycTrWorkflows = [
    '11261a38-c96f-4b87-8634-6e12c649a696',
    'f3bb8ed0-487f-45e1-b195-e92c683caf38',
    '26a7ebe9-9fbd-4fdc-b749-df9064e6857d',
  ]
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const sessionResults: Record<string, unknown>[] = []

  for (const wfId of kycTrWorkflows) {
    const sRes = await fetch(`${DIDIT_BASE}/session/`, {
      method: 'POST',
      headers: { 'x-api-key': apikey, 'content-type': 'application/json' },
      body: JSON.stringify({
        workflow_id: wfId,
        vendor_data: `debug-${wfId.slice(0, 8)}`,
        callback: `${appUrl}/sign/debug`,
      }),
    })
    const sText = await sRes.text()
    let sBody: Record<string, unknown> = {}
    try { sBody = JSON.parse(sText) } catch { sBody = { raw: sText.slice(0, 300) } }
    sessionResults.push({ workflow_id: wfId, status: sRes.status, url: sBody.url, session_token: sBody.session_token, session_id: sBody.session_id })
  }
  results.kyc_tr_sessions = sessionResults

  return NextResponse.json(results, { status: 200 })
}
