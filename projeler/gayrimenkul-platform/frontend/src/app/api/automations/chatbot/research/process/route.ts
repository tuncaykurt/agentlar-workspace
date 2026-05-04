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
  BİLİNEN TEKNİK VERİLER:
  - Mülkiyet Tipi: ${args.owner_type === 'sirket' ? 'Kurumsal (Şirket - 2 Yıl Muafiyet)' : 'Bireysel (Şahıs - 5 Yıl Muafiyet)'}
  - Mülk Tipi: ${args.property_type || 'Belirtilmedi'}
  - Edinme Tarihi: ${args.acquisition_date || 'Belirtilmedi'}
  - Edinme Bedeli: ${args.acquisition_price ? args.acquisition_price + ' TL' : 'Belirtilmedi'}
  - Yönetim Planı Tarihi (Bina Yaşı İçin): ${args.management_plan_date || 'Belirtilmedi'}
  `

  const query = `${args.city} ${args.district} ${args.neighborhood || ''} Ada ${args.ada} Parsel ${args.parsel} gayrimenkul değerleme.
  ${knownFacts}
  Lütfen şu bilgileri bul:
  1. Bu adresteki arsa/konut için tahmini m2 birim fiyatları (2026 güncel).
  2. Yakınlardaki emsal satış ilanları veya fiyat trendleri.
  3. Bölgedeki imar durumu hakkında genel bilgi.
  4. Çevredeki önemli noktalar (ulaşım, hastane, okul).
  5. Yatırım potansiyeli yorumu. (Bina yaşını ve vergi durumunu yukarıdaki verilere göre yorumla)`

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://gayrimenkul.yapayzekaotomasyon.cloud',
        'X-Title': 'Property Deep Research',
      },
      body: JSON.stringify({
        model: 'perplexity/sonar',
        messages: [
          {
            role: 'system',
            content: `Sen uzman bir gayrimenkul değerleme uzmanısın. 
            Sana verilen ada/parsel ve teknik verileri kullanarak profesyonel, şık, emojilerle zenginleştirilmiş bir SUNUM RAPORU hazırla.
            
            RAPOR FORMATI:
            📍 **BÖLGE VE KONUM ANALİZİ**
            💰 **PİYASA DEĞERLEMESİ**
            🏗️ **İMAR VE YAPILAŞMA DURUMU**
            🏫 **ÇEVRESEL OLANAKLAR**
            📈 **YATIRIM YORUMU** (Burada bina yaşını ve finansal verileri mutlaka profesyonelce yorumla)
            
            Önemli: Başlıkları **BAŞLIK** formatında kullan. Verileri 2026 piyasasına göre yorumla.`
          },
          { role: 'user', content: query },
        ],
      }),
    })
    const data = await res.json()
    return data?.choices?.[0]?.message?.content || 'Rapor oluşturulamadı.'
  } catch (e: any) {
    return `Araştırma sırasında hata oluştu: ${e.message}`
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
    let delayMinutes = 7
    const { data: config } = await supabase
      .from('whatsapp_chatbot_config')
      .select('research_delay_minutes')
      .eq('consultant_id', research.consultant_id)
      .single()
    
    if (config?.research_delay_minutes) {
      delayMinutes = config.research_delay_minutes
    }

    const scheduledAt = new Date(Date.now() + delayMinutes * 60000).toISOString()
    
    await supabase.from('whatsapp_outbound_queue').insert({
      consultant_id: research.consultant_id,
      customer_phone: research.customer_phone,
      message: finalMessage,
      scheduled_at: scheduledAt,
      status: 'pending'
    })

    // 7. Trigger Queue Processor (Optional/Kickstart)
    fetch(`${baseUrl}/api/automations/chatbot/queue/process`).catch(() => {})

    return NextResponse.json({ success: true, scheduled_at: scheduledAt })
  } catch (e: any) {
    await supabase.from('property_researches').update({ status: 'failed' }).eq('id', researchId)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
