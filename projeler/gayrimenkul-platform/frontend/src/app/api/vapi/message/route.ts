import { NextRequest, NextResponse } from 'next/server'

const VAPI_API_KEY = process.env.VAPI_API_KEY || ''

/**
 * Aktif bir Vapi aramasına anlık mesaj/talimat gönder.
 * Bu mesaj AI asistanın system prompt'una eklenir ve
 * asistan konuşmayı buna göre yönlendirir.
 */
export async function POST(req: NextRequest) {
  try {
    const { callId, message, type = 'add-message' } = await req.json()

    if (!callId || !message) {
      return NextResponse.json(
        { error: 'callId ve message gerekli' },
        { status: 400 }
      )
    }

    if (!VAPI_API_KEY) {
      return NextResponse.json(
        { error: 'VAPI_API_KEY ayarlanmamış' },
        { status: 500 }
      )
    }

    // Vapi'nin call message endpoint'i — aktif aramaya mesaj enjekte eder
    const response = await fetch(`https://api.vapi.ai/call/${callId}/message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        message: {
          role: 'system',
          content: message,
        },
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      console.error('[vapi/message] Failed:', data)
      return NextResponse.json(
        { error: data.message || data.error || 'Mesaj gönderilemedi' },
        { status: response.status }
      )
    }

    // Vapi bazı durumlarda 204 No Content döner
    const data = response.status === 204 ? { ok: true } : await response.json().catch(() => ({ ok: true }))

    return NextResponse.json({
      success: true,
      ...data,
    })
  } catch (err: any) {
    console.error('[vapi/message] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Beklenmeyen hata' },
      { status: 500 }
    )
  }
}
