import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function logQueue(id: string, phone: string, result: string, success: boolean) {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    await supabase.from('webhook_logs').insert({
      source: 'queue_processor',
      event: success ? 'message_sent' : 'message_failed',
      payload: { queue_id: id, phone },
      result: result
    })
  } catch { /* ignore */ }
}

async function sendWhatsApp(phone: string, message: string, instance: string) {
  const baseUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!baseUrl || !apiKey) return { ok: false, error: 'no Evolution config' }

  // CRITICAL FIX: Strip JID suffixes (like :37) before cleaning digits
  let cleanPhone = phone.split(':')[0] 
  let num = cleanPhone.replace(/\D/g, '')
  
  if (num.startsWith('0')) num = '90' + num.slice(1)
  else if (num.startsWith('5') && num.length === 10) num = '90' + num
  else if (!num.startsWith('90')) num = '90' + num

  try {
    const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: num + '@s.whatsapp.net', text: message }),
    })
    const data = await res.json()
    return { ok: res.ok, status: res.status, data }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

export async function GET(req: NextRequest) {
  const supabase = svc()
  
  // 1. Get messages that are due
  const { data: queue, error } = await supabase
    .from('whatsapp_outbound_queue')
    .select('*, consultants!consultant_id(wa_instance)')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!queue || queue.length === 0) return NextResponse.json({ ok: true, processed: 0 })

  let sent = 0
  for (const item of queue) {
    const instance = (item.consultants as any)?.wa_instance || 'gayr-ofis'
    const res = await sendWhatsApp(item.customer_phone, item.message, instance)
    
    if (res.ok) {
      await supabase.from('whatsapp_outbound_queue').update({ status: 'sent' }).eq('id', item.id)
      await logQueue(item.id, item.customer_phone, 'Success', true)
      sent++
    } else {
      const errorMsg = `Error: ${JSON.stringify(res.data || res.error)}`
      await supabase.from('whatsapp_outbound_queue').update({ status: 'failed' }).eq('id', item.id)
      await logQueue(item.id, item.customer_phone, errorMsg, false)
    }
  }

  return NextResponse.json({ ok: true, processed: sent })
}
