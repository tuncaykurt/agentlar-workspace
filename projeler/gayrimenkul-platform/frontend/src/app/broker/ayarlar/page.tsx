'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Office, Brand } from '@/lib/types'
import {
  Settings, Save, Upload, X, CheckCircle, Building2,
  Tag, Loader2, Image as ImageIcon, Info,
} from 'lucide-react'

type OfficeForm = {
  name: string
  address: string
  phone: string
  email: string
  tax_no: string
  brand_id: string
  logo_url: string
  default_total_commission_rate: number
  default_office_share_rate: number
  default_consultant_share_rate: number
}

const BRAND_INFO: Record<string, { website?: string; description?: string }> = {
  'RE/MAX':               { website: 'remax.com.tr',         description: 'Dünya genelinde 140.000+ ofis. Aylık royalty + reklam fonu (REMAX tarafından belirlenir).' },
  'Century 21':           { website: 'century21.com.tr',     description: 'Century 21 Türkiye franchise ağı. Marka kitini ve training desteğini kapsar.' },
  'Coldwell Banker':      { website: 'coldwellbanker.com.tr', description: 'CB Net listeleme sistemi dahil. Uluslararası referans ağına erişim sağlar.' },
  'ERA Real Estate':      { website: 'era.com.tr',           description: 'ERA Türkiye franchise. ERA Connect yazılımı ve global ağ dahil.' },
  'Keller Williams':      { website: 'kwturkey.com',          description: 'KW Command sistemi. Kap uygulandığında ek royalty alınmaz.' },
  'Engel & Völkers':      { website: 'engelvoelkers.com/tr', description: 'Lüks segment odaklı. Şehir lisansı gerektirir.' },
  "Sotheby's Realty TR":  { website: 'sothebysrealty.com',   description: 'Sotheby\'s International Realty Türkiye. Premium mülk segmenti.' },
  'Turyap':               { website: 'turyap.com.tr',        description: 'Yerli zincir marka. Türkiye genelinde 200+ ofis.' },
  'Zingat Ofis':          { website: 'zingat.com',           description: 'Zingat kurumsal ofis ağı. Portal görünürlüğü avantajı.' },
  'Hepsiemlak Ofis':      { website: 'hepsiemlak.com',       description: 'Hepsiemlak kurumsal ofis programı.' },
  'emlakjet Ofis':        { website: 'emlakjet.com',         description: 'emlakjet kurumsal ofis programı.' },
}

function formatRate(rate: number) {
  return `%${rate.toFixed(2).replace('.00', '')}`
}

