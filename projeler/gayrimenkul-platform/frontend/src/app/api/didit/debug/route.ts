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

  // 3. Fetch details of known workflow
  const knownId = 'ef6a29e5-b39f-4448-9163-7a53d0164400'
  const wRes = await fetch(`${DIDIT_BASE}/workflows/${knownId}/`, {
    headers: { 'x-api-key': apikey },
  })
  const wBody = wRes.ok ? await wRes.json() : { error: wRes.status, body: await wRes.text() }
  results.known_workflow_details = wBody

  // 4. Create a test session with the known workflow to see full response
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const testSessionRes = await fetch(`${DIDIT_BASE}/session/`, {
    method: 'POST',
    headers: { 'x-api-key': apikey, 'content-type': 'application/json' },
    body: JSON.stringify({
      workflow_id: knownId,
      vendor_data: 'debug-test',
      callback: `${appUrl}/sign/debug`,
    }),
  })
  const testSessionText = await testSessionRes.text()
  results.test_session_status = testSessionRes.status
  results.test_session_body = testSessionText.slice(0, 1000)

  return NextResponse.json(results, { status: 200 })
}
