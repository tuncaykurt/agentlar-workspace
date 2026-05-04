'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import {
  Search, Phone, MessageCircle, BookUser,
  Pencil, Trash2, X, Save, Loader2, AlertTriangle,
  Download, CheckSquare, Square, ChevronDown, Plus,
  Briefcase, Mail, Cake, FileText, Upload, CheckCircle,
  AlertCircle,
} from 'lucide-react'

interface Contact {
  id: string
  full_name: string
  salutation?: string
  phone?: string
  email?: string
  birth_date?: string
  company_name?: string
  notes?: string
  client_type: string
  lead_status: string
}

const typeColors: Record<string, string> = {
  buyer:   'bg-primary-container text-primary',
  seller:  'bg-green-50 text-green-700',
  both:    'bg-purple-50 text-purple-700',
  investor:'bg-orange-50 text-orange-700',
  tenant:  'bg-teal-50 text-teal-700',
  landlord:'bg-rose-50 text-rose-700',
  network: 'bg-surface-container-high text-on-surface-variant',
  emlakci: 'bg-indigo-50 text-indigo-700',
}

const typeLabels: Record<string, string> = {
  buyer:   'Alıcı',
  seller:  'Satıcı',
  both:    'Alıcı & Satıcı',
  investor:'Yatırımcı',
  tenant:  'Kiracı',
  landlord:'Ev Sahibi',
  network: 'Ağ / Tanışık',
  emlakci: 'Emlakçı',
}

const SALUTATION_PRESETS = ['Bey', 'Hanım', 'Dr.', 'Op. Dr.', 'Uzm. Dr.', 'Av.', 'Prof.', 'Prof. Dr.', 'Doç.', 'Müh.']

function normalize(str: string) {
  return str
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
}

function firstLetter(name: string) {
  const ch = name.trim().charAt(0).toLocaleUpperCase('tr-TR')
  return /[A-ZÇĞİÖŞÜ]/.test(ch) ? ch : '#'
}

// ─── VCF Parser ──────────────────────────────────────────────────────────────