export default function BrokerAyarlarPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [offices, setOffices] = useState<Office[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<OfficeForm>({
    name: '',
    address: '',
    phone: '',
    email: '',
    tax_no: '',
    brand_id: '',
    logo_url: '',
    default_total_commission_rate: 3,
    default_office_share_rate: 50,
    default_consultant_share_rate: 50,
  })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [oRes, bRes] = await Promise.all([
      supabase.from('offices').select('*').order('name'),
      supabase.from('brands').select('*').order('name'),
    ])
    if (oRes.data && oRes.data.length > 0) {
      setOffices(oRes.data as Office[])
      setSelectedOfficeId(oRes.data[0].id)
    }
    if (bRes.data) setBrands(bRes.data as Brand[])
    setLoading(false)
  }

  useEffect(() => {
    const office = offices.find(o => o.id === selectedOfficeId)
    if (!office) return
    setForm({
      name: office.name || '',
      address: office.address || '',
      phone: office.phone || '',
      email: office.email || '',
      tax_no: office.tax_no || '',
      brand_id: office.brand_id || '',
      logo_url: office.logo_url || '',
      default_total_commission_rate: office.default_total_commission_rate ?? 3,
      default_office_share_rate: office.default_office_share_rate ?? 50,
      default_consultant_share_rate: office.default_consultant_share_rate ?? 50,
    })
  }, [selectedOfficeId, offices])

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedOfficeId) return

    const ext = file.name.split('.').pop()
    const path = `office-logos/${selectedOfficeId}.${ext}`
    setUploadingLogo(true)
    setError(null)

    const { data, error: upErr } = await supabase.storage
      .from('consultant-docs')
      .upload(path, file, { upsert: true })

    if (upErr) {
      setError('Logo yüklenemedi: ' + upErr.message)
      setUploadingLogo(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('consultant-docs')
      .getPublicUrl(data.path)

    setForm(f => ({ ...f, logo_url: urlData.publicUrl }))
    setUploadingLogo(false)
  }

  async function handleSave() {
    if (!selectedOfficeId) return
    setSaving(true)
    setError(null)

    const { error: err } = await supabase
      .from('offices')
      .update({
        name: form.name,
        address: form.address,
        phone: form.phone,
        email: form.email,
        tax_no: form.tax_no,
        brand_id: form.brand_id || null,
        logo_url: form.logo_url || null,
        default_total_commission_rate: form.default_total_commission_rate,
        default_office_share_rate: form.default_office_share_rate,
        default_consultant_share_rate: form.default_consultant_share_rate,
      })
      .eq('id', selectedOfficeId)

    setSaving(false)
    if (err) {
      setError('Kayıt hatası: ' + err.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      fetchData()
    }
  }

  const selectedBrand = brands.find(b => b.id === form.brand_id)
  const brandExtra = selectedBrand ? BRAND_INFO[selectedBrand.name] : null

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <Settings size={22} className="text-primary" />
            Ofis Ayarları
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Logo, marka ve komisyon ayarlarını buradan yönetin
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
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <CheckCircle size={15} /> : <Save size={15} />}
            {saved ? 'Kaydedildi' : 'Kaydet'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm flex items-center gap-2">
          <X size={15} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol kolon — Logo + Kimlik */}
        <div className="space-y-6">
          {/* Logo */}
          <div className="card">
            <h2 className="text-base font-semibold text-on-surface mb-4 flex items-center gap-2">
              <ImageIcon size={16} className="text-primary" /> Ofis Logosu
            </h2>

            <div className="flex flex-col items-center gap-3">
              <div
                className="w-32 h-32 rounded-xl border-2 border-dashed border-outline flex items-center justify-center overflow-hidden bg-surface-container cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Logo"
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <div className="flex flex-col items-center text-on-surface-variant gap-1">
                    <Building2 size={32} className="opacity-40" />
                    <span className="text-xs">Logo yok</span>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
                className="btn-secondary flex items-center gap-2 text-sm w-full justify-center"
              >
                {uploadingLogo
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Upload size={14} />}
                {uploadingLogo ? 'Yükleniyor...' : 'Logo Yükle'}
              </button>

              {form.logo_url && (
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, logo_url: '' }))}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                >
                  <X size={12} /> Logoyu kaldır
                </button>
              )}
              <p className="text-xs text-on-surface-variant text-center">PNG, JPG veya SVG — maks. 2MB</p>
            </div>
          </div>

          {/* Komisyon oranları */}
          <div className="card">
            <h2 className="text-base font-semibold text-on-surface mb-4 flex items-center gap-2">
              <Tag size={16} className="text-primary" /> Komisyon Oranları
            </h2>
            <div className="space-y-3">
              <Field label="Müşteriden alınan %">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="20"
                  className="input"
                  value={form.default_total_commission_rate}
                  onChange={e => setForm(f => ({ ...f, default_total_commission_rate: Number(e.target.value) }))}
                />
              </Field>
              <div className="pt-2 border-t border-outline">
                <p className="text-xs text-on-surface-variant mb-2">
                  {selectedBrand ? `HQ sonrası kalan dağılımı (${formatRate(selectedBrand.hq_share_rate)} HQ düşüldükten sonra):` : 'Dağılım (HQ yoksa):'}
                </p>
                <Field label="Ofis payı %">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    className="input"
                    value={form.default_office_share_rate}
                    onChange={e => setForm(f => ({ ...f, default_office_share_rate: Number(e.target.value) }))}
                  />
                </Field>
                <div className="mt-2">
                  <Field label="Danışman payı %">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      className="input"
                      value={form.default_consultant_share_rate}
                      onChange={e => setForm(f => ({ ...f, default_consultant_share_rate: Number(e.target.value) }))}
                    />
                  </Field>
                </div>
              </div>
              {(form.default_office_share_rate + form.default_consultant_share_rate) !== 100 && (
                <p className="text-xs text-orange-600 flex items-center gap-1">
                  <Info size={12} />
                  Ofis + danışman toplamı {form.default_office_share_rate + form.default_consultant_share_rate}% (ideal: 100%)
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Orta + Sağ kolon */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ofis bilgileri */}
          <div className="card">
            <h2 className="text-base font-semibold text-on-surface mb-4 flex items-center gap-2">
              <Building2 size={16} className="text-primary" /> Ofis Bilgileri
            </h2>
            <div className="space-y-3">
              <Field label="Ofis Adı">
                <input
                  className="input"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </Field>
              <Field label="Adres">
                <textarea
                  className="input"
                  rows={2}
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telefon">
                  <input
                    className="input"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  />
                </Field>
                <Field label="E-posta">
                  <input
                    type="email"
                    className="input"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Vergi / TC Kimlik No">
                <input
                  className="input"
                  value={form.tax_no}
                  onChange={e => setForm(f => ({ ...f, tax_no: e.target.value }))}
                />
              </Field>
            </div>
          </div>

          {/* Franchise / Marka */}
          <div className="card">
            <h2 className="text-base font-semibold text-on-surface mb-1 flex items-center gap-2">
              <Tag size={16} className="text-primary" /> Franchise Markası
            </h2>
            <p className="text-xs text-on-surface-variant mb-4">
              Seçilen markanın HQ payı, her satış kapatmada otomatik olarak düşülür.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {/* Bağımsız seçeneği */}
              <BrandCard
                name="Bağımsız"
                rate={0}
                description="Franchise ödemesi yok"
                selected={!form.brand_id}
                onClick={() => setForm(f => ({ ...f, brand_id: '' }))}
              />
              {brands.filter(b => b.name !== 'Bağımsız').map(b => (
                <BrandCard
                  key={b.id}
                  name={b.name}
                  rate={b.hq_share_rate}
                  description={BRAND_INFO[b.name]?.description}
                  selected={form.brand_id === b.id}
                  onClick={() => setForm(f => ({ ...f, brand_id: b.id }))}
                />
              ))}
            </div>

            {/* Seçili marka detayı */}
            {selectedBrand && (
              <div className="mt-4 p-3 rounded-lg bg-primary-container text-primary text-sm space-y-1">
                <p className="font-semibold">{selectedBrand.name} — HQ payı {formatRate(selectedBrand.hq_share_rate)}</p>
                {brandExtra?.description && (
                  <p className="text-xs opacity-80">{brandExtra.description}</p>
                )}
                {brandExtra?.website && (
                  <a
                    href={`https://${brandExtra.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline opacity-70 hover:opacity-100"
                  >
                    {brandExtra.website}
                  </a>
                )}
                <p className="text-xs opacity-70 pt-1 border-t border-primary/20 mt-1">
                  HQ payı ve iletişim bilgilerini değiştirmek için sistem yöneticisine başvurun.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Kaydet — mobil için alt buton */}
      <div className="mt-6 flex justify-end lg:hidden">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </div>
  )
}

function BrandCard({
  name, rate, description, selected, onClick,
}: {
  name: string
  rate: number
  description?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition-all ${
        selected
          ? 'border-primary bg-primary-container'
          : 'border-outline hover:border-primary/50 hover:bg-surface-container-high'
      }`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-sm font-medium text-on-surface">{name}</span>
        {selected && <CheckCircle size={14} className="text-primary flex-shrink-0" />}
      </div>
      <span className={`text-xs font-semibold ${rate > 0 ? 'text-orange-600' : 'text-green-600'}`}>
        HQ {formatRate(rate)}
      </span>
      {description && (
        <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{description}</p>
      )}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-on-surface mb-1">{label}</label>
      {children}
    </div>
  )
}
