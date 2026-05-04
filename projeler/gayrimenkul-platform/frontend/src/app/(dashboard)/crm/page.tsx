'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Client, LeadStatus, ClientType } from '@/lib/types'
import {
  Search,
  Plus,
  Phone,
  Mail,
  ChevronRight,
  Users,
  Clock,
  TrendingUp,
  CheckCircle,
  Upload,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react'

const statusColors: Record<LeadStatus, string> = {
  new: 'bg-primary-container text-primary',
  contacted: 'bg-purple-100 text-purple-700',
  qualified: 'bg-yellow-100 text-yellow-700',
  negotiating: 'bg-orange-100 text-orange-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
  dormant: 'bg-surface-container-high text-on-surface-variant',
}

const statusLabels: Record<LeadStatus, string> = {
  new: 'Yeni',
  contacted: 'İletişime Geçildi',
  qualified: 'Nitelikli',
  negotiating: 'Müzakere',
  won: 'Kazanıldı',
  lost: 'Kaybedildi',
  dormant: 'Pasif',
}

const typeLabels: Record<ClientType, string> = {
  buyer: 'Alıcı',
  seller: 'Satıcı',
  both: 'Alıcı & Satıcı',
  investor: 'Yatırımcı',
  tenant: 'Kiracı',
  landlord: 'Ev Sahibi',
  network: 'Ağ / Tanışık',
}

// ─── VCF Parser ──────────────────────────────────────────────────────────────

function decodeQP(str: string): string {
  // Quoted-Printable soft line breaks: "=" followed by optional whitespace and newline or end of string
  const joined = str.replace(/=[ \t]*(\r?\n|$)/g, '')

  // Decode =XX hex sequences → byte array → UTF-8 string
  const bytes: number[] = []
  let i = 0
  while (i < joined.length) {
    if (joined[i] === '=' && i + 2 < joined.length) {
      const hex = joined.substring(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16))
        i += 3
        continue
      }
    }
    bytes.push(joined.charCodeAt(i) & 0xff)
    i++
  }
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  } catch (err) {
    console.error('QP decode error:', err)
    return joined
  }
}

function decodeFieldValue(params: string[], value: string): string {
  const isQP = params.some(p => /ENCODING=QUOTED-PRINTABLE/i.test(p))
  if (isQP) return decodeQP(value)
  return value
}

interface ParsedContact {
  full_name: string
  salutation: string
  phone: string
  email: string
  org: string
  notes: string
}

function detectSalutation(name: string): { cleanName: string; salutation: string; extraNotes: string } {
  let salutation = ''
  let cleanName = name.trim()
  let extraNotes = ''

  // 1. Professional prefixes (Dr., Av., Prof. etc.)
  const prefixRules: [RegExp, string][] = [
    [/^Prof\.\s*Dr\.\s*/i, 'Prof. Dr.'],
    [/^Doç\.\s*Dr\.\s*/i, 'Doç. Dr.'],
    [/^Uzm\.\s*Dr\.\s*/i, 'Uzm. Dr.'],
    [/^Yrd\.\s*Doç\.\s*/i, 'Yrd. Doç.'],
    [/^Op\.\s*Dr\.\s*/i, 'Op. Dr.'],
    [/^Dr\.\s*/i, 'Dr.'],
    [/^Av\.\s*/i, 'Av.'],
    [/^Prof\.\s*/i, 'Prof.'],
    [/^Doç\.\s*/i, 'Doç.'],
    [/^Uzm\.\s*/i, 'Uzm.'],
    [/^Mh\.\s*/i, 'Mh.'],
    [/^Müh\.\s*/i, 'Müh.'],
  ]

  for (const [re, sal] of prefixRules) {
    if (re.test(cleanName)) {
      salutation = sal
      cleanName = cleanName.replace(re, '').trim()
      break
    }
  }

  // 2. Ayraçlara göre bölme ( - , ( ) [ ] | : / )
  const separators = /[-|:()\[\]/]/
  const sepMatch = cleanName.match(separators)
  if (sepMatch) {
    const idx = sepMatch.index!
    const suffix = cleanName.substring(idx).replace(/[()\[\]]/g, '').trim()
    if (suffix && suffix !== '-') {
      extraNotes = suffix
    }
    cleanName = cleanName.substring(0, idx).trim()
  }

  // 3. Turkish honorifics (Bey, Hanım, Efendi) - search in middle
  const honorifics = ['Bey', 'Hanım', 'Efendi']
  const words = cleanName.split(/\s+/)
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[.,]/g, '')
    const foundHon = honorifics.find(h => h.toLocaleLowerCase('tr-TR') === word.toLocaleLowerCase('tr-TR'))
    if (foundHon) {
      salutation = foundHon
      const namePart = words.slice(0, i).join(' ')
      const rest = words.slice(i + 1).join(' ')
      extraNotes = extraNotes ? `${rest} ${extraNotes}`.trim() : rest.trim()
      cleanName = namePart
      return { cleanName: cleanName.trim(), salutation, extraNotes: extraNotes.trim() }
    }
  }

  // 4. Kelime sayısına göre bölme (İlk 2 kelime isim-soyisim, kalanı not)
  const finalWords = cleanName.split(/\s+/)
  if (finalWords.length > 2) {
    cleanName = finalWords.slice(0, 2).join(' ')
    const rest = finalWords.slice(2).join(' ')
    extraNotes = extraNotes ? `${rest} ${extraNotes}`.trim() : rest.trim()
  }

  return { cleanName: cleanName.trim(), salutation, extraNotes: extraNotes.trim() }
}

