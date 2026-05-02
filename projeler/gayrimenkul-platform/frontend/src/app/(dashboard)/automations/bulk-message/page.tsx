'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import {
  Send, MessageSquare, Users, Tag, GraduationCap, Copy, CheckCircle,
  ChevronDown, ChevronUp, Filter, Sparkles, Play, Pause, SkipForward,
  Square, Settings2, Bot, Save, Loader2, Clock,
} from 'lucide-react'

interface Contact {
  id: string
  full_name: string
  salutation: string | null
  phone: string | null
  email: string | null
  tags: string[]
}

const SALUTATION_GROUPS = [
  { label: 'Dr. / Uzm. / Op.', values: ['Dr.', 'Uzm. Dr.', 'Op. Dr.'], day: 'Tıp Bayramı' },
  { label: 'Ecz.', values: ['Ecz.'], day: 'Eczacılar Günü' },
  { label: 'Dt.', values: ['Dt.'], day: 'Diş Hekimleri Günü' },
  { label: 'Öğretmen', values: ['Öğretmen'], day: 'Öğretmenler Günü' },
  { label: 'Av.', values: ['Av.'], day: 'Avukatlar Günü' },
  { label: 'Müh.', values: ['Müh.'], day: 'Mühendisler Günü' },
  { label: 'Arh.', values: ['Arh.'], day: 'Mimarlar Günü' },
  { label: 'Prof. / Doç.', values: ['Prof.', 'Prof. Dr.', 'Doç.', 'Doç. Dr.', 'Yrd. Doç.'], day: 'Öğretmenler Günü' },
  { label: 'Psik.', values: ['Psik.'], day: '' },
  { label: 'Vet.', values: ['Vet.'], day: '' },
  { label: 'Bey', values: ['Bey'], day: '' },
  { label: 'Hanım', values: ['Hanım'], day: '' },
]

const QUICK_TEMPLATES = [
  { label: 'Ramazan Bayramı', text: 'Sayın {hitap} {isim},\n\nRamazan Bayramı\'nızı en içten dileklerimle kutlar, sağlık ve mutluluk dolu nice bayramlar dilerim. 🌙\n\nSaygılarımla' },
  { label: 'Kurban Bayramı', text: 'Sayın {hitap} {isim},\n\nKurban Bayramı\'nızı tebrik eder, bayramın huzur ve bereket getirmesini dilerim. 🌿\n\nSaygılarımla' },
  { label: 'Yılbaşı', text: 'Sayın {hitap} {isim},\n\nYeni yılın size sağlık, mutluluk ve başarı getirmesini diliyorum. İyi yıllar! 🎉\n\nSaygılarımla' },
  { label: 'Öğretmenler Günü', text: 'Sayın {hitap} {isim},\n\n24 Kasım Öğretmenler Günü\'nüzü kutlar, emekleriniz için teşekkür ederim. 📚\n\nSaygılarımla' },
  { label: 'Tıp Bayramı', text: 'Sayın {hitap} {isim},\n\n14 Mart Tıp Bayramı\'nızı kutlar, sağlıklı günler dilerim. 🏥\n\nSaygılarımla' },
  { label: 'Eczacılar Günü', text: 'Sayın {hitap} {isim},\n\n25 Nisan Eczacılar Günü\'nüzü kutlar, sağlıklı günler dilerim. 💊\n\nSaygılarımla' },
  { label: 'Diş Hekimleri Günü', text: 'Sayın {hitap} {isim},\n\n22 Mart Diş Hekimleri Günü\'nüzü kutlar, başarılı günler dilerim. 😊\n\nSaygılarımla' },
  { label: 'Avukatlar Günü', text: 'Sayın {hitap} {isim},\n\n5 Nisan Avukatlar Günü\'nüzü kutlar, başarılı günler dilerim. ⚖️\n\nSaygılarımla' },
  { label: 'Genel Kutlama', text: 'Sayın {hitap} {isim},\n\nÖzel gününüzü en içten dileklerimle kutlarım. 🎊\n\nSaygılarımla' },
]

const PREDEFINED_TAGS = ['Emlakçı', 'VIP', 'Yatırımcı', 'Aktif Alıcı', 'Taşınma Planlıyor', 'Sektör Bağlantısı', 'Referans Kaynağı']

