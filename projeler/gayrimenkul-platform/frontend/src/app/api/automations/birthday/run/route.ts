import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function todayMMDD() {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

async function sendWhatsApp(phone: string, message: string, instance: string): Promise<boolean> {
  const baseUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!baseUrl || !apiKey || !phone) return false

  const normalized = phone.replace(/\D/g, '')
  let num = normalized
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

function buildMessage(template: string, contact: { full_name: string; salutation?: string }) {
  const parts = contact.full_name.trim().split(' ')
  const ad = parts[0] || contact.full_name
  const hitap = contact.salutation || ''
  return template
    .replace(/\{ad\}/gi, ad)
    .replace(/\{adsoyad\}/gi, contact.full_name)
    .replace(/\{hitap\}/gi, hitap)
    .trim()
    .replace(/\s+/g, ' ')
}

// POST — run automation (called by cron or manually)
export async function POST(req: NextRequest) {
  // Allow cron calls with secret key OR authenticated users
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCron) {
    const userSb = await createServerSupabaseClient()
    const { data: { user } } = await userSb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const supabase = svc()
  const mmdd = todayMMDD()

  // Load enabled configs (optionally filter to one consultant)
  let configQuery = supabase
    .from('birthday_automation_config')
    .select('*')
    .eq('is_enabled', true)

  if (body.consultant_id) {
    configQuery = configQuery.eq('consultant_id', body.consultant_id)
  }

  const { data: configs } = await configQuery
  if (!configs?.length) return NextResponse.json({ sent: 0, message: 'Aktif otomasyon yok' })

  const results: { consultant_id: string; sent: number; failed: number }[] = []

  for (const config of configs) {
    // Get consultant's WA instance
    const { data: consultant } = await supabase
      .from('consultants')
      .select('id, wa_instance, wa_phone')
      .eq('id', config.consultant_id)
      .single()

    if (!consultant?.wa_instance) continue

    // Find today's birthday contacts
    let contactQuery = supabase
      .from('clients')
      .select('id, full_name, salutation, phone, birth_date')
      .eq('is_active', true)
      .eq('assigned_consultant_id', consultant.id)
      .not('birth_date', 'is', null)
      .not('phone', 'is', null)

    const { data: contacts } = await contactQuery
    if (!contacts?.length) continue

    // Filter to today's birthdays (MM-DD match)
    let todayContacts = contacts.filter(c => {
      if (!c.birth_date) return false
      const bd = c.birth_date.slice(5, 10) // "YYYY-MM-DD" → "MM-DD"
      return bd === mmdd
    })

    // If specific contacts selected, further filter
    if (config.contact_filter === 'specific' && config.selected_contact_ids?.length) {
      todayContacts = todayContacts.filter(c => config.selected_contact_ids.includes(c.id))
    }

    let sent = 0, failed = 0
    for (const contact of todayContacts) {
      if (!contact.phone) continue
      const message = buildMessage(config.message_template, contact)
      const ok = await sendWhatsApp(contact.phone, message, consultant.wa_instance)
      if (ok) sent++; else failed++
    }

    results.push({ consultant_id: consultant.id, sent, failed })
  }

  return NextResponse.json({ results, date: mmdd })
}
