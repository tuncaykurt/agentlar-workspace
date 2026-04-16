import { NextRequest, NextResponse } from 'next/server'

const VAPI_BASE = 'https://api.vapi.ai'
const VAPI_KEY = process.env.VAPI_PRIVATE_KEY!

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  if (!id) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })

  const res = await fetch(`${VAPI_BASE}/call/${id}`, {
    headers: { 'Authorization': `Bearer ${VAPI_KEY}` },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ error: 'Çağrı bulunamadı' }, { status: res.status })

  const call = await res.json()
  return NextResponse.json({
    id: call.id,
    status: call.status,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    endedReason: call.endedReason,
    duration: call.startedAt && call.endedAt
      ? Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
      : null,
    transcript: call.transcript || null,
    summary: call.analysis?.summary || null,
    sentiment: call.analysis?.structuredData || null,
    recordingUrl: call.recordingUrl || null,
    monitorUrl: call.monitor?.listenUrl,
    controlUrl: call.monitor?.controlUrl,
  })
}
