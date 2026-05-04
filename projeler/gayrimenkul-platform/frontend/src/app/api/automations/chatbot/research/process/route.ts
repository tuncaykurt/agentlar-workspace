import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes (Vercel Pro limit)

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function sendWhatsApp(phone: string, message: string, instance: string) {
  const baseUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!baseUrl || !apiKey) return { ok: false, error: 'no Evolution config' }

  let num = phone.replace(/\D/g, '')
  if (num.startsWith('0')) num = '90' + num.slice(1)
  else if (num.startsWith('5') && num.length === 10) num = '90' + num
  else if (!num.startsWith('90')) num = '90' + num

  try {
    const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: num + '@s.whatsapp.net', text: message }),
    })
    return { ok: res.ok, status: res.status }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

async function deepResearch(args: { 
  city: string, 
  district: string, 
  neighborhood?: string, 
  ada: string, 
  parsel: string,
  owner_type?: string,
  property_type?: string,
  acquisition_price?: number,
  acquisition_date?: string,
  management_plan_date?: string
}) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return 'Araştırma yapılamadı (API key eksik).'

  const knownFacts = `
  TEKNİK VERİLER:
  - Mülkiyet: ${args.owner_type === 'sirket' ? 'Kurumsal' : 'Bireysel'}
  - Edinme: ${args.acquisition_date || 'Bilinmiyor'} (${args.acquisition_price ? args.acquisition_price + ' TL' : 'Bedel Bilinmiyor'})
  - Bina Yaşı Verisi (Yön. Planı): ${args.management_plan_date || 'Bilinmiyor'}
  `

  // 1. AŞAMA: PERPLEXITY İLE HAM VERİ TOPLAMA
  console.log('[research] Phase 1: Searching with Perplexity...')
  const searchQuery = `${args.city} ${args.district} ${args.neighborhood || ''} Ada ${args.ada} Parsel ${args.parsel} emsal fiyatlar, bölge m2 birim fiyatları 2026, çevredeki yeni projeler ve imar durumu.`
  
  let rawData = ''
  try {
    const searchRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'perplexity/sonar',
        messages: [{ role: 'user', content: searchQuery }],
      }),
    })
    const searchData = await searchRes.json()
    rawData = searchData?.choices?.[0]?.message?.content || ''
  } catch (e) {
    console.error('Perplexity error:', e)
  }

  // 2. AŞAMA: GEMINI 2.0 İLE PROFESYONEL SENTEZ
  console.log('[research] Phase 2: Synthesizing with Gemini 2.0...')
  try {
    const synthesisRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          {
            role: 'system',
            content: `Sen üst düzey bir Gayrimenkul Yatırım Stratejistisin. 
            Sana verilen ham araştırma verilerini ve teknik detayları kullanarak, yatırımcıya güven veren, analitik ve premium bir rapor hazırla.
            
            KURALLAR:
            - Raporu mutlaka şu başlıklarla ayır: **BÖLGE VE KONUM ANALİZİ**, **PİYASA VE EMSAL KARŞILAŞTIRMASI**, **TEKNİK VE İMAR DURUMU**, **YATIRIM VE GELECEK POTANSİYELİ**.
            - 'Yatırım Potansiyeli' kısmında mülke 10 üzerinden bir 'Yatırım Skoru' ver.
            - Amortisman süresi (kira/fiyat oranı) tahmini yap.
            - Teknik verileri (bina yaşı, vergi durumu) raporun içine profesyonelce yedir.
            - Üslup: Profesyonel, vizyoner ve güven verici.
            - Format: Markdown kullan, başlıkları **BAŞLIK** şeklinde yaz.`
          },
          { 
            role: 'user', 
            content: `TEKNİK DETAYLAR: ${knownFacts}\n\nİNTERNET ARAŞTIRMA VERİLERİ:\n${rawData}\n\nLütfen bu mülk için profesyonel raporu hazırla.` 
          },
        ],
      }),
    })
    const synthData = await synthesisRes.json()
    return synthData?.choices?.[0]?.message?.content || 'Rapor sentezlenemedi.'
  } catch (e: any) {
    return `Sentez hatası: ${e.message}`
  }
}

