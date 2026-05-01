const APIFY_TOKEN = process.env.APIFY_API_KEY || ''
const APIFY_BASE = 'https://api.apify.com/v2'

export const APIFY_ACTORS = {
  google_maps: 'compass~crawler-google-places',
  linkedin_people: 'curious_coder~linkedin-post-search-scraper',
  linkedin_company: 'apimaestro~linkedin-company-pages-scraper',
  linkedin_message: 'dev_fusion~linkedin-message-sender',
} as const

export type ApifyActorKey = keyof typeof APIFY_ACTORS

export async function startApifyRun(actor: string, input: unknown): Promise<{
  runId: string
  datasetId: string
  status: string
}> {
  if (!APIFY_TOKEN) throw new Error('APIFY_API_KEY tanımlı değil')
  const res = await fetch(`${APIFY_BASE}/acts/${actor}/runs?token=${APIFY_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Apify run başlatma hatası ${res.status}: ${txt.slice(0, 300)}`)
  }
  const json = await res.json()
  const data = json.data
  return { runId: data.id, datasetId: data.defaultDatasetId, status: data.status }
}

export async function getApifyRun(runId: string): Promise<{
  status: string
  datasetId: string
  finishedAt?: string
  cost?: number
  itemCount?: number
}> {
  if (!APIFY_TOKEN) throw new Error('APIFY_API_KEY tanımlı değil')
  const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${APIFY_TOKEN}`)
  if (!res.ok) throw new Error(`Apify run getirme hatası ${res.status}`)
  const json = await res.json()
  const d = json.data
  return {
    status: d.status,
    datasetId: d.defaultDatasetId,
    finishedAt: d.finishedAt,
    cost: d.usageTotalUsd,
    itemCount: d.stats?.outputBodyLen ? undefined : undefined,
  }
}

export async function getApifyDatasetItems(datasetId: string, limit = 1000): Promise<unknown[]> {
  if (!APIFY_TOKEN) throw new Error('APIFY_API_KEY tanımlı değil')
  const res = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=${limit}&clean=true`,
  )
  if (!res.ok) throw new Error(`Apify dataset hatası ${res.status}`)
  const items = await res.json()
  return Array.isArray(items) ? items : []
}

export async function runApifySync(actor: string, input: unknown, timeoutSec = 280): Promise<unknown[]> {
  if (!APIFY_TOKEN) throw new Error('APIFY_API_KEY tanımlı değil')
  const res = await fetch(
    `${APIFY_BASE}/acts/${actor}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${timeoutSec}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((timeoutSec + 20) * 1000),
    },
  )
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Apify hata ${res.status}: ${txt.slice(0, 300)}`)
  }
  const json = await res.json()
  return Array.isArray(json) ? json : []
}

interface RawItem { [k: string]: unknown }

const get = (o: RawItem, k: string) => (typeof o[k] === 'string' ? (o[k] as string) : undefined)

export interface NormalizedLead {
  full_name?: string
  email?: string
  phone?: string
  company?: string
  title?: string
  industry?: string
  city?: string
  district?: string
  linkedin_url?: string
  website?: string
  source: string
  enrichment_data: Record<string, unknown>
}

function pickEmail(o: RawItem): string | undefined {
  const direct = get(o, 'email') || get(o, 'emailAddress')
  if (direct) return direct.toLowerCase()
  const arr = (o.emails as unknown[]) || (o.contactDetails as unknown[]) || []
  for (const e of arr) {
    if (typeof e === 'string' && e.includes('@')) return e.toLowerCase()
    if (e && typeof e === 'object' && 'value' in e) {
      const v = (e as { value: unknown }).value
      if (typeof v === 'string' && v.includes('@')) return v.toLowerCase()
    }
  }
  return undefined
}

function pickPhone(o: RawItem): string | undefined {
  const direct = get(o, 'phone') || get(o, 'phoneNumber') || get(o, 'phoneUnformatted')
  if (direct) return direct
  const arr = (o.phones as unknown[]) || []
  for (const p of arr) {
    if (typeof p === 'string') return p
  }
  return undefined
}

export function normalizeGoogleMapsItem(item: RawItem): NormalizedLead {
  return {
    full_name: get(item, 'title') || get(item, 'name'),
    email: pickEmail(item),
    phone: pickPhone(item),
    company: get(item, 'title') || get(item, 'name'),
    title: get(item, 'categoryName'),
    industry: get(item, 'categoryName'),
    city: get(item, 'city'),
    district: get(item, 'neighborhood') || get(item, 'street'),
    website: get(item, 'website'),
    source: 'apify_google_maps',
    enrichment_data: {
      address: get(item, 'address'),
      total_score: item.totalScore,
      reviews_count: item.reviewsCount,
      categories: item.categories,
      url: get(item, 'url'),
      place_id: get(item, 'placeId'),
    },
  }
}

export function normalizeLinkedInPersonItem(item: RawItem): NormalizedLead {
  const first = get(item, 'firstName') || ''
  const last = get(item, 'lastName') || ''
  const fullName = get(item, 'fullName') || get(item, 'name') || `${first} ${last}`.trim() || undefined
  return {
    full_name: fullName,
    email: pickEmail(item),
    phone: pickPhone(item),
    company: get(item, 'companyName') || get(item, 'company'),
    title: get(item, 'jobTitle') || get(item, 'headline') || get(item, 'title'),
    industry: get(item, 'industry'),
    city: get(item, 'city') || get(item, 'location'),
    linkedin_url: get(item, 'linkedinUrl') || get(item, 'profileUrl') || get(item, 'url'),
    source: 'apify_linkedin_people',
    enrichment_data: {
      headline: get(item, 'headline'),
      summary: get(item, 'summary'),
      experience: item.experience,
      location: get(item, 'location'),
      connections: item.connections,
    },
  }
}

export function normalizeLinkedInCompanyItem(item: RawItem): NormalizedLead {
  return {
    full_name: get(item, 'name') || get(item, 'companyName'),
    email: pickEmail(item),
    phone: pickPhone(item),
    company: get(item, 'name') || get(item, 'companyName'),
    title: 'Company',
    industry: get(item, 'industry'),
    city: get(item, 'city') || get(item, 'headquarter') || get(item, 'location'),
    linkedin_url: get(item, 'url') || get(item, 'linkedinUrl'),
    website: get(item, 'website'),
    source: 'apify_linkedin_company',
    enrichment_data: {
      employees: item.employeesCount || item.employees,
      followers: item.followers,
      description: get(item, 'description'),
      specialties: item.specialties,
    },
  }
}
