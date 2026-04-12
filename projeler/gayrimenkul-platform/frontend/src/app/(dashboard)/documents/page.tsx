'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Document, SignatureStatus } from '@/lib/types'
import {
  FileText, Plus, Search, CheckCircle, Clock,
  XCircle, AlertCircle, ChevronRight, ExternalLink,
} from 'lucide-react'

const sigStatusConfig: Record<SignatureStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Taslak', color: 'bg-slate-100 text-slate-600', icon: FileText },
  sent: { label: 'Gönderildi', color: 'bg-blue-100 text-blue-700', icon: Clock },
  viewed: { label: 'Görüldü', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  signed: { label: 'İmzalandı', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  declined: { label: 'Reddedildi', color: 'bg-red-100 text-red-700', icon: XCircle },
  expired: { label: 'Süresi Doldu', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
}

const docTypeLabels: Record<string, string> = {
  authorization: 'Yetki Belgesi',
  sales_contract: 'Satış Sözleşmesi',
  rental_contract: 'Kira Sözleşmesi',
  offer_letter: 'Teklif Mektubu',
  other: 'Diğer',
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<(Document & {
    client?: { full_name: string }
    property?: { title: string }
  })[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<SignatureStatus | 'all'>('all')

  useEffect(() => { fetchDocuments() }, [filterStatus])

  async function fetchDocuments() {
    const supabase = createClient()
    let query = supabase
      .from('documents')
      .select('*, client:clients(full_name), property:properties(title)')
      .order('created_at', { ascending: false })

    if (filterStatus !== 'all') query = query.eq('signature_status', filterStatus)

    const { data, error } = await query
    if (!error && data) setDocuments(data as typeof documents)
    setLoading(false)
  }

  const filtered = documents.filter(d => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      d.title.toLowerCase().includes(s) ||
      d.client?.full_name?.toLowerCase().includes(s) ||
      d.property?.title?.toLowerCase().includes(s)
    )
  })

  const stats = [
    { label: 'Toplam', value: documents.length, status: null },
    { label: 'Bekleyen İmza', value: documents.filter(d => ['sent', 'viewed'].includes(d.signature_status)).length, status: 'sent' },
    { label: 'İmzalanan', value: documents.filter(d => d.signature_status === 'signed').length, status: 'signed' },
    { label: 'Taslak', value: documents.filter(d => d.signature_status === 'draft').length, status: 'draft' },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Belgeler</h1>
          <p className="text-slate-500 text-sm mt-1">Sözleşmeler ve yetki belgeleri</p>
        </div>
        <Link href="/documents/new" className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Belge Oluştur
        </Link>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map(s => (
          <div
            key={s.label}
            className={`stat-card cursor-pointer hover:shadow transition-shadow ${
              s.status && filterStatus === s.status ? 'border-blue-300 bg-blue-50' : ''
            }`}
            onClick={() => s.status && setFilterStatus(s.status === filterStatus ? 'all' : s.status as SignatureStatus)}
          >
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtreler */}
      <div className="card mb-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Belge adı, müşteri veya mülk ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as SignatureStatus | 'all')}
            className="border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tüm Durumlar</option>
            {Object.entries(sigStatusConfig).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Belge Listesi */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <FileText size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Belge bulunamadı</p>
            <Link href="/documents/new" className="btn-primary mt-3 inline-flex items-center gap-1 text-sm">
              <Plus size={14} /> İlk Belgeyi Oluştur
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(doc => {
              const sigConf = sigStatusConfig[doc.signature_status]
              const SigIcon = sigConf.icon
              return (
                <Link key={doc.id} href={`/documents/${doc.id}`} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors cursor-pointer">
                  {/* Tip ikonu */}
                  <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText size={18} className="text-slate-500" />
                  </div>

                  {/* Bilgiler */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-slate-900 text-sm truncate">{doc.title}</p>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">
                        {docTypeLabels[doc.doc_type] || doc.doc_type}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      {doc.client?.full_name && <span>{doc.client.full_name}</span>}
                      {doc.property?.title && <><span>·</span><span className="truncate">{doc.property.title}</span></>}
                      <span>·</span>
                      <span>{formatDate(doc.created_at)}</span>
                    </div>
                  </div>

                  {/* Sağ: Durum + Linkler */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${sigConf.color}`}>
                      <SigIcon size={11} />
                      {sigConf.label}
                    </span>
                    {doc.signed_pdf_url && (
                      <a href={doc.signed_pdf_url} target="_blank" rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700">
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {doc.pdf_url && !doc.signed_pdf_url && (
                      <a href={doc.pdf_url} target="_blank" rel="noopener noreferrer"
                        className="text-slate-400 hover:text-slate-600">
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <ChevronRight size={15} className="text-slate-300" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
