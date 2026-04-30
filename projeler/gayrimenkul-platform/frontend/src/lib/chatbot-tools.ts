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
        .eq('consultant_id', ctx.consultantId)
        .neq('status', 'sold')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (!data || data.length === 0) return 'Aktif portföyde mülk bulunamadı.'
      return JSON.stringify(data.map(p => ({
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
    description: 'Belirli kriterlerle mülk arar. Müşteri "İzmir\'de 3+1 villa", "100m2 üstü daire" gibi talep ederse kullan.',
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
    description: 'Belirli bir mülkün tüm detaylarını getirir. Müşteri belirli bir mülk hakkında daha fazla bilgi istediğinde kullan.',
    parameters: {
      type: 'object',
      properties: {
        property_id: { type: 'string', description: 'Mülk ID (UUID)' },
        title_search: { type: 'string', description: 'Veya mülk adı içinde arama' },
      },
    },
    execute: async (args, ctx) => {
      let q = ctx.supabase.from('properties').select('*').eq('is_active', true).limit(1)
      if (args.property_id) q = q.eq('id', args.property_id)
      else if (args.title_search) q = q.ilike('title', `%${args.title_search}%`)
      else return 'property_id veya title_search gerekli.'
      const { data } = await q.single()
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
}

export const TOOL_LABELS: Record<string, { label: string; emoji: string; description: string }> = {
  list_my_properties:    { label: 'Portföyümü Listele',      emoji: '🏠', description: 'Aktif mülklerinizi gösterebilir' },
  search_properties:     { label: 'Mülk Ara',                 emoji: '🔍', description: 'Kriterle mülk arama yapabilir' },
  get_property_details:  { label: 'Mülk Detayı',              emoji: '📋', description: 'Belirli bir mülkün tüm detayını döner' },
  get_consultant_contact:{ label: 'İletişim Bilgilerim',      emoji: '📞', description: 'Telefon/e-posta/ofis bilgisi' },
  get_client_info:       { label: 'Müşteri CRM Bilgisi',      emoji: '👤', description: 'Müşteri kayıtlıysa geçmişini hatırlar' },
  schedule_appointment:  { label: 'Randevu Kaydet',           emoji: '📅', description: 'AI randevu oluşturabilir' },
}

export const PERSONALITY_PRESETS: Record<string, string> = {
  resmi: `Resmi, kibar ve net bir dil kullanırsın. Klişe cümlelerden kaçınır, doğrudan konuya girersin. Emojiler nadiren kullanılır. Yanıtlar 1-3 cümle, somut ve yararlı olur. Müşterilere "siz" diye hitap edersin.`,

  samimi: `Müşterilerle gerçek bir insan gibi yazışırsın - sıcak, samimi ama profesyonel. Aşırı resmi olmazsın ama saygılı kalırsın. Müşterinin söylediğini anlayıp ona özel cevap verirsin, kalıp cümleler kullanmazsın. Bazen 1-2 emoji kullanabilirsin ama abartmazsın. Yanıtlarını kısa ve doğal tut, gerçek bir insan gibi yaz.`,

  espirili: `Sıcakkanlı ve esprili bir tonun var. Müşterilerle samimi ve eğlenceli bir tonda konuşursun. Yeri geldiğinde küçük şakalar, espriler yaparsın ama saygıyı kaybetmezsin. Profesyonelliği eğlence ile harmanlar, müşteriye iyi vakit geçirtirsin. Emojiler doğal akışta yer alır.`,
}

export function buildSystemPrompt(opts: {
  basePrompt: string
  preset?: string
  exampleDialogues?: string
  consultantName?: string
}): string {
  // ÖNEMLİ: AI, danışmanın asistanı DEĞİL — danışmanın KENDİSİ gibi yazar
  const identity = opts.consultantName
    ? `Sen ${opts.consultantName}'sın. Bir gayrimenkul danışmanısın ve müşterilerinle WhatsApp'tan kendi adına yazışırsın. ASLA "ben asistanım", "danışmanım size dönecek", "size yardımcı olacağım" gibi üçüncü kişi ifadeleri kullanma — sen birinci kişisin, kendi adına konuşuyorsun.\n\n`
    : `Sen bir gayrimenkul danışmanısın, kendi adına müşterilerinle WhatsApp'tan yazışırsın.\n\n`

  const presetText = opts.preset && PERSONALITY_PRESETS[opts.preset]
    ? `ÜSLUP:\n${PERSONALITY_PRESETS[opts.preset]}\n\n`
    : ''

  const examples = opts.exampleDialogues?.trim()
    ? `ÖRNEK DİYALOGLAR (bu üslupta yanıt ver):\n${opts.exampleDialogues}\n\n`
    : ''

  const rules = `
GENEL KURALLAR:
- Sen danışmanın kendisisin. "Ben Tuncay" / "ben de aradım" / "müsaitim" gibi yaz. ASLA "asistanım", "danışmanım", "size yönlendireceğim" deme.
- Her mesaja farklı bir yaklaşımla cevap ver, kalıp cümleler kullanma
- Müşterinin gerçekte sorduğu şeyi anla, genel cevap verme
- Kısa ve doğal yaz - aşırı uzun, kataloğa benzer mesajlar yazma
- Bilmediğin bilgiyi uydurma; gerekirse "kontrol edip döneyim" / "ofiste bakıp ileteyim" de
- Mülk/fiyat/portföy bilgileri için mevcut tool'ları kullan
- Emojileri abartma, doğal akışta kullan
- Selamlama her mesajda gerekmez, akıcı bir konuşma sürdür
- Sesli mesaj veya fotoğraf gelirse içeriğini anlamlandır ve doğal yanıt ver`

  return `${identity}${presetText}${examples}TEMEL TALİMAT: ${opts.basePrompt}\n${rules}`
}
