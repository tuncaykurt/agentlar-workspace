'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Consultant } from '@/lib/types'
import {
  User, Phone, Mail, FileText, Award, Upload,
  Save, Loader2, CheckCircle, Plus, Trash2,
} from 'lucide-react'

export default function ProfilePage() {
  const [consultant, setConsultant] = useState<Consultant | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    bio: '',
    tax_number: '',
    id_number: '',
    address: '',
    instagram_handle: '',
    facebook_page: '',
    linkedin_url: '',
  })

  // Yeni sertifika ekleme
  const [newCert, setNewCert] = useState({ name: '', expires_at: '' })
  const [certifications, setCertifications] = useState<{ name: string; expires_at: string }[]>([])

  useEffect(() => { fetchProfile() }, [])

  async function fetchProfile() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('consultants')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data) {
      setConsultant(data as Consultant)
      setForm({
        full_name: data.full_name || '',
        phone: data.phone || '',
        bio: data.bio || '',
        tax_number: data.tax_number || '',
        id_number: data.id_number || '',
        address: data.address || '',
        instagram_handle: data.instagram_handle || '',
        facebook_page: data.facebook_page || '',
        linkedin_url: data.linkedin_url || '',
      })
      setCertifications(Array.isArray(data.certifications) ? data.certifications : [])
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!consultant) return
    setSaving(true)

    const supabase = createClient()
    const { error } = await supabase
      .from('consultants')
      .update({
        ...form,
        certifications: certifications,
      })
      .eq('id', consultant.id)

    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  function addCert() {
    if (!newCert.name) return
    setCertifications(c => [...c, { ...newCert }])
    setNewCert({ name: '', expires_at: '' })
  }

  function removeCert(index: number) {
    setCertifications(c => c.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const completionFields = [
    form.full_name, form.phone, form.bio, form.tax_number,
    consultant?.profile_photo_url, consultant?.authorization_doc_url,
    consultant?.tax_certificate_url, certifications.length > 0 ? 'ok' : '',
  ]
  const completionPct = Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Profilim</h1>
          <p className="text-slate-500 text-sm mt-1">Kişisel bilgilerinizi ve belgelerinizi yönetin</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <CheckCircle size={15} /> : <Save size={15} />}
          {saved ? 'Kaydedildi!' : 'Kaydet'}
        </button>
      </div>

      {/* Profil Tamamlık */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-slate-700">Profil Tamamlık</p>
          <span className={`text-sm font-bold ${completionPct >= 80 ? 'text-green-600' : completionPct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
            %{completionPct}
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${completionPct >= 80 ? 'bg-green-500' : completionPct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
            style={{ width: `${completionPct}%` }}
          />
        </div>
        {completionPct < 95 && (
          <p className="text-xs text-slate-500 mt-1.5">
            Profil tamamlık oranı yükseldikçe sistem tarafından daha az hatırlatma alırsınız.
          </p>
        )}
      </div>

      <div className="space-y-5">
        {/* Temel Bilgiler */}
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <User size={16} /> Kişisel Bilgiler
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ad Soyad</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <Phone size={12} /> Telefon
                </label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="05XX XXX XXXX"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <Mail size={12} /> E-posta
                </label>
                <input value={consultant?.email || ''} disabled
                  className="w-full border border-slate-100 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Adres</label>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="İlçe, Şehir"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bio / Hakkımda</label>
              <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                rows={3} placeholder="Kendinizi kısaca tanıtın..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>
        </div>

        {/* Resmi Belgeler */}
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <FileText size={16} /> Resmi Bilgiler
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vergi Numarası</label>
              <input value={form.tax_number} onChange={e => setForm(f => ({ ...f, tax_number: e.target.value }))}
                placeholder="1234567890"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">TC Kimlik No</label>
              <input value={form.id_number} onChange={e => setForm(f => ({ ...f, id_number: e.target.value }))}
                placeholder="12345678901"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Belge Yükleme Alanları */}
          <div className="mt-4 space-y-3">
            {[
              { label: 'Vergi Levhası', field: 'tax_certificate_url', url: consultant?.tax_certificate_url },
              { label: 'Kimlik (Ön)', field: 'id_front_url', url: consultant?.id_front_url },
              { label: 'Yetki Belgesi', field: 'authorization_doc_url', url: consultant?.authorization_doc_url },
            ].map(doc => (
              <div key={doc.field} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText size={15} className="text-slate-400" />
                  <span className="text-sm text-slate-700">{doc.label}</span>
                </div>
                {doc.url ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle size={12} /> Yüklendi
                    </span>
                    <a href={doc.url} target="_blank" className="text-xs text-blue-500 hover:underline">Görüntüle</a>
                  </div>
                ) : (
                  <button className="text-xs text-blue-600 flex items-center gap-1 hover:text-blue-800">
                    <Upload size={12} /> Yükle
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sertifikalar */}
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Award size={16} /> Sertifikalar & Yetkinlikler
          </h2>

          {certifications.length > 0 && (
            <div className="space-y-2 mb-3">
              {certifications.map((cert, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{cert.name}</p>
                    {cert.expires_at && (
                      <p className="text-xs text-slate-400">
                        Geçerlilik: {new Date(cert.expires_at).toLocaleDateString('tr-TR')}
                      </p>
                    )}
                  </div>
                  <button onClick={() => removeCert(i)} className="text-red-400 hover:text-red-600 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Yeni Sertifika */}
          <div className="flex gap-2">
            <input
              value={newCert.name}
              onChange={e => setNewCert(c => ({ ...c, name: e.target.value }))}
              placeholder="Sertifika adı (SPK, TDUB...)"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={newCert.expires_at}
              onChange={e => setNewCert(c => ({ ...c, expires_at: e.target.value }))}
              className="w-36 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={addCert} className="btn-secondary flex items-center gap-1 text-xs">
              <Plus size={13} /> Ekle
            </button>
          </div>
        </div>

        {/* Sosyal Medya */}
        <div className="card">
          <h2 className="font-semibold text-slate-900 mb-4">Sosyal Medya Hesapları</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-pink-500 text-lg flex-shrink-0">📷</span>
              <input value={form.instagram_handle}
                onChange={e => setForm(f => ({ ...f, instagram_handle: e.target.value }))}
                placeholder="@kullanici_adi"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4.5 h-4.5 flex-shrink-0 text-blue-600 font-bold text-sm">f</div>
              <input value={form.facebook_page}
                onChange={e => setForm(f => ({ ...f, facebook_page: e.target.value }))}
                placeholder="facebook.com/sayfaniz"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-blue-700 text-lg flex-shrink-0">in</span>
              <input value={form.linkedin_url}
                onChange={e => setForm(f => ({ ...f, linkedin_url: e.target.value }))}
                placeholder="linkedin.com/in/adsoyadiniz"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* Komisyon Bilgisi (Salt Okunur) */}
        {consultant && (
          <div className="card bg-slate-50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Komisyon Oranınız</p>
                <p className="text-xs text-slate-400 mt-0.5">Bu oran yönetici tarafından belirlenir</p>
              </div>
              <span className="text-2xl font-bold text-blue-600">%{consultant.commission_rate}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