/**
 * Telefon numaralarını +90 formatına normalize eder.
 */
function formatPhone(phone: string): string {
  if (!phone) return ''
  
  // Sadece rakamları ve + işaretini temizle
  let cleaned = phone.replace(/[^\d+]/g, '')
  
  // Sadece rakamlar
  let digits = cleaned.replace(/\D/g, '')
  
  // 1. Durum: 5321234567 (10 hane) -> +905321234567
  if (digits.length === 10 && digits.startsWith('5')) {
    return '+90' + digits
  }
  
  // 2. Durum: 05321234567 (11 hane) -> +905321234567
  if (digits.length === 11 && digits.startsWith('05')) {
    return '+90' + digits.substring(1)
  }
  
  // 3. Durum: 905321234567 (12 hane) -> +905321234567
  if (digits.length === 12 && digits.startsWith('90')) {
    return '+' + digits
  }
  
  // 4. Durum: Zaten +905321234567 formatındaysa olduğu gibi bırak
  if (cleaned.startsWith('+90') && digits.length === 12) {
    return cleaned
  }
  
  // Diğer durumlar (yabancı numaralar vb.): Eğer + yoksa ekle
  return cleaned.startsWith('+') ? cleaned : (cleaned ? '+' + cleaned : '')
}

function parseVCF(text: string): ParsedContact[] {
  const contacts: ParsedContact[] = []

  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Split into vCard blocks
  const cardBlocks = normalized.split(/^BEGIN:VCARD$/im)

  for (const block of cardBlocks.slice(1)) {
    // 1. RFC 2425 unfolding: satır başında boşluk/tab varsa önceki satıra ekle
    const unfolded = block.replace(/\n[ \t]/g, '')

    // 2. vCard 2.1 QP unfolding: join lines ending with "=" (possibly with spaces)
    const qpJoined = unfolded.replace(/=[ \t]*\n/g, '')

    const lines = qpJoined.split('\n')

    let fn = ''
    let phone = ''
    let email = ''
    let org = ''
    let notes = ''

    for (const line of lines) {
      if (!line || /^END:VCARD/i.test(line)) continue

      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue

      const propPart = line.substring(0, colonIdx)
      const valuePart = line.substring(colonIdx + 1).trim()

      const propSegments = propPart.split(';')
      const propName = propSegments[0].toUpperCase()
      const params = propSegments.slice(1)

      const decoded = decodeFieldValue(params, valuePart)

      if (propName === 'FN') {
        fn = decoded.trim()
      } else if (propName === 'N' && !fn) {
        // N format: Last;First;Middle;Prefix;Suffix
        const parts = decoded.split(';')
        const last = parts[0]?.trim() || ''
        const first = parts[1]?.trim() || ''
        fn = [first, last].filter(Boolean).join(' ')
      } else if (propName === 'TEL') {
        if (!phone && valuePart.trim()) {
          phone = formatPhone(valuePart.trim())
        }
      } else if (propName === 'EMAIL') {
        if (!email) email = decoded.trim()
      } else if (propName === 'ORG') {
        org = decoded.split(';')[0].trim()
      } else if (propName === 'NOTE') {
        notes = decoded.trim()
      }
    }

    if (!fn || !phone) continue
    
    // Parse the name and check for extra descriptive parts to put in notes
    const { cleanName, salutation, extraNotes } = detectSalutation(fn)
    
    // Merge extra notes from name with existing NOTE field
    let combinedNotes = notes
    if (extraNotes) {
      combinedNotes = combinedNotes ? `${extraNotes} | ${combinedNotes}` : extraNotes
    }

    contacts.push({
      full_name: cleanName || fn,
      salutation,
      phone,
      email,
      org,
      notes: combinedNotes,
    })
  }

  return contacts
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CRMPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<LeadStatus | 'all'>('all')
  const [filterType, setFilterType] = useState<ClientType | 'all'>('all')
  const [stats, setStats] = useState({ total: 0, newLead: 0, negotiating: 0, won: 0 })

  // VCF import state
  const [showImport, setShowImport] = useState(false)
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; skip: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchClients()
  }, [filterStatus, filterType])

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: myConsultant } = await supabase.from('consultants').select('id, role').eq('user_id', user?.id ?? '').single()
    const isAdmin = myConsultant?.role === 'admin'
    const myId = myConsultant?.id

    const base = () => {
      let q = supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_active', true)
      if (!isAdmin && myId) q = q.eq('assigned_consultant_id', myId)
      return q
    }

    const [total, newLead, negotiating, won] = await Promise.all([
      base(),
      base().eq('lead_status', 'new'),
      base().eq('lead_status', 'negotiating'),
      base().eq('lead_status', 'won'),
    ])
    setStats({
      total: total.count || 0,
      newLead: newLead.count || 0,
      negotiating: negotiating.count || 0,
      won: won.count || 0,
    })
  }

  async function fetchClients() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: myConsultant } = await supabase.from('consultants').select('id, role').eq('user_id', user?.id ?? '').single()
    const isAdmin = myConsultant?.role === 'admin'
    const myId = myConsultant?.id

    let query = supabase
      .from('clients')
      .select('*, consultant:consultants(full_name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(0, 9999)

    if (!isAdmin && myId) query = query.eq('assigned_consultant_id', myId)
    if (filterStatus !== 'all') query = query.eq('lead_status', filterStatus)
    if (filterType !== 'all') query = query.eq('client_type', filterType)

    const { data, error } = await query
    if (!error && data) setClients(data as Client[])
    setLoading(false)
  }

  const filtered = clients.filter((c) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      c.full_name.toLowerCase().includes(s) ||
      c.phone?.includes(s) ||
      c.email?.toLowerCase().includes(s)
    )
  })

  // ── VCF handlers ──

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const contacts = parseVCF(text)
      setParsedContacts(contacts)
      setSelected(new Set(contacts.map((_, i) => i)))
      setImportResult(null)
    }
    reader.readAsText(file, 'utf-8')
  }

  function toggleSelect(i: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === parsedContacts.length) setSelected(new Set())
    else setSelected(new Set(parsedContacts.map((_, i) => i)))
  }

  async function handleImport() {
    if (selected.size === 0) return
    setImporting(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: consultant } = await supabase
      .from('consultants').select('id').eq('user_id', user?.id).single()

    const rows = Array.from(selected).map(i => {
      const c = parsedContacts[i]
      const notesParts = []
      if (c.org) notesParts.push(`Firma: ${c.org}`)
      if (c.notes) notesParts.push(c.notes)
      return {
        full_name: c.full_name,
        salutation: c.salutation,
        phone: c.phone,
        email: c.email || null,
        notes: notesParts.join('\n') || null,
        client_type: 'buyer' as const,
        lead_status: 'new' as const,
        source: 'other' as const,
        assigned_consultant_id: consultant?.id || null,
      }
    })

    // Insert in batches of 50
    let okCount = 0
    let skipCount = 0
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50)
      
      // Upsert mantığı: Telefon numarası çakışırsa kaydı güncelle ve is_active yap
      const { data, error } = await supabase
        .from('clients')
        .upsert(batch, { onConflict: 'phone' })
        .select('id')

      if (error) {
        console.error('Import error:', error)
        skipCount += batch.length
      } else {
        okCount += data?.length || 0
      }
    }

    setImportResult({ ok: okCount, skip: skipCount })
    setImporting(false)
    fetchClients()
  }

  function closeImport() {
    setShowImport(false)
    setParsedContacts([])
    setSelected(new Set())
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="p-6">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">CRM</h1>
          <p className="text-on-surface-variant text-sm mt-1">Tüm müşterilerinizi buradan yönetin</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <Upload size={15} /> VCF İçe Aktar
          </button>
          <Link href="/crm/new" className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Yeni Müşteri
          </Link>
        </div>
      </div>

      {/* Özet Kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Toplam', value: stats.total, icon: Users, color: 'blue' },
          { label: 'Yeni Lead', value: stats.newLead, icon: TrendingUp, color: 'purple' },
          { label: 'Müzakere', value: stats.negotiating, icon: Clock, color: 'orange' },
          { label: 'Kazanılan', value: stats.won, icon: CheckCircle, color: 'green' },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="stat-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-on-surface-variant">{s.label}</p>
                  <p className="text-xl font-bold text-on-surface mt-0.5">{s.value}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg bg-${s.color}-50 flex items-center justify-center`}>
                  <Icon size={18} className={`text-${s.color}-600`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filtreler */}
      <div className="card mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="İsim, telefon veya e-posta ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as LeadStatus | 'all')}
              className="border border-outline rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container"
            >
              <option value="all">Tüm Durumlar</option>
              {Object.entries(statusLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as ClientType | 'all')}
              className="border border-outline rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container"
            >
              <option value="all">Tüm Tipler</option>
              {Object.entries(typeLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Müşteri Listesi */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-on-surface-variant">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">Yükleniyor...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
            <Users size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">Müşteri bulunamadı</p>
            <p className="text-xs mt-1">Yeni müşteri ekleyin veya filtreyi değiştirin</p>
          </div>
        ) : (
          <div className="divide-y divide-outline">
            {filtered.map((client) => (
              <Link
                key={client.id}
                href={`/crm/${client.id}`}
                className="flex items-center gap-4 p-4 hover:bg-surface-container-high transition-colors group"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
                  <span className="text-primary font-semibold text-sm">
                    {client.full_name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Bilgiler */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-on-surface text-sm truncate">
                      {client.salutation ? `${client.salutation} ` : ''}{client.full_name}
                    </p>
                    <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 bg-surface-container-high text-on-surface-variant">
                      {typeLabels[client.client_type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                    {client.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {client.phone}
                      </span>
                    )}
                    {client.email && (
                      <span className="flex items-center gap-1 truncate">
                        <Mail size={11} /> {client.email}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sağ Taraf */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[client.lead_status]}`}>
                    {statusLabels[client.lead_status]}
                  </span>
                  {client.consultant && (
                    <span className="text-xs text-on-surface-variant hidden lg:block">
                      {(client.consultant as { full_name: string }).full_name}
                    </span>
                  )}
                  <ChevronRight size={16} className="text-on-surface-variant group-hover:text-on-surface-variant transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── VCF Import Modal ─────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/40 dark:bg-black/50 dark:bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Modal Başlık */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline">
              <div>
                <h2 className="font-semibold text-on-surface">VCF Kişi Dosyası İçe Aktar</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">Telefondan indirilen .vcf dosyasını seçin</p>
              </div>
              <button onClick={closeImport} className="text-on-surface-variant hover:text-on-surface-variant">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Dosya Seç */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".vcf,text/vcard"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-outline rounded-xl py-6 flex flex-col items-center gap-2 text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
                >
                  <Upload size={24} />
                  <span className="text-sm font-medium">
                    {parsedContacts.length > 0
                      ? `${parsedContacts.length} kişi bulundu — başka dosya seçmek için tıklayın`
                      : '.vcf dosyasını seçmek için tıklayın'}
                  </span>
                </button>
              </div>

              {/* Kişi Listesi */}
              {parsedContacts.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-on-surface">
                      {selected.size} / {parsedContacts.length} kişi seçili
                    </p>
                    <button
                      onClick={toggleAll}
                      className="text-xs text-primary hover:underline"
                    >
                      {selected.size === parsedContacts.length ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                    </button>
                  </div>

                  <div className="border border-outline rounded-xl overflow-hidden divide-y divide-outline max-h-80 overflow-y-auto">
                    {parsedContacts.map((c, i) => (
                      <label
                        key={i}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-container-high ${selected.has(i) ? 'bg-primary-container/40' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => toggleSelect(i)}
                          className="rounded border-outline text-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {c.salutation && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium">
                                {c.salutation}
                              </span>
                            )}
                            <span className="text-sm font-medium text-on-surface truncate">{c.full_name}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-on-surface-variant">
                            <span>{c.phone}</span>
                            {c.org && <span className="truncate text-on-surface-variant">{c.org}</span>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {/* Sonuç */}
              {importResult && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  importResult.skip > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'
                }`}>
                  {importResult.skip > 0
                    ? <AlertCircle size={15} />
                    : <CheckCircle size={15} />}
                  <span>
                    {importResult.ok} kişi başarıyla aktarıldı
                    {importResult.skip > 0 && `, ${importResult.skip} kişi aktarılamadı`}.
                  </span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-outline">
              <button onClick={closeImport} className="btn-secondary flex-1">
                {importResult ? 'Kapat' : 'İptal'}
              </button>
              {!importResult && (
                <button
                  onClick={handleImport}
                  disabled={importing || selected.size === 0}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {importing
                    ? <><Loader2 size={15} className="animate-spin" /> Aktarılıyor...</>
                    : <><Upload size={15} /> {selected.size} Kişiyi Aktar</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
