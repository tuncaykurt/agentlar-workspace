/**
 * Chatbot Tools Registry
 * AI uses these via OpenRouter function calling.
 * Each tool: name, description, parameters (JSON schema), execute(args, ctx).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export interface ToolContext {
  supabase: SupabaseClient
  consultantId: string
  customerPhone: string
  baseUrl?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
  execute: (args: any, ctx: ToolContext) => Promise<string>
}

export const BUILTIN_TOOLS: Record<string, ToolDefinition> = {
  list_my_properties: {
    name: 'list_my_properties',
    description: 'Danışmanın aktif portföyündeki mülkleri listeler. Müşteri "neyiniz var", "satılık daire", "müsait olan" gibi sorduğunda kullan.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Maksimum kaç mülk', default: 10 },
      },
    },
    execute: async (args, ctx) => {
      const limit = Math.min(args.limit || 10, 20)
      const { data } = await ctx.supabase
        .from('properties')
        .select('id, title, city, district, price, m2_gross, room_count, property_type, status')
        .eq('is_active', true)
        .eq('assigned_consultant_id', ctx.consultantId)
        .neq('status', 'sold')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (!data || data.length === 0) return 'Aktif portföyde mülk bulunamadı.'
      return JSON.stringify(data.map(p => ({
        id: p.id,
        title: p.title,
        sehir: p.city,
        ilce: p.district,
        fiyat_tl: p.price,
        m2: p.m2_gross,
        oda: p.room_count,
        tip: p.property_type,
        durum: p.status,
      })), null, 2)
    },
  },

  search_properties: {
    name: 'search_properties',
    description: 'Danışmanın kendi portföyünde belirli kriterlerle mülk arar. Müşteri "İzmir\'de 3+1 villa", "100m2 üstü daire" gibi talep ederse kullan.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'Şehir adı (opsiyonel)' },
        district: { type: 'string', description: 'İlçe adı (opsiyonel)' },
        property_type: { type: 'string', description: 'apartment | villa | land | commercial | office | shop' },
        min_price: { type: 'number', description: 'Minimum fiyat TL' },
        max_price: { type: 'number', description: 'Maksimum fiyat TL' },
        min_m2: { type: 'number', description: 'Minimum m2' },
        room_count: { type: 'string', description: 'Oda sayısı (örn: "3+1")' },
      },
    },
    execute: async (args, ctx) => {
      let q = ctx.supabase
        .from('properties')
        .select('id, title, city, district, price, m2_gross, room_count, property_type')
        .eq('is_active', true)
        .eq('assigned_consultant_id', ctx.consultantId)
        .neq('status', 'sold')
        .limit(15)
      if (args.city) q = q.ilike('city', `%${args.city}%`)
      if (args.district) q = q.ilike('district', `%${args.district}%`)
      if (args.property_type) q = q.eq('property_type', args.property_type)
      if (args.min_price) q = q.gte('price', args.min_price)
      if (args.max_price) q = q.lte('price', args.max_price)
      if (args.min_m2) q = q.gte('m2_gross', args.min_m2)
      if (args.room_count) q = q.eq('room_count', args.room_count)
      const { data } = await q
      if (!data || data.length === 0) return 'Bu kriterlere uygun mülk bulunamadı.'
      return JSON.stringify(data, null, 2)
    },
  },

  get_property_details: {
    name: 'get_property_details',
    description: 'Danışmanın kendi portföyündeki belirli bir mülkün tüm detaylarını getirir. Müşteri belirli bir mülk hakkında daha fazla bilgi istediğinde kullan.',
    parameters: {
      type: 'object',
      properties: {
        property_id: { type: 'string', description: 'Mülk ID (UUID)' },
        title_search: { type: 'string', description: 'Veya mülk adı içinde arama' },
      },
    },
    execute: async (args, ctx) => {
      let q = ctx.supabase.from('properties').select('*')
        .eq('is_active', true)
        .eq('assigned_consultant_id', ctx.consultantId)
        .limit(1)
      if (args.property_id) q = q.eq('id', args.property_id)
      else if (args.title_search) q = q.ilike('title', `%${args.title_search}%`)
      else return 'property_id veya title_search gerekli.'
      const { data } = await q.maybeSingle()
      return data ? JSON.stringify(data, null, 2) : 'Mülk bulunamadı.'
    },
  },

  get_consultant_contact: {
    name: 'get_consultant_contact',
    description: 'Danışmanın iletişim bilgilerini (telefon, e-posta, ofis) döner. Müşteri "telefon numaranız", "nasıl ulaşırım" gibi sorduğunda kullan.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, ctx) => {
      const { data } = await ctx.supabase
        .from('consultants')
        .select('full_name, phone, email, address, office_phone, wa_phone')
        .eq('id', ctx.consultantId)
        .single()
      if (!data) return 'Bilgi bulunamadı.'
      return JSON.stringify({
        ad: data.full_name,
        telefon: data.phone || data.wa_phone || data.office_phone,
        ofis_telefonu: data.office_phone,
        eposta: data.email,
        ofis_adresi: data.address,
      })
    },
  },

  get_client_info: {
    name: 'get_client_info',
    description: 'Müşterinin CRM\'deki kayıtlı bilgisini getirir (geçmiş, ilgilendiği tip, notlar). Konuşmada müşteriyi tanımak için kullan.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, ctx) => {
      const { data } = await ctx.supabase
        .from('clients')
        .select('full_name, salutation, client_type, lead_status, notes, birth_date, email')
        .eq('phone', ctx.customerPhone)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (!data) {
        // Try with normalized phone
        const norm = ctx.customerPhone.replace(/^90/, '0')
        const { data: alt } = await ctx.supabase
          .from('clients')
          .select('full_name, salutation, client_type, lead_status, notes, birth_date')
          .eq('phone', norm)
          .limit(1)
          .maybeSingle()
        return alt ? JSON.stringify(alt) : 'Müşteri CRM\'de kayıtlı değil.'
      }
      return JSON.stringify(data)
    },
  },

  web_search: {
    name: 'web_search',
    description: 'İnternette güncel bilgi araması yapar (OpenRouter üzerinden Perplexity Sonar). Müşteri güncel piyasa, haber, yasal düzenleme, semt bilgisi, ortalama m2 fiyatı gibi web\'den araştırma gerektiren bir şey sorduğunda kullan.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Aranacak soru/konu (Türkçe veya İngilizce)' },
      },
      required: ['query'],
    },
    execute: async (args, _ctx) => {
      const apiKey = process.env.OPENROUTER_API_KEY
      if (!apiKey) return 'Web arama yapılandırılmamış (OPENROUTER_API_KEY yok).'

      const now = new Date()
      const todayTR = now.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
      const yyyy = now.getFullYear()
      const yyyymm = `${yyyy}-${String(now.getMonth() + 1).padStart(2, '0')}`

      // Türk gayrimenkul piyasası enflasyonist; Sonar varsayılan olarak eski (2023-2024) kaynaklara
      // dayanıp düşük fiyat verebiliyor. Tarihi açıkça vurgu + sorguya yıl ekleyerek güncel sonuç zorla.
      const query = args.query?.trim() || ''
      const augmentedQuery = /\b20\d{2}\b/.test(query) ? query : `${query} (${yyyy} güncel)`

      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://gayrimenkul.yapayzekaotomasyon.cloud',
            'X-Title': 'Gayrimenkul Web Search',
          },
          body: JSON.stringify({
            model: 'perplexity/sonar',
            messages: [
              {
                role: 'system',
                content: `Türkçe, kısa ve doğrudan cevap ver. Bugünün tarihi: ${todayTR}.

KRİTİK KURALLAR (Türk gayrimenkul piyasası enflasyonist — eski rakamlar bugün geçerli değil):
- SADECE ${yyyymm} veya sonrası tarihli kaynakları kullan. ${yyyy - 1} ve öncesi rakamları ASLA kullanma.
- Fiyat verirken kaynağın tarihini parantez içinde belirt: "X TL (${yyyymm} verisi, [kaynak])".
- Güncel kaynak bulamadıysan "şu an net bir veri bulamadım" de, eski rakamı vermiş gibi yapma.
- Türkiye'de yıllık emlak enflasyonu yüksek, 1-2 yıl eski rakam gerçekçi değildir.
- Tarih, sayı, fiyat varsa öne çıkar. Konuya odaklı, gereksiz detaya girme.`,
              },
              { role: 'user', content: augmentedQuery },
            ],
            max_tokens: 600,
          }),
          signal: AbortSignal.timeout(25000),
        })
        if (!res.ok) {
          const errText = await res.text()
          return `Web arama hatası (${res.status}): ${errText.slice(0, 200)}`
        }
        const data = await res.json()
        return data?.choices?.[0]?.message?.content || 'Sonuç bulunamadı.'
      } catch (e: any) {
        return `Web arama exception: ${e?.message || String(e)}`
      }
    },
  },

  schedule_appointment: {
    name: 'schedule_appointment',
    description: 'Müşteriyle randevu kaydeder. Müşteri görüşmek/buluşmak istediğinde kullan.',
    parameters: {
      type: 'object',
      properties: {
        date_iso: { type: 'string', description: 'ISO tarih-saat (örn: 2026-05-05T14:00:00)' },
        notes: { type: 'string', description: 'Görüşme konusu / not' },
        customer_name: { type: 'string', description: 'Müşteri adı (varsa)' },
      },
      required: ['date_iso'],
    },
    execute: async (args, ctx) => {
      const { error } = await ctx.supabase.from('appointments').insert({
        consultant_id: ctx.consultantId,
        customer_phone: ctx.customerPhone,
        customer_name: args.customer_name || null,
        appointment_date: args.date_iso,
        notes: args.notes || null,
      })
      if (error) return `Randevu kaydedilemedi: ${error.message}`
      return `Randevu kaydedildi: ${args.date_iso}. Danışman bilgilendirildi.`
    },
  },

  research_property: {
    name: 'research_property',
    description: 'Belirli bir ada/parsel için derin gayrimenkul araştırması, bina yaşı hesabı ve vergi analizi yapar. Müşteri tapu fotoğrafı attığında veya ada/parsel bilgisi verdiğinde kullan.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'Şehir' },
        district: { type: 'string', description: 'İlçe' },
        neighborhood: { type: 'string', description: 'Mahalle/Köy' },
        ada: { type: 'string', description: 'Ada No' },
        parsel: { type: 'string', description: 'Parsel No' },
        owner_type: { type: 'string', enum: ['sahis', 'sirket'], description: 'Mülkiyet tipi (sahis veya sirket)' },
        property_type: { type: 'string', description: 'Ana Taşınmaz Niteliği (örn: Arsa, Tarla, Kargir Apartman)' },
        independent_unit_type: { type: 'string', description: 'Bağımsız Bölüm Niteliği (örn: Mesken, Dükkan)' },
        acquisition_price: { type: 'number', description: 'Tapudaki Satış Bedeli (TL)' },
        acquisition_date: { type: 'string', description: 'Edinme Tarihi (YYYY-MM-DD)' },
        management_plan_date: { type: 'string', description: 'Yönetim Planı Tarihi (Bina yaşı için, YYYY-MM-DD)' },
        floor_number: { type: 'string', description: 'Kat No' }
      },
      required: ['city', 'district', 'ada', 'parsel'],
    },
    execute: async (args, ctx) => {
      // 1. Kaydı veritabanına ekle
      const { data: resRecord, error: insErr } = await ctx.supabase
        .from('property_researches')
        .insert({
          consultant_id: ctx.consultantId,
          customer_phone: ctx.customerPhone,
          city: args.city,
          district: args.district,
          neighborhood: args.neighborhood,
          ada: args.ada,
          parsel: args.parsel,
          owner_type: args.owner_type || 'sahis',
          property_type: args.property_type,
          independent_unit_type: args.independent_unit_type,
          acquisition_price: args.acquisition_price,
          acquisition_date: args.acquisition_date,
          management_plan_date: args.management_plan_date,
          floor_number: args.floor_number,
          status: 'pending'
        })
        .select('id')
        .single()

      if (insErr) return `Araştırma başlatılamadı: ${insErr.message}`

      // 2. Arka planda araştırmayı tetikle
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || ctx.baseUrl || 'https://gayrimenkul.yapayzekaotomasyon.cloud'
      fetch(`${appUrl}/api/automations/chatbot/research/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.SUPABASE_SERVICE_ROLE_KEY! },
        body: JSON.stringify({ researchId: resRecord.id })
      }).catch(e => console.error('Research trigger error:', e))

      return JSON.stringify({
        status: 'success',
        message: 'Araştırma işlemi arka planda başlatıldı.',
        details: {
          location: `${args.city}, ${args.district}, ${args.neighborhood || ''}`,
          ada: args.ada,
          parsel: args.parsel,
          info: 'Bina yaşı ve vergi analizi raporunuza dahil edilecektir.'
        }
      })
    },
  },
}

export const TOOL_LABELS: Record<string, { label: string; emoji: string; description: string }> = {
  list_my_properties:    { label: 'Portföyümü Listele',      emoji: '🏠', description: 'Aktif mülklerinizi gösterebilir' },
  search_properties:     { label: 'Mülk Ara',                 emoji: '🔍', description: 'Kriterle mülk arama yapabilir' },
  get_property_details:  { label: 'Mülk Detayı',              emoji: '📋', description: 'Belirli bir mülkün tüm detayını döner' },
  get_consultant_contact:{ label: 'İletişim Bilgilerim',      emoji: '📞', description: 'Telefon/e-posta/ofis bilgisi' },
  get_client_info:       { label: 'Müşteri CRM Bilgisi',      emoji: '👤', description: 'Müşteri kayıtlıysa geçmişini hatırlar' },
  web_search:            { label: 'İnternet Araştırması',     emoji: '🌐', description: 'Perplexity ile güncel bilgi araması (semt fiyatı, piyasa, haber)' },
  schedule_appointment:  { label: 'Randevu Kaydet',           emoji: '📅', description: 'AI randevu oluşturabilir' },
  research_property:     { label: 'Ada/Parsel Araştırma',     emoji: '🔬', description: 'Derin mülk analizi ve sunum raporu hazırlar (5-10 dk)' },
}

export const PERSONALITY_PRESETS: Record<string, string> = {
  resmi: `Resmi, kibar ve net bir dil kullanırsın. Klişe cümlelerden kaçınır, doğrudan konuya girersin. Emojiler nadiren kullanılır. Yanıtlar 1-3 cümle, somut ve yararlı olur. Müşterilere "siz" diye hitap edersin.`,

  samimi: `Müşterilerle gerçek bir insan gibi yazışırsın - sıcak, samimi ama profesyonel. Tıpkı bir dostunla konuşur gibi "abi", "abla" gibi hitapları duruma göre kullanabilirsin. Aşırı resmi olmazsın, kalıp cümleler (örn: "Lütfen bekleyiniz", "İşleminiz yapılıyor") ASLA kullanmazsın. Müşterinin söylediğini anlayıp ona özel, içten cevaplar verirsin. Yanıtlarını kısa, doğal ve samimi tut.`,

  espirili: `Sıcakkanlı ve esprili bir tonun var. Müşterilerle samimi ve eğlenceli bir tonda konuşursun. Yeri geldiğinde küçük şakalar, espriler yaparsın ama saygıyı kaybetmezsin. Profesyonelliği eğlence ile harmanlar, müşteriye iyi vakit geçirtirsin. Emojiler doğal akışta yer alır.`,
}

// Her tool için "ne zaman çağırılmalı" kısa Türkçe kullanım ipucu (system prompt için)
const TOOL_USAGE_HINTS: Record<string, string> = {
  list_my_properties:
    'Müşteri "neyiniz var", "satılık daireler", "müsait olanlar", "portföyünüzde ne var" gibi GENEL portföy sorduğunda çağır.',
  search_properties:
    'Müşteri KRİTER belirttiğinde (şehir/ilçe/oda sayısı/fiyat/m2 vb.) çağır. Ör: "İzmir\'de 3+1", "5 milyon altı daire", "100m2 üstü villa".',
  get_property_details:
    'Müşteri belirli bir mülk hakkında daha fazla detay istediğinde (id veya başlık) çağır.',
  get_consultant_contact:
    'Müşteri "telefonunuz", "e-postanız", "ofis adresi", "nasıl ulaşırım" gibi iletişim sorduğunda çağır.',
  get_client_info:
    'Müşterinin geçmişini, ilgilendiği tipi, notlarını hatırlaman gerektiğinde (özellikle ilk birkaç mesajda) çağır. CRM\'de kayıtlıysa kişiselleştirilmiş cevap verirsin.',
  web_search:
    'Güncel piyasa bilgisi, semt ortalama m2 fiyatı, mevzuat değişikliği, haber gibi WEB ARAŞTIRMASI gereken bir şey sorulursa çağır. Kafadan tahmin etme.',
  schedule_appointment:
    'Müşteri görüşmek/buluşmak/randevu istediğinde tarih-saat alıp çağır.',
  research_property:
    'Müşteri bir mülkün ada/parsel bilgisini verdiğinde veya tapu/bilgi görseli paylaştığında (ve sen oradan bilgileri ayıkladığında) derin araştırma ve rapor hazırlamak için çağır.',
}

function buildToolsSection(enabledTools?: string[]): string {
  if (!enabledTools?.length) return ''
  const lines: string[] = []
  for (const name of enabledTools) {
    const hint = TOOL_USAGE_HINTS[name]
    if (hint) lines.push(`- ${name}: ${hint}`)
  }
  if (!lines.length) return ''
  return `\n\nKULLANABİLECEĞİN ARAÇLAR (function calling):
${lines.join('\n')}

ARAÇ KULLANIM KURALI:
- Mülk/fiyat/portföy/iletişim/randevu/güncel bilgi gibi VERİ gerektiren her durumda ÖNCE uygun tool'u çağır, SONRA cevap yaz. Kafadan uydurma.
- Tool çağırırken "bir bakayım", "kontrol edeyim" gibi ön-cümle yazma — direkt çağır, dönen veriyle sohbete devam et.
- Müşteri kriter verdiyse (oda/bütçe/bölge) hep search_properties; kriter yoksa list_my_properties kullan.
- Aynı turda gerekirse birden fazla tool çağırabilirsin.`
}

export function buildSystemPrompt(opts: {
  basePrompt: string
  preset?: string
  exampleDialogues?: string
  consultantName?: string
  enabledTools?: string[]
}): string {
  // 1. Kimlik ve Birinci Şahıs Kuralı (Dinamik)
  const identity = opts.consultantName
    ? `KİMLİK:\nSen ${opts.consultantName}'sın. Bir gayrimenkul danışmanısın ve müşterilerinle WhatsApp üzerinden kendi adına yazışıyorsun. ASLA üçüncü şahıs gibi (asistan, sistem, danışmanım dönecek vb.) konuşma. Her zaman birinci şahıs ("ben", "iletiyorum", "bakıyorum") olarak cevap ver.\n\n`
    : `KİMLİK:\nSen bir gayrimenkul danışmanısın. Müşterilerle doğrudan kendi adına yazışıyorsun. Birinci şahıs dili kullan.\n\n`

  // 2. Kullanıcı tarafından seçilen Üslup Paketi
  const presetText = opts.preset && PERSONALITY_PRESETS[opts.preset]
    ? `ÜSLUP VE KİŞİLİK:\n${PERSONALITY_PRESETS[opts.preset]}\n\n`
    : ''

  // 3. Kullanıcının Panelden Girdiği Ana Prompt
  const userBasePrompt = `TEMEL TALİMATLAR:\n${opts.basePrompt}\n\n`

  // 4. Örnek Diyaloglar
  const examples = opts.exampleDialogues?.trim()
    ? `ÖRNEK DİYALOGLAR (bu tarzda yanıt ver):\n${opts.exampleDialogues}\n\n`
    : ''

  // 5. Araç Kullanım Kuralları (Jenerik)
  const toolsSection = buildToolsSection(opts.enabledTools)

  const commonRules = `
GENEL ÇALIŞMA PRENSİPLERİ:
- Her zaman kısa, net ve sonuç odaklı ol. Bir yapay zeka gibi değil, bizzat Tuncay Kurt gibi cevap ver.
- EĞER BİR TAPU GÖRSELİ GELİRSE:
    1. Görseli analiz et ve gerekli tool'u (research_property) çağır.
    2. Kullanıcıya ASLA ada, parsel, mahalle, fiyat veya tarih gibi teknik verileri tekrar etme. Kullanıcı zaten bu bilgileri biliyor, duymak istemiyor.
    3. Yanıtında sadece: "Bilgileri aldım, hemen detaylı bir araştırma başlatıyorum. Raporun hazır olduğunda buradan sana/size ileteceğim." şeklinde kısa ve güven verici bir onay ver.
- HİTAP VE ÜSLUP: 
    - Karşındakinin cinsiyetini bilmiyorsan "Selamlar", "Merhabalar" veya samimi bir dil için "Hocam" kelimesini kullan. 
    - Sadece çok gerekliyse veya kullanıcı öyle hitap ediyorsa "Bey/Hanım/Abi" diyebilirsin.
    - Gereksiz nezaket cümlelerinden ve robotik kalıplardan kaçın.
- Bilgi gerektiren her durumda tool kullan. Tool çıktısını kullanıcıya özetlerken en can alıcı 1-2 cümleyi söyle, detayları rapora veya linke bırak.
`

  return identity + presetText + userBasePrompt + examples + toolsSection + commonRules
}
