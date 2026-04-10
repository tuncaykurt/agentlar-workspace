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
    signal: AbortSignal.timeout(30000), // 30 sn timeout
  })

  if (!res.ok) throw new Error(`n8n hata: ${res.status}`)
  const data = await res.json()
  // n8n'den ham HTML veya metin döner
  return data.content || data.html || data.text || ''
}

// Claude ile parse et
async function parseWithClaude(rawContent: string, url: string) {
  const prompt = `Aşağıdaki gayrimenkul ilan sayfasından bilgileri çıkar ve SADECE JSON olarak döndür.
URL: ${url}

İçerik:
${rawContent.slice(0, 8000)}

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

    // 1. n8n üzerinden sayfayı çek
    let rawContent: string
    try {
      rawContent = await fetchViaN8n(url, platform)
    } catch {
      // n8n ulaşılamıyor → doğrudan fetch dene (CB.com.tr gibi basit siteler için)
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'tr-TR,tr;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      })
      rawContent = await res.text()
    }

    if (!rawContent || rawContent.length < 100) {
      return NextResponse.json({ error: 'Sayfa içeriği alınamadı' }, { status: 502 })
    }

    // 2. Claude ile parse et
    const parsed = await parseWithClaude(rawContent, url)

    return NextResponse.json(parsed)
  } catch (err: unknown) {
    console.error('Scraping error:', err)
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
