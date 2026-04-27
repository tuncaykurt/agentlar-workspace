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

  // 1. Check billing balance
  const balanceRes = await fetch(`${DIDIT_BASE}/billing/balance/`, {
    headers: { 'x-api-key': apikey },
  })
  results.balance_status = balanceRes.status
  results.balance = balanceRes.ok ? await balanceRes.json() : await balanceRes.text()

  // 2. Get cached workflow from settings
  const supabase = serviceClient()
  for (const ver of ['v5', 'v6', 'v7']) {
    const { data } = await supabase.from('settings').select('value').eq('key', `didit_workflow_id_${ver}`).maybeSingle()
    results[`cached_workflow_${ver}`] = data?.value ?? null
  }

  // 3. List all workflows
  const listRes = await fetch(`${DIDIT_BASE}/workflows/`, {
    headers: { 'x-api-key': apikey },
  })
  results.workflows_list_status = listRes.status
  results.workflows = listRes.ok ? await listRes.json() : await listRes.text()

  return NextResponse.json(results, { status: 200 })
}
