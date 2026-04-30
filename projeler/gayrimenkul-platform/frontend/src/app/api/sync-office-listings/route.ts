import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const APIFY_TOKEN = process.env.APIFY_API_KEY || ''
const APIFY_SAHIBINDEN_ACTOR = 'clearpath~sahibinden-scraper-pro'

// ── Yardımcılar (scrape-property ile aynı mapping mantığı) ────────────────────
function parseNumber(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return isNaN(raw) ? null : raw
  const s = String(raw).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return isNaN(n) ? null : n
}

function parseAge(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return raw
  const s = String(raw).toLowerCase()
  if (s.includes('sıfır')) return 0
  const range = s.match(/(\d+)\s*-\s*(\d+)/)
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2)
  const single = s.match(/\d+/)
  return single ? Number(single[0]) : null
}

function mapCategoryToType(path: string[] | undefined): string {
  const joined = (path || []).join(' ').toLocaleLowerCase('tr-TR')
  if (joined.includes('daire')) return 'apartment'
  if (joined.includes('villa')) return 'villa'
  if (joined.includes('müstakil')) return 'detached_house'
  if (joined.includes('rezidans')) return 'apartment'
  if (joined.includes('ofis') || joined.includes('büro')) return 'office'
  if (joined.includes('dükkan') || joined.includes('mağaza')) return 'shop'
  if (joined.includes('depo') || joined.includes('ambar')) return 'warehouse'
  if (joined.includes('tarla') || joined.includes('bağ') || joined.includes('bahçe')) return 'field'
  if (joined.includes('arsa')) return 'land'
  if (joined.includes('iş yeri') || joined.includes('işyeri')) return 'commercial'
  return 'apartment'
}

interface SahibindenItem {
  id?: string | number
  url?: string
  title?: string
  description?: string
  descriptionNormalized?: string
  price?: number
  currency?: string
  categoryPath?: string[]
  city?: string
  district?: string
  neighborhood?: string
  quarter?: string
  address?: string
  latitude?: number
  longitude?: number
  images?: string[]
  features?: string[]
  attributes?: Record<string, unknown>
  // Seller info — actor versiyonuna göre değişen alan adları
  sellerName?: string
  sellerPhone?: string | string[]
  sellerPhones?: string[]
  seller?: { name?: string; phone?: string | string[]; phones?: string[]; type?: string; tel?: string; mobile?: string; gsm?: string }
  contactName?: string
  contactPhone?: string
  contact?: { name?: string; phone?: string | string[]; phones?: string[]; tel?: string }
  phone?: string | string[]
  phones?: string[]
  tel?: string
  mobile?: string
  gsm?: string
  userName?: string
  userType?: string
  owner?: { name?: string; phone?: string | string[]; tel?: string }
  agent?: { name?: string; phone?: string | string[]; tel?: string }
  [key: string]: unknown
}

// Tüm muhtemel telefon kaynaklarından ilk valid olanı çıkar.
// "0532 123 45 67" / array / nested obj / string'in içine gömülü olabilir.
function extractPhone(item: SahibindenItem): string | null {
  const candidates: unknown[] = [
    item.sellerPhone, item.sellerPhones, item.contactPhone, item.phone, item.phones,
    item.tel, item.mobile, item.gsm,
    item.seller?.phone, item.seller?.phones, item.seller?.tel, item.seller?.mobile, item.seller?.gsm,
    item.contact?.phone, item.contact?.phones, item.contact?.tel,
    item.owner?.phone, item.owner?.tel,
    item.agent?.phone, item.agent?.tel,
  ]
  for (const c of candidates) {
    if (!c) continue
    if (Array.isArray(c)) {
      for (const v of c) if (typeof v === 'string' && /\d{7,}/.test(v)) return normalizePhone(v)
    } else if (typeof c === 'string' && /\d{7,}/.test(c)) {
      return normalizePhone(c)
    }
  }
  return null
}

function extractSellerName(item: SahibindenItem): string | null {
  return (
    item.sellerName ||
    item.seller?.name ||
    item.contactName ||
    item.contact?.name ||
    item.userName ||
    item.owner?.name ||
    item.agent?.name ||
    null
  )
}

function extractSellerType(item: SahibindenItem): string | null {
  return (item.seller?.type || item.userType || null) as string | null
}

function normalizePhone(s: string): string {
  // "+90 (532) 123 45 67" / "0532 123 4567" → düzgün biçim
  const digits = s.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('5')) return '0' + digits
  if (digits.length === 11 && digits.startsWith('0')) return digits
  if (digits.length === 12 && digits.startsWith('90')) return '0' + digits.slice(2)
  if (digits.length === 13 && digits.startsWith('900')) return '0' + digits.slice(3)
  return digits
}

