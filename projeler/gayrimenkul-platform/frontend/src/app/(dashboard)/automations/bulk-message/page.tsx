'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import {
  Send, MessageSquare, Users, Tag, GraduationCap, Copy, CheckCircle,
  ChevronDown, ChevronUp, Filter, Sparkles,
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
  { label: 'Dr. / Uzm. / Op.', values: ['Dr.', 'Uzm. Dr.', 'Op. Dr.'], day: 'Tıp Bayramı (14 Mart)' },
  { label: 'Ecz.', values: ['Ecz.'], day: 'Eczacılar Günü (25 Nisan)' },
  { label: 'Dt.', values: ['Dt.'], day: 'Diş Hekimleri Günü (22 Mart)' },
  { label: 'Öğretmen', values: ['Öğretmen'], day: 'Öğretmenler Günü (24 Kasım)' },
  { label: 'Av.', values: ['Av.'], day: 'Avukatlar Günü (5 Nisan)' },
  { label: 'Müh.', values: ['Müh.'], day: 'Mühendisler Günü' },
  { label: 'Arh.', values: ['Arh.'], day: 'Mimarlar Günü' },
  { label: 'Prof. / Doç.', values: ['Prof.', 'Prof. Dr.', 'Doç.', 'Doç. Dr.', 'Yrd. Doç.'], day: 'Öğretmenler Günü (24 Kasım)' },
  { label: 'Psik.', values: ['Psik.'], day: '' },
  { label: 'Vet.', values: ['Vet.'], day: '' },
]

const QUICK_TEMPLATES = [
  {
    label: 'Ramazan Bayramı',
    text: 'Sayın {hitap} {isim},\n\nRamazan Bayramı\'nızı en içten dileklerimle kutlar, sağlık ve mutluluk dolu nice bayramlar dilerim. 🌙\n\nSaygılarımla',
  },
  {
    label: 'Kurban Bayramı',
    text: 'Sayın {hitap} {isim},\n\nKurban Bayramı\'nızı tebrik eder, bayramın huzur ve bereket getirmesini dilerim. 🌿\n\nSaygılarımla',
  },
  {
    label: 'Yılbaşı',
    text: 'Sayın {hitap} {isim},\n\nYeni yılın size sağlık, mutluluk ve başarı getirmesini diliyorum. İyi yıllar! 🎉\n\nSaygılarımla',
  },
  {
    label: 'Öğretmenler Günü',
    text: 'Sayın {hitap} {isim},\n\n24 Kasım Öğretmenler Günü\'nüzü kutlar, emekleriniz için teşekkür ederim. 📚\n\nSaygılarımla',
  },
  {
    label: 'Tıp Bayramı',
    text: 'Sayın {hitap} {isim},\n\n14 Mart Tıp Bayramı\'nızı kutlar, sağlıklı günler dilerim. 🏥\n\nSaygılarımla',
  },
  {
    label: 'Eczacılar Günü',
    text: 'Sayın {hitap} {isim},\n\n25 Nisan Eczacılar Günü\'nüzü kutlar, sağlıklı günler dilerim. 💊\n\nSaygılarımla',
  },
  {
    label: 'Genel Kutlama',
    text: 'Sayın {hitap} {isim},\n\nÖzel gününüzü en içten dileklerimle kutlarım. 🎊\n\nSaygılarımla',
  },
]

const PREDEFINED_TAGS = ['Emlakçı', 'VIP', 'Yatırımcı', 'Aktif Alıcı', 'Taşınma Planlıyor', 'Sektör Bağlantısı', 'Referans Kaynağı']

