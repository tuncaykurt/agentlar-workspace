import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function nowTR() {
  // Turkey is UTC+3
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const hh = String(now.getUTCHours()).padStart(2, '0')
  const mm = String(now.getUTCMinutes()).padStart(2, '0')
  const yyyy = now.getUTCFullYear()
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  return { time: `${hh}:${mm}`, date: `${yyyy}-${mo}-${dd}`, mmdd: `${mo}-${dd}` }
}

function buildMessage(template: string, contact: { full_name: string; salutation?: string }) {
  const ad = contact.full_name.trim().split(' ')[0] || contact.full_name
  const hitap = contact.salutation?.trim() || ''
  return template
    .replace(/\{ad\}/gi, ad)
    .replace(/\{adsoyad\}/gi, contact.full_name)
    .replace(/\{hitap\}/gi, hitap)
    .replace(/\s+([,!?.:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function sendWhatsApp(phone: string, message: string, instance: string): Promise<boolean> {
  const baseUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!baseUrl || !apiKey || !phone) return false

  let num = phone.replace(/\D/g, '')
  if (num.startsWith('0')) num = '90' + num.slice(1)
  else if (!num.startsWith('90')) num = '90' + num

  try {
    const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: num + '@s.whatsapp.net', text: message }),
    })
    return res.ok
  } catch { return false }
}

// GET — called every minute by external cron
// Checks which automations are due to run right now
export async function GET(req: NextRequest) {
  // Optional: verify cron secret for security
  const secret = req.nextUrl.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = svc()
  const { time, date, mmdd } = nowTR()

  // Find enabled automations whose trigger_time matches current HH:MM
  // and haven't run today yet
  const { data: configs } = await supabase
    .from('birthday_automation_config')
    .select('*')
    .eq('is_enabled', true)
    .eq('trigger_time', time)

  if (!configs?.length) {
    return NextResponse.json({ skipped: true, time, reason: 'No automations due at this time' })
  }

  // Filter out those already run today
  const due = configs.filter(c => c.last_run_date !== date)

  if (!due.length) {
    return NextResponse.json({ skipped: true, time, reason: 'All due automations already ran today' })
  }

  const results: Record<string, { sent: number; failed: number }> = {}

  for (const config of due) {
    // Get consultant's WA instance
    const { data: consultant } = await supabase
      .from('consultants')
      .select('id, wa_instance')
      .eq('id', config.consultant_id)
      .single()

    if (!consultant?.wa_instance) {
      results[config.consultant_id] = { sent: 0, failed: 0 }
      continue
    }

    // Get today's birthday contacts
    const { data: consultantRole } = await supabase
      .from('consultants').select('role').eq('id', consultant.id).single()
    const isAdminC = consultantRole?.role === 'admin'

    let clientQ = supabase
      .from('clients')
      .select('id, full_name, salutation, phone, birth_date')
      .eq('is_active', true)
      .not('birth_date', 'is', null)
      .not('phone', 'is', null)
      .neq('phone', '')

    if (!isAdminC) {
      clientQ = clientQ.or(`assigned_consultant_id.eq.${consultant.id},assigned_consultant_id.is.null`)
    }

    const { data: contacts } = await clientQ

    const todayContacts = (contacts || []).filter(c => {
      if (!c.birth_date) return false
      return c.birth_date.slice(5, 10) === mmdd
    })

    let filtered = todayContacts
    if (config.contact_filter === 'specific' && config.selected_contact_ids?.length) {
      filtered = todayContacts.filter(c => config.selected_contact_ids.includes(c.id))
    }

    let sent = 0, failed = 0
    for (const contact of filtered) {
      if (!contact.phone) continue
      const message = buildMessage(config.message_template, contact)
      const ok = await sendWhatsApp(contact.phone, message, consultant.wa_instance)
      if (ok) sent++; else failed++
    }

    // Mark as run today
    await supabase
      .from('birthday_automation_config')
      .update({ last_run_date: date })
      .eq('id', config.id)

    results[config.consultant_id] = { sent, failed }
  }

  return NextResponse.json({ ran: true, time, date, results })
}
