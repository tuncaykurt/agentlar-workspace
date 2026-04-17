import { NextRequest, NextResponse } from 'next/server'

const VAPI_API_KEY = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_API_KEY || ''
const VAPI_BASE = 'https://api.vapi.ai'

/**
 * Aktif Vapi aramasına system mesajı enjekte et.
 *
 * controlUrl bir HTTPS POST endpoint'idir (WebSocket değil).
 * Payload: { type: "add-message", message: { role, content }, triggerResponseEnabled }
 */
export async function POST(req: NextRequest) {
  try {
    const { callId, message, controlUrl: clientControlUrl } = await req.json()

    if (!callId || !message) {
      return NextResponse.json({ error: 'callId ve message gerekli' }, { status: 400 })
    }
    if (!VAPI_API_KEY) {
      return NextResponse.json({ error: 'VAPI_API_KEY ayarlanmamış' }, { status: 500 })
    }

    // 1) controlUrl'i bul — client göndermiş olabilir veya Vapi'den al
    let postUrl = clientControlUrl || ''

    if (!postUrl) {
      const callRes = await fetch(`${VAPI_BASE}/call/${callId}`, {
        headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
      })
      if (callRes.ok) {
        const callData = await callRes.json()
        postUrl = callData.monitor?.controlUrl || ''
        console.log('[vapi/message] Got controlUrl from API:', postUrl ? 'yes' : 'no')
      }
    }

    if (!postUrl) {
      return NextResponse.json(
        { error: 'controlUrl bulunamadı — arama aktif olmayabilir' },
        { status: 404 }
      )
    }

    // 2) HTTP POST ile add-message gönder
    const payload = {
      type: 'add-message',
      message: {
        role: 'system',
        content: message,
      },
      triggerResponseEnabled: true,
    }

    console.log('[vapi/message] Sending POST to controlUrl:', message.slice(0, 60))

    const ctrlRes = await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!ctrlRes.ok) {
      const errText = await ctrlRes.text()
      console.error('[vapi/message] controlUrl POST failed:', ctrlRes.status, errText)
      return NextResponse.json(
        { error: `controlUrl POST hatası: ${ctrlRes.status}` },
        { status: ctrlRes.status }
      )
    }

    console.log('[vapi/message] Message sent successfully')
    return NextResponse.json({ success: true, sent: true })
  } catch (err: any) {
    console.error('[vapi/message] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Beklenmeyen hata' },
      { status: 500 }
    )
  }
}