function mapItem(item: SahibindenItem, officeUrl: string) {
  const a = item.attributes || {}
  const pick = (keys: string[]): unknown => {
    for (const k of keys) {
      for (const actual of Object.keys(a)) {
        if (actual.toLocaleLowerCase('tr-TR') === k.toLocaleLowerCase('tr-TR')) return a[actual]
      }
    }
    return null
  }

  const address =
    item.address ||
    [item.neighborhood, item.quarter, item.district, item.city].filter(Boolean).join(', ') ||
    null

  return {
    title: item.title || 'İsimsiz İlan',
    description: item.description || item.descriptionNormalized || null,
    price: item.price ?? null,
    currency: item.currency || 'TRY',
    property_type: mapCategoryToType(item.categoryPath),
    city: item.city || null,
    district: item.district || null,
    neighborhood: item.neighborhood || item.quarter || null,
    address,
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    m2_gross: parseNumber(pick(['m²', 'Brüt Metrekare', 'm² (Brüt)'])),
    m2_net: parseNumber(pick(['Net Metrekare', 'm² (Net)'])),
    room_count: (() => {
      const r = pick(['Oda Sayısı', 'Oda + Salon Sayısı'])
      return r ? String(r) : null
    })(),
    bathroom_count: parseNumber(pick(['Banyo Sayısı', 'Banyo'])),
    floor: parseNumber(pick(['Bulunduğu Kat', 'Kat'])),
    total_floors: parseNumber(pick(['Kat Sayısı', 'Binanın Kat Sayısı'])),
    age: parseAge(pick(['Bina Yaşı', 'Yaşı'])),
    heating_type: (() => {
      const h = pick(['Isıtma', 'Isıtma Tipi'])
      return h ? String(h) : null
    })(),
    features: Array.isArray(item.features) ? item.features : [],
    photos: Array.isArray(item.images) ? item.images.slice(0, 30) : [],
    source: 'sahibinden' as const,
    source_listing_id: item.id != null ? String(item.id) : null,
    source_url: item.url || null,
    office_source_url: officeUrl,
    seller_name: extractSellerName(item),
    seller_phone: extractPhone(item),
    seller_type: extractSellerType(item),
  }
}

