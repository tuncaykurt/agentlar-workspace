'use client'

import { useState, useEffect } from 'react'
import { Bot, Save, Clock, MessageSquare, ToggleLeft, ToggleRight, Loader2, CheckCircle, Info, Cpu, XCircle, AlertCircle, Sparkles, Wrench, MessageCircleQuestion } from 'lucide-react'

const TOOL_LIBRARY: Record<string, { label: string; emoji: string; description: string }> = {
  list_my_properties:    { label: 'Portföyümü Listele',      emoji: '🏠', description: 'Aktif mülklerinizi gösterebilir' },
  search_properties:     { label: 'Mülk Ara',                 emoji: '🔍', description: 'Kriterle (şehir/oda/fiyat) mülk arar' },
  get_property_details:  { label: 'Mülk Detayı',              emoji: '📋', description: 'Belirli bir mülkün tüm detayını döner' },
  get_consultant_contact:{ label: 'İletişim Bilgilerim',      emoji: '📞', description: 'Telefon/e-posta/ofis bilgisi' },
  get_client_info:       { label: 'Müşteri CRM Bilgisi',      emoji: '👤', description: 'Müşteri kayıtlıysa geçmişini hatırlar' },
  web_search:            { label: 'İnternet Araştırması',     emoji: '🌐', description: 'Perplexity Sonar ile güncel bilgi (OpenRouter üzerinden)' },
  schedule_appointment:  { label: 'Randevu Kaydet',           emoji: '📅', description: 'AI randevu oluşturabilir' },
  research_property:     { label: 'Gayrimenkul Araştırma',   emoji: '📊', description: 'Ada/Parsel ile derin pazar ve tapu analizi yapar' },
}

const PERSONALITY_OPTIONS = [
  { value: 'resmi',     label: 'Resmi',   description: 'Profesyonel, mesafeli, saygılı' },
  { value: 'samimi',    label: 'Samimi',  description: 'Sıcak, doğal, profesyonel' },
  { value: 'espirili',  label: 'Esprili', description: 'Eğlenceli, samimi, esprili' },
]

interface Config {
  is_enabled: boolean
  auto_reply_enabled: boolean
  system_prompt: string
  working_hours_enabled: boolean
  working_hours_start: string
  working_hours_end: string
  outside_hours_message: string
  max_history_messages: number
  selected_model: string
  personality_preset: string
  temperature: number
  example_dialogues: string
  enabled_tools: string[]
  debounce_seconds: number
  research_delay_minutes: number
}

interface ORModel {
  id: string
  name: string
  pricing?: { prompt: string }
}

const DEFAULT: Config = {
  is_enabled: false,
  auto_reply_enabled: true,
  system_prompt: 'Sen yardımsever bir gayrimenkul danışmanı asistanısın. Müşterilerin sorularını kısa, samimi ve profesyonel bir şekilde yanıtlıyorsun.',
  working_hours_enabled: false,
  working_hours_start: '09:00',
  working_hours_end: '18:00',
  outside_hours_message: 'Mesai saatlerimiz dışındasınız (09:00-18:00). Yarın size döneceğiz.',
  max_history_messages: 10,
  selected_model: 'anthropic/claude-haiku-4-5',
  personality_preset: 'samimi',
  temperature: 0.7,
  example_dialogues: '',
  enabled_tools: [],
  debounce_seconds: 5,
  research_delay_minutes: 7,
}

