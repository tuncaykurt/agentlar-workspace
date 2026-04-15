import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

const VAPI_BASE = 'https://api.vapi.ai'
const VAPI_KEY = process.env.VAPI_PRIVATE_KEY!

// Lina asistanı — mevcut "Giden arama Lina"
const LINA_ASSISTANT_ID = 'd7871696-4562-4e40-8937-951c6f2c882b'
// Giden arama numarası (netgsm_giden)
const OUTBOUND_PHONE_ID = '2ab0aeea-700c-4f78-82d5-766eb02a301e'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const body = await req.json()
  const { listingId, phoneNumber, sellerName, propertyTitle, price, city, district } = body

  if (!listingId || !phoneNumber) {
    return NextResponse.json({ error: 'listingId ve phoneNumber zorunlu' }, { status: 400 })
  }

  // Türk telefon numarasını +90 formatına çevir
  let phone = phoneNumber.replace(/\D/g, '')
  if (phone.startsWith('0')) phone = '90' + phone.slice(1)
  if (!phone.startsWith('90')) phone = '90' + phone
  phone = '+' + phone

  // Mülk sahibine özel sistem prompt override
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
          firstMessage: `Merhabalar ${sellerName ? sellerName + ' hanım/bey' : ''}, ben CB Ambiance Gayrimenkul'ün dijital asistanını Lina. Sahibinden'deki mülkünüzle ilgili kısa bir bilgi vermek için arıyorum. Uygun musunuz?`,
        },
      }),
    })

    if (!vapiRes.ok) {
      const err = await vapiRes.json()
      return NextResponse.json({ error: err?.message || 'Vapi araması başlatılamadı' }, { status: vapiRes.status })
    }

    const call = await vapiRes.json()

    // market_listings'i güncelle — contacted
    await supabase
      .from('market_listings')
      .update({
        contact_status: 'contacted',
        contacted_at: new Date().toISOString(),
        contacted_by_id: user.id,
        contact_notes: (call.id ? `Vapi call: ${call.id}` : ''),
      })
      .eq('id', listingId)

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
