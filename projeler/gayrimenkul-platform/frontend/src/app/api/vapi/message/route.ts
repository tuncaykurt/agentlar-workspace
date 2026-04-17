import { NextRequest, NextResponse } from 'next/server'
import WebSocket from 'ws'

const VAPI_API_KEY = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_API_KEY || ''
const VAPI_BASE = 'https://api.vapi.ai'

/**
 * Aktif Vapi aramasına system mesajı enjekte et.
 *
 * Yöntem: Önce call bilgilerinden controlUrl al,
 * sonra WebSocket ile bağlanıp add-message gönder.
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
    let wsUrl = clientControlUrl || ''

    if (!wsUrl) {
      // Call bilgilerinden controlUrl al
      const callRes = await fetch(`${VAPI_BASE}/call/${callId}`, {
        headers: { 'Authorization': `Bearer ${VAPI_API_KEY}` },
      })
      if (callRes.ok) {
        const callData = await callRes.json()
        wsUrl = callData.monitor?.controlUrl || ''
        console.log('[vapi/message] Got controlUrl from API:', wsUrl ? 'yes' : 'no')
      }
    }

    if (!wsUrl) {
      return NextResponse.json(
        { error: 'controlUrl bulunamadı — arama aktif olmayabilir' },
        { status: 404 }
      )
    }

    // 2) WebSocket ile bağlan ve mesaj gönder
    const result = await sendViaWebSocket(wsUrl, message)

    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    console.error('[vapi/message] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Beklenmeyen hata' },
      { status: 500 }
    )
  }
}

function sendViaWebSocket(url: string, message: string): Promise<{ sent: boolean }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('WebSocket bağlantı zaman aşımı (5s)'))
    }, 5000)

    const ws = new WebSocket(url)

    ws.on('open', () => {
      // add-message: system mesajı olarak enjekte et
      ws.send(JSON.stringify({
        type: 'add-message',
        message: {
          role: 'system',
          content: message,
        },
      }))

      console.log('[vapi/message] Sent via WS:', message.slice(0, 60))

      // Kısa bir süre bekle ki mesaj ulaşsın
      setTimeout(() => {
        clearTimeout(timeout)
        ws.close()
        resolve({ sent: true })
      }, 500)
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`WebSocket hatası: ${err.message}`))
    })
  })
}
