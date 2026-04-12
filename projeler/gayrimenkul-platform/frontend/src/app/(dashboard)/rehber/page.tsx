'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Search, Phone, MessageCircle, ChevronRight, BookUser } from 'lucide-react'

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
  buyer: 'bg-blue-50 text-blue-700',
  seller: 'bg-green-50 text-green-700',
  both: 'bg-purple-50 text-purple-700',
  investor: 'bg-orange-50 text-orange-700',
  tenant: 'bg-teal-50 text-teal-700',
  landlord: 'bg-rose-50 text-rose-700',
}

const typeLabels: Record<string, string> = {
  buyer: 'Alıcı',
  seller: 'Satıcı',
  both: 'Alıcı & Satıcı',
  investor: 'Yatırımcı',
  tenant: 'Kiracı',
  landlord: 'Ev Sahibi',
}

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

export default function RehberPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchContacts() }, [])

  async function fetchContacts() {
    const supabase = createClient()
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, salutation, phone, email, client_type, lead_status')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
    if (data) setContacts(data as Contact[])
    setLoading(false)
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

  // Alfabetik grupla
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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Ana içerik */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Başlık + Arama */}
        <div className="p-6 pb-3 bg-white border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Rehber</h1>
              <p className="text-slate-500 text-sm mt-0.5">{contacts.length} kişi</p>
            </div>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="İsim, telefon veya e-posta ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />
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
                  {/* Harf başlığı */}
                  <div className="sticky top-0 z-10 bg-slate-100 px-5 py-1.5">
                    <span className="text-xs font-bold text-slate-500 tracking-widest">{letter}</span>
                  </div>

                  {/* Kişiler */}
                  <div className="bg-white divide-y divide-slate-50">
                    {items.map(contact => (
                      <div key={contact.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
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
                          <Link
                            href={`/crm/${contact.id}`}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                            title="Detay"
                          >
                            <ChevronRight size={17} />
                          </Link>
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

      {/* Sağ: Harf indeksi */}
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
    </div>
  )
}
