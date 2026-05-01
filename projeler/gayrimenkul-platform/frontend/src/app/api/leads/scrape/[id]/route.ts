import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/email'
import {
  getApifyRun,
  getApifyDatasetItems,
  normalizeGoogleMapsItem,
  normalizeLinkedInPersonItem,
  normalizeLinkedInCompanyItem,
} from '@/lib/apify'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = adminClient()

  const { data: job, error } = await supabase
    .from('lead_scrape_jobs')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !job) return NextResponse.json({ error: 'Job bulunamadı' }, { status: 404 })

  // Apify'dan güncel durum
  if (job.apify_run_id && (job.status === 'pending' || job.status === 'running')) {
    try {
      const run = await getApifyRun(job.apify_run_id)
      const status = run.status === 'SUCCEEDED' ? 'succeeded'
        : run.status === 'FAILED' ? 'failed'
        : run.status === 'TIMED-OUT' ? 'failed'
        : run.status === 'ABORTED' ? 'failed'
        : 'running'

      const update: Record<string, unknown> = { status, cost_usd: run.cost }
      if (status === 'succeeded' || status === 'failed') {
        update.completed_at = new Date().toISOString()
      }
      await supabase.from('lead_scrape_jobs').update(update).eq('id', id)
      job.status = status
      if (run.cost) job.cost_usd = run.cost
    } catch {
      // sessizce devam
    }
  }

  return NextResponse.json({ job })
}

// POST → datasete bak, leads tablosuna import et
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = adminClient()

  const { data: job, error } = await supabase
    .from('lead_scrape_jobs')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !job) return NextResponse.json({ error: 'Job bulunamadı' }, { status: 404 })
  if (!job.apify_dataset_id) return NextResponse.json({ error: 'Dataset henüz hazır değil' }, { status: 400 })

  const items = await getApifyDatasetItems(job.apify_dataset_id, 1000)

  const normalize = job.job_type === 'google_maps' ? normalizeGoogleMapsItem
    : job.job_type === 'linkedin_people' ? normalizeLinkedInPersonItem
    : job.job_type === 'linkedin_company' ? normalizeLinkedInCompanyItem
    : null
  if (!normalize) return NextResponse.json({ error: 'Bu iş tipi için normalize tanımsız' }, { status: 400 })

  const leads = items
    .map(it => normalize(it as Record<string, unknown>))
    .filter(l => l.email || l.phone || l.linkedin_url)
    .map(l => ({
      ...l,
      scrape_job_id: job.id,
      consultant_id: job.consultant_id,
    }))

  let imported = 0
  if (leads.length > 0) {
    // Email duplicate'ları yoksay; email yoksa phone ile dedup
    const { data, error: insErr } = await supabase
      .from('marketing_leads')
      .upsert(leads, { onConflict: 'email', ignoreDuplicates: true })
      .select('id')
    if (insErr) {
      return NextResponse.json({ error: insErr.message, sample: leads[0] }, { status: 500 })
    }
    imported = data?.length || 0
  }

  await supabase
    .from('lead_scrape_jobs')
    .update({ result_count: items.length, imported_count: imported })
    .eq('id', id)

  return NextResponse.json({
    fetched: items.length,
    imported,
    skipped_no_contact: items.length - leads.length,
  })
}