async function runApifyActor(input: unknown, timeoutSec = 280): Promise<SahibindenItem[]> {
  if (!APIFY_TOKEN) throw new Error('APIFY_API_KEY tanımlı değil')
  const res = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_SAHIBINDEN_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${timeoutSec}`,
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
  const items = await res.json()
  return Array.isArray(items) ? items : []
}

// ── POST /api/sync-office-listings ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const runStart = new Date().toISOString()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Ayarları al
  const { data: settings } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['office_sahibinden_url', 'office_sync_cron_secret', 'office_sync_max_items'])

  const map: Record<string, string> = {}
  for (const row of settings || []) {
    const v = typeof row.value === 'string' ? row.value.replace(/^"|"$/g, '') : String(row.value)
    map[row.key] = v
  }

  const officeUrl = map.office_sahibinden_url?.trim()
  const cronSecret = map.office_sync_cron_secret?.trim()

  // Auth: header veya body secret'ı eşleşmeli (settings'te tanımlıysa)
  if (cronSecret) {
    const headerSecret = req.headers.get('x-cron-secret') || ''
    if (headerSecret !== cronSecret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  if (!officeUrl || !officeUrl.startsWith('http')) {
    return NextResponse.json(
      { error: 'Ofis URL ayarlanmamış (admin → Ayarlar → Sahibinden Mağaza URL)' },
      { status: 400 },
    )
  }

  // Apify: mağaza/arama URL'ini tara
  let items: SahibindenItem[] = []
  try {
    // Her çalışmada max 50 ilan çek (maliyet kontrolü ~$0.30/run)
    // Daha önce çekilenler source_listing_id ile atlanır
  const maxItems = parseInt(map.office_sync_max_items || '200', 10) || 200
  const pagesToScrape = Math.ceil(maxItems / 20)
  
  let totalScraped = 0
  let totalInserted = 0
  let totalUpdated = 0
  let totalWithPhone = 0
  let firstItemDiagnostic: Record<string, unknown> | null = null
  const errors: string[] = []

  for (let i = 0; i < pagesToScrape; i++) {
    const offset = i * 20
    const pageUrl = officeUrl.includes('?')
      ? `${officeUrl}&pagingOffset=${offset}`
      : `${officeUrl}?pagingOffset=${offset}`

    try {
      // Phone enrichment için tüm muhtemel flag'leri yolla.
      // Actor desteklemediğini sessizce yok sayar; destekleyenler için detail page'i ziyaret eder.
      const pageItems = await runApifyActor({
        startUrls: [pageUrl],
        maxItems: 20,
        enriched: true,
        fullDetail: true,
        crawlDetailPages: true,
        extendItems: true,
        extractContactInfo: true,
        includePhone: true,
        includePhones: true,
        includeContact: true,
        revealPhone: true,
        withContact: true,
        getOwnerInfo: true,
        proxyConfiguration: { useApifyProxy: true, groups: ['RESIDENTIAL'] },
      }, 180) as SahibindenItem[]

      if (!pageItems || pageItems.length === 0) break

      // İlk item'in diagnostic bilgisini topla — telefon hangi alanda geliyor görmek için
      if (!firstItemDiagnostic && pageItems[0]) {
        const item: any = pageItems[0]
        const phoneFields: Record<string, unknown> = {}
        const flatten = (obj: any, prefix = '', depth = 0) => {
          if (!obj || typeof obj !== 'object' || depth > 3) return
          for (const [k, v] of Object.entries(obj)) {
            const key = prefix ? `${prefix}.${k}` : k
            if (/phone|tel|gsm|mobile|contact/i.test(k)) phoneFields[key] = v
            if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, depth + 1)
          }
        }
        flatten(item)
        firstItemDiagnostic = {
          topLevelKeys: Object.keys(item),
          attributesKeys: item.attributes ? Object.keys(item.attributes) : null,
          phoneCandidateFields: phoneFields,
        }
      }

      for (const raw of pageItems) {
        if (!raw?.id) continue
        const mapped = mapItem(raw, pageUrl) // url as context
        if (mapped.seller_phone) totalWithPhone++
        const payload = {
          ...mapped,
          is_active: true,
          last_seen_at: runStart,
        }

        const { data: existing } = await supabase
          .from('market_listings')
          .select('id')
          .eq('source', 'sahibinden')
          .eq('source_listing_id', mapped.source_listing_id)
          .maybeSingle()

        if (existing?.id) {
          const { error } = await supabase
            .from('market_listings')
            .update({
              title: payload.title,
              price: payload.price,
              photos: payload.photos,
              is_active: true,
              last_seen_at: runStart,
              ...(payload.seller_name ? { seller_name: payload.seller_name } : {}),
              ...(payload.seller_phone ? { seller_phone: payload.seller_phone } : {}),
              ...(payload.seller_type ? { seller_type: payload.seller_type } : {}),
            })
            .eq('id', existing.id)
          if (error) errors.push(`update ${mapped.source_listing_id}: ${error.message}`)
          else totalUpdated++
        } else {
          const { error } = await supabase
            .from('market_listings')
            .insert({ ...payload, contact_status: 'new' })
          if (error) errors.push(`insert ${mapped.source_listing_id}: ${error.message}`)
          else totalInserted++
        }
      }
      totalScraped += pageItems.length
    } catch (err: any) {
      errors.push(`Page ${i} error: ${err.message}`)
    }
  }

  const summary = {
    run_at: runStart,
    scraped: totalScraped,
    inserted: totalInserted,
    updated: totalUpdated,
    with_phone: totalWithPhone,
    phone_coverage_pct: totalScraped > 0 ? Math.round((totalWithPhone / totalScraped) * 100) : 0,
    deactivated: 0,
    diagnostic: firstItemDiagnostic,
    errors: errors.slice(0, 10),
  }

  await logResult(supabase, runStart, summary)
  return NextResponse.json(summary)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Bilinmeyen hata'
    await logResult(supabase, runStart, { error: msg, scraped: 0 })
    return NextResponse.json({ error: `Sync işlemi başarısız: ${msg}` }, { status: 500 })
  }
}

// Ayrıca GET ile manual tetikleme (admin panel buton)
export async function GET(req: NextRequest) {
  return POST(req)
}

async function logResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  runAt: string,
  result: Record<string, unknown>,
) {
  await supabase.from('settings').upsert(
    [
      { key: 'office_sync_last_run', value: runAt as unknown, updated_at: new Date().toISOString() },
      { key: 'office_sync_last_result', value: result as unknown, updated_at: new Date().toISOString() },
    ] as Array<{ key: string; value: unknown; updated_at: string }>,
    { onConflict: 'key' },
  )
}