function personalizeMessage(template: string, contact: Contact): string {
  const hitap = contact.salutation || ''
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

  // Mesaj
  const [messageTemplate, setMessageTemplate] = useState(QUICK_TEMPLATES[0].text)
  const [showPreview, setShowPreview] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [allCopied, setAllCopied] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('clients')
        .select('id,full_name,salutation,phone,email,tags')
        .eq('is_active', true)
        .not('phone', 'is', null)
        .order('full_name')
        .limit(1000)
      if (data) setContacts(data as Contact[])
      setLoading(false)
    }
    load()
  }, [])

  // Tüm unique tag'ler
  const allTags = useMemo(() => {
    const set = new Set<string>()
    PREDEFINED_TAGS.forEach(t => set.add(t))
    contacts.forEach(c => (c.tags || []).forEach(t => set.add(t)))
    return Array.from(set)
  }, [contacts])

  // Tüm unique hitaplar
  const allSalutations = useMemo(() => {
    const set = new Set<string>()
    contacts.forEach(c => { if (c.salutation) set.add(c.salutation) })
    return Array.from(set).sort()
  }, [contacts])

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

  function toggleSalutation(sal: string) {
    setSelectedSalutations(prev => prev.includes(sal) ? prev.filter(s => s !== sal) : [...sal, ...prev])
  }

  function toggleSalutationGroup(values: string[]) {
    const allSelected = values.every(v => selectedSalutations.includes(v))
    if (allSelected) {
      setSelectedSalutations(prev => prev.filter(s => !values.includes(s)))
    } else {
      setSelectedSalutations(prev => [...new Set([...prev, ...values])])
    }
  }

  async function copyMessage(contact: Contact) {
    const msg = personalizeMessage(messageTemplate, contact)
    await navigator.clipboard.writeText(msg)
    setCopiedId(contact.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function copyAllMessages() {
    const all = filtered
      .map(c => {
        const msg = personalizeMessage(messageTemplate, c)
        return `--- ${c.full_name} ---\n${msg}`
      })
      .join('\n\n')
    await navigator.clipboard.writeText(all)
    setAllCopied(true)
    setTimeout(() => setAllCopied(false), 2500)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
          <Sparkles size={22} className="text-primary" />
          Toplu Mesaj Gönder
        </h1>
        <p className="text-on-surface-variant text-sm mt-1">
          Rehberden kişi seç, mesaj şablonu yaz, WhatsApp ile gönder
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Sol: Filtre + Mesaj ─── */}
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
            )}

            {filterMode === 'salutation' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {SALUTATION_GROUPS.map(group => {
                    const inDB = group.values.some(v => allSalutations.includes(v))
                    const count = filtered.filter(c => c.salutation && group.values.includes(c.salutation)).length
                    const allSel = group.values.every(v => selectedSalutations.includes(v))
                    if (!inDB && selectedSalutations.length === 0) return null
                    return (
                      <button key={group.label} type="button"
                        onClick={() => toggleSalutationGroup(group.values)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          allSel
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'border-outline text-on-surface-variant hover:border-purple-300'
                        }`}>
                        {group.label} {count > 0 && `(${count})`}
                      </button>
                    )
                  })}
                </div>
                {selectedSalutations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSalutations.map(s => (
                      <button key={s} type="button" onClick={() => toggleSalutation(s)}
                        className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full flex items-center gap-1 hover:bg-purple-200">
                        {s} ×
                      </button>
                    ))}
                  </div>
                )}
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
            <p className="text-xs text-on-surface-variant mt-2">
              Değişkenler: <code className="bg-surface-container-high px-1 rounded">{'{isim}'}</code> · <code className="bg-surface-container-high px-1 rounded">{'{hitap}'}</code>
            </p>
          </div>
        </div>

        {/* ─── Sağ: Önizleme + Gönder ─── */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-on-surface flex items-center gap-2">
                <Send size={16} /> Gönderim Listesi
                <span className="text-xs text-on-surface-variant font-normal">({filtered.length} kişi)</span>
              </h2>
              <div className="flex gap-2">
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
              <div className="text-center py-8 text-on-surface-variant text-sm">Yükleniyor...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant text-sm">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                Filtreyle eşleşen kişi bulunamadı
              </div>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {filtered.map(contact => {
                  const waNum = phoneToWA(contact.phone)
                  const msg = personalizeMessage(messageTemplate, contact)
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
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                              <MessageSquare size={12} /> WA
                            </a>
                          )}
                          <button type="button" onClick={() => copyMessage(contact)}
                            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
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