function decodeQP(str: string): string {
  // Quoted-Printable soft line breaks: "=" followed by optional whitespace and newline or end of string
  const joined = str.replace(/=[ \t]*(\r?\n|$)/g, '')
  
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
  // Örn: "Ali Yılmaz - Sahibinden" veya "Veli Can (Alıcı)"
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

  // 3. Turkish honorifics (Bey, Hanım, Efendi)
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

function parseVCF(text: string): ParsedContact[] {
  const contacts: ParsedContact[] = []
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const cardBlocks = normalized.split(/^BEGIN:VCARD$/im)

  for (const block of cardBlocks.slice(1)) {
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
        const parts = decoded.split(';')
        const last = parts[0]?.trim() || ''
        const first = parts[1]?.trim() || ''
        fn = [first, last].filter(Boolean).join(' ')
      } else if (propName === 'TEL') {
        if (!phone && valuePart.trim()) {
          phone = valuePart.trim().replace(/[\s\-().]/g, '')
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
    const { cleanName, salutation, extraNotes } = detectSalutation(fn)
    let combinedNotes = notes
    if (extraNotes) combinedNotes = combinedNotes ? `${extraNotes} | ${combinedNotes}` : extraNotes

    contacts.push({ full_name: cleanName || fn, salutation, phone, email, org, notes: combinedNotes })
  }
  return contacts
}

// VCF çıktısı üret
function encodeQP(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if ((b >= 0x20 && b <= 0x7e && b !== 0x3d) || b === 0x09) {
      out += String.fromCharCode(b)
    } else {
      out += `=${b.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}

function contactsToVCF(contacts: Contact[]): string {
  return contacts.map(c => {
    const name = encodeQP(c.full_name)
    const lines = [
      'BEGIN:VCARD',
      'VERSION:2.1',
      `FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:${c.salutation ? encodeQP(c.salutation) + ' ' : ''}${name}`,
      `N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:${name};;;`,
    ]
    if (c.phone) lines.push(`TEL;CELL:${c.phone}`)
    if (c.email) lines.push(`EMAIL:${c.email}`)
    if (c.client_type) lines.push(`NOTE:${typeLabels[c.client_type] || c.client_type}`)
    lines.push('END:VCARD')
    return lines.join('\r\n')
  }).join('\r\n')
}

function downloadVCF(contacts: Contact[], filename = 'rehber.vcf') {
  const content = contactsToVCF(contacts)
  const blob = new Blob([content], { type: 'text/vcard;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Hitap combobox bileşeni — hem serbest metin hem preset seçimi destekler
function SalutationInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Yazılan metne göre filtrelenmiş presetler
  const filteredPresets = value.trim()
    ? SALUTATION_PRESETS.filter(s => s.toLocaleLowerCase('tr-TR').includes(value.toLocaleLowerCase('tr-TR')))
    : SALUTATION_PRESETS

  // Yazılan değer preset listesinde yok mu? (özel giriş)
  const isCustom = value.trim() !== '' && !SALUTATION_PRESETS.includes(value.trim())

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Tab') setOpen(false)
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center border border-outline rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary">
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Yaz veya seç…"
          className="flex-1 px-3 py-2 text-sm focus:outline-none min-w-0 bg-transparent"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="px-2 text-on-surface-variant hover:text-on-surface transition-colors"
          tabIndex={-1}
        >
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full bg-surface-container border border-outline rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
          {/* Temizle */}
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => { onChange(''); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high border-b border-outline"
          >
            — (yok)
          </button>

          {/* Özel / Manuel giriş onayı */}
          {isCustom && (
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-2 text-sm bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100 border-b border-outline flex items-center gap-1.5"
            >
              <span className="text-xs bg-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">Özel</span>
              &ldquo;{value}&rdquo; ekle
            </button>
          )}

          {/* Filtrelenmiş presetler */}
          {filteredPresets.length > 0 ? (
            filteredPresets.map(s => (
              <button
                key={s}
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(s); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-primary-container hover:text-primary transition-colors ${
                  value === s ? 'bg-primary-container text-primary font-medium' : 'text-on-surface'
                }`}
              >
                {s}
              </button>
            ))
          ) : !isCustom ? (
            <p className="px-3 py-2 text-xs text-on-surface-variant italic">Sonuç bulunamadı</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default function RehberPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Seçim (toplu işlem)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirmBulk, setConfirmBulk] = useState(false)

  // Düzenleme
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [editForm, setEditForm] = useState({ full_name: '', salutation: '', phone: '', email: '', birth_date: '', company_name: '', notes: '', client_type: 'buyer' })
  const [customEditLabel, setCustomEditLabel] = useState('')
  const [saving, setSaving] = useState(false)

  // Yeni kişi oluşturma
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ full_name: '', salutation: '', phone: '', email: '', birth_date: '', company_name: '', notes: '', client_type: 'buyer' })
  const [customCreateLabel, setCustomCreateLabel] = useState('')
  const [creating, setCreating] = useState(false)

  // Silme
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null)
  const [deleting, setDeleting] = useState(false)

  // VCF import
  const [showImport, setShowImport] = useState(false)
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([])
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; skip: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchContacts() }, [])

  async function fetchContacts() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: myConsultant } = await supabase.from('consultants').select('id, role').eq('user_id', user?.id ?? '').single()
    const isAdmin = myConsultant?.role === 'admin'
    const myId = myConsultant?.id

    const PAGE = 1000
    let all: Contact[] = []
    let from = 0
    while (true) {
      let query = supabase
        .from('clients')
        .select('id, full_name, salutation, phone, email, birth_date, company_name, notes, client_type, lead_status')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
        .range(from, from + PAGE - 1)
      if (!isAdmin && myId) query = query.eq('assigned_consultant_id', myId)
      const { data, error } = await query
      if (error || !data || data.length === 0) break
      all = [...all, ...(data as Contact[])]
      if (data.length < PAGE) break
      from += PAGE
    }
    setContacts(all)
    setLoading(false)
  }

  function openEdit(c: Contact) {
    setEditContact(c)
    setEditForm({
      full_name: c.full_name,
      salutation: c.salutation || '',
      phone: c.phone || '',
      email: c.email || '',
      birth_date: c.birth_date || '',
      company_name: c.company_name || '',
      notes: c.notes || '',
      client_type: c.client_type,
    })
  }

  async function handleSave() {
    if (!editContact || !editForm.full_name.trim()) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('clients')
      .update({
        full_name: editForm.full_name.trim(),
        salutation: editForm.salutation || null,
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        birth_date: editForm.birth_date || null,
        company_name: editForm.company_name.trim() || null,
        notes: editForm.notes.trim() || null,
        client_type: editForm.client_type,
      })
      .eq('id', editContact.id)

    if (error) {
      console.error('Update error:', error)
      alert('Kaydedilirken bir hata oluştu: ' + error.message)
    } else {
      setContacts(prev => prev.map(c =>
        c.id === editContact.id
          ? { ...c, ...editForm, salutation: editForm.salutation || undefined, birth_date: editForm.birth_date || undefined }
          : c
      ))
      setEditContact(null)
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteContact) return
    setDeleting(true)
    const supabase = createClient()
    
    // Rehber sayfası genellikle geçici liste olduğu için GERÇEK SİLME (Hard Delete) yapıyoruz
    // Bu sayede "silip tekrar yükleme" senaryosunda eski kayıtlar çakışmaz.
    const { error } = await supabase.from('clients').delete().eq('id', deleteContact.id)
    
    if (error) {
      console.error('Delete error:', error)
      alert('Silme işlemi başarısız oldu: ' + error.message)
    } else {
      setContacts(prev => prev.filter(c => c.id !== deleteContact.id))
      setDeleteContact(null)
    }
    setDeleting(false)
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    setBulkDeleting(true)
    const supabase = createClient()
    const ids = Array.from(selected)
    
    const { error } = await supabase.from('clients').delete().in('id', ids)
    
    if (error) {
      console.error('Bulk delete error:', error)
      alert('Toplu silme işlemi başarısız oldu: ' + error.message)
    } else {
      setContacts(prev => prev.filter(c => !selected.has(c.id)))
      setSelected(new Set())
      setConfirmBulk(false)
    }
    setBulkDeleting(false)
  }

  async function handleClearAll() {
    if (!confirm(`Tüm rehber kayıtlarını (${filtered.length} kişi) kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return
    setLoading(true)
    const supabase = createClient()
    
    const ids = filtered.map(c => c.id)
    if (ids.length === 0) {
      setLoading(false)
      return
    }

    try {
      // Çok fazla kayıt olduğunda (örneğin 3000+) tek bir URL içinde tüm ID'leri göndermek
      // "Failed to fetch" (URL length limit) hatasına yol açar. Bu yüzden parçalayarak siliyoruz.
      const chunkSize = 200
      let successCount = 0
      
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const { error } = await supabase.from('clients').delete().in('id', chunk)
        if (error) throw error
        successCount += chunk.length
      }

      setContacts(prev => prev.filter(c => !ids.includes(c.id)))
      setSelected(new Set())
      alert(`${successCount} kişi başarıyla silindi.`)
    } catch (err: any) {
      console.error('Clear all error:', err)
      alert('Silme işlemi sırasında bir hata oluştu: ' + (err.message || err.toString()))
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!createForm.full_name.trim()) return
    setCreating(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: consultant } = await supabase.from('consultants').select('id').eq('user_id', user?.id).single()

    const { data: newContact, error } = await supabase
      .from('clients')
      .insert({
        full_name: createForm.full_name.trim(),
        salutation: createForm.salutation || null,
        phone: createForm.phone.trim() || null,
        email: createForm.email.trim() || null,
        birth_date: createForm.birth_date || null,
        company_name: createForm.company_name.trim() || null,
        notes: createForm.notes.trim() || null,
        client_type: createForm.client_type,
        lead_status: 'new',
        source: 'other',
        assigned_consultant_id: consultant?.id || null,
      })
      .select('id, full_name, salutation, phone, email, birth_date, company_name, notes, client_type, lead_status')
      .single()

    if (error) {
      console.error('Create error:', error)
      alert('Kişi eklenirken bir hata oluştu: ' + error.message)
    } else if (newContact) {
      setContacts(prev => [...prev, newContact as Contact].sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')))
      setCreateForm({ full_name: '', salutation: '', phone: '', email: '', birth_date: '', company_name: '', notes: '', client_type: 'buyer' })
      setShowCreate(false)
    }
    setCreating(false)
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── VCF handlers ──
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const contacts = parseVCF(text)
      setParsedContacts(contacts)
      setImportSelected(new Set(contacts.map((_, i) => i)))
      setImportResult(null)
    }
    reader.readAsText(file, 'utf-8')
  }

  function toggleImportSelect(i: number) {
    setImportSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function toggleAllImport() {
    if (importSelected.size === parsedContacts.length) setImportSelected(new Set())
    else setImportSelected(new Set(parsedContacts.map((_, i) => i)))
  }

  async function handleImport() {
    if (importSelected.size === 0) return
    setImporting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: consultant } = await supabase.from('consultants').select('id').eq('user_id', user?.id).single()

    const rows = Array.from(importSelected).map(i => {
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
        client_type: 'buyer',
        lead_status: 'new',
        source: 'other',
        assigned_consultant_id: consultant?.id || null,
      }
    })

    let okCount = 0
    let skipCount = 0
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50)
      const { data, error } = await supabase.from('clients').insert(batch).select('id')
      if (error) {
        console.error('Import error:', error)
        skipCount += batch.length
      } else {
        okCount += data?.length || 0
      }
    }

    setImportResult({ ok: okCount, skip: skipCount })
    setImporting(false)
    fetchContacts()
  }

  function closeImport() {
    setShowImport(false)
    setParsedContacts([])
    setImportSelected(new Set())
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(c => c.id)))
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts
    const q = normalize(search)
    return contacts.filter(c =>
      normalize(c.full_name).includes(q) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    )
  }, [contacts, search])

  const grouped = useMemo(() => {
    const map: Record<string, Contact[]> = {}
    for (const c of filtered) {
      const letter = firstLetter(c.full_name)
      if (!map[letter]) map[letter] = []
      map[letter].push(c)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b, 'tr'))
  }, [filtered])

  const letters = grouped.map(([l]) => l)

  function scrollTo(letter: string) {
    document.getElementById(`section-${letter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const selectedContacts = contacts.filter(c => selected.has(c.id))
  const allSelected = filtered.length > 0 && selected.size === filtered.length

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Başlık + Arama */}
        <div className="p-5 pb-3 bg-surface-container border-b border-outline">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-2xl font-bold text-on-surface">Rehber</h1>
              <p className="text-on-surface-variant text-sm mt-0.5">{contacts.length} kişi</p>
            </div>
            {/* Aksiyonlar */}
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <button
                  onClick={() => setConfirmBulk(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors"
                >
                  <Trash2 size={14} /> {selected.size} Kişiyi Sil
                </button>
              )}
              <button
                onClick={() => downloadVCF(selected.size > 0 ? selectedContacts : filtered)}
                className="flex items-center gap-1.5 px-3 py-2 bg-surface-container-high text-on-surface hover:bg-surface-container-highest rounded-lg text-sm font-medium transition-colors"
                title={selected.size > 0 ? `${selected.size} seçili kişiyi dışa aktar` : 'Tümünü dışa aktar'}
              >
                <Download size={14} />
                {selected.size > 0 ? `${selected.size} Seçiliyi` : 'Tümünü'} VCF İndir
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-surface-container-high text-on-surface hover:bg-surface-container-highest rounded-lg text-sm font-medium transition-colors"
              >
                <Upload size={14} /> VCF İçe Aktar
              </button>
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 rounded-lg text-sm font-medium transition-colors"
                title="Listeyi tamamen temizle"
              >
                <Trash2 size={14} /> Tümünü Sil
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white hover:bg-primary/90 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={14} /> Yeni Kişi
              </button>
            </div>
          </div>

          {/* Arama + Tümünü seç */}
          <div className="flex items-center gap-2">
            <button onClick={toggleSelectAll} className="flex-shrink-0 text-on-surface-variant hover:text-primary transition-colors" title="Tümünü seç">
              {allSelected ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
            </button>
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                placeholder="İsim, telefon veya e-posta ara..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-outline rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container-high"
              />
            </div>
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant">
              <BookUser size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Kişi bulunamadı</p>
              <p className="text-xs mt-1">CRM'den kişi ekleyin veya VCF dosyası içe aktarın</p>
            </div>
          ) : (
            <div className="pb-8">
              {grouped.map(([letter, items]) => (
                <div key={letter} id={`section-${letter}`}>
                  <div className="sticky top-0 z-10 bg-surface-container-high px-5 py-1.5">
                    <span className="text-xs font-bold text-on-surface-variant tracking-widest">{letter}</span>
                  </div>
                  <div className="bg-surface-container divide-y divide-outline">
                    {items.map(contact => (
                      <div
                        key={contact.id}
                        className={`flex items-center gap-3 px-5 py-3 hover:bg-surface-container-high transition-colors ${selected.has(contact.id) ? 'bg-primary-container/50' : ''}`}
                      >
                        {/* Checkbox */}
                        <button onClick={() => toggleSelect(contact.id)} className="flex-shrink-0 text-on-surface-variant hover:text-primary transition-colors">
                          {selected.has(contact.id)
                            ? <CheckSquare size={18} className="text-primary" />
                            : <Square size={18} />}
                        </button>

                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm">
                          {contact.full_name.charAt(0).toLocaleUpperCase('tr-TR')}
                        </div>

                        {/* Sol Bilgi (İsim, Telefon) */}
                        <div className="w-[30%] min-w-[180px] pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-on-surface truncate">{contact.full_name}</span>
                            {contact.salutation && (
                              <span className="text-xs text-indigo-600 font-medium">{contact.salutation}</span>
                            )}
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${typeColors[contact.client_type] || 'bg-surface-container-high text-on-surface-variant'}`}>
                              {typeLabels[contact.client_type] || contact.client_type}
                            </span>
                          </div>
                          {contact.phone && (
                            <p className="text-xs text-on-surface-variant mt-0.5">{contact.phone}</p>
                          )}
                          {contact.email && !contact.phone && (
                            <p className="text-xs text-on-surface-variant mt-0.5">{contact.email}</p>
                          )}
                        </div>

                        {/* Orta Bilgi (Şirket, Mail, Doğum Tarihi, Not) */}
                        <div className="flex-1 flex items-center gap-x-3 gap-y-2 flex-wrap text-xs text-on-surface-variant hidden md:flex overflow-hidden">
                          {contact.company_name && (
                            <div className="flex items-center gap-1.5 bg-surface-container-high px-2 py-1 rounded-md" title="Şirket">
                              <Briefcase size={13} className="text-on-surface-variant/70 flex-shrink-0" />
                              <span className="truncate max-w-[130px]">{contact.company_name}</span>
                            </div>
                          )}
                          {contact.email && contact.phone && (
                            <div className="flex items-center gap-1.5 bg-surface-container-high px-2 py-1 rounded-md" title="E-posta">
                              <Mail size={13} className="text-on-surface-variant/70 flex-shrink-0" />
                              <span className="truncate max-w-[150px]">{contact.email}</span>
                            </div>
                          )}
                          {contact.birth_date && (
                            <div className="flex items-center gap-1.5 bg-surface-container-high px-2 py-1 rounded-md" title="Doğum Tarihi">
                              <Cake size={13} className="text-on-surface-variant/70 flex-shrink-0" />
                              <span>{new Date(contact.birth_date).toLocaleDateString('tr-TR')}</span>
                            </div>
                          )}
                          {contact.notes && (
                            <div className="flex items-center gap-1.5 bg-surface-container-high px-2 py-1 rounded-md" title={contact.notes}>
                              <FileText size={13} className="text-on-surface-variant/70 flex-shrink-0" />
                              <span className="truncate max-w-[200px]">{contact.notes}</span>
                            </div>
                          )}
                        </div>

                        {/* Aksiyonlar */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {contact.phone && (
                            <>
                              <a
                                href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-green-50 text-green-600 transition-colors"
                                title="WhatsApp"
                              >
                                <MessageCircle size={17} />
                              </a>
                              <a
                                href={`tel:${contact.phone}`}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-primary-container text-primary transition-colors"
                                title="Ara"
                              >
                                <Phone size={17} />
                              </a>
                            </>
                          )}
                          <button
                            onClick={() => openEdit(contact)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-yellow-50 text-yellow-500 transition-colors"
                            title="Düzenle"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteContact(contact)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-red-400 transition-colors"
                            title="Sil"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Harf indeksi */}
      {!loading && letters.length > 0 && (
        <div className="w-8 flex flex-col items-center justify-center py-4 gap-0.5 bg-surface-container border-l border-outline overflow-y-auto">
          {letters.map(letter => (
            <button
              key={letter}
              onClick={() => scrollTo(letter)}
              className="text-xs font-medium text-on-surface-variant hover:text-primary w-6 h-6 flex items-center justify-center rounded hover:bg-primary-container transition-colors"
            >
              {letter}
            </button>
          ))}
        </div>
      )}

      {/* ── Düzenleme Modalı ─────────────────────────────────── */}
      {editContact && (
        <div className="fixed inset-0 z-50 bg-black/40 dark:bg-black/50 dark:bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline">
              <h2 className="font-semibold text-on-surface">Kişiyi Düzenle</h2>
              <button onClick={() => setEditContact(null)} className="text-on-surface-variant hover:text-on-surface-variant">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
              {/* İsim + Hitap */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Ad Soyad *</label>
                  <input
                    value={editForm.full_name}
                    onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="w-36 flex-shrink-0">
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Hitap Şekli</label>
                  <SalutationInput value={editForm.salutation} onChange={v => setEditForm(f => ({ ...f, salutation: v }))} />
                </div>
              </div>

              {/* Etiket */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Etiket</label>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {Object.entries(typeLabels).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setEditForm(f => ({ ...f, client_type: val }))}
                      className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors font-medium ${
                        editForm.client_type === val
                          ? (typeColors[val] || 'bg-surface-container-high text-on-surface-variant') + ' border-transparent ring-2 ring-offset-1 ring-primary'
                          : 'bg-surface-container border-outline text-on-surface-variant hover:border-outline'
                      }`}
                    >
                      {label}
                    </button>
                  ))}

                  {/* Özel Etiket Görüntüleme */}
                  {editForm.client_type && !(editForm.client_type in typeLabels) && (
                    <button
                      onClick={() => setEditForm(f => ({ ...f, client_type: editForm.client_type }))}
                      className="text-xs px-2.5 py-1.5 rounded-full transition-colors font-medium bg-surface-container-high text-on-surface-variant border border-transparent ring-2 ring-offset-1 ring-primary"
                    >
                      {editForm.client_type}
                    </button>
                  )}

                  {/* Özel Etiket Ekleme Alanı */}
                  <input
                    type="text"
                    placeholder="+ Özel Ekle (Enter)"
                    value={customEditLabel}
                    onChange={e => setCustomEditLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const val = customEditLabel.trim()
                        if (val) {
                          setEditForm(f => ({ ...f, client_type: val }))
                          setCustomEditLabel('')
                        }
                      }
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-full border border-outline bg-transparent text-on-surface focus:outline-none focus:border-primary w-[140px] placeholder:text-on-surface-variant/70"
                  />
                </div>
              </div>

              {/* Telefon */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Telefon</label>
                <input
                  value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="05XX XXX XXXX"
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* E-posta */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">E-posta</label>
                <input
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="ornek@email.com"
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Doğum Tarihi */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Doğum Tarihi</label>
                <input
                  type="date"
                  value={editForm.birth_date}
                  onChange={e => setEditForm(f => ({ ...f, birth_date: e.target.value }))}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Şirket */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Şirket / Kurum</label>
                <input
                  value={editForm.company_name}
                  onChange={e => setEditForm(f => ({ ...f, company_name: e.target.value }))}
                  placeholder="Örn. ABC Holding A.Ş."
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Hatırlatici Not */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Hatırlatıcı Not</label>
                <textarea
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Özel notlar, tercihler, hatırlatmalar..."
                  rows={3}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-outline">
              <button onClick={() => setEditContact(null)} className="btn-secondary flex-1">İptal</button>
              <button
                onClick={handleSave}
                disabled={saving || !editForm.full_name.trim()}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Yeni Kişi Oluşturma Modalı ──────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline">
              <h2 className="font-semibold text-on-surface">Yeni Kişi Ekle</h2>
              <button onClick={() => setShowCreate(false)} className="text-on-surface-variant hover:text-on-surface-variant">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
              {/* İsim + Hitap */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Ad Soyad *</label>
                  <input
                    value={createForm.full_name}
                    onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="Ad Soyad"
                    className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                  />
                </div>
                <div className="w-36 flex-shrink-0">
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Hitap</label>
                  <SalutationInput value={createForm.salutation} onChange={v => setCreateForm(f => ({ ...f, salutation: v }))} />
                </div>
              </div>

              {/* Etiket */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Etiket</label>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {Object.entries(typeLabels).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setCreateForm(f => ({ ...f, client_type: val }))}
                      className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors font-medium ${
                        createForm.client_type === val
                          ? (typeColors[val] || 'bg-surface-container-high text-on-surface-variant') + ' border-transparent ring-2 ring-offset-1 ring-primary'
                          : 'bg-surface-container border-outline text-on-surface-variant hover:border-outline'
                      }`}
                    >
                      {label}
                    </button>
                  ))}

                  {/* Özel Etiket Görüntüleme */}
                  {createForm.client_type && !(createForm.client_type in typeLabels) && (
                    <button
                      onClick={() => setCreateForm(f => ({ ...f, client_type: createForm.client_type }))}
                      className="text-xs px-2.5 py-1.5 rounded-full transition-colors font-medium bg-surface-container-high text-on-surface-variant border border-transparent ring-2 ring-offset-1 ring-primary"
                    >
                      {createForm.client_type}
                    </button>
                  )}

                  {/* Özel Etiket Ekleme Alanı */}
                  <input
                    type="text"
                    placeholder="+ Özel Ekle (Enter)"
                    value={customCreateLabel}
                    onChange={e => setCustomCreateLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const val = customCreateLabel.trim()
                        if (val) {
                          setCreateForm(f => ({ ...f, client_type: val }))
                          setCustomCreateLabel('')
                        }
                      }
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-full border border-outline bg-transparent text-on-surface focus:outline-none focus:border-primary w-[140px] placeholder:text-on-surface-variant/70"
                  />
                </div>
              </div>

              {/* Telefon */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Telefon</label>
                <input
                  value={createForm.phone}
                  onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="05XX XXX XXXX"
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* E-posta */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">E-posta</label>
                <input
                  value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="ornek@email.com"
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Doğum Tarihi */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Doğum Tarihi</label>
                <input
                  type="date"
                  value={createForm.birth_date}
                  onChange={e => setCreateForm(f => ({ ...f, birth_date: e.target.value }))}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Şirket */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Şirket / Kurum</label>
                <input
                  value={createForm.company_name}
                  onChange={e => setCreateForm(f => ({ ...f, company_name: e.target.value }))}
                  placeholder="Örn. ABC Holding A.Ş."
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Hatırlatici Not */}
              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Hatırlatıcı Not</label>
                <textarea
                  value={createForm.notes}
                  onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Özel notlar, tercihler, hatırlatmalar..."
                  rows={3}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-outline">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">İptal</button>
              <button
                onClick={handleCreate}
                disabled={creating || !createForm.full_name.trim()}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Ekle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tekli Silme Modalı ───────────────────────────────── */}
      {deleteContact && (
        <div className="fixed inset-0 z-50 bg-black/40 dark:bg-black/50 dark:bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={22} className="text-red-500" />
              </div>
              <h3 className="font-semibold text-on-surface mb-1">Kişiyi Sil</h3>
              <p className="text-sm text-on-surface-variant">
                <strong>{deleteContact.salutation ? deleteContact.salutation + ' ' : ''}{deleteContact.full_name}</strong> rehberden kaldırılacak.
              </p>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setDeleteContact(null)} className="btn-secondary flex-1">İptal</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toplu Silme Onay Modalı ──────────────────────────── */}
      {confirmBulk && (
        <div className="fixed inset-0 z-50 bg-black/40 dark:bg-black/50 dark:bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={22} className="text-red-500" />
              </div>
              <h3 className="font-semibold text-on-surface mb-1">Toplu Silme</h3>
              <p className="text-sm text-on-surface-variant">
                Seçili <strong>{selected.size} kişi</strong> rehberden kaldırılacak. Bu işlem geri alınabilir.
              </p>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setConfirmBulk(false)} className="btn-secondary flex-1">İptal</button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {bulkDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {selected.size} Kişiyi Sil
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── VCF Import Modal ─────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/40 dark:bg-black/50 dark:bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
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

              {parsedContacts.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-on-surface">
                      {importSelected.size} / {parsedContacts.length} kişi seçili
                    </p>
                    <button onClick={toggleAllImport} className="text-xs text-primary hover:underline">
                      {importSelected.size === parsedContacts.length ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                    </button>
                  </div>

                  <div className="border border-outline rounded-xl overflow-hidden divide-y divide-outline max-h-80 overflow-y-auto">
                    {parsedContacts.map((c, i) => (
                      <label
                        key={i}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-container-high ${importSelected.has(i) ? 'bg-primary-container/40' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={importSelected.has(i)}
                          onChange={() => toggleImportSelect(i)}
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
                            {c.notes && <span className="truncate text-on-surface-variant italic">({c.notes.slice(0, 30)}...)</span>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {importResult && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  importResult.skip > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'
                }`}>
                  {importResult.skip > 0 ? <AlertCircle size={15} /> : <CheckCircle size={15} />}
                  <span>
                    {importResult.ok} kişi başarıyla aktarıldı
                    {importResult.skip > 0 && `, ${importResult.skip} kişi aktarılamadı`}.
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-outline">
              <button onClick={closeImport} className="btn-secondary flex-1">
                {importResult ? 'Kapat' : 'İptal'}
              </button>
              {!importResult && (
                <button
                  onClick={handleImport}
                  disabled={importing || importSelected.size === 0}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {importing
                    ? <><Loader2 size={15} className="animate-spin" /> Aktarılıyor...</>
                    : <><Upload size={15} /> {importSelected.size} Kişiyi Aktar</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
