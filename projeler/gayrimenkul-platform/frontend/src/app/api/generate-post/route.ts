import { NextRequest, NextResponse } from 'next/server'

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
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter hata: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

export async function POST(req: NextRequest) {
  try {
    const { property, platform } = await req.json()

    if (!property) {
      return NextResponse.json({ error: 'Mülk bilgisi gerekli' }, { status: 400 })
    }

    const platformGuide: Record<string, string> = {
      instagram: 'Instagram için etkileyici, emoji kullanan, hashtag içeren (en az 10 hashtag)',
      facebook: 'Facebook için detaylı, samimi, paylaşılabilir',
      linkedin: 'LinkedIn için profesyonel, yatırım odaklı, resmi dil kullanan',
      twitter: 'Twitter/X için kısa ve öz (280 karakter altında)',
    }

    const guide = platformGuide[platform] || 'sosyal medya için etkileyici'

    const prompt = `Sen bir Türk gayrimenkul danışmanının sosyal medya uzmanısın.
Aşağıdaki mülk bilgisi için ${guide} bir sosyal medya gönderisi yaz.

Mülk: ${property}

Kurallar:
- Türkçe yaz
- Profesyonel ama samimi ol
- Satışa teşvik et ama agresif olma
- ${platform === 'instagram' ? '15-20 hashtag ekle (#gayrimenkul #satilik gibi)' : 'Hashtag ekleme'}
- Sadece gönderi metnini yaz, başka açıklama ekleme`

    const content = await callOpenRouter(prompt)

    return NextResponse.json({ content })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