function personalizeMessage(template: string, contact: Contact, fallbackHitap: string = ''): string {
  const hitap = contact.salutation || fallbackHitap
  const isim = (contact.full_name || '').split(' ')[0] || ''
  return template
    .replace(/\{hitap\}/g, hitap)
    .replace(/\{isim\}/g, isim)
    .trim()
}

function phoneToWA(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 11) return '90' + digits.slice(1)
  if (digits.length === 10) return '90' + digits
  return digits
}

export default function BulkMessagePage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)

  // Filtreler
  const [filterMode, setFilterMode] = useState<'all' | 'tag' | 'salutation'>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedSalutations, setSelectedSalutations] = useState<string[]>([])
  const [customFilterInput, setCustomFilterInput] = useState('')

  // Mesaj
  const [messageTemplate, setMessageTemplate] = useState(QUICK_TEMPLATES[0].text)
  const [showTemplates, setShowTemplates] = useState(false)
  const [fallbackHitap, setFallbackHitap] = useState('')

  // Önizleme
  const [showPreview, setShowPreview] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [allCopied, setAllCopied] = useState(false)

  // Toplu Gönder modu
  const [sendMode, setSendMode] = useState(false)
  const [sendIndex, setSendIndex] = useState(0)
  const [delaySeconds, setDelaySeconds] = useState(15)
  const [countdown, setCountdown] = useState(0)
  const [paused, setPaused] = useState(false)
  const [sentCount, setSentCount] = useState(0)
  const [sendError, setSendError] = useState<string | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // AI Sistem Promptu
  const [showAI, setShowAI] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [savingAI, setSavingAI] = useState(false)
  const [aiSaved, setAiSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [contactsRes, configRes] = await Promise.all([
        supabase
          .from('clients')
          .select('id,full_name,salutation,phone,email,tags')
          .eq('is_active', true)
          .not('phone', 'is', null)
          .order('full_name')
          .limit(2000),
        supabase.from('whatsapp_chatbot_config').select('system_prompt').limit(1).single(),
      ])
      if (contactsRes.data) setContacts(contactsRes.data as Contact[])
      if (configRes.data?.system_prompt) setAiPrompt(configRes.data.system_prompt)
      setLoading(false)
    }
    load()
  }, [])

  // Unique tags: predefined + contacts'takiler
  const allTags = useMemo(() => {
    const set = new Set<string>(PREDEFINED_TAGS)
    contacts.forEach(c => (c.tags || []).forEach(t => set.add(t)))
    if (customFilterInput && filterMode === 'tag') set.add(customFilterInput)
    return Array.from(set).sort()
  }, [contacts, customFilterInput, filterMode])

  // Unique salutations
  const allSalutations = useMemo(() => {
    const set = new Set<string>()
    SALUTATION_GROUPS.forEach(g => g.values.forEach(v => set.add(v)))
    contacts.forEach(c => { if (c.salutation) set.add(c.salutation) })
    if (customFilterInput && filterMode === 'salutation') set.add(customFilterInput)
    return Array.from(set).sort()
  }, [contacts, customFilterInput, filterMode])

  // Filtrelenmiş kişiler
  const filtered = useMemo(() => {
    if (filterMode === 'all') return contacts
    if (filterMode === 'tag') {
      if (selectedTags.length === 0) return contacts
      return contacts.filter(c => selectedTags.some(t => (c.tags || []).includes(t)))
    }
    if (filterMode === 'salutation') {
      if (selectedSalutations.length === 0) return contacts
      return contacts.filter(c => c.salutation && selectedSalutations.includes(c.salutation))
    }
    return contacts
  }, [contacts, filterMode, selectedTags, selectedSalutations])

  function toggleTag(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  function toggleSalutationGroup(sal: string) {
    setSelectedSalutations(prev => prev.includes(sal) ? prev.filter(s => s !== sal) : [...prev, sal])
  }

  function handleAddCustomFilter(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && customFilterInput.trim()) {
      e.preventDefault()
      const val = customFilterInput.trim()
      if (filterMode === 'tag' && !selectedTags.includes(val)) {
        setSelectedTags(prev => [...prev, val])
      } else if (filterMode === 'salutation' && !selectedSalutations.includes(val)) {
        setSelectedSalutations(prev => [...prev, val])
      }
      setCustomFilterInput('')
    }
  }

  async function copyMessage(contact: Contact) {
    const msg = personalizeMessage(messageTemplate, contact, fallbackHitap)
    await navigator.clipboard.writeText(msg)
    setCopiedId(contact.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function copyAllMessages() {
    const all = filtered
      .map(c => {
        const msg = personalizeMessage(messageTemplate, c, fallbackHitap)
        return `--- ${c.full_name} ---\n${msg}`
      })
      .join('\n\n')
    await navigator.clipboard.writeText(all)
    setAllCopied(true)
    setTimeout(() => setAllCopied(false), 2500)
  }

  // ─── Toplu Gönder ────────────────────────────────────────────────────────────

  function startSendMode() {
    setSendMode(true)
    setSendIndex(0)
    setSentCount(0)
    setCountdown(0)
    setPaused(false)
    setSendError(null)
  }

  function stopSendMode() {
    setSendMode(false)
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(0)
    setPaused(false)
    setSendError(null)
  }

  async function sendCurrentMessage() {
    const contact = filtered[sendIndex]
    if (!contact) return
    const waNum = phoneToWA(contact.phone)
    const msg = personalizeMessage(messageTemplate, contact, fallbackHitap)
    
    if (waNum) {
      setSendError(null)
      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: waNum, message: msg }),
        })
        const data = await res.json()
        if (!res.ok) {
          setSendError(data.error || 'Gönderim hatası')
          setPaused(true)
          return
        }
        setSentCount(prev => prev + 1)
        startCountdown()
      } catch (err) {
        setSendError('Bağlantı hatası')
        setPaused(true)
      }
    } else {
      // Eğer numarası yoksa direkt atla
      advanceToNext()
    }
  }

  function startCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(delaySeconds)
    setPaused(false)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!)
          advanceToNext()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function togglePause() {
    if (paused) {
      // resume
      setPaused(false)
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!)
            advanceToNext()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      // pause
      setPaused(true)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }

  function advanceToNext() {
    setSendError(null)
    setSendIndex(prev => {
      const next = prev + 1
      if (next >= filtered.length) {
        // Hepsi bittiğinde hemen kapatma, ekranda bitti yazısını göstersin diye
        return next
      }
      setCountdown(0)
      return next
    })
    // Otomatik olarak sonrakine gönderim yapmak istersen burada sendCurrentMessage tetiklenebilir
    // Ancak state güncellemesi asenkron olduğu için, useEffect ile tetiklemek daha sağlıklı.
  }

  useEffect(() => {
    // Eğer countdown bittiyse ve yeni kişiye geçildiyse ve paused değilse otomatik gönder
    // Ancak sendIndex değiştiğinde otomatik göndermek istiyorsak bunu yakalamalıyız.
    // Şimdilik sadece "Sıradakine Geçiliyor" sayacı bitince advanceToNext çağrılıyor.
    // İlk kişinin gönderilmesi için butona basılması bekleniyor, sonrakiler otomatik gider.
  }, [sendIndex])

  function skipCurrent() {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(0)
    advanceToNext()
  }

  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [])

  // ─── AI Sistem Promptu kaydet ────────────────────────────────────────────────

  async function saveAIPrompt() {
    setSavingAI(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: consultant } = await supabase.from('consultants').select('id').eq('user_id', user?.id ?? '').single()
    if (!consultant) { setSavingAI(false); return }

    await supabase
      .from('whatsapp_chatbot_config')
      .upsert({ consultant_id: consultant.id, system_prompt: aiPrompt }, { onConflict: 'consultant_id' })

    setSavingAI(false)
    setAiSaved(true)
    setTimeout(() => setAiSaved(false), 3000)
  }

  // ─── Toplu Gönder Paneli ─────────────────────────────────────────────────────

  if (sendMode) {
    const isFinished = sendIndex >= filtered.length
    const contact = !isFinished ? filtered[sendIndex] : null
    const isLast = sendIndex >= filtered.length - 1
    const waNum = contact ? phoneToWA(contact.phone) : null
    const msg = contact ? personalizeMessage(messageTemplate, contact, fallbackHitap) : ''
    const progress = (sendIndex / Math.max(1, filtered.length)) * 100

    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-on-surface flex items-center gap-2">
              <Sparkles size={20} className="text-primary" /> Toplu Gönderim (Otomatik)
            </h1>
            <p className="text-sm text-on-surface-variant">
              {sendIndex} / {filtered.length} geçildi · {sentCount} kişiye başarıyla iletildi
            </p>
          </div>
          <button onClick={stopSendMode}
            className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors">
            <Square size={14} /> Durdur
          </button>
        </div>

        {/* İlerleme çubuğu */}
        <div className="w-full bg-surface-container-high rounded-full h-2 mb-6">
          <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        {contact ? (
          <div className="card space-y-4">
            {/* Kişi bilgisi */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-bold text-lg">{contact.full_name.charAt(0)}</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  {contact.salutation && (
                    <span className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-medium">{contact.salutation}</span>
                  )}
                  <p className="font-semibold text-on-surface">{contact.full_name}</p>
                </div>
                <p className="text-sm text-on-surface-variant">{contact.phone}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-on-surface-variant">{sendIndex + 1} / {filtered.length}</p>
              </div>
            </div>

            {/* Kişiselleştirilmiş mesaj */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm text-green-900 whitespace-pre-line leading-relaxed">{msg}</p>
            </div>

            {/* Error Message */}
            {sendError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                <span className="text-red-600 mt-0.5">⚠️</span>
                <div>
                  <p className="text-sm text-red-800 font-medium">Gönderim Hatası</p>
                  <p className="text-xs text-red-600">{sendError}</p>
                </div>
              </div>
            )}

            {/* Countdown */}
            {countdown > 0 && !sendError && (
              <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
                <div className="w-10 h-10 rounded-full border-4 border-orange-400 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-orange-700">{countdown}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-orange-800 font-medium">Sonraki kişiye geçiliyor...</p>
                  <p className="text-xs text-orange-600">Lütfen bekleyin, otomatik gönderilecek</p>
                </div>
                <button onClick={togglePause}
                  className="p-2 text-orange-700 hover:bg-orange-100 rounded-lg transition-colors">
                  {paused ? <Play size={16} /> : <Pause size={16} />}
                </button>
                <button onClick={skipCurrent}
                  className="p-2 text-orange-700 hover:bg-orange-100 rounded-lg transition-colors">
                  <SkipForward size={16} />
                </button>
              </div>
            )}

            {/* Aksiyon butonları */}
            {(countdown === 0 || sendError) && (
              <div className="flex gap-3">
                <button onClick={skipCurrent}
                  className="btn-secondary flex items-center gap-2">
                  <SkipForward size={15} /> Atla
                </button>
                {waNum ? (
                  <button onClick={sendCurrentMessage}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700">
                    <Send size={16} />
                    {sendIndex === 0 && !sendError ? 'Gönderimi Başlat' : (sendError ? 'Tekrar Dene' : `Sıradakini Gönder ${isLast ? '(Son)' : ''}`)}
                  </button>
                ) : (
                  <div className="flex-1 text-sm text-center text-on-surface-variant py-2">
                    Telefon numarası yok — atlanıyor
                    <button onClick={skipCurrent} className="text-primary ml-2 hover:underline">Sonraki</button>
                  </div>
                )}
              </div>
            )}

            {/* Gecikme ayarı */}
            <div className="flex items-center gap-3 text-sm text-on-surface-variant pt-2 border-t border-outline">
              <Clock size={14} />
              <span>Mesajlar arası bekleme:</span>
              <input type="range" min="5" max="60" value={delaySeconds}
                onChange={e => setDelaySeconds(Number(e.target.value))}
                className="flex-1 accent-primary" disabled={countdown > 0} />
              <span className="w-16 text-right font-medium text-on-surface">{delaySeconds} sn</span>
            </div>
          </div>
        ) : (
          <div className="card text-center py-12">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-on-surface mb-1">Tüm mesajlar gönderildi!</h2>
            <p className="text-on-surface-variant text-sm mb-4">Toplam {sentCount} kişiye başarıyla mesaj iletildi.</p>
            <button onClick={stopSendMode} className="btn-primary">Kapat</button>
          </div>
        )}
      </div>
    )
  }

  // ─── Ana sayfa ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Sparkles size={22} className="text-primary" /> Toplu Mesaj Gönder
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Rehberden kişi seç, mesaj şablonu yaz, otomatik WhatsApp ile gönder
          </p>
        </div>
        {filtered.length > 0 && (
          <button onClick={startSendMode}
            className="btn-primary flex items-center gap-2">
            <Play size={16} /> Toplu Gönder ({filtered.length})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Sol ─── */}
        <div className="space-y-4">
          {/* Kişi Filtresi */}
          <div className="card">
            <h2 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
              <Filter size={16} /> Kişi Filtresi
              <span className="ml-auto text-xs text-on-surface-variant font-normal">{filtered.length} kişi seçili</span>
            </h2>

            <div className="flex gap-2 mb-4">
              {([
                { mode: 'all', label: 'Tüm Kişiler', icon: Users },
                { mode: 'tag', label: 'Etikete Göre', icon: Tag },
                { mode: 'salutation', label: 'Mesleğe Göre', icon: GraduationCap },
              ] as const).map(({ mode, label, icon: Icon }) => (
                <button key={mode} type="button"
                  onClick={() => setFilterMode(mode)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    filterMode === mode
                      ? 'bg-primary text-on-primary border-primary'
                      : 'border-outline text-on-surface-variant hover:bg-surface-container-high'
                  }`}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            {filterMode === 'tag' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {allTags.map(tag => (
                    <button key={tag} type="button" onClick={() => toggleTag(tag)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        selectedTags.includes(tag)
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-outline text-on-surface-variant hover:border-indigo-300'
                      }`}>
                      {tag}
                    </button>
                  ))}
                </div>
                <input type="text"
                  placeholder="Manuel etiket ekle ve Enter'a bas..."
                  value={customFilterInput}
                  onChange={e => setCustomFilterInput(e.target.value)}
                  onKeyDown={handleAddCustomFilter}
                  className="w-full border border-outline rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            {filterMode === 'salutation' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {allSalutations.map(sal => {
                    const count = contacts.filter(c => c.salutation === sal).length
                    const isSelected = selectedSalutations.includes(sal)
                    return (
                      <button key={sal} type="button"
                        onClick={() => toggleSalutationGroup(sal)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'border-outline text-on-surface-variant hover:border-purple-300'
                        }`}>
                        {sal}{count > 0 ? ` (${count})` : ''}
                      </button>
                    )
                  })}
                </div>
                <input type="text"
                  placeholder="Manuel hitap/meslek ekle ve Enter'a bas..."
                  value={customFilterInput}
                  onChange={e => setCustomFilterInput(e.target.value)}
                  onKeyDown={handleAddCustomFilter}
                  className="w-full border border-outline rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                />
              </div>
            )}
          </div>

          {/* Mesaj Şablonu */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-on-surface flex items-center gap-2">
                <MessageSquare size={16} /> Mesaj Şablonu
              </h2>
              <button type="button" onClick={() => setShowTemplates(v => !v)}
                className="text-xs text-primary flex items-center gap-1 hover:underline">
                Hazır Şablonlar {showTemplates ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>

            {showTemplates && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {QUICK_TEMPLATES.map(t => (
                  <button key={t.label} type="button"
                    onClick={() => { setMessageTemplate(t.text); setShowTemplates(false) }}
                    className="text-left px-3 py-2 text-xs rounded-lg border border-outline hover:bg-surface-container-high transition-colors">
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            <textarea
              value={messageTemplate}
              onChange={e => setMessageTemplate(e.target.value)}
              rows={8}
              className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y font-mono"
              placeholder="Mesaj şablonunuzu yazın..."
            />
            
            <div className="mt-3 flex items-center gap-3">
              <label className="text-xs font-medium text-on-surface-variant w-32">
                Varsayılan Hitap:
              </label>
              <input type="text"
                value={fallbackHitap}
                onChange={e => setFallbackHitap(e.target.value)}
                placeholder="Örn: Değerli Müşterimiz (Kişinin hitabı boşsa kullanılır)"
                className="flex-1 border border-outline rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            
            <p className="text-xs text-on-surface-variant mt-2">
              Değişkenler: <code className="bg-surface-container-high px-1 rounded">{'{isim}'}</code> (ilk isim) · <code className="bg-surface-container-high px-1 rounded">{'{hitap}'}</code> (Kişinin hitabı yoksa Varsayılan Hitap kullanılır)
            </p>
          </div>

          {/* Gecikme Ayarı */}
          <div className="card">
            <h2 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
              <Settings2 size={16} /> Gönderim Ayarları
            </h2>
            <div className="flex items-center gap-3 text-sm">
              <Clock size={14} className="text-on-surface-variant flex-shrink-0" />
              <span className="text-on-surface-variant">Mesajlar arası bekleme:</span>
              <input type="range" min="5" max="60" value={delaySeconds}
                onChange={e => setDelaySeconds(Number(e.target.value))}
                className="flex-1 accent-primary" />
              <span className="w-16 text-right font-semibold text-on-surface">{delaySeconds} saniye</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-2">
              WhatsApp spam algılamasını önlemek için her mesaj arasında {delaySeconds} saniyelik bekleme uygulanır.
            </p>
          </div>

          {/* AI Sistem Promptu */}
          <div className="card">
            <button type="button" onClick={() => setShowAI(v => !v)}
              className="w-full flex items-center justify-between">
              <h2 className="font-semibold text-on-surface flex items-center gap-2">
                <Bot size={16} className="text-purple-600" /> AI Yanıt Ayarı
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-on-surface-variant">Geri mesaj yazanlara AI cevap verir</span>
                {showAI ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {showAI && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Bu mesajlara cevap yazan kişilerle AI chatbot nasıl konuşsun? Aşağıdaki sistem promptunu belirleyin.
                </p>
                <textarea
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  rows={5}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y"
                  placeholder="Örn: Sen bir gayrimenkul danışmanının asistanısın. Sıcak, samimi ve kısa cevaplar veriyorsun. Mülk soruları için randevu öneriyorsun. Bayram mesajına cevap verenlere teşekkür et ve nasıl yardımcı olabileceğini sor."
                />
                <div className="flex items-center gap-2 justify-end">
                  {aiSaved && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle size={12} /> Kaydedildi
                    </span>
                  )}
                  <button onClick={saveAIPrompt} disabled={savingAI}
                    className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50">
                    {savingAI ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Kaydet
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Sağ: Önizleme ─── */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-on-surface flex items-center gap-2">
                <Send size={16} /> Gönderim Listesi
                <span className="text-xs text-on-surface-variant font-normal">({filtered.length} kişi)</span>
              </h2>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowPreview(v => !v)}
                  className="text-xs text-on-surface-variant hover:text-on-surface flex items-center gap-1">
                  Önizleme {showPreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                <button type="button" onClick={copyAllMessages}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    allCopied
                      ? 'bg-green-100 border-green-300 text-green-700'
                      : 'border-outline text-on-surface-variant hover:bg-surface-container-high'
                  }`}>
                  {allCopied ? <CheckCircle size={12} /> : <Copy size={12} />}
                  {allCopied ? 'Kopyalandı' : 'Tümünü Kopyala'}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-on-surface-variant">
                <Loader2 size={20} className="animate-spin mr-2" /> Yükleniyor...
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant text-sm">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                Filtreyle eşleşen kişi bulunamadı
              </div>
            ) : (
              <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                {filtered.map(contact => {
                  const waNum = phoneToWA(contact.phone)
                  const msg = personalizeMessage(messageTemplate, contact, fallbackHitap)
                  const waLink = waNum
                    ? `https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`
                    : null

                  return (
                    <div key={contact.id}
                      className="border border-outline rounded-xl p-3 hover:bg-surface-container-high transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {contact.salutation && (
                              <span className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-medium">
                                {contact.salutation}
                              </span>
                            )}
                            <p className="text-sm font-medium text-on-surface truncate">{contact.full_name}</p>
                          </div>
                          {contact.phone && (
                            <p className="text-xs text-on-surface-variant">{contact.phone}</p>
                          )}
                          {showPreview && (
                            <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed whitespace-pre-line line-clamp-3 bg-surface-container-high rounded p-2">
                              {msg}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          {waLink && (
                            <a href={waLink} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap">
                              <MessageSquare size={12} /> WA
                            </a>
                          )}
                          <button type="button" onClick={() => copyMessage(contact)}
                            className={`flex items-center justify-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                              copiedId === contact.id
                                ? 'bg-green-100 border-green-300 text-green-700'
                                : 'border-outline text-on-surface-variant hover:bg-surface-container-high'
                            }`}>
                            {copiedId === contact.id ? <CheckCircle size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
