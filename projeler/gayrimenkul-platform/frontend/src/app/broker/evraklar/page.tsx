'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Office, Document, SignatureStatus } from '@/lib/types'
import {
  FileText, Plus, Search, CheckCircle, Clock,
  XCircle, AlertCircle, ChevronRight, Loader2, Building2,
} from 'lucide-react'

const sigStatusConfig: Record<SignatureStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft:    { label: 'Taslak',        color: 'bg-surface-container-high text-on-surface-variant', icon: FileText },
  sent:     { label: 'Gönderildi',    color: 'bg-primary-container text-primary',                 icon: Clock },
  viewed:   { label: 'Görüldü',       color: 'bg-yellow-100 text-yellow-700',                     icon: Clock },
  signed:   { label: 'İmzalandı',     color: 'bg-green-100 text-green-700',                       icon: CheckCircle },
  declined: { label: 'Reddedildi',    color: 'bg-red-100 text-red-700',                           icon: XCircle },
  expired:  { label: 'Süresi Doldu',  color: 'bg-orange-100 text-orange-700',                     icon: AlertCircle },
}

const docTypeLabels: Record<string, string> = {
  authorization:    'Yetki Belgesi',
  sales_contract:   'Satış Sözleşmesi',
  rental_contract:  'Kira Sözleşmesi',
  offer_letter:     'Teklif Mektubu',
  showing_agreement:'Gösterim Belgesi',
  sales_closing:    'Satış Kapatma',
  other:            'Diğer',
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

type DocWithRelations = Document & {
  client?: { full_name: string }
  property?: { title: string }
  consultant?: { full_name: string }
}

export default function BrokerEvraklarPage() {
  const supabase = createClient()

  const [offices, setOffices] = useState<Office[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const [documents, setDocuments] = useState<DocWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<SignatureStatus | 'all'>('all')

  // Ofis listesini çek
  useEffect(() => {
    supabase
      .from('offices')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setOffices(data as Office[])
          setSelectedOfficeId(data[0].id)
        } else {
          setLoading(false)
        }
      })
  }, [])

  // Seçili ofis değişince belgelerini çek
  useEffect(() => {
    if (!selectedOfficeId) return
    fetchDocuments(selectedOfficeId)
  }, [selectedOfficeId, filterStatus])

  async function fetchDocuments(officeId: string) {
    setLoading(true)
    let query = supabase
      .from('documents')
      .select('*, client:clients(full_name), property:properties(title), consultant:consultants(full_name)')
      .eq('office_id', officeId)
      .order('created_at', { ascending: false })

    if (filterStatus !== 'all') {
      query = query.eq('signature_status', filterStatus)
    }

    const { data } = await query
    setDocuments((data as DocWithRelations[]) || [])
    setLoading(false)
  }

  const filtered = documents.filter(d => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      d.title.toLowerCase().includes(s) ||
      d.client?.full_name?.toLowerCase().includes(s) ||
      d.property?.title?.toLowerCase().includes(s) ||
      d.consultant?.full_name?.toLowerCase().includes(s)
    )
  })

  const stats = [
    { label: 'Toplam Belge',    value: documents.length,                                                                  status: null },
    { label: 'Bekleyen İmza',   value: documents.filter(d => ['sent', 'viewed'].includes(d.signature_status)).length,    status: 'sent' as SignatureStatus },
    { label: 'İmzalanan',       value: documents.filter(d => d.signature_status === 'signed').length,                    status: 'signed' as SignatureStatus },
    { label: 'Taslak',          value: documents.filter(d => d.signature_status === 'draft').length,                     status: 'draft' as SignatureStatus },
  ]

  return (
    <div className="p-6">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <FileText size={22} className="text-primary" />
            Ofis Evrakları
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Ofisteki tüm danışmanların belgeleri
          </p>
        </div>

        <div className="flex items-center gap-3">
          {offices.length > 1 && (
            <select
              value={selectedOfficeId}
              onChange={e => setSelectedOfficeId(e.target.value)}
              className="input max-w-xs"
            >
              {offices.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          <Link href="/broker/evraklar/new?returnTo=/broker/evraklar" className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Belge Oluştur
          </Link>
        </div>
      </div>

      {/* Stat kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map(s => (
          <button
            key={s.label}
            onClick={() => setFilterStatus(s.status ?? 'all')}
            className={`stat-card text-left transition-all hover:ring-2 hover:ring-primary/30 ${
              filterStatus === (s.status ?? 'all') ? 'ring-2 ring-primary' : ''
            }`}
          >
            <p className="text-xs text-on-surface-variant mb-1">{s.label}</p>
            <p className="text-xl font-bold text-on-surface">{s.value}</p>
          </button>
        ))}
      </div>

      {/* Filtre + Arama */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          {/* Arama */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              className="input pl-9"
              placeholder="Belge, müşteri veya danışman ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Durum filtresi */}
          <select
            className="input max-w-[180px]"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as SignatureStatus | 'all')}
          >
            <option value="all">Tüm Durumlar</option>
            {(Object.keys(sigStatusConfig) as SignatureStatus[]).map(s => (
              <option key={s} value={s}>{sigStatusConfig[s].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Building2 size={40} className="text-on-surface-variant opacity-30 mb-3" />
          <p className="text-on-surface-variant">
            {search || filterStatus !== 'all'
              ? 'Filtreyle eşleşen belge bulunamadı.'
              : 'Bu ofise ait henüz belge yok.'}
          </p>
          <Link href="/broker/evraklar/new?returnTo=/broker/evraklar" className="btn-primary mt-4 flex items-center gap-2">
            <Plus size={15} /> İlk belgeyi oluştur
          </Link>
        </div>
      ) : (
        <div className="card divide-y divide-outline">
          {filtered.map(doc => {
            const cfg = sigStatusConfig[doc.signature_status] ?? sigStatusConfig.draft
            const Icon = cfg.icon
            return (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="flex items-center justify-between p-4 hover:bg-surface-container-high transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center flex-shrink-0">
                    <FileText size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{doc.title}</p>
                    <p className="text-xs text-on-surface-variant">
                      {docTypeLabels[doc.doc_type] ?? doc.doc_type}
                      {doc.consultant?.full_name && ` · ${doc.consultant.full_name}`}
                      {doc.client?.full_name && ` · ${doc.client.full_name}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${cfg.color}`}>
                      <Icon size={11} />
                      {cfg.label}
                    </span>
                    <p className="text-xs text-on-surface-variant mt-1">{formatDate(doc.created_at)}</p>
                  </div>
                  <ChevronRight size={16} className="text-on-surface-variant" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
