'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Property, PropertyStatus } from '@/lib/types'
import {
  ArrowLeft, MapPin, Home, Eye, Edit2, Trash2,
  DollarSign, Building2, Calendar, CheckCircle,
} from 'lucide-react'

const statusColors: Record<PropertyStatus, string> = {
  active: 'bg-green-100 text-green-700',
  under_offer: 'bg-yellow-100 text-yellow-700',
  sold: 'bg-slate-100 text-slate-500',
  rented: 'bg-blue-100 text-blue-700',
  withdrawn: 'bg-red-100 text-red-600',
}

const statusLabels: Record<PropertyStatus, string> = {
  active: 'Aktif', under_offer: 'Teklif Var', sold: 'Satıldı',
  rented: 'Kiralandı', withdrawn: 'Kaldırıldı',
}

function formatPrice(n: number, currency = 'TRY') {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n)
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('properties')
        .select('*, consultant:consultants(full_name)')
        .eq('id', id)
        .single()
      setProperty(data as Property)
      setLoading(false)
    }
    load()
  }, [id])

  async function handleDelete() {
    if (!confirm('Bu mülkü silmek istediğinizden emin misiniz?')) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('properties').update({ is_active: false }).eq('id', id)
    router.push('/portfolio')
  }

  async function handleStatusChange(status: PropertyStatus) {
    const supabase = createClient()
    await supabase.from('properties').update({ status }).eq('id', id)
    setProperty(p => p ? { ...p, status } : p)
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!property) return (
    <div className="p-6 text-center text-slate-400">
      <Building2 size={40} className="mx-auto mb-3 opacity-30" />
      <p>Mülk bulunamadı.</p>
      <Link href="/portfolio" className="btn-primary mt-4 inline-block">Portföye Dön</Link>
    </div>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/portfolio" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{property.title}</h1>
            {(property.city || property.district) && (
              <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                <MapPin size={12} /> {[property.neighborhood, property.district, property.city].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[property.status]}`}>
            {statusLabels[property.status]}
          </span>
          <button onClick={handleDelete} disabled={deleting}
            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Fotoğraflar */}
      {property.photos && property.photos.length > 0 && (
        <div className="card p-0 overflow-hidden mb-4">
          <img src={property.photos[0]} alt={property.title}
            className="w-full h-64 object-cover" />
        </div>
      )}

      {/* Durum Değiştir */}
      <div className="card mb-4">
        <p className="text-xs font-medium text-slate-500 mb-2">DURUM GÜNCELLE</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(statusLabels) as PropertyStatus[]).map(s => (
            <button key={s} onClick={() => handleStatusChange(s)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                property.status === s
                  ? statusColors[s] + ' border-transparent font-medium'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}>
              {property.status === s && <CheckCircle size={10} className="inline mr-1" />}
              {statusLabels[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Temel Bilgiler */}
        <div className="card">
          <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Home size={16} /> Mülk Bilgileri
          </h3>
          <div className="space-y-2 text-sm">
            {property.price && (
              <div className="flex justify-between">
                <span className="text-slate-500">Fiyat</span>
                <span className="font-semibold text-slate-900">{formatPrice(property.price, property.currency)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Tip</span>
              <span className="text-slate-700">{property.property_type}</span>
            </div>
            {property.m2_gross && (
              <div className="flex justify-between">
                <span className="text-slate-500">Brüt m²</span>
                <span className="text-slate-700">{property.m2_gross} m²</span>
              </div>
            )}
            {property.m2_net && (
              <div className="flex justify-between">
                <span className="text-slate-500">Net m²</span>
                <span className="text-slate-700">{property.m2_net} m²</span>
              </div>
            )}
            {property.room_count && (
              <div className="flex justify-between">
                <span className="text-slate-500">Oda Sayısı</span>
                <span className="text-slate-700">{property.room_count}</span>
              </div>
            )}
            {property.floor != null && (
              <div className="flex justify-between">
                <span className="text-slate-500">Kat</span>
                <span className="text-slate-700">{property.floor}{property.total_floors ? ` / ${property.total_floors}` : ''}</span>
              </div>
            )}
            {property.age != null && (
              <div className="flex justify-between">
                <span className="text-slate-500">Bina Yaşı</span>
                <span className="text-slate-700">{property.age} yıl</span>
              </div>
            )}
            {property.heating_type && (
              <div className="flex justify-between">
                <span className="text-slate-500">Isıtma</span>
                <span className="text-slate-700">{property.heating_type}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500 flex items-center gap-1"><Eye size={12} /> Görüntülenme</span>
              <span className="text-slate-700">{property.view_count}</span>
            </div>
          </div>
        </div>

        {/* Konum & Danışman */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <MapPin size={16} /> Konum
            </h3>
            <div className="space-y-1 text-sm text-slate-600">
              {property.city && <p>{property.city}</p>}
              {property.district && <p>{property.district}</p>}
              {property.neighborhood && <p>{property.neighborhood}</p>}
              {property.address && <p className="text-slate-400 text-xs mt-1">{property.address}</p>}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Calendar size={16} /> Diğer
            </h3>
            <div className="space-y-1 text-sm text-slate-600">
              {property.source_url && (
                <a href={property.source_url} target="_blank"
                  className="text-blue-500 hover:underline text-xs block truncate">
                  Kaynak İlan
                </a>
              )}
              <p className="text-xs text-slate-400">
                Eklenme: {new Date(property.created_at).toLocaleDateString('tr-TR')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Özellikler */}
      {property.features && (property.features as string[]).length > 0 && (
        <div className="card mt-4">
          <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <CheckCircle size={16} /> Özellikler
          </h3>
          <div className="flex flex-wrap gap-2">
            {(property.features as string[]).map((f, i) => (
              <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Açıklama */}
      {property.description && (
        <div className="card mt-4">
          <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <Edit2 size={16} /> Açıklama
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">{property.description}</p>
        </div>
      )}

      {/* Fiyat & Komisyon Hesap */}
      {property.price && (
        <div className="card mt-4 bg-blue-50 border-blue-100">
          <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <DollarSign size={16} /> Hızlı Komisyon Hesabı
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            {[2, 3, 4].map(rate => (
              <div key={rate} className="bg-white rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">%{rate} Komisyon</p>
                <p className="font-bold text-slate-900 text-sm">
                  {formatPrice(property.price! * rate / 100)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
