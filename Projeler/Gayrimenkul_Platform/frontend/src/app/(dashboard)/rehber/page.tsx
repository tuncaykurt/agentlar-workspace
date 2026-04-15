'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import {
  Search, Phone, MessageCircle, BookUser,
  Pencil, Trash2, X, Save, Loader2, AlertTriangle,
  Download, CheckSquare, Square, ChevronDown,
} from 'lucide-react'

interface Contact {
  id: string
  full_name: string
  salutation?: string
  phone?: string
  email?: string
  client_type: string
  lead_status: string
}

const typeColors: Record<string, string> = {
  buyer:   'bg-blue-50 text-blue-700',
  seller:  'bg-green-50 text-green-700',
  both:    'bg-purple-50 text-purple-700',
  investor:'bg-orange-50 text-orange-700',
  tenant:  'bg-teal-50 text-teal-700',
  landlord:'bg-rose-50 text-rose-700',
  network: 'bg-slate-100 text-slate-600',
}

const typeLabels: Record<string, string> = {
  buyer:   'Alıcı',
  seller:  'Satıcı',
  both:    'Alıcı & Satıcı',
  investor:'Yatırımcı',
  tenant:  'Kiracı',
  landlord:'Ev Sahibi',
  network: 'Ağ / Tanışık',
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

// Hitap combobox bileşeni
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

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Hitap şekli"
          className="flex-1 px-3 py-2 text-sm focus:outline-none min-w-0"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="px-2 text-slate-400 hover:text-slate-600"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <button
            onClick={() => { onChange(''); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-50"
          >
            — (yok)
          </button>
          {SALUTATION_PRESETS.map(s => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 ${value === s ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`}
            >
              {s}
            </button>
          ))}
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
  const [editForm, setEditForm] = useState({ full_name: '', salutation: '', phone: '', email: '', client_type: 'buyer' })
  const [saving, setSaving] = useState(false)

  // Silme
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchContacts() }, [])

  async function fetchContacts() {
    const supabase = createClient()
    const PAGE = 1000
    let all: Contact[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, salutation, phone, email, client_type, lead_status')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
        .range(from, from + PAGE - 1)
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
        client_type: editForm.client_type,
      })
      .eq('id', editContact.id)

    if (!error) {
      setContacts(prev => prev.map(c =>
        c.id === editContact.id
          ? { ...c, ...editForm, salutation: editForm.salutation || undefined }
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
    await supabase.from('clients').update({ is_active: false }).eq('id', deleteContact.id)
    setContacts(prev => prev.filter(c => c.id !== deleteContact.id))
    setDeleteContact(null)
    setDeleting(false)
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    setBulkDeleting(true)
    const supabase = createClient()
    const ids = Array.from(selected)
    await supabase.from('clients').update({ is_active: false }).in('id', ids)
    setContacts(prev => prev.filter(c => !selected.has(c.id)))
    setSelected(new Set())
    setConfirmBulk(false)
    setBulkDeleting(false)
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
        <div className="p-5 pb-3 bg-white border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Rehber</h1>
              <p className="text-slate-500 text-sm mt-0.5">{contacts.length} kişi</p>
            </div>
            {/* Dışa Aktar */}
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
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
                title={selected.size > 0 ? `${selected.size} seçili kişiyi dışa aktar` : 'Tümünü dışa aktar'}
              >
                <Download size={14} />
                {selected.size > 0 ? `${selected.size} Seçiliyi` : 'Tümünü'} VCF İndir
              </button>
            </div>
          </div>

          {/* Arama + Tümünü seç */}
          <div className="flex items-center gap-2">
            <button onClick={toggleSelectAll} className="flex-shrink-0 text-slate-400 hover:text-blue-600 transition-colors" title="Tümünü seç">
              {allSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
            </button>
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="İsim, telefon veya e-posta ara..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <BookUser size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Kişi bulunamadı</p>
              <p className="text-xs mt-1">CRM'den kişi ekleyin veya VCF dosyası içe aktarın</p>
            </div>
          ) : (
            <div className="pb-8">
              {grouped.map(([letter, items]) => (
                <div key={letter} id={`section-${letter}`}>
                  <div className="sticky top-0 z-10 bg-slate-100 px-5 py-1.5">
                    <span className="text-xs font-bold text-slate-500 tracking-widest">{letter}</span>
                  </div>
                  <div className="bg-white divide-y divide-slate-50">
                    {items.map(contact => (
                      <div
                        key={contact.id}
                        className={`flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors ${selected.has(contact.id) ? 'bg-blue-50/50' : ''}`}
                      >
                        {/* Checkbox */}
                        <button onClick={() => toggleSelect(contact.id)} className="flex-shrink-0 text-slate-300 hover:text-blue-500 transition-colors">
                          {selected.has(contact.id)
                            ? <CheckSquare size={18} className="text-blue-600" />
                            : <Square size={18} />}
                        </button>

                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm">
                          {contact.full_name.charAt(0).toLocaleUpperCase('tr-TR')}
                        </div>

                        {/* Bilgi */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {contact.salutation && (
                              <span className="text-xs text-indigo-600 font-medium">{contact.salutation}</span>
                            )}
                            <span className="text-sm font-medium text-slate-900 truncate">{contact.full_name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${typeColors[contact.client_type] || 'bg-slate-100 text-slate-600'}`}>
                              {typeLabels[contact.client_type] || contact.client_type}
                            </span>
                          </div>
                          {contact.phone && (
                            <p className="text-xs text-slate-500 mt-0.5">{contact.phone}</p>
                          )}
                          {contact.email && !contact.phone && (
                            <p className="text-xs text-slate-400 mt-0.5">{contact.email}</p>
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
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-blue-50 text-blue-600 transition-colors"
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
        <div className="w-8 flex flex-col items-center justify-center py-4 gap-0.5 bg-white border-l border-slate-100 overflow-y-auto">
          {letters.map(letter => (
            <button
              key={letter}
              onClick={() => scrollTo(letter)}
              className="text-xs font-medium text-slate-400 hover:text-blue-600 w-6 h-6 flex items-center justify-center rounded hover:bg-blue-50 transition-colors"
            >
              {letter}
            </button>
          ))}
        </div>
      )}

      {/* ── Düzenleme Modalı ─────────────────────────────────── */}
      {editContact && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Kişiyi Düzenle</h2>
              <button onClick={() => setEditContact(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Hitap + İsim */}
              <div className="flex gap-2">
                <div className="w-40 flex-shrink-0">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Hitap Şekli</label>
                  <SalutationInput value={editForm.salutation} onChange={v => setEditForm(f => ({ ...f, salutation: v }))} />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Ad Soyad *</label>
                  <input
                    value={editForm.full_name}
                    onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Etiket */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Etiket</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(typeLabels).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setEditForm(f => ({ ...f, client_type: val }))}
                      className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors font-medium ${
                        editForm.client_type === val
                          ? (typeColors[val] || 'bg-slate-100 text-slate-600') + ' border-transparent ring-2 ring-offset-1 ring-blue-400'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Telefon */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Telefon</label>
                <input
                  value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="05XX XXX XXXX"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* E-posta */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">E-posta</label>
                <input
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="ornek@email.com"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
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

      {/* ── Tekli Silme Modalı ───────────────────────────────── */}
      {deleteContact && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={22} className="text-red-500" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">Kişiyi Sil</h3>
              <p className="text-sm text-slate-500">
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
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={22} className="text-red-500" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">Toplu Silme</h3>
              <p className="text-sm text-slate-500">
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
    </div>
  )
}
