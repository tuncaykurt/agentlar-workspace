'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Property, PropertyStatus } from '@/lib/types'
import {
  ArrowLeft, MapPin, Home, Eye, Edit2, Trash2,
  DollarSign, Building2, Calendar, CheckCircle, ChevronLeft, ChevronRight,
} from 'lucide-react'

const statusColors: Record<PropertyStatus, string> = {
  active: 'bg-green-100 text-green-700',
  under_offer: 'bg-yellow-100 text-yellow-700',
  sold: 'bg-surface-container-high text-on-surface-variant',
  rented: 'bg-primary-container text-primary',
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
  const [activePhoto, setActivePhoto] = useState(0)

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
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!property) return (
    <div className="p-6 text-center text-on-surface-variant">
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
          <Link href="/portfolio" className="text-on-surface-variant hover:text-on-surface-variant">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-on-surface">{property.title}</h1>
            {(property.city || property.district) && (
              <p className="text-sm text-on-surface-variant flex items-center gap-1 mt-0.5">
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

      {/* Fotoğraf Galerisi */}
      {property.photos && property.photos.length > 0 && (() => {
        const photos = property.photos as string[]
        return (
          <div className="card p-0 overflow-hidden mb-4">
            {/* Ana Foto */}
            <div className="relative">
              <img
                src={photos[activePhoto]}
                alt={`${property.title} - ${activePhoto + 1}`}
                className="w-full h-72 object-cover"
                onError={e => { (e.target as HTMLImageElement).src = '' }}
              />
              {/* Ok butonları */}
              {photos.length > 1 && (
                <>
                  <button
                    onClick={() => setActivePhoto(i => (i - 1 + photos.length) % photos.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setActivePhoto(i => (i + 1) % photos.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <div className="absolute bottom-2 right-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                    {activePhoto + 1} / {photos.length}
                  </div>
                </>
              )}
            </div>
            {/* Thumbnail'lar */}
            {photos.length > 1 && (
              <div className="flex gap-1.5 p-2 overflow-x-auto bg-surface-container-high">
                {photos.map((src, i) => (
                  <button key={i} onClick={() => setActivePhoto(i)}
                    className={`flex-shrink-0 rounded overflow-hidden border-2 transition-all ${
                      i === activePhoto ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={src} alt={`thumb-${i}`}
                      className="w-16 h-12 object-cover"
                      onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Durum Değiştir */}
      <div className="card mb-4">
        <p className="text-xs font-medium text-on-surface-variant mb-2">DURUM GÜNCELLE</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(statusLabels) as PropertyStatus[]).map(s => (
            <button key={s} onClick={() => handleStatusChange(s)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                property.status === s
                  ? statusColors[s] + ' border-transparent font-medium'
                  : 'border-outline text-on-surface-variant hover:bg-surface-container-high'
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
          <h3 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
            <Home size={16} /> Mülk Bilgileri
          </h3>
          <div className="space-y-2 text-sm">
            {property.price && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Fiyat</span>
                <span className="font-semibold text-on-surface">{formatPrice(property.price, property.currency)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Tip</span>
              <span className="text-on-surface">{property.property_type}</span>
            </div>
            {property.m2_gross && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Brüt m²</span>
                <span className="text-on-surface">{property.m2_gross} m²</span>
              </div>
            )}
            {property.m2_net && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Net m²</span>
                <span className="text-on-surface">{property.m2_net} m²</span>
              </div>
            )}
            {property.room_count && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Oda Sayısı</span>
                <span className="text-on-surface">{property.room_count}</span>
              </div>
            )}
            {property.floor != null && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Kat</span>
                <span className="text-on-surface">{property.floor}{property.total_floors ? ` / ${property.total_floors}` : ''}</span>
              </div>
            )}
            {property.age != null && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Bina Yaşı</span>
                <span className="text-on-surface">{property.age} yıl</span>
              </div>
            )}
            {property.heating_type && (
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Isıtma</span>
                <span className="text-on-surface">{property.heating_type}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-on-surface-variant flex items-center gap-1"><Eye size={12} /> Görüntülenme</span>
              <span className="text-on-surface">{property.view_count}</span>
            </div>
          </div>
        </div>

        {/* Konum & Danışman */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
              <MapPin size={16} /> Konum
            </h3>
            <div className="space-y-1 text-sm text-on-surface-variant">
              {property.city && <p>{property.city}</p>}
              {property.district && <p>{property.district}</p>}
              {property.neighborhood && <p>{property.neighborhood}</p>}
              {property.address && <p className="text-on-surface-variant text-xs mt-1">{property.address}</p>}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
              <Calendar size={16} /> Diğer
            </h3>
            <div className="space-y-1 text-sm text-on-surface-variant">
              {property.source_url && (
                <a href={property.source_url} target="_blank"
                  className="text-primary hover:underline text-xs block truncate">
                  Kaynak İlan
                </a>
              )}
              <p className="text-xs text-on-surface-variant">
                Eklenme: {new Date(property.created_at).toLocaleDateString('tr-TR')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Özellikler */}
      {property.features && (property.features as string[]).length > 0 && (
        <div className="card mt-4">
          <h3 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
            <CheckCircle size={16} /> Özellikler
          </h3>
          <div className="flex flex-wrap gap-2">
            {(property.features as string[]).map((f, i) => (
              <span key={i} className="text-xs bg-primary-container text-primary px-2 py-1 rounded-full">{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Açıklama */}
      {property.description && (
        <div className="card mt-4">
          <h3 className="font-semibold text-on-surface mb-2 flex items-center gap-2">
            <Edit2 size={16} /> Açıklama
          </h3>
          <p className="text-sm text-on-surface-variant leading-relaxed">{property.description}</p>
        </div>
      )}

      {/* Fiyat & Komisyon Hesap */}
      {property.price && (
        <div className="card mt-4 bg-primary-container border-primary/20">
          <h3 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
            <DollarSign size={16} /> Hızlı Komisyon Hesabı
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            {[2, 3, 4].map(rate => (
              <div key={rate} className="bg-surface-container rounded-lg p-3">
                <p className="text-xs text-on-surface-variant mb-1">%{rate} Komisyon</p>
                <p className="font-bold text-on-surface text-sm">
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