export default function ChatbotPage() {
  const [config, setConfig] = useState<Config>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [models, setModels] = useState<ORModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [registeringWebhook, setRegisteringWebhook] = useState(false)
  const [debug, setDebug] = useState<any>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [status, setStatus] = useState<{
    wa_connected: boolean
    webhook_registered: boolean
    chatbot_enabled: boolean
    model_selected: boolean
    active_model: string
    openrouter_configured: boolean
    ready: boolean
  } | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/automations/chatbot').then(r => r.json()),
      checkStatus(),
    ]).then(([{ config: c }]) => {
      if (c) setConfig(c)
      setLoading(false)
    })
  }, [])

  async function checkStatus() {
    const res = await fetch('/api/automations/chatbot/status').catch(() => null)
    if (res?.ok) {
      const data = await res.json()
      setStatus(data)
    }
  }

  async function registerWebhook() {
    setRegisteringWebhook(true)
    try {
      const res = await fetch('/api/whatsapp/register-webhook', { method: 'POST' })
      const data = await res.json()
      if (!data.ok) {
        alert(`Webhook kaydedilemedi:\n${JSON.stringify(data.attempts || data.error, null, 2)}`)
      }
    } catch { /* ignore */ }
    await checkStatus()
    setRegisteringWebhook(false)
  }

  async function loadDebug() {
    const res = await fetch('/api/whatsapp/debug').catch(() => null)
    if (res?.ok) {
      const data = await res.json()
      setDebug(data)
      setShowDebug(true)
    }
  }

  async function fetchModels() {
    setModelsLoading(true)
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models')
      const data = await res.json()
      const list: ORModel[] = (data?.data || [])
        .sort((a: ORModel, b: ORModel) => a.name.localeCompare(b.name))
      setModels(list)
    } catch { /* ignore */ }
    setModelsLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/automations/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
        if (data.config) setConfig(data.config)
        await checkStatus()
      } else {
        alert(`Kayıt başarısız (HTTP ${res.status}):\n${JSON.stringify(data, null, 2)}`)
      }
    } catch (e: any) {
      alert(`Kayıt sırasında hata: ${e?.message || e}`)
    }
    setSaving(false)
  }

  const set = (patch: Partial<Config>) => setConfig(c => ({ ...c, ...patch }))

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-primary" /></div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Bot size={22} className="text-primary" /> WhatsApp Chatbot
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">Gelen mesajlara otomatik AI yanıtı ver</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : <Save size={14} />}
          {saved ? 'Kaydedildi!' : 'Kaydet'}
        </button>
      </div>

      <div className="space-y-5">
        {/* Durum Kartı */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-on-surface">Sistem Durumu</p>
            <div className="flex gap-2">
              <button onClick={checkStatus} className="text-xs text-on-surface-variant hover:text-primary">
                Yenile
              </button>
              <button onClick={loadDebug} className="text-xs text-on-surface-variant hover:text-primary px-2 py-1 border border-outline rounded">
                Debug
              </button>
              <button onClick={registerWebhook} disabled={registeringWebhook}
                className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-xs rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {registeringWebhook ? <Loader2 size={11} className="animate-spin" /> : null}
                {registeringWebhook ? 'Kaydediliyor...' : 'Webhook Kaydettir'}
              </button>
            </div>
          </div>

          {showDebug && debug && (
            <div className="mb-3 p-3 bg-surface-container-high rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">Debug Bilgisi</span>
                <button onClick={() => setShowDebug(false)} className="text-xs text-on-surface-variant hover:text-on-surface">Kapat</button>
              </div>
              <pre className="text-[10px] overflow-auto max-h-96 bg-surface-container p-2 rounded text-on-surface">
                {JSON.stringify(debug, null, 2)}
              </pre>
            </div>
          )}
          {status ? (
            <div className="space-y-2">
              {[
                { label: 'WhatsApp Bağlı', ok: status.wa_connected },
                { label: 'Webhook Kayıtlı', ok: status.webhook_registered },
                { label: 'OpenRouter API', ok: status.openrouter_configured },
                { label: 'Model Seçili', ok: status.model_selected, detail: status.active_model },
                { label: 'Chatbot Aktif', ok: status.chatbot_enabled },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  {item.ok
                    ? <CheckCircle size={15} className="text-green-500 flex-shrink-0" />
                    : <XCircle size={15} className="text-red-400 flex-shrink-0" />}
                  <span className={item.ok ? 'text-on-surface' : 'text-on-surface-variant'}>{item.label}</span>
                  {item.detail && <span className="text-xs text-on-surface-variant ml-1">({item.detail})</span>}
                </div>
              ))}
              {status.ready ? (
                <div className="mt-3 px-3 py-2 bg-green-50 rounded-lg text-xs text-green-700 font-medium flex items-center gap-1.5">
                  <CheckCircle size={13} /> Chatbot aktif — gelen mesajlara otomatik yanıt verilecek
                </div>
              ) : (
                <div className="mt-3 px-3 py-2 bg-amber-50 rounded-lg text-xs text-amber-700 flex items-center gap-1.5">
                  <AlertCircle size={13} /> Kırmızı işaretli adımları tamamlayın
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-on-surface-variant">Durum yükleniyor...</div>
          )}
        </div>

        {/* Ana açma/kapama */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-on-surface">Chatbot Durumu</p>
              <p className="text-xs text-on-surface-variant mt-0.5">Gelen tüm WhatsApp mesajlarını AI ile yanıtla</p>
            </div>
            <button onClick={() => set({ is_enabled: !config.is_enabled })} className="flex items-center gap-2">
              {config.is_enabled
                ? <ToggleRight size={36} className="text-primary" />
                : <ToggleLeft size={36} className="text-on-surface-variant" />}
              <span className={`text-sm font-medium ${config.is_enabled ? 'text-primary' : 'text-on-surface-variant'}`}>
                {config.is_enabled ? 'Aktif' : 'Pasif'}
              </span>
            </button>
          </div>
        </div>

        {config.is_enabled && (
          <>
            {/* Model Seçimi */}
            <div className="card">
              <h2 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
                <Cpu size={16} /> AI Modeli
              </h2>
              <p className="text-xs text-on-surface-variant mb-3">
                OpenRouter üzerinden yüzlerce model kullanabilirsiniz. Seçili: <code className="bg-surface-container-high px-1 rounded">{config.selected_model}</code>
              </p>
              {models.length === 0 ? (
                <button onClick={fetchModels} disabled={modelsLoading}
                  className="text-sm text-primary hover:underline flex items-center gap-1 disabled:opacity-50">
                  {modelsLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                  {modelsLoading ? 'Modeller yükleniyor...' : 'Modelleri Listele'}
                </button>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Model ara... (örn: claude, gpt, llama)"
                    value={modelSearch}
                    onChange={e => setModelSearch(e.target.value)}
                    className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="max-h-52 overflow-y-auto border border-outline rounded-lg divide-y divide-outline">
                    {models
                      .filter(m => !modelSearch || m.id.toLowerCase().includes(modelSearch.toLowerCase()) || m.name.toLowerCase().includes(modelSearch.toLowerCase()))
                      .map(m => {
                        const isFree = m.pricing?.prompt === '0'
                        return (
                          <button
                            key={m.id}
                            onClick={() => set({ selected_model: m.id })}
                            className={`w-full text-left px-3 py-2 hover:bg-surface-container-high text-sm transition-colors flex items-center justify-between ${config.selected_model === m.id ? 'bg-primary-container' : ''}`}
                          >
                            <div>
                              <span className={`font-medium ${config.selected_model === m.id ? 'text-primary' : 'text-on-surface'}`}>{m.name}</span>
                              <span className="text-xs text-on-surface-variant ml-2">{m.id}</span>
                            </div>
                            {isFree && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Ücretsiz</span>}
                          </button>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Kişilik / Üslup */}
            <div className="card">
              <h2 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
                <Sparkles size={16} /> Kişilik & Üslup
              </h2>
              <p className="text-xs text-on-surface-variant mb-3">
                AI'ın nasıl konuşacağını belirler. Doğal danışman tonu için Samimi önerilir.
              </p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {PERSONALITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => set({ personality_preset: opt.value })}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${
                      config.personality_preset === opt.value
                        ? 'border-primary bg-primary-container'
                        : 'border-outline hover:border-primary/50'
                    }`}
                  >
                    <p className="text-sm font-medium text-on-surface">{opt.label}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{opt.description}</p>
                  </button>
                ))}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-on-surface-variant">
                    Yaratıcılık (Temperature)
                  </label>
                  <span className="text-xs font-mono text-on-surface">{config.temperature.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.2}
                  step={0.1}
                  value={config.temperature}
                  onChange={e => set({ temperature: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-on-surface-variant mt-1">
                  <span>0.0 — Sabit, tekrarlı</span>
                  <span>0.7 — Doğal</span>
                  <span>1.2 — Yaratıcı</span>
                </div>
              </div>
            </div>

            {/* Sistem Promptu */}
            <div className="card">
              <h2 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
                <MessageSquare size={16} /> Sistem Promptu
              </h2>
              <p className="text-xs text-on-surface-variant mb-3">
                Asistanın rolü ve görevi. Kişilik ayarı bunun üstüne eklenir.
              </p>
              <textarea
                value={config.system_prompt}
                onChange={e => set({ system_prompt: e.target.value })}
                rows={4}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                placeholder="Sen bir gayrimenkul danışmanı asistanısın..."
              />
            </div>

            {/* Örnek Diyaloglar */}
            <div className="card">
              <h2 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
                <MessageCircleQuestion size={16} /> Örnek Diyaloglar
              </h2>
              <p className="text-xs text-on-surface-variant mb-3">
                AI'a "böyle yanıt ver" örnekleri verin. Her örnek arasına boş satır bırakın.
              </p>
              <textarea
                value={config.example_dialogues}
                onChange={e => set({ example_dialogues: e.target.value })}
                rows={6}
                className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none font-mono"
                placeholder={`Müşteri: Merhaba\nAsistan: Merhaba 🙂 Size nasıl yardımcı olabilirim?\n\nMüşteri: 3+1 daire arıyorum\nAsistan: Hangi semtte bakıyorsunuz? Bütçeniz hakkında da bilgi verirseniz size uygun seçenekleri çıkarabilirim.`}
              />
            </div>

            {/* Tools */}
            <div className="card">
              <h2 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
                <Wrench size={16} /> Tool'lar (Araçlar)
              </h2>
              <p className="text-xs text-on-surface-variant mb-3">
                AI bu araçları kullanarak veritabanından gerçek bilgiye ulaşabilir. Açtığınız tool'lar müşteri sorduğunda otomatik çağrılır.
              </p>
              <div className="space-y-2">
                {Object.entries(TOOL_LIBRARY).map(([key, tool]) => {
                  const enabled = config.enabled_tools.includes(key)
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                        enabled ? 'border-primary bg-primary-container/30' : 'border-outline'
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <span className="text-xl">{tool.emoji}</span>
                        <div>
                          <p className="text-sm font-medium text-on-surface">{tool.label}</p>
                          <p className="text-xs text-on-surface-variant">{tool.description}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          set({
                            enabled_tools: enabled
                              ? config.enabled_tools.filter(t => t !== key)
                              : [...config.enabled_tools, key],
                          })
                        }}
                      >
                        {enabled
                          ? <ToggleRight size={28} className="text-primary" />
                          : <ToggleLeft size={28} className="text-on-surface-variant" />}
                      </button>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-on-surface-variant mt-3 italic">
                💡 Tool'lar OpenRouter "function calling" destekleyen modellerle çalışır (Claude, GPT-4, Gemini gibi).
              </p>
            </div>

            {/* Gayrimenkul Araştırma Ayarları */}
            <div className="card border-l-4 border-l-primary">
              <h2 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
                <Sparkles size={16} className="text-primary" /> Yapay Zeka Gayrimenkul Araştırma (Tapu Analizi)
              </h2>
              <p className="text-xs text-on-surface-variant mb-4">
                Müşterileriniz ada/parsel veya tapu görseli ilettiğinde, AI otomatik olarak pazar analizi yapar. 
                Müşteri algısını yönetmek için raporun ne kadar süre sonra gönderileceğini belirleyebilirsiniz.
              </p>
              
              <div className="bg-surface-container/50 p-4 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-on-surface">Araştırma Gecikmesi</label>
                    <p className="text-[11px] text-on-surface-variant">Raporun hazırlanıp müşteriye iletilme süresi (dakika)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={config.research_delay_minutes}
                      onChange={e => set({ research_delay_minutes: parseInt(e.target.value) || 1 })}
                      className="w-16 border border-outline rounded-lg px-2 py-1 text-center font-bold text-primary"
                    />
                    <span className="text-xs text-on-surface-variant">dakika</span>
                  </div>
                </div>

                <div className="flex items-start gap-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <Info size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] text-blue-700 leading-relaxed">
                    <strong>Tavsiye:</strong> Hemen verilen cevaplar "basit bir sorgu" algısı yaratabilir. 
                    <strong> 5-10 dakika</strong> arası bir gecikme, müşterinin "arkada gerçekten derin bir araştırma yapılıyor" 
                    şeklinde profesyonel bir algı edinmesini sağlar.
                  </p>
                </div>

                {!config.enabled_tools.includes('research_property') && (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded-lg text-[11px]">
                    <AlertCircle size={14} />
                    <span>Bu özelliğin çalışması için yukarıdaki <strong>Gayrimenkul Araştırma</strong> tool'unu aktif etmelisiniz.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Çalışma Saatleri */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-on-surface flex items-center gap-2">
                  <Clock size={16} /> Çalışma Saatleri
                </h2>
                <button onClick={() => set({ working_hours_enabled: !config.working_hours_enabled })}
                  className="flex items-center gap-1.5">
                  {config.working_hours_enabled
                    ? <ToggleRight size={28} className="text-primary" />
                    : <ToggleLeft size={28} className="text-on-surface-variant" />}
                  <span className="text-xs text-on-surface-variant">
                    {config.working_hours_enabled ? 'Açık' : 'Kapalı (7/24 yanıt)'}
                  </span>
                </button>
              </div>

              {config.working_hours_enabled && (
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <div>
                      <label className="block text-xs text-on-surface-variant mb-1">Başlangıç</label>
                      <input type="time" value={config.working_hours_start}
                        onChange={e => set({ working_hours_start: e.target.value })}
                        className="border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs text-on-surface-variant mb-1">Bitiş</label>
                      <input type="time" value={config.working_hours_end}
                        onChange={e => set({ working_hours_end: e.target.value })}
                        className="border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-on-surface-variant mb-1">Mesai dışı otomatik mesaj</label>
                    <textarea
                      value={config.outside_hours_message}
                      onChange={e => set({ outside_hours_message: e.target.value })}
                      rows={2}
                      className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                  </div>
                </div>
              )}
            </div>

            {/* Sohbet geçmişi */}
            <div className="card">
              <h2 className="font-semibold text-on-surface mb-3">Sohbet Hafızası</h2>
              <div className="flex items-center gap-4">
                <input type="range" min={0} max={20} value={config.max_history_messages}
                  onChange={e => set({ max_history_messages: +e.target.value })}
                  className="flex-1" />
                <span className="text-sm font-mono w-20 text-on-surface">
                  {config.max_history_messages === 0 ? 'Yok' : `${config.max_history_messages} mesaj`}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-1">
                AI her yanıtta önceki kaç mesajı bağlam olarak kullansın. Yüksek değer daha iyi bağlam sağlar.
              </p>
            </div>

            {/* Mesaj Birleştirme (Debounce) */}
            <div className="card">
              <h2 className="font-semibold text-on-surface mb-1">Mesaj Birleştirme</h2>
              <p className="text-xs text-on-surface-variant mb-3">
                Müşteri ardarda mesaj atarsa kaç saniye bekleyip hepsini tek cevapla yanıtlayalım. 0 = beklemeden hemen cevap.
              </p>
              <div className="flex items-center gap-4">
                <input type="range" min={0} max={20} value={config.debounce_seconds}
                  onChange={e => set({ debounce_seconds: +e.target.value })}
                  className="flex-1" />
                <span className="text-sm font-mono w-20 text-on-surface">
                  {config.debounce_seconds === 0 ? 'Anlık' : `${config.debounce_seconds} sn`}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
