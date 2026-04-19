import { NextRequest, NextResponse } from 'next/server'

const APIFY_TOKEN = process.env.APIFY_API_KEY || ''
const APIFY_SAHIBINDEN_ACTOR = 'clearpath~sahibinden-scraper-pro'

// ── Platform tespiti ─────────────────────────────────────────────────────────
function detectPlatform(url: string) {
  if (url.includes('sahibinden.com')) return 'sahibinden'
  if (url.includes('cb.com.tr')) return 'cb_com_tr'
  if (url.includes('hepsiemlak.com')) return 'hepsiemlak'
  if (url.includes('emlakjet.com')) return 'emlakjet'
  if (url.includes('zingat.com')) return 'zingat'
  return 'other'
}

// ── Apify çağrısı ────────────────────────────────────────────────────────────
async function runApifyActor(actor: string, input: unknown, timeoutSec = 180): Promise<unknown[]> {
  if (!APIFY_TOKEN) throw new Error('APIFY_API_KEY tanımlı değil')
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${timeoutSec}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((timeoutSec + 15) * 1000),
    },
  )
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Apify ${actor} hata ${res.status}: ${txt.slice(0, 200)}`)
  }
  const items = await res.json()
  return Array.isArray(items) ? items : []
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────
function parseNumber(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return isNaN(raw) ? null : raw
  const s = String(raw).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return isNaN(n) ? null : n
}

// "26-30 arası" → 28, "5" → 5, "Sıfır Bina" → 0
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

// Sahibinden categoryPath → property_type enum
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

// ── Apify sahibinden item → form alanları ───────────────────────────────────
interface SahibindenItem {
  id?: string | number
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
  listedAt?: string
}

function mapSahibindenItem(item: SahibindenItem, sourceUrl: string) {
  const a = item.attributes || {}

  // Attribute key'leri Türkçe ve bazen varyasyonlu; tolerant ara
  const pick = (keys: string[]): unknown => {
    for (const k of keys) {
      for (const actual of Object.keys(a)) {
        if (actual.toLocaleLowerCase('tr-TR') === k.toLocaleLowerCase('tr-TR')) {
          return a[actual]
        }
      }
    }
    return null
  }

  const m2Gross = parseNumber(pick(['m²', 'Brüt Metrekare', 'm² (Brüt)', 'Metrekare (Brüt)']))
  const m2Net = parseNumber(pick(['Net Metrekare', 'm² (Net)', 'Metrekare (Net)']))
  const rooms = pick(['Oda Sayısı', 'Oda + Salon Sayısı'])
  const bath = parseNumber(pick(['Banyo Sayısı', 'Banyo']))
  const floor = parseNumber(pick(['Bulunduğu Kat', 'Kat']))
  const totalFloors = parseNumber(pick(['Kat Sayısı', 'Binanın Kat Sayısı']))
  const age = parseAge(pick(['Bina Yaşı', 'Yaşı']))
  const heating = pick(['Isıtma', 'Isıtma Tipi'])
  const deposit = parseNumber(pick(['Depozito (TL)', 'Depozito']))
  const dues = parseNumber(pick(['Aidat (TL)', 'Aidat']))

  const address =
    item.address ||
    [item.neighborhood, item.quarter, item.district, item.city].filter(Boolean).join(', ') ||
    null

  return {
    title: item.title || null,
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
    m2_gross: m2Gross,
    m2_net: m2Net,
    room_count: rooms ? String(rooms) : null,
    bathroom_count: bath,
    floor,
    total_floors: totalFloors,
    age,
    heating_type: heating ? String(heating) : null,
    deposit,
    dues,
    features: Array.isArray(item.features) ? item.features : [],
    photos: Array.isArray(item.images) ? item.images.slice(0, 30) : [],
    source_listing_id: item.id != null ? String(item.id) : null,
    source_url: sourceUrl,
    category_path: item.categoryPath || [],
  }
}

// ── Fallback: HTML çek + Claude ile parse (Apify desteklemediği platformlar) ─
async function callOpenRouter(prompt: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gayrimenkul.yapayzekaotomasyon.cloud',
      'X-Title': 'Gayrimenkul Platform',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter hata: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

async function fetchViaBrowserless(url: string): Promise<string> {
  const browserlessUrl = process.env.BROWSERLESS_URL
  const browserlessToken = process.env.BROWSERLESS_TOKEN
  if (!browserlessUrl) throw new Error('BROWSERLESS_URL tanımlanmamış')
  const res = await fetch(`${browserlessUrl}/content?token=${browserlessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      waitFor: 2000,
      rejectResourceTypes: ['image', 'font', 'stylesheet'],
    }),
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) throw new Error(`Browserless hata: ${res.status}`)
  return await res.text()
}

