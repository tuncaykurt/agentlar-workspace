import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function todayMMDD() {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000) // UTC+3
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

async function sendWhatsApp(phone: string, message: string, instance: string): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!baseUrl || !apiKey || !phone) return { ok: false, error: 'Evolution API yapılandırılmamış' }

  let num = phone.replace(/\D/g, '')
  if (num.startsWith('0')) num = '90' + num.slice(1)
  else if (!num.startsWith('90')) num = '90' + num

  try {
    const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: num + '@s.whatsapp.net', text: message }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText)
      return { ok: false, error: `Evolution API ${res.status}: ${txt}` }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Bağlantı hatası' }
  }
}

function buildMessage(template: string, contact: { full_name: string; salutation?: string }) {
  const ad = contact.full_name.trim().split(' ')[0] || contact.full_name
  const hitap = contact.salutation?.trim() || ''
  return template
    .replace(/\{ad\}/gi, ad)
    .replace(/\{adsoyad\}/gi, contact.full_name)
    .replace(/\{hitap\}/gi, hitap)
    .replace(/\s+([,!?.:])/g, '$1')  // boş hitap sonrası "Ahmet ," → "Ahmet,"
    .replace(/\s{2,}/g, ' ')          // çift boşlukları temizle
    .trim()
}

async function buildAIMessage(
  contact: { full_name: string; salutation?: string },
  systemPrompt: string,
  template: string,
  model: string,
): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key || !model) return buildMessage(template, contact)

  const ad = contact.full_name.trim().split(' ')[0] || contact.full_name
  const hitap = contact.salutation || ''
  const userMsg = `Müşteri adı: ${contact.full_name}${hitap ? ` (Hitap: ${hitap})` : ''}. Şablon: "${template.replace(/\{ad\}/gi, ad).replace(/\{adsoyad\}/gi, contact.full_name).replace(/\{hitap\}/gi, hitap)}". Bu şablonu temel alarak kişiye özel, samimi bir doğum günü WhatsApp mesajı yaz. Sadece mesajı yaz, başka bir şey ekleme.`

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || '',
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      const data = await res.json()
      return data?.choices?.[0]?.message?.content?.trim() || buildMessage(template, contact)
    }
  } catch { /* fallback */ }
  return buildMessage(template, contact)
}

// POST — run automation manually (from UI "Şimdi Gönder" button)
// body: { force?: boolean, test_contact_ids?: string[] }
// force=true → doğum günü tarihi kontrolü atlanır (test modu)
export async function POST(req: NextRequest) {
  try {
  const userSb = await createServerSupabaseClient()
  const { data: { user } } = await userSb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const force: boolean = body.force === true
  const supabase = svc()
  const mmdd = todayMMDD()

  // Get current user's consultant
  const { data: consultant } = await supabase
    .from('consultants')
    .select('id, wa_instance, wa_phone')
    .eq('user_id', user.id)
    .single()

  if (!consultant) return NextResponse.json({ error: 'Danışman bulunamadı' }, { status: 404 })

  if (!consultant.wa_instance) {
    return NextResponse.json({
      error: 'WhatsApp bağlı değil. Profilim sayfasından WhatsApp\'ı bağlayın.',
    }, { status: 400 })
  }

  // Config: UI'dan gelen inline config öncelikli, yoksa DB'den oku
  const inlineConfig = body.config  // UI mevcut state'ini gönderebilir
  let config: any = inlineConfig

  if (!config) {
    const { data: dbConfig } = await supabase
      .from('birthday_automation_config')
      .select('*')
      .eq('consultant_id', consultant.id)
      .single()
    config = dbConfig
  }

  if (!config) {
    // Kayıt yok, varsayılan ayarlarla tüm kişilere gönder
    config = { contact_filter: 'all', message_template: 'Merhaba {hitap} {ad}, doğum gününüz kutlu olsun! 🎂', selected_contact_ids: [] }
  }

  let targets: { id: string; full_name: string; salutation?: string; phone: string; birth_date?: string }[] = []

  if (config.contact_filter === 'specific') {
    // Specific mod: seçili ID'leri direkt çek, assignment filtresi yok
    if (!config.selected_contact_ids?.length) {
      return NextResponse.json({ sent: 0, failed: 0, detail: [], reason: '"Belirli kişiler seç" modunda en az bir kişi seçin ve Kaydet\'e basın.' })
    }
    const { data: selected } = await supabase
      .from('clients')
      .select('id, full_name, salutation, phone, birth_date')
      .in('id', config.selected_contact_ids)
      .eq('is_active', true)
    targets = (selected || []).filter(c => c.phone && c.phone.trim() !== '')
    if (!targets.length) {
      return NextResponse.json({ sent: 0, failed: 0, detail: [], reason: 'Seçili kişilerin telefon numarası kayıtlı değil.' })
    }
  } else {
    // All mod: bu consultant'a atanmış kişiler
    const { data: assigned } = await supabase
      .from('clients')
      .select('id, full_name, salutation, phone, birth_date')
      .eq('is_active', true)
      .eq('assigned_consultant_id', consultant.id)
    const { data: unassigned } = await supabase
      .from('clients')
      .select('id, full_name, salutation, phone, birth_date')
      .eq('is_active', true)
      .is('assigned_consultant_id', null)
    const all = [...(assigned || []), ...(unassigned || [])].filter(c => c.phone && c.phone.trim() !== '')
    if (!all.length) {
      return NextResponse.json({ sent: 0, failed: 0, detail: [], reason: 'Telefon numarası kayıtlı müşteri bulunamadı.' })
    }
    if (!force) {
      targets = all.filter(c => c.birth_date?.slice(5, 10) === mmdd)
      if (!targets.length) {
        return NextResponse.json({ sent: 0, failed: 0, detail: [], reason: `Bugün (${mmdd}) doğum günü olan müşteri yok.` })
      }
    } else {
      targets = all
    }
  }

  const detail: { name: string; phone: string; ok: boolean; error?: string }[] = []
  let sent = 0, failed = 0

  for (const contact of targets) {
    if (!contact.phone) continue
    const message = buildMessage(config.message_template, contact)
    const result = await sendWhatsApp(contact.phone, message, consultant.wa_instance)
    detail.push({ name: contact.full_name, phone: contact.phone, ok: result.ok, error: result.error })
    if (result.ok) {
      sent++
      // Mesaj gönderildi → chat history'ye kaydet (webhook bu kişiden cevap gelince tanıyacak)
      const normPhone = contact.phone.replace(/\D/g, '')
      await supabase.from('whatsapp_chat_history').insert({
        consultant_id: consultant.id,
        customer_phone: normPhone.startsWith('90') ? normPhone : '90' + (normPhone.startsWith('0') ? normPhone.slice(1) : normPhone),
        role: 'assistant',
        content: message,
      }).catch(() => {})
    } else {
      failed++
    }
  }

  return NextResponse.json({ sent, failed, detail, date: mmdd, force })
  } catch (e: any) {
    console.error('[birthday/run] unhandled error:', e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
