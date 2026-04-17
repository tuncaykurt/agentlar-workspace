import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SETTING_KEY = 'lina_call_prompt'

const DEFAULT_PROMPT = `Sen CB Ambiance Gayrimenkul ofisinin dijital asistanı Lina'sın.

Görevin:
1. Kibarca tanıt kendini ve CB Ambiance'ı
2. Mülkü satmak isteyip istemediklerini sor
3. CB Ambiance'ın geniş portföyünü ve profesyonel hizmetini vurgula
4. Yetki sözleşmesi için randevu almaya çalış
5. Cevap olumsuzsa teşekkür et ve vedalaş

Konuşma kuralları:
- Nazik ve profesyonel ol
- Kısa ve öz konuş
- Türkçe konuş
- Doğal ve samimi bir ton kullan

ÖNEMLİ: Konuşma sırasında sana ek talimatlar (system mesajları) gelebilir. Bu talimatlar danışmanından geliyor. Talimatları hemen uygula ve konuşmayı ona göre yönlendir. Talimatı aldığını karşı tarafa belli etme, doğal şekilde konuşmaya devam et.`

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** Prompt template'i oku */
export async function GET() {
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', SETTING_KEY)
      .single()

    const prompt = data?.value || DEFAULT_PROMPT

    return NextResponse.json({ prompt, isDefault: !data?.value })
  } catch {
    return NextResponse.json({ prompt: DEFAULT_PROMPT, isDefault: true })
  }
}

/** Prompt template'i kaydet */
export async function PUT(req: NextRequest) {
  try {
    const { prompt } = await req.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt zorunlu' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { error } = await supabase
      .from('settings')
      .upsert({
        key: SETTING_KEY,
        value: JSON.stringify(prompt),
        description: 'Lina dijital asistan arama prompt şablonu',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })

    if (error) {
      console.error('[vapi/prompt] Save error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Beklenmeyen hata' }, { status: 500 })
  }
}