function extractPhotos(html: string, baseUrl: string): string[] {
  const photos: string[] = []
  const origin = new URL(baseUrl).origin
  function addPhoto(src: string) {
    if (!src || src.startsWith('data:') || src.length < 10) return
    if (src.includes('icon') || src.includes('logo') || src.includes('avatar')) return
    if (!src.match(/\.(jpg|jpeg|png|webp)/i)) return
    const full = src.startsWith('http') ? src : `${origin}${src.startsWith('/') ? '' : '/'}${src}`
    if (!photos.includes(full) && photos.length < 20) photos.push(full)
  }
  for (const m of Array.from(html.matchAll(/<img[^>]+>/gi))) {
    const tag = m[0]
    const dataSrc =
      tag.match(/\bdata-src=["']([^"']+)["']/i) ||
      tag.match(/\bdata-lazy-src=["']([^"']+)["']/i) ||
      tag.match(/\bdata-original=["']([^"']+)["']/i) ||
      tag.match(/\bdata-url=["']([^"']+)["']/i)
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)
    if (dataSrc) addPhoto(dataSrc[1])
    else if (src) addPhoto(src[1])
  }
  for (const m of Array.from(html.matchAll(/"(https?:[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi))) {
    const u = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/')
    if (!photos.includes(u) && photos.length < 20) photos.push(u)
  }
  return photos.slice(0, 15)
}

function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function parseWithClaude(html: string, url: string) {
  const cleaned = cleanHtml(html)
  const prompt = `Aşağıdaki gayrimenkul ilan sayfasından bilgileri çıkar ve SADECE JSON döndür.
URL: ${url}
İçerik:
${cleaned.slice(0, 12000)}

Alanlar (bulamazsan null):
{"title":"","price":0,"currency":"TRY","property_type":"apartment|villa|land|commercial|office|shop|warehouse|detached_house|field","city":"","district":"","neighborhood":"","address":"","m2_gross":0,"m2_net":0,"room_count":"","bathroom_count":0,"floor":0,"total_floors":0,"age":0,"heating_type":"","deposit":0,"dues":0,"features":[],"description":""}

Sadece JSON döndür.`
  const text = await callOpenRouter(prompt)
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('Claude JSON döndürmedi')
  return JSON.parse(m[0])
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url || !url.startsWith('http')) {
      return NextResponse.json({ error: 'Geçerli bir URL giriniz' }, { status: 400 })
    }

    const platform = detectPlatform(url)

    // 1) Sahibinden → Apify (yapılandırılmış veri, Cloudflare aşılır)
    if (platform === 'sahibinden') {
      try {
        const items = await runApifyActor(APIFY_SAHIBINDEN_ACTOR, { startUrls: [url] }, 180)
        const item = items.find((x) => x && typeof x === 'object') as SahibindenItem | undefined
        if (!item) {
          return NextResponse.json(
            { error: 'Apify sahibinden scraper veri döndürmedi. İlan kaldırılmış olabilir.' },
            { status: 502 },
          )
        }
        // Cloudflare challenge sayfası kontrolü
        const title = item.title || ''
        if (title.toLowerCase().includes('just a moment') || title.toLowerCase().includes('attention required')) {
          return NextResponse.json(
            { error: 'Sahibinden Cloudflare koruması nedeniyle veri çekilemedi. Lütfen tekrar deneyin.' },
            { status: 502 },
          )
        }
        const mapped = mapSahibindenItem(item, url)
        // Hiçbir anlamlı veri yoksa hata döndür
        if (!mapped.title && !mapped.price && !mapped.city) {
          return NextResponse.json(
            { error: 'İlan verisi alınamadı. İlan kaldırılmış veya erişilemiyor olabilir.' },
            { status: 502 },
          )
        }
        return NextResponse.json(mapped)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Bilinmeyen hata'
        return NextResponse.json(
          { error: `Sahibinden scraping başarısız: ${msg}` },
          { status: 502 },
        )
      }
    }

    // 2) Diğer platformlar → Browserless/fetch + Claude parse
    let rawContent = ''
    const jsHeavy = ['hepsiemlak', 'emlakjet', 'zingat']
    if (jsHeavy.includes(platform) && process.env.BROWSERLESS_URL) {
      try {
        rawContent = await fetchViaBrowserless(url)
      } catch {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000),
        })
        rawContent = await r.text()
      }
    } else {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'tr-TR,tr;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      })
      rawContent = await r.text()
    }

    if (!rawContent || rawContent.length < 100) {
      return NextResponse.json({ error: 'Sayfa içeriği alınamadı' }, { status: 502 })
    }

    const photos = extractPhotos(rawContent, url)
    const parsed = await parseWithClaude(rawContent, url)
    if (photos.length > 0 && (!parsed.photos || parsed.photos.length === 0)) {
      parsed.photos = photos
    }
    if (!parsed.title) {
      const tm = rawContent.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (tm) parsed.title = tm[1].replace(/\s*[-|]\s*(sahibinden|hepsiemlak|emlakjet|zingat|cb)\..*/i, '').trim()
    }
    parsed.source_url = url
    return NextResponse.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata'
    console.error('Scraping error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
