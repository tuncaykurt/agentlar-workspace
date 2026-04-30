import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const APIFY_TOKEN = process.env.APIFY_API_KEY || ''
const APIFY_SAHIBINDEN_ACTOR = 'clearpath~sahibinden-scraper-pro'

/**
 * GET /api/debug/sahibinden-sample?url=<sahibinden-listing-url>&flags=<comma-flags>
 * Tek bir Sahibinden URL'ini Apify'a gönderir, raw cevabı + key haritasını döner.
 * Telefon hangi alanda geliyor / geliyor mu görmek için.
 *
 * flags örneği: "extractContactInfo,includePhone,fullDetail" (virgülle ayır)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')
  const flagsParam = searchParams.get('flags') || ''
  const flags = flagsParam.split(',').map(s => s.trim()).filter(Boolean)

  if (!url) {
    return NextResponse.json({ error: 'url query param gerekli' }, { status: 400 })
  }
  if (!APIFY_TOKEN) {
    return NextResponse.json({ error: 'APIFY_API_KEY tanımlı değil' }, { status: 500 })
  }

  // Tüm muhtemel flag'leri input'a ekle. Actor desteklemediğini yok sayar.
  const input: Record<string, unknown> = {
    startUrls: [url],
    maxItems: 1,
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
  }
  // Override / ekstra flag'ler
  for (const f of flags) input[f] = true

  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_SAHIBINDEN_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=180`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(200000),
      },
    )
    const text = await res.text()
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, body: text.slice(0, 2000) }, { status: 502 })
    }
    const items = JSON.parse(text)
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: true, count: 0, raw: items, input })
    }
    const item = items[0]

    // Phone candidate fields — hangileri set olmuş, derle
    const phoneCandidates: Record<string, unknown> = {}
    const flatten = (obj: any, prefix = '') => {
      if (!obj || typeof obj !== 'object') return
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k
        if (/phone|tel|gsm|mobile|contact/i.test(k)) {
          phoneCandidates[key] = v
        }
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          flatten(v, key)
        }
      }
    }
    flatten(item)

    return NextResponse.json({
      ok: true,
      count: items.length,
      input,
      topLevelKeys: Object.keys(item),
      phoneCandidates,
      attributesKeys: item.attributes ? Object.keys(item.attributes) : null,
      sample: item, // tam item — büyük olabilir
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
