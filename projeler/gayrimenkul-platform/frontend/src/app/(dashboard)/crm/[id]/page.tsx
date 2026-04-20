'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Client, Interaction, FollowUp, Document, LeadStatus } from '@/lib/types'
import {
  ArrowLeft, Phone, Mail, Edit2, MessageSquare, PhoneCall,
  Clock, FileText, ChevronRight, Plus, Send, Calendar,
  CheckCircle, AlertCircle, Building2,
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
  new: 'Yeni', contacted: 'İletişime Geçildi', qualified: 'Nitelikli',
  negotiating: 'Müzakere', won: 'Kazanıldı', lost: 'Kaybedildi', dormant: 'Pasif',
}

const channelIcons: Record<string, React.ReactNode> = {
  whatsapp: <MessageSquare size={14} className="text-green-500" />,
  call_inbound: <PhoneCall size={14} className="text-primary" />,
  call_outbound: <PhoneCall size={14} className="text-purple-500" />,
  email: <Mail size={14} className="text-orange-500" />,
  meeting: <Calendar size={14} className="text-on-surface-variant" />,
  note: <FileText size={14} className="text-on-surface-variant" />,
}

const channelLabels: Record<string, string> = {
  whatsapp: 'WhatsApp', call_inbound: 'Gelen Çağrı', call_outbound: 'Giden Çağrı',
  email: 'E-posta', meeting: 'Toplantı', sms: 'SMS', note: 'Not',
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDateShort(d: string) {
  return new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'interactions' | 'followups' | 'documents'>('interactions')

  // Yeni not/takip formu
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpMsg, setFollowUpMsg] = useState('')
  const [showFollowUpForm, setShowFollowUpForm] = useState(false)

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    const supabase = createClient()
    const [clientRes, interactionsRes, followUpsRes, docsRes] = await Promise.all([
      supabase.from('clients').select('*, consultant:consultants(full_name)').eq('id', id).single(),
      supabase.from('interactions').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(50),
      supabase.from('follow_ups').select('*').eq('client_id', id).order('due_at').limit(20),
      supabase.from('documents').select('*').eq('client_id', id).order('created_at', { ascending: false }),
    ])
    if (clientRes.data) setClient(clientRes.data as Client)
    if (interactionsRes.data) setInteractions(interactionsRes.data as Interaction[])
    if (followUpsRes.data) setFollowUps(followUpsRes.data as FollowUp[])
    if (docsRes.data) setDocuments(docsRes.data as Document[])
    setLoading(false)
  }

  async function addNote() {
    if (!noteText.trim()) return
    setAddingNote(true)
    const supabase = createClient()
    const { data: consultant } = await supabase.from('consultants').select('id').eq('user_id', (await supabase.auth.getUser()).data.user?.id).single()
    await supabase.from('interactions').insert({
      client_id: id,
      consultant_id: consultant?.id,
      channel: 'note',
      direction: 'internal',
      content: noteText.trim(),
    })
    // last_contacted_at güncelle
    await supabase.from('clients').update({ last_contacted_at: new Date().toISOString() }).eq('id', id)
    setNoteText('')
    setAddingNote(false)
    fetchAll()
  }

  async function addFollowUp() {
    if (!followUpDate) return
    const supabase = createClient()
    const { data: consultant } = await supabase.from('consultants').select('id').eq('user_id', (await supabase.auth.getUser()).data.user?.id).single()
    await supabase.from('follow_ups').insert({
      client_id: id,
      consultant_id: consultant?.id,
      due_at: new Date(followUpDate).toISOString(),
      channel: 'whatsapp',
      custom_message: followUpMsg.trim() || null,
      status: 'pending',
    })
    setFollowUpDate('')
    setFollowUpMsg('')
    setShowFollowUpForm(false)
    fetchAll()
  }

  async function updateStatus(status: LeadStatus) {
    const supabase = createClient()
    await supabase.from('clients').update({ lead_status: status }).eq('id', id)
    setClient(c => c ? { ...c, lead_status: status } : null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="p-6 text-center text-on-surface-variant">
        Müşteri bulunamadı.
        <Link href="/crm" className="text-primary ml-2">CRM'e Dön</Link>
      </div>
    )
  }

  const pendingFollowUps = followUps.filter(f => f.status === 'pending')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Başlık */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/crm" className="text-on-surface-variant hover:text-on-surface-variant transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold text-on-surface flex-1">{client.full_name}</h1>
        <Link href={`/crm/${id}/edit`} className="btn-secondary flex items-center gap-2">
          <Edit2 size={14} /> Düzenle
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol Panel — Müşteri Bilgileri */}
        <div className="space-y-4">
          {/* Profil Kartı */}
          <div className="card">
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center mb-3">
                <span className="text-primary font-bold text-xl">{client.full_name.charAt(0)}</span>
              </div>
              <h2 className="font-semibold text-on-surface">{client.full_name}</h2>
              {(client.consultant as { full_name: string } | undefined)?.full_name && (
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Danışman: {(client.consultant as { full_name: string }).full_name}
                </p>
              )}
            </div>

            {/* Durum Seçici */}
            <select
              value={client.lead_status}
              onChange={e => updateStatus(e.target.value as LeadStatus)}
              className={`w-full text-xs font-medium px-3 py-2 rounded-lg border-0 cursor-pointer focus:ring-2 focus:ring-primary ${statusColors[client.lead_status]}`}
            >
              {Object.entries(statusLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>

            <div className="mt-4 space-y-2">
              {client.phone && (
                <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors">
                  <Phone size={14} className="text-on-surface-variant" /> {client.phone}
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors truncate">
                  <Mail size={14} className="text-on-surface-variant" /> {client.email}
                </a>
              )}
            </div>

            {client.last_contacted_at && (
              <div className="mt-3 pt-3 border-t border-outline flex items-center gap-1.5 text-xs text-on-surface-variant">
                <Clock size={12} /> Son iletişim: {formatDateShort(client.last_contacted_at)}
              </div>
            )}
          </div>

          {/* Alıcı Kriterleri */}
          {(client.budget_min || client.budget_max || client.preferred_cities?.length) && (
            <div className="card">
              <h3 className="font-semibold text-on-surface text-sm mb-3 flex items-center gap-1.5">
                <Building2 size={14} /> Arama Kriterleri
              </h3>
              <div className="space-y-2 text-xs text-on-surface-variant">
                {(client.budget_min || client.budget_max) && (
                  <div>
                    <span className="text-on-surface-variant">Bütçe:</span>{' '}
                    {client.budget_min ? `₺${client.budget_min.toLocaleString('tr-TR')}` : '—'} –{' '}
                    {client.budget_max ? `₺${client.budget_max.toLocaleString('tr-TR')}` : '—'}
                  </div>
                )}
                {client.preferred_cities?.length && (
                  <div>
                    <span className="text-on-surface-variant">Şehir:</span>{' '}
                    {client.preferred_cities.join(', ')}
                  </div>
                )}
                {(client.min_m2 || client.max_m2) && (
                  <div>
                    <span className="text-on-surface-variant">m²:</span>{' '}
                    {client.min_m2 || '—'} – {client.max_m2 || '—'}
                  </div>
                )}
                {client.min_rooms && (
                  <div><span className="text-on-surface-variant">Min oda:</span> {client.min_rooms}+</div>
                )}
              </div>
            </div>
          )}

          {/* Bekleyen Takipler */}
          {pendingFollowUps.length > 0 && (
            <div className="card border-l-4 border-l-orange-400">
              <h3 className="font-semibold text-on-surface text-sm mb-2 flex items-center gap-1.5">
                <AlertCircle size={14} className="text-orange-500" />
                Bekleyen Takip ({pendingFollowUps.length})
              </h3>
              {pendingFollowUps.slice(0, 3).map(f => (
                <div key={f.id} className="text-xs text-on-surface-variant mt-1.5">
                  <span className="font-medium">{formatDateShort(f.due_at)}</span>
                  {f.custom_message && <p className="text-on-surface-variant mt-0.5 truncate">{f.custom_message}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Notlar */}
          {client.notes && (
            <div className="card">
              <h3 className="font-semibold text-on-surface text-sm mb-2">Notlar</h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">{client.notes}</p>
            </div>
          )}
        </div>

        {/* Sağ Panel — Aktivite */}
        <div className="lg:col-span-2 space-y-4">
          {/* Hızlı Aksiyon Butonları */}
          <div className="flex gap-2 flex-wrap">
            {client.phone && (
              <a href={`https://wa.me/90${client.phone.replace(/\D/g, '').replace(/^0/, '')}`}
                target="_blank" rel="noopener noreferrer"
                className="btn-primary flex items-center gap-1.5 text-xs">
                <MessageSquare size={13} /> WhatsApp
              </a>
            )}
            {client.phone && (
              <a href={`tel:${client.phone}`} className="btn-secondary flex items-center gap-1.5 text-xs">
                <Phone size={13} /> Ara
              </a>
            )}
            <button
              onClick={() => setShowFollowUpForm(v => !v)}
              className="btn-secondary flex items-center gap-1.5 text-xs">
              <Clock size={13} /> Takip Ekle
            </button>
            <Link href={`/documents/new?client_id=${id}`}
              className="btn-secondary flex items-center gap-1.5 text-xs">
              <FileText size={13} /> Belge Oluştur
            </Link>
          </div>

          {/* Takip Ekleme Formu */}
          {showFollowUpForm && (
            <div className="card bg-orange-50 border border-orange-200">
              <h3 className="font-semibold text-on-surface text-sm mb-3 flex items-center gap-1.5">
                <Calendar size={14} /> Yeni Takip Planla
              </h3>
              <div className="space-y-3">
                <input
                  type="datetime-local"
                  value={followUpDate}
                  onChange={e => setFollowUpDate(e.target.value)}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-surface-container"
                />
                <textarea
                  value={followUpMsg}
                  onChange={e => setFollowUpMsg(e.target.value)}
                  placeholder="Gönderilecek mesaj (opsiyonel)..."
                  rows={2}
                  className="w-full border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-surface-container resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowFollowUpForm(false)} className="btn-secondary text-xs">İptal</button>
                  <button onClick={addFollowUp} className="btn-primary text-xs flex items-center gap-1">
                    <CheckCircle size={13} /> Kaydet
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sekmeler */}
          <div className="card p-0">
            <div className="flex border-b border-outline">
              {[
                { key: 'interactions', label: `İletişim (${interactions.length})` },
                { key: 'followups', label: `Takipler (${followUps.length})` },
                { key: 'documents', label: `Belgeler (${documents.length})` },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* İletişim Geçmişi */}
              {activeTab === 'interactions' && (
                <div className="space-y-3">
                  {/* Not Ekleme */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addNote()}
                      placeholder="Not ekle veya görüşmeyi kaydet..."
                      className="flex-1 border border-outline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      onClick={addNote}
                      disabled={addingNote || !noteText.trim()}
                      className="btn-primary flex items-center gap-1 text-xs disabled:opacity-50"
                    >
                      <Send size={13} />
                    </button>
                  </div>

                  {/* Geçmiş Listesi */}
                  {interactions.length === 0 ? (
                    <div className="text-center py-8 text-on-surface-variant text-sm">
                      Henüz iletişim kaydı yok
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {interactions.map(i => (
                        <div key={i.id} className="flex gap-3 p-3 rounded-lg bg-surface-container-high">
                          <div className="mt-0.5">{channelIcons[i.channel] || <MessageSquare size={14} />}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-on-surface-variant">
                                {channelLabels[i.channel] || i.channel}
                              </span>
                              <span className="text-xs text-on-surface-variant">{formatDate(i.created_at)}</span>
                            </div>
                            {i.content && <p className="text-sm text-on-surface leading-relaxed">{i.content}</p>}
                            {i.duration_seconds && (
                              <p className="text-xs text-on-surface-variant mt-0.5">
                                Süre: {Math.floor(i.duration_seconds / 60)}:{String(i.duration_seconds % 60).padStart(2, '0')}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Takipler */}
              {activeTab === 'followups' && (
                <div className="space-y-2">
                  {followUps.length === 0 ? (
                    <div className="text-center py-8 text-on-surface-variant text-sm">Takip planlanmamış</div>
                  ) : (
                    followUps.map(f => (
                      <div key={f.id} className={`flex items-start gap-3 p-3 rounded-lg ${
                        f.status === 'done' ? 'bg-green-50' : f.status === 'pending' ? 'bg-orange-50' : 'bg-surface-container-high'
                      }`}>
                        {f.status === 'done'
                          ? <CheckCircle size={16} className="text-green-500 mt-0.5" />
                          : <Clock size={16} className="text-orange-500 mt-0.5" />}
                        <div className="flex-1">
                          <p className="text-xs font-medium text-on-surface">{formatDate(f.due_at)}</p>
                          {f.custom_message && <p className="text-sm text-on-surface-variant mt-0.5">{f.custom_message}</p>}
                          <span className="text-xs text-on-surface-variant capitalize">{f.channel}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Belgeler */}
              {activeTab === 'documents' && (
                <div className="space-y-2">
                  {documents.length === 0 ? (
                    <div className="text-center py-8 text-on-surface-variant text-sm">Belge oluşturulmamış</div>
                  ) : (
                    documents.map(d => (
                      <Link key={d.id} href={`/documents/${d.id}`}
                        className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest transition-colors">
                        <FileText size={16} className="text-on-surface-variant" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-on-surface">{d.title}</p>
                          <p className="text-xs text-on-surface-variant">{formatDateShort(d.created_at)}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          d.signature_status === 'signed' ? 'bg-green-100 text-green-700' :
                          d.signature_status === 'sent' ? 'bg-primary-container text-primary' :
                          'bg-surface-container-high text-on-surface-variant'
                        }`}>
                          {d.signature_status === 'signed' ? 'İmzalandı' :
                           d.signature_status === 'sent' ? 'Gönderildi' : 'Taslak'}
                        </span>
                        <ChevronRight size={14} className="text-on-surface-variant" />
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
