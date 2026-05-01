import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/email'
import { APIFY_ACTORS, startApifyRun } from '@/lib/apify'
import { renderTemplate } from '@/lib/email'

interface MsgBody {
  lead_ids: string[]
  message_template: string
  cookie?: string
  consultant_id?: string
  campaign_id?: string
}

// LinkedIn mesaj otomasyonu — KULLANIRKEN DİKKAT:
// LinkedIn ToS'a aykırıdır, hesap banlanma riski vardır. Sadece kullanıcı
// kendi hesabıyla, kendi cookie'sini girerek başlatabilir. Günlük limit önemli.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as MsgBody
  if (!body.lead_ids?.length) return NextResponse.json({ error: 'lead_ids gerekli' }, { status: 400 })
  if (!body.message_template) return NextResponse.json({ error: 'message_template gerekli' }, { status: 400 })

  const supabase = adminClient()

  // Cookie'yi DB'den al (yoksa body'den)
  let cookie = body.cookie
  if (!cookie) {
    const { data } = await supabase.from('settings').select('value').eq('key', 'linkedin_cookie').maybeSingle()
    if (data?.value) {
      let v = String(data.value)
      while (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      cookie = v
    }
  }
  if (!cookie) return NextResponse.json({ error: 'LinkedIn cookie tanımlı değil (settings.linkedin_cookie)' }, { status: 400 })

  // Lead'leri yükle
  const { data: leads } = await supabase
    .from('marketing_leads')
    .select('id, full_name, linkedin_url, company, title')
    .in('id', body.lead_ids)
    .not('linkedin_url', 'is', null)

  if (!leads?.length) return NextResponse.json({ error: 'LinkedIn URL içeren lead yok' }, { status: 400 })

  // Mesajları lead başına render et
  const messages = leads.map(l => ({
    profileUrl: l.linkedin_url,
    message: renderTemplate(body.message_template, {
      isim: (l.full_name || '').split(' ')[0],
      ad_soyad: l.full_name,
      sirket: l.company,
      unvan: l.title,
    }),
  }))

  const actor = APIFY_ACTORS.linkedin_message
  const input = {
    cookie: [{ name: 'li_at', value: cookie, domain: '.linkedin.com' }],
    messages,
    delaySecondsMin: 30,
    delaySecondsMax: 90,
  }

  const { data: job } = await supabase
    .from('lead_scrape_jobs')
    .insert({
      job_type: 'linkedin_message',
      actor_id: actor,
      input: { ...input, cookie: '[REDACTED]' },
      status: 'pending',
      consultant_id: body.consultant_id,
    })
    .select()
    .single()

  try {
    const run = await startApifyRun(actor, input)
    await supabase
      .from('lead_scrape_jobs')
      .update({
        apify_run_id: run.runId,
        apify_dataset_id: run.datasetId,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', job!.id)

    // Logs için kayıt
    if (body.campaign_id) {
      const logs = leads.map(l => ({
        campaign_id: body.campaign_id,
        lead_id: l.id,
        channel: 'linkedin',
        status: 'pending',
      }))
      await supabase.from('campaign_logs').insert(logs)
    }

    return NextResponse.json({
      job_id: job!.id,
      apify_run_id: run.runId,
      target_count: leads.length,
      warning: 'LinkedIn mesaj otomasyonu hesabınızı riske atabilir. Günlük 20-30 mesajdan fazla atmayın.',
    })
  } catch (e) {
    await supabase
      .from('lead_scrape_jobs')
      .update({ status: 'failed', error_message: e instanceof Error ? e.message : 'unknown' })
      .eq('id', job!.id)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Apify hatası' }, { status: 500 })
  }
}
