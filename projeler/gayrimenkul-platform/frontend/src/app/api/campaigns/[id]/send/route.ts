import { NextRequest, NextResponse } from 'next/server'
import {
  adminClient,
  loadSmtpConfig,
  buildTransporter,
  sendBatchEmails,
} from '@/lib/email'

interface Recipient {
  client_id?: string
  lead_id?: string
  full_name?: string
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
  vars: Record<string, string | undefined>
}

async function loadAudience(supabase: ReturnType<typeof adminClient>, campaign: Record<string, unknown>): Promise<Recipient[]> {
  const out: Recipient[] = []
  const audience = (campaign.audience_source as string) || 'clients'
  const filter = (campaign.lead_filter as Record<string, unknown> | null) || {}

  if (audience === 'clients' || audience === 'mixed') {
    const { data: clients } = await supabase
      .from('clients')
      .select('id, full_name, email, phone, salutation')
      .eq('is_active', true)
    for (const c of clients || []) {
      out.push({
        client_id: c.id,
        full_name: c.full_name,
        email: c.email,
        phone: c.phone,
        vars: { isim: (c.full_name || '').split(' ')[0], ad_soyad: c.full_name, salutation: c.salutation },
      })
    }
  }

  if (audience === 'leads' || audience === 'mixed') {
    let q = supabase
      .from('marketing_leads')
      .select('id, full_name, email, phone, company, title, linkedin_url, city, district')
      .eq('unsubscribed', false)
      .eq('bounced', false)
    if (filter.city) q = q.eq('city', filter.city as string)
    if (filter.district) q = q.eq('district', filter.district as string)
    if (filter.source) q = q.eq('source', filter.source as string)
    if (Array.isArray(filter.tags) && filter.tags.length) q = q.contains('tags', filter.tags as string[])

    const { data: leads } = await q
    for (const l of leads || []) {
      out.push({
        lead_id: l.id,
        full_name: l.full_name || l.company,
        email: l.email,
        phone: l.phone,
        linkedin_url: l.linkedin_url,
        vars: {
          isim: (l.full_name || '').split(' ')[0] || l.company || '',
          ad_soyad: l.full_name,
          sirket: l.company,
          unvan: l.title,
          sehir: l.city,
        },
      })
    }
  }

  return out
}

