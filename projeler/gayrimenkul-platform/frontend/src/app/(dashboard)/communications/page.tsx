'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Interaction } from '@/lib/types'
import {
  MessageSquare, PhoneCall, Mail, Calendar, FileText,
  Search, Filter, TrendingUp, Clock, CheckCircle,
  Phone, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react'

const channelConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  whatsapp: { icon: MessageSquare, label: 'WhatsApp', color: 'text-green-600 bg-green-50' },
  call_inbound: { icon: PhoneCall, label: 'Gelen Çağrı', color: 'text-primary bg-primary-container' },
  call_outbound: { icon: Phone, label: 'Giden Çağrı', color: 'text-purple-600 bg-purple-50' },
  email: { icon: Mail, label: 'E-posta', color: 'text-orange-600 bg-orange-50' },
  meeting: { icon: Calendar, label: 'Toplantı', color: 'text-on-surface-variant bg-surface-container-high' },
  sms: { icon: MessageSquare, label: 'SMS', color: 'text-teal-600 bg-teal-50' },
  note: { icon: FileText, label: 'Not', color: 'text-on-surface-variant bg-surface-container-high' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function CommunicationsPage() {
  const [interactions, setInteractions] = useState<(Interaction & {
    client?: { full_name: string; phone: string }
  })[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterChannel, setFilterChannel] = useState('all')
  const [filterDirection, setFilterDirection] = useState('all')

  useEffect(() => { fetchInteractions() }, [filterChannel, filterDirection])

  async function fetchInteractions() {
    const supabase = createClient()
    let query = supabase
      .from('interactions')
      .select('*, client:clients(full_name, phone)')
      .order('created_at', { ascending: false })
      .limit(200)

    if (filterChannel !== 'all') query = query.eq('channel', filterChannel)
    if (filterDirection !== 'all') query = query.eq('direction', filterDirection)

    const { data, error } = await query
    if (!error && data) setInteractions(data as typeof interactions)
    setLoading(false)
  }

  const filtered = interactions.filter(i => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      i.client?.full_name?.toLowerCase().includes(s) ||
      i.client?.phone?.includes(s) ||
      i.content?.toLowerCase().includes(s)
    )
  })

  // Özet metrikler (son 7 gün)
  const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const recent = interactions.filter(i => i.created_at > last7days)
  const stats = [
    { label: 'Son 7 Gün', value: recent.length, icon: TrendingUp, color: 'blue' },
    { label: 'WhatsApp', value: recent.filter(i => i.channel === 'whatsapp').length, icon: MessageSquare, color: 'green' },
    { label: 'Çağrı', value: recent.filter(i => i.channel.includes('call')).length, icon: PhoneCall, color: 'purple' },
    { label: 'E-posta', value: recent.filter(i => i.channel === 'email').length, icon: Mail, color: 'orange' },
  ]

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface">İletişim Geçmişi</h1>
        <p className="text-on-surface-variant text-sm mt-1">Tüm müşteri iletişimleriniz tek ekranda</p>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="stat-card">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-on-surface-variant">{s.label}</p>
                <div className={`w-8 h-8 rounded-lg bg-${s.color}-50 flex items-center justify-center`}>
                  <Icon size={15} className={`text-${s.color}-600`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-on-surface">{s.value}</p>
            </div>
          )
        })}
      </div>

      {/* Filtreler */}
      <div className="card mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Musteri adi, telefon veya icerik ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-outline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterChannel}
              onChange={e => setFilterChannel(e.target.value)}
              className="border border-outline rounded-lg text-sm px-3 py-2 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Tüm Kanallar</option>
              {Object.entries(channelConfig).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={filterDirection}
              onChange={e => setFilterDirection(e.target.value)}
              className="border border-outline rounded-lg text-sm px-3 py-2 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Yön</option>
              <option value="inbound">Gelen</option>
              <option value="outbound">Giden</option>
            </select>
          </div>
        </div>
      </div>

      {/* İletişim Listesi */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant">
            <MessageSquare size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">İletişim kaydı bulunamadı</p>
            <p className="text-xs mt-1">WhatsApp ve çağrı entegrasyonunu n8n'de aktif edin</p>
          </div>
        ) : (
          <div className="divide-y divide-outline">
            {filtered.map(interaction => {
              const ch = channelConfig[interaction.channel] || channelConfig.note
              const Icon = ch.icon
              return (
                <div key={interaction.id} className="flex items-start gap-4 p-4 hover:bg-surface-container-high transition-colors">
                  {/* Kanal İkonu */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${ch.color}`}>
                    <Icon size={15} />
                  </div>

                  {/* İçerik */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {interaction.client?.full_name && (
                        <span className="font-medium text-on-surface text-sm">
                          {interaction.client.full_name}
                        </span>
                      )}
                      <span className="text-xs text-on-surface-variant">{ch.label}</span>
                      {interaction.direction === 'inbound' ? (
                        <ArrowDownLeft size={12} className="text-primary" />
                      ) : interaction.direction === 'outbound' ? (
                        <ArrowUpRight size={12} className="text-green-500" />
                      ) : null}
                    </div>
                    {interaction.content && (
                      <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-2">
                        {interaction.content}
                      </p>
                    )}
                    {interaction.duration_seconds && (
                      <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1">
                        <Clock size={10} />
                        Süre: {formatDuration(interaction.duration_seconds)}
                        {interaction.recording_url && (
                          <a href={interaction.recording_url} target="_blank"
                            className="ml-2 text-primary hover:underline">
                            Kaydı Dinle
                          </a>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Tarih */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-on-surface-variant">{formatDate(interaction.created_at)}</p>
                    {interaction.client?.phone && (
                      <p className="text-xs text-on-surface-variant mt-0.5">{interaction.client.phone}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
