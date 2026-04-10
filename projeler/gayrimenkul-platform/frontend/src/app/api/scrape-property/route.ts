import { NextRequest, NextResponse } from 'next/server'

// OpenRouter üzerinden Claude API çağrısı
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

// Desteklenen platformları tespit et
function detectPlatform(url: string) {
  if (url.includes('sahibinden.com')) return 'sahibinden'
  if (url.includes('cb.com.tr')) return 'cb_com_tr'
  if (url.includes('hepsiemlak.com')) return 'hepsiemlak'
  if (url.includes('emlakjet.com')) return 'emlakjet'
  if (url.includes('zingat.com')) return 'zingat'
  return 'other'
}

// Browserless (headless Chrome) ile sayfa çek
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

// n8n scraping webhook'unu çağır
async function fetchViaN8n(url: string, platform: string): Promise<string> {
  const n8nBase = process.env.N8N_BASE_URL
  if (!n8nBase) throw new Error('N8N_BASE_URL tanımlanmamış')

  const res = await fetch(`${n8nBase}/webhook/scrape-property`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-Secret': process.env.N8N_WEBHOOK_SECRET || '',
    },
    body: JSON.stringify({ url, platform }),
    signal: AbortSignal.timeout(30000),
  })

  if (!res.ok) throw new Error(`n8n hata: ${res.status}`)
  const data = await res.json()
  return data.content || data.html || data.text || ''
}

// HTML'den fotoğraf URL'lerini çıkar
function extractPhotos(html: string, baseUrl: string): string[] {
  const photos: string[] = []
  const origin = new URL(baseUrl).origin

  // <img src="..."> taglarından çek
  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)
  for (const m of imgMatches) {
    const src = m[1]
    if (!src || src.startsWith('data:') || src.length < 10) continue
    // Küçük ikonları filtrele (genelde ilan fotoları büyük URL'ler içerir)
    if (src.includes('icon') || src.includes('logo') || src.includes('avatar')) continue
    if (src.match(/\.(jpg|jpeg|png|webp)/i)) {
      const fullUrl = src.startsWith('http') ? src : `${origin}${src.startsWith('/') ? '' : '/'}${src}`
      if (!photos.includes(fullUrl)) photos.push(fullUrl)
    }
  }

  // JSON içindeki fotoğraf URL'lerini bul (birçok portal JS'de tutar)
  const jsonImgMatches = html.matchAll(/"(https?:[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi)
  for (const m of jsonImgMatches) {
    const url = m[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/')
    if (!photos.includes(url) && photos.length < 20) photos.push(url)
  }

  return photos.slice(0, 15) // max 15 fotoğraf
}

// HTML'den script/style/nav taglarını temizle, sadece metin içeriği al
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

// Claude ile parse et
async function parseWithClaude(rawContent: string, url: string) {
  const cleaned = cleanHtml(rawContent)
  const prompt = `Aşağıdaki gayrimenkul ilan sayfasından bilgileri çıkar ve SADECE JSON olarak döndür.
URL: ${url}

İçerik:
${cleaned.slice(0, 12000)}

Çıkarılacak alanlar (bulamazsan null):
{
  "title": "İlan başlığı",
  "price": 2500000,
  "currency": "TRY",
  "property_type": "apartment|villa|land|commercial|office|shop|warehouse|detached_house",
  "city": "Şehir",
  "district": "İlçe",
  "neighborhood": "Mahalle",
  "address": "Tam adres varsa",
  "m2_gross": 120,
  "m2_net": 100,
  "room_count": "3+1",
  "bathroom_count": 2,
  "floor": 3,
  "total_floors": 8,
  "age": 5,
  "heating_type": "Doğalgaz kombi",
  "features": ["Asansör", "Otopark", "Balkon"],
  "description": "Açıklama metni (max 500 karakter)"
}

Sadece JSON döndür, başka metin ekleme.`

  const text = await callOpenRouter(prompt)

  // JSON parse
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude geçerli JSON döndürmedi')
  return JSON.parse(jsonMatch[0])
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url || !url.startsWith('http')) {
      return NextResponse.json({ error: 'Geçerli bir URL giriniz' }, { status: 400 })
    }

    const platform = detectPlatform(url)

    // JS gerektiren platformlar → Browserless kullan
    const jsHeavyPlatforms = ['sahibinden', 'hepsiemlak', 'emlakjet', 'zingat']
    const needsBrowser = jsHeavyPlatforms.includes(platform)

    // 1. Sayfayı çek
    let rawContent: string
    if (needsBrowser && process.env.BROWSERLESS_URL) {
      // Browserless ile headless Chrome
      try {
        rawContent = await fetchViaBrowserless(url)
      } catch {
        // Browserless başarısız → doğrudan fetch dene
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(15000),
        })
        rawContent = await res.text()
      }
    } else {
      // CB.com.tr gibi basit siteler → doğrudan fetch
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'tr-TR,tr;q=0.9',
          },
          signal: AbortSignal.timeout(15000),
        })
        rawContent = await res.text()
      } catch {
        // n8n'e dene
        rawContent = await fetchViaN8n(url, platform)
      }
    }

    if (!rawContent || rawContent.length < 100) {
      return NextResponse.json({ error: 'Sayfa içeriği alınamadı' }, { status: 502 })
    }

    // 2. Fotoğrafları çek (HTML temizlenmeden önce)
    const photos = extractPhotos(rawContent, url)

    // 3. Claude ile parse et
    const parsed = await parseWithClaude(rawContent, url)

    // Fotoğrafları ekle
    if (photos.length > 0 && (!parsed.photos || parsed.photos.length === 0)) {
      parsed.photos = photos
    }

    // Başlık boşsa <title> tag'inden çek
    if (!parsed.title) {
      const titleMatch = rawContent.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch) {
        parsed.title = titleMatch[1]
          .replace(/\s*[-|]\s*sahibinden\.com.*/i, '')
          .replace(/\s*[-|]\s*hepsiemlak\.com.*/i, '')
          .replace(/\s*[-|]\s*emlakjet\.com.*/i, '')
          .replace(/\s*[-|]\s*zingat\.com.*/i, '')
          .replace(/\s*[-|]\s*cb\.com\.tr.*/i, '')
          .trim()
      }
    }

    return NextResponse.json(parsed)
  } catch (err: unknown) {
    console.error('Scraping error:', err)
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
