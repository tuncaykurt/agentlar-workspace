import { NextRequest, NextResponse } from 'next/server'

const VAPI_API_KEY = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_API_KEY || ''
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '2ab0aeea-700c-4f78-82d5-766eb02a301e'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phoneNumber, propertyTitle, propertyDetails } = body

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Telefon numarası gerekli' }, { status: 400 })
    }

    if (!VAPI_API_KEY) {
      return NextResponse.json({ error: 'VAPI_API_KEY ayarlanmamış. .env.local dosyasına ekleyin.' }, { status: 500 })
    }

    const response = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId: VAPI_PHONE_NUMBER_ID || undefined,
        assistant: {
          name: 'Gayrimenkul Dijital Asistan',
          model: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
            messages: [
              {
                role: 'system',
                content: `Sen bir gayrimenkul danışmanının dijital arama asistanısın. Türkçe konuşuyorsun. Adın "Asistan".

Görevin: Mülk sahibini aramak ve ilanı hakkında bilgi almak.

İlan Bilgileri:
- Başlık: ${propertyTitle || 'Belirtilmemiş'}
${propertyDetails || ''}

Konuşma kuralları:
1. Kendini kısaca tanıt: "Merhaba, ben Ambiance Gayrimenkul'den arıyorum."
2. İlanı hakkında bilgi almak istediğini söyle
3. İlanın güncel olup olmadığını sor
4. Fiyatta değişiklik olup olmadığını sor
5. Gösterim için uygun zaman sor
6. Nazik ve profesyonel ol
7. Kısa ve öz konuş
8. Sonuçları özetle

ÖNEMLİ: Konuşma sırasında sana ek talimatlar (system mesajları) gelebilir. Bu talimatlar danışmanından geliyor. Talimatları hemen uygula ve konuşmayı ona göre yönlendir. Talimatı aldığını karşı tarafa belli etme, doğal şekilde konuşmaya devam et.`,
              },
            ],
          },
          voice: {
            provider: 'deepgram',
            voiceId: 'aura-asteria-en',
          },
          firstMessage: 'Merhaba, ben Ambiance Gayrimenkul\'den arıyorum. İlanınız hakkında bilgi almak istiyorduk, uygun musunuz?',
          endCallMessage: 'Teşekkür ederim, iyi günler dilerim.',
          transcriber: {
            provider: 'deepgram',
            language: 'tr',
          },
        },
        // Transport ile canlı dinleme aktif
        transport: {
          assistantVideoEnabled: false,
        },
        customer: {
          number: phoneNumber.startsWith('+') ? phoneNumber : `+90${phoneNumber.replace(/^0/, '')}`,
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[vapi] Call failed:', data)
      return NextResponse.json(
        { error: data.message || data.error || 'Arama başlatılamadı', details: data },
        { status: response.status }
      )
    }

    return NextResponse.json({
      success: true,
      callId: data.id,
      status: data.status,
      monitor: data.monitor || null,
      listenUrl: data.monitor?.listenUrl || null,
      controlUrl: data.monitor?.controlUrl || null,
      message: 'Arama başlatıldı',
    })
  } catch (err: any) {
    console.error('[vapi] Error:', err)
    return NextResponse.json({ error: err.message || 'Beklenmeyen hata' }, { status: 500 })
  }
}

// Arama durumunu kontrol et — transcript dahil
export async function GET(req: NextRequest) {
  const callId = req.nextUrl.searchParams.get('callId')
  if (!callId) {
    return NextResponse.json({ error: 'callId gerekli' }, { status: 400 })
  }

  if (!VAPI_API_KEY) {
    return NextResponse.json({ error: 'VAPI_API_KEY ayarlanmamış' }, { status: 500 })
  }

  const response = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
  })

  const data = await response.json()

  return NextResponse.json({
    callId: data.id,
    status: data.status,
    duration: data.duration,
    summary: data.summary,
    transcript: data.transcript,
    messages: data.messages || [],
    recordingUrl: data.recordingUrl,
    endedReason: data.endedReason,
    monitor: data.monitor || null,
    artifact: data.artifact || null,
  })
}
