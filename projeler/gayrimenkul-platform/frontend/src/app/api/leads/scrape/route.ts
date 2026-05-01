import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/email'
import {
  APIFY_ACTORS,
  startApifyRun,
  type ApifyActorKey,
} from '@/lib/apify'

interface ScrapeBody {
  job_type: ApifyActorKey
  query?: string
  city?: string
  district?: string
  max_results?: number
  consultant_id?: string
  // job_type'a özel ekstra parametreler
  search_url?: string
  company_urls?: string[]
}

function buildActorInput(body: ScrapeBody): unknown {
  const max = Math.min(body.max_results || 100, 500)
  const locationQuery = [body.city, body.district].filter(Boolean).join(' ')

  switch (body.job_type) {
    case 'google_maps':
      return {
        searchStringsArray: [body.query || 'emlak ofisi'],
        locationQuery: locationQuery || 'Türkiye',
        maxCrawledPlacesPerSearch: max,
        language: 'tr',
        includeWebResults: true,
        scrapeContacts: true,
      }
    case 'linkedin_people':
      return {
        searchUrl: body.search_url,
        searchKeywords: body.query,
        maxItems: max,
        location: locationQuery,
      }
    case 'linkedin_company':
      return {
        companyUrls: body.company_urls || [],
        searchKeywords: body.query,
        maxItems: max,
      }
    default:
      throw new Error('Geçersiz job_type')
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ScrapeBody
  if (!body.job_type || !(body.job_type in APIFY_ACTORS)) {
    return NextResponse.json({ error: 'Geçersiz job_type' }, { status: 400 })
  }

  const supabase = adminClient()
  const actor = APIFY_ACTORS[body.job_type]

  let input: unknown
  try {
    input = buildActorInput(body)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'input hatası' }, { status: 400 })
  }

  // DB'ye job kaydı aç
  const { data: job, error: jobErr } = await supabase
    .from('lead_scrape_jobs')
    .insert({
      job_type: body.job_type,
      actor_id: actor,
      input,
      status: 'pending',
      consultant_id: body.consultant_id,
    })
    .select()
    .single()
  if (jobErr || !job) return NextResponse.json({ error: jobErr?.message || 'Job oluşturulamadı' }, { status: 500 })

  // Apify'ı async başlat — kullanıcı sayfayı kapatabilir
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
      .eq('id', job.id)
    return NextResponse.json({ job_id: job.id, apify_run_id: run.runId })
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'unknown'
    let friendly = raw
    if (raw.includes('Monthly usage hard limit')) {
      friendly = 'Apify aylık kullanım limiti aşıldı. https://console.apify.com/account/billing → Limits sayfasından üst sınırı artırın veya planı yükseltin.'
    } else if (raw.includes('platform-feature-disabled')) {
      friendly = 'Apify özelliği devre dışı. Hesap planınızı kontrol edin.'
    } else if (raw.includes('401') || raw.includes('Unauthorized')) {
      friendly = 'APIFY_API_KEY geçersiz veya yetkisi yok.'
    } else if (raw.includes('actor-not-found') || raw.includes('404')) {
      friendly = 'Apify aktörü bulunamadı veya hesabınızda erişim yok.'
    }
    await supabase
      .from('lead_scrape_jobs')
      .update({ status: 'failed', error_message: raw })
      .eq('id', job.id)
    return NextResponse.json({ error: friendly, raw }, { status: 500 })
  }
}

export async function GET() {
  const supabase = adminClient()
  const { data, error } = await supabase
    .from('lead_scrape_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data || [] })
}