export async function POST(req: NextRequest) {
  // Verify API Key (using service role key for simplicity between internal calls)
  const authHeader = req.headers.get('x-api-key')
  if (authHeader !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { researchId } = await req.json()
  if (!researchId) return NextResponse.json({ error: 'Missing researchId' }, { status: 400 })

  const supabase = svc()

  // 1. Get research details
  console.log(`[research] processing id: ${researchId}`)
  const { data: research, error: fetchErr } = await supabase
    .from('property_researches')
    .select('*, consultants!consultant_id(wa_instance)')
    .eq('id', researchId)
    .single()
  
  if (fetchErr) {
    console.error(`[research] fetch error:`, fetchErr)
    return NextResponse.json({ error: `Fetch error: ${fetchErr.message}` }, { status: 500 })
  }
  if (!research) return NextResponse.json({ error: 'Research not found' }, { status: 404 })

  // 2. Update status
  await supabase.from('property_researches').update({ status: 'researching' }).eq('id', researchId)

  // 3. Start research (Async)
  // We wrap the rest in a background execution if possible, but for 5 mins we need to be careful
  // Here we will do the research, then WAIT the remaining time, then send.
  
  const startTime = Date.now()
  
  try {
    const report = await deepResearch({
      city: research.city,
      district: research.district,
      neighborhood: research.neighborhood,
      ada: research.ada,
      parsel: research.parsel,
      owner_type: research.owner_type,
      property_type: research.property_type,
      acquisition_price: research.acquisition_price,
      acquisition_date: research.acquisition_date,
      management_plan_date: research.management_plan_date
    })

    // 4. Save report
    await supabase.from('property_researches').update({ 
      report_content: report,
      status: 'completed'
    }).eq('id', researchId)

    // 5. SIMULATE DELAY (The user asked for 5-10 mins)
    // To avoid Vercel timeout, we'll try to wait up to the limit or just send after research.
    // In a real prod env, this would be a separate worker.
    // For now, we wait at least 30-60 seconds if we have time, or just send.
    const elapsedTime = Date.now() - startTime
    const targetDelay = 300000 // 5 minutes in ms
    const remainingDelay = Math.max(0, targetDelay - elapsedTime)
    
    // If remainingDelay is too long for the request, we can't wait here.
    // We'll use a trick: If we are in a serverless env with short timeout, we send it after research.
    // If we have a queue, we'd insert into outbound queue.
    
    const instance = (research.consultants as any)?.wa_instance || 'gayr-ofis'
    
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gayrimenkul.yapayzekaotomasyon.cloud'
    const reportLink = `${baseUrl}/report/${researchId}`
    
    const finalMessage = `🔔 *ADA/PARSEL ARAŞTIRMA RAPORUNUZ HAZIR*

Sayın müşterimiz, talebiniz üzerine gerçekleştirdiğim derin araştırma sonuçları ve profesyonel dijital sunum dosyanız hazır.

✨ *DİJİTAL SUNUM DOSYASI:*
${reportLink}

---
📍 *ÖZET ANALİZ:*
${report.substring(0, 600)}${report.length > 600 ? '...' : ''}
---

Detaylı bölge analizi, yatırım puanlaması ve imar detayları için yukarıdaki linke tıklayarak interaktif sunumu inceleyebilirsiniz. 📊🚀`

    // 6. INSERT INTO QUEUE with user-defined delay
    let delayMinutes = 5
    const { data: config } = await supabase
      .from('whatsapp_chatbot_config')
      .select('research_delay_minutes')
      .eq('consultant_id', research.consultant_id)
      .single()
    
    if (config && typeof config.research_delay_minutes === 'number') {
      delayMinutes = config.research_delay_minutes
    }

    // Eğer delay 0 ise anında gönderilmek üzere ayarla
    const scheduledAt = new Date(Date.now() + (delayMinutes * 60000)).toISOString()
    console.log(`[research] scheduling message for: ${scheduledAt} (delay: ${delayMinutes}m)`)
    
    const { error: qErr } = await supabase.from('whatsapp_outbound_queue').insert({
      consultant_id: research.consultant_id,
      customer_phone: research.customer_phone,
      message: finalMessage,
      scheduled_at: scheduledAt,
      status: 'pending'
    })

    if (qErr) console.error('[research] queue insert error:', qErr)

    // 7. Trigger Queue Processor
    // Eğer delay çok kısa ise (0 veya 1), hemen tetikleyelim. 
    // Ama tam 1. dakikada gitmesi için bir cron job şart.
    // Anlık test için delay=0 en iyisidir.
    fetch(`${baseUrl}/api/automations/chatbot/queue/process`).catch(() => {})

    return NextResponse.json({ 
      success: true, 
      scheduled_at: scheduledAt,
      delay_minutes: delayMinutes
    })
  } catch (e: any) {
    await supabase.from('property_researches').update({ status: 'failed' }).eq('id', researchId)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