async function sendWhatsApp(req: NextRequest, recipients: Recipient[], message: string) {
  // Mevcut /api/whatsapp/send route'unu kullan
  const baseUrl = req.nextUrl.origin
  const cookie = req.headers.get('cookie') || ''
  const results: Array<{ ok: boolean; error?: string; phone?: string }> = []

  for (const r of recipients) {
    if (!r.phone) { results.push({ ok: false, error: 'no_phone' }); continue }
    try {
      const personalized = message.replace(/\{(\w+)\}/g, (_, k) => r.vars[k] ?? '')
      const res = await fetch(`${baseUrl}/api/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ phone: r.phone, message: personalized }),
      })
      if (res.ok) results.push({ ok: true, phone: r.phone })
      else {
        const txt = await res.text().catch(() => '')
        results.push({ ok: false, error: txt.slice(0, 120), phone: r.phone })
      }
    } catch (e) {
      results.push({ ok: false, error: e instanceof Error ? e.message : 'unknown', phone: r.phone })
    }
    await new Promise(res => setTimeout(res, 1500)) // rate limit
  }
  return results
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = adminClient()

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !campaign) return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 })
  if (campaign.status === 'sending' || campaign.status === 'completed') {
    return NextResponse.json({ error: 'Kampanya zaten gönderildi/gönderiliyor' }, { status: 400 })
  }

  await supabase.from('campaigns').update({ status: 'sending', started_at: new Date().toISOString() }).eq('id', id)

  // Unsubscribe listesi
  const { data: unsubs } = await supabase.from('marketing_unsubscribes').select('email, phone')
  const unsubEmails = new Set((unsubs || []).map(u => u.email?.toLowerCase()).filter(Boolean))
  const unsubPhones = new Set((unsubs || []).map(u => u.phone).filter(Boolean))

  let recipients = await loadAudience(supabase, campaign)
  recipients = recipients.filter(r => {
    if (r.email && unsubEmails.has(r.email.toLowerCase())) return false
    if (r.phone && unsubPhones.has(r.phone)) return false
    return true
  })

  await supabase.from('campaigns').update({ target_count: recipients.length }).eq('id', id)

  let sent = 0
  let failed = 0

  if (campaign.channel === 'email') {
    const emailRcpts = recipients.filter(r => r.email)
    const cfg = await loadSmtpConfig(supabase)
    if (!cfg) {
      await supabase.from('campaigns').update({ status: 'cancelled' }).eq('id', id)
      return NextResponse.json({ error: 'SMTP ayarları eksik' }, { status: 400 })
    }
    const transporter = buildTransporter(cfg)

    const baseUrl = req.nextUrl.origin
    const result = await sendBatchEmails({
      transporter,
      fromName: campaign.from_name || cfg.fromName,
      fromAddress: cfg.user,
      subject: campaign.subject || campaign.name,
      htmlTemplate: campaign.html_template || `<p>${campaign.message_template}</p>`,
      recipients: emailRcpts.map(r => ({ email: r.email!, name: r.full_name, vars: r.vars })),
      unsubscribeBaseUrl: `${baseUrl}/api/unsubscribe`,
      pixelBaseUrl: `${baseUrl}/api/pixel`,
      campaignId: id,
      delayMs: 800,
    })
    sent = result.sent
    failed = result.failed

    // Logs
    const logRows = result.results.map(r => {
      const rcpt = emailRcpts.find(x => x.email === r.email)
      return {
        campaign_id: id,
        client_id: rcpt?.client_id,
        lead_id: rcpt?.lead_id,
        channel: 'email',
        email: r.email,
        status: r.ok ? 'sent' : 'failed',
        email_message_id: r.messageId,
        sent_at: r.ok ? new Date().toISOString() : null,
        error_message: r.error,
      }
    })
    if (logRows.length) await supabase.from('campaign_logs').insert(logRows)

    // last_contacted_at güncelle
    const sentLeadIds = result.results.filter(r => r.ok).map(r => emailRcpts.find(x => x.email === r.email)?.lead_id).filter(Boolean) as string[]
    if (sentLeadIds.length) {
      try {
        await supabase.rpc('exec_sql', {
          sql: `UPDATE marketing_leads SET last_contacted_at = now(), contact_count = contact_count + 1 WHERE id = ANY('{${sentLeadIds.join(',')}}'::uuid[])`,
        })
      } catch { /* ignore */ }
    }
  } else if (campaign.channel === 'whatsapp') {
    const waRcpts = recipients.filter(r => r.phone)
    const results = await sendWhatsApp(req, waRcpts, campaign.message_template)
    sent = results.filter(r => r.ok).length
    failed = results.filter(r => !r.ok).length

    const logRows = results.map((r, i) => ({
      campaign_id: id,
      client_id: waRcpts[i]?.client_id,
      lead_id: waRcpts[i]?.lead_id,
      channel: 'whatsapp',
      phone: r.phone,
      status: r.ok ? 'sent' : 'failed',
      sent_at: r.ok ? new Date().toISOString() : null,
      error_message: r.error,
    }))
    if (logRows.length) await supabase.from('campaign_logs').insert(logRows)
  } else if (campaign.channel === 'linkedin') {
    // LinkedIn → linkedin-message endpoint'ine yönlendir
    const liRcpts = recipients.filter(r => r.linkedin_url && r.lead_id)
    if (liRcpts.length === 0) {
      await supabase.from('campaigns').update({ status: 'cancelled' }).eq('id', id)
      return NextResponse.json({ error: 'LinkedIn URL içeren lead yok' }, { status: 400 })
    }
    const baseUrl = req.nextUrl.origin
    const res = await fetch(`${baseUrl}/api/leads/linkedin-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
      body: JSON.stringify({
        lead_ids: liRcpts.map(r => r.lead_id),
        message_template: campaign.message_template,
        consultant_id: campaign.consultant_id,
        campaign_id: id,
      }),
    })
    const j = await res.json()
    if (!res.ok) {
      await supabase.from('campaigns').update({ status: 'cancelled' }).eq('id', id)
      return NextResponse.json({ error: j.error || 'LinkedIn gönderim başarısız' }, { status: 500 })
    }
    sent = liRcpts.length
  }

  await supabase
    .from('campaigns')
    .update({
      status: 'completed',
      sent_count: sent,
      failed_count: failed,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)

  return NextResponse.json({ sent, failed, target: recipients.length })
}
