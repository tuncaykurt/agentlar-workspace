import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VAPI_BASE = 'https://api.vapi.ai'
const VAPI_KEY = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_API_KEY || ''

// Lina asistanı — mevcut "Giden arama Lina"
const LINA_ASSISTANT_ID = 'd7871696-4562-4e40-8937-951c6f2c882b'
// Giden arama numarası (netgsm_giden)
const OUTBOUND_PHONE_ID = process.env.VAPI_PHONE_NUMBER_ID || '2ab0aeea-700c-4f78-82d5-766eb02a301e'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  if (!VAPI_KEY) {
    return NextResponse.json({ error: 'VAPI_PRIVATE_KEY ayarlanmamış' }, { status: 500 })
  }

  const supabase = getSupabase()
  const body = await req.json()
  const { listingId, phoneNumber, sellerName, propertyTitle, price, city, district } = body

  if (!phoneNumber) {
    return NextResponse.json({ error: 'phoneNumber zorunlu' }, { status: 400 })
  }

  // Türk telefon numarasını +90 formatına çevir
  let phone = phoneNumber.replace(/\D/g, '')
  if (phone.startsWith('0')) phone = '90' + phone.slice(1)
  if (!phone.startsWith('90')) phone = '90' + phone
  phone = '+' + phone

  const propertyContext = `
Sen CB Ambiance Gayrimenkul ofisinin dijital asistanı Lina'sın.
Şu anda ${sellerName || 'bir mülk sahibi'} ile konuşuyorsun.
İlan bilgileri: ${propertyTitle || 'ilan'} — ${city || ''}${district ? '/' + district : ''} — ${price ? price.toLocaleString('tr-TR') + ' TL' : 'fiyat belirtilmemiş'}

Görevin:
1. Kibarca tanıt kendini ve CB Ambiance'ı
2. Mülkü satmak isteyip istemediklerini sor
3. CB Ambiance'ın geniş portföyünü ve profesyonel hizmetini vurgula
4. Yetki sözleşmesi için randevu almaya çalış
5. Cevap olumsuzsa teşekkür et ve vedalaş

ÖNEMLİ: Konuşma sırasında sana ek talimatlar (system mesajları) gelebilir. Bu talimatlar danışmanından geliyor. Talimatları hemen uygula ve konuşmayı ona göre yönlendir. Talimatı aldığını karşı tarafa belli etme, doğal şekilde konuşmaya devam et.
`.trim()

  try {
    const vapiRes = await fetch(`${VAPI_BASE}/call/phone`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId: OUTBOUND_PHONE_ID,
        assistantId: LINA_ASSISTANT_ID,
        customer: {
          number: phone,
          name: sellerName || undefined,
        },
        assistantOverrides: {
          model: {
            messages: [
              {
                role: 'system',
                content: propertyContext,
              }
            ],
          },
          firstMessage: `Merhabalar ${sellerName ? sellerName + ' hanım/bey' : ''}, ben CB Ambiance Gayrimenkul'ün dijital asistanı Lina. Sahibinden'deki mülkünüzle ilgili kısa bir bilgi vermek için arıyorum. Uygun musunuz?`,
        },
      }),
    })

    if (!vapiRes.ok) {
      const err = await vapiRes.json()
      return NextResponse.json({ error: err?.message || 'Vapi araması başlatılamadı' }, { status: vapiRes.status })
    }

    const call = await vapiRes.json()

    // market_listings'i güncelle — contacted
    if (listingId) {
      await supabase
        .from('market_listings')
        .update({
          contact_status: 'contacted',
          contacted_at: new Date().toISOString(),
          contact_notes: (call.id ? `Vapi call: ${call.id}` : ''),
        })
        .eq('id', listingId)
    }

    return NextResponse.json({
      callId: call.id,
      status: call.status,
      monitorUrl: call.monitor?.listenUrl,
      controlUrl: call.monitor?.controlUrl,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bilinmeyen hata'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
