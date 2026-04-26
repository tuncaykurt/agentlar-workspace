'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle, XCircle, PenLine, Type, Trash2, AlertCircle, ShieldCheck, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

const KVKK_SIGNING_TEXT = `6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında veri sorumlusu tarafından aşağıdaki kişisel verileriniz işlenecektir.

İşlenen Kişisel Veriler:
• Kimlik verileri: Ad, soyad
• İletişim verileri: Telefon numarası
• İşlem güvenliği verileri: Elektronik imza (çizili veya yazılı ad), işlem IP adresi, işlem tarih ve saati, cihaz/tarayıcı bilgisi
• KYC kimlik doğrulama kapsamında (zorunlu olması halinde): TC Kimlik No / Pasaport numarası, doğum tarihi, belge görseli — DiDit Teknoloji A.Ş. tarafından işlenmektedir

İşleme Amaçları:
• Elektronik imzalı belge ve sözleşmelerin oluşturulması ve arşivlenmesi
• İmzacı kimliğinin 5070 sayılı Elektronik İmza Kanunu kapsamında tespit edilmesi
• Uyuşmazlık durumunda hukuki ispat ve savunma hakkının kullanılması
• Yasal yükümlülüklerin (Türk Borçlar Kanunu, Tapu Kanunu vb.) yerine getirilmesi

Veri Aktarımı: Verileriniz; KYC hizmeti için DiDit'e ve yasal zorunluluk halinde yetkili kamu kurum ve kuruluşlarına aktarılabilir.

Saklama Süresi: İmzalı belgeler ve ilgili kişisel veriler imza tarihinden itibaren 10 yıl saklanacak; akabinde silinecek veya anonim hale getirilecektir.

Haklarınız (KVKK Md.11): Verilerinize erişim, düzeltme, silme, aktarım bilgisi talep etme ve işlemeye itiraz etme haklarına sahipsiniz.`

// ─── Types ────────────────────────────────────────────────────────────────────

type SignRequest = {
  id: string
  document_id: string
  signer_name: string
  signer_phone: string | null
  signer_role: string
  token: string
  status: string
  viewed_at: string | null
  signed_at: string | null
  kyc_status: string | null
  kyc_session_id: string | null
}

type DocInfo = {
  id: string
  title: string
  doc_type: string
  template_data: Record<string, string | null>
  kyc_required?: boolean
  client?: { full_name: string; salutation?: string } | null
  property?: { title: string; city?: string } | null
}

const docTypeLabels: Record<string, string> = {
  authorization:   'Yetki Belgesi',
  sales_contract:  'Satış Sözleşmesi',
  rental_contract: 'Kira Sözleşmesi',
  offer_letter:    'Teklif Mektubu',
  other:           'Belge',
}

// ─── Canvas Signature Pad ─────────────────────────────────────────────────────

function SignaturePad({ onReady }: { onReady: (getDataURL: () => string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const hasDrawn = useRef(false)

  function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const getDataURL = useCallback(() => {
    if (!hasDrawn.current) return null
    return canvasRef.current?.toDataURL('image/png') || null
  }, [])

  useEffect(() => {
    onReady(getDataURL)
  }, [onReady, getDataURL])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas resolution
    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2
    ctx.scale(1, 1)

    function onStart(e: MouseEvent | TouchEvent) {
      e.preventDefault()
      isDrawing.current = true
      lastPos.current = getPos(e, canvas!)
    }

    function onMove(e: MouseEvent | TouchEvent) {
      e.preventDefault()
      if (!isDrawing.current || !lastPos.current) return
      const ctx = canvas!.getContext('2d')!
      const pos = getPos(e, canvas!)
      ctx.beginPath()
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
      lastPos.current = pos
      hasDrawn.current = true
    }

    function onEnd() {
      isDrawing.current = false
      lastPos.current = null
    }

    canvas.addEventListener('mousedown', onStart)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseup', onEnd)
    canvas.addEventListener('mouseleave', onEnd)
    canvas.addEventListener('touchstart', onStart, { passive: false })
    canvas.addEventListener('touchmove', onMove, { passive: false })
    canvas.addEventListener('touchend', onEnd)

    return () => {
      canvas.removeEventListener('mousedown', onStart)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseup', onEnd)
      canvas.removeEventListener('mouseleave', onEnd)
      canvas.removeEventListener('touchstart', onStart)
      canvas.removeEventListener('touchmove', onMove)
      canvas.removeEventListener('touchend', onEnd)
    }
  }, [])

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    hasDrawn.current = false
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full h-36 border-2 border-dashed border-outline rounded-xl bg-white touch-none cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
      <button
        onClick={clearCanvas}
        type="button"
        className="absolute top-2 right-2 text-on-surface-variant hover:text-on-surface-variant bg-surface-container rounded-lg p-1 shadow-sm border border-outline"
        title="Temizle"
      >
        <Trash2 size={14} />
      </button>
      <p className="text-xs text-on-surface-variant mt-1 text-center">Yukarıdaki alana imzanızı çizin</p>
    </div>
  )
}

// ─── Document Summary ─────────────────────────────────────────────────────────

function DocSummary({ doc, signerRole, token }: { doc: DocInfo; signerRole: string; token: string }) {
  const [expanded, setExpanded] = useState(false)
  const data = doc.template_data || {}

  const money = (v: string | null | undefined) => {
    if (!v) return null
    const n = parseFloat(v.replace(',', '.'))
    if (isNaN(n)) return v
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n)
  }

  const fmtDate = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '___'

  const keyItems: { label: string; value: string | null | undefined }[] = []

  if (doc.doc_type === 'authorization') {
    keyItems.push(
      { label: 'Yetki Türü', value: data.yetki_turu },
      { label: 'Satış Tutarı', value: money(data.satis_tutari) },
      { label: 'Komisyon Oranı', value: data.komisyon_orani ? `%${data.komisyon_orani} + KDV (${data.komisyon_turu || 'Satıcıdan'})` : null },
      { label: 'Yetki Süresi', value: data.yetki_suresi_gun ? `${data.yetki_suresi_gun} gün` : null },
      { label: 'Başlangıç', value: fmtDate(data.baslangic_tarihi) },
    )
  } else if (doc.doc_type === 'sales_contract') {
    keyItems.push(
      { label: 'Satış Bedeli', value: money(data.satis_bedeli) },
      { label: 'Kapora', value: money(data.kapora) },
      { label: 'Tapuda Ödenecek', value: money(data.tapuda_odenecek) },
      { label: 'Hizmet Bedeli', value: money(data.hizmet_bedeli) },
    )
  } else if (doc.doc_type === 'rental_contract') {
    keyItems.push(
      { label: 'Aylık Kira', value: money(data.aylik_kira) },
      { label: 'Depozito', value: money(data.depozito) },
      { label: 'Süre', value: data.kira_suresi_ay ? `${data.kira_suresi_ay} ay` : null },
    )
  } else if (doc.doc_type === 'offer_letter') {
    keyItems.push({ label: 'Teklif Bedeli', value: money(data.teklif_bedeli) })
  }

  const roleLabel =
    signerRole === 'consultant' ? 'Danışman'
    : signerRole === 'other' ? 'Diğer İmzacı'
    : signerRole === 'main'
      ? doc.doc_type === 'authorization' ? 'Mülk Sahibi'
        : doc.doc_type === 'sales_contract' ? 'Satıcı'
        : doc.doc_type === 'rental_contract' ? 'Kiraya Veren'
        : 'İmzacı'
      : /* second */
        doc.doc_type === 'sales_contract' ? 'Alıcı'
        : doc.doc_type === 'rental_contract' ? 'Kiracı'
        : doc.doc_type === 'authorization' ? 'Alıcı Aday'
        : 'İmzacı'

  // Full contract text sections
  const contractSections: { title: string; rows: { label: string; value: string }[] }[] = []

  if (doc.doc_type === 'authorization') {
    contractSections.push({
      title: 'Taraf Bilgileri',
      rows: [
        { label: 'Mülk Sahibi', value: doc.client?.full_name || '___' },
        { label: 'Adres', value: (data.main_address as string) || '___' },
        { label: 'TC No', value: (data.main_tc_no as string) || '___' },
      ]
    }, {
      title: 'Mülk Bilgileri',
      rows: [
        ...(doc.property ? [{ label: 'Mülk', value: doc.property.title }] : []),
        ...(data.ada ? [{ label: 'Ada / Parsel / Pafta', value: `${data.ada} / ${data.parsel || '___'} / ${data.pafta || '___'}` }] : []),
      ]
    }, {
      title: 'Sözleşme Detayları',
      rows: [
        { label: 'Yetki Türü', value: (data.yetki_turu as string) || 'Satış' },
        { label: 'Satış Tutarı', value: money(data.satis_tutari) || '___' },
        { label: 'Ödeme Şekli', value: (data.odeme_sekli as string) || 'Nakit' },
        { label: 'Komisyon Oranı', value: `%${data.komisyon_orani || '2'} + KDV (${data.komisyon_turu || 'Satıcıdan'})` },
        { label: 'Yetki Süresi', value: `${data.yetki_suresi_gun || '90'} gün` },
        { label: 'Başlangıç', value: fmtDate(data.baslangic_tarihi) },
      ]
    })
    if (data.ozel_sartlar) contractSections.push({ title: 'Özel Şartlar', rows: [{ label: '', value: data.ozel_sartlar as string }] })
  } else if (doc.doc_type === 'sales_contract') {
    contractSections.push({
      title: 'Satış Detayları',
      rows: [
        { label: 'Satış Bedeli', value: money(data.satis_bedeli) || '___' },
        { label: 'Kapora', value: money(data.kapora) || '___' },
        { label: 'Kapora Tarihi', value: fmtDate(data.kapora_tarihi) },
        { label: 'Tapuda Ödenecek', value: money(data.tapuda_odenecek) || '___' },
        { label: 'Tapu Tescil Tarihi', value: fmtDate(data.teslim_tarihi) },
        { label: 'Toplam Hizmet Bedeli', value: money(data.hizmet_bedeli) || '___' },
        { label: 'Alıcıdan Hizmet Bedeli', value: money(data.hizmet_bedeli_alici) || '___' },
        { label: 'Satıcıdan Hizmet Bedeli', value: money(data.hizmet_bedeli_satici) || '___' },
      ]
    })
    if (data.ada) contractSections.push({ title: 'Tapu Bilgileri', rows: [{ label: 'Ada / Parsel / Pafta', value: `${data.ada} / ${data.parsel || '___'} / ${data.pafta || '___'}` }] })
    if (data.ozel_sartlar) contractSections.push({ title: 'Özel Şartlar', rows: [{ label: '', value: data.ozel_sartlar as string }] })
  }

  return (
    <div className="bg-primary-container border border-primary/20 rounded-xl overflow-hidden">
      {/* Summary */}
      <div className="p-4 space-y-3">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">{docTypeLabels[doc.doc_type]}</span>
          <h2 className="text-base font-bold text-on-surface mt-0.5 leading-tight">{doc.title}</h2>
        </div>

        {doc.property && (
          <div className="text-sm text-on-surface">
            <span className="text-on-surface-variant">Mülk: </span>
            <span className="font-medium">{doc.property.title}</span>
            {doc.property.city && <span className="text-on-surface-variant"> · {doc.property.city}</span>}
          </div>
        )}

        {keyItems.filter(i => i.value).map(item => (
          <div key={item.label} className="flex justify-between text-sm">
            <span className="text-on-surface-variant">{item.label}</span>
            <span className="font-semibold text-on-surface">{item.value}</span>
          </div>
        ))}

        <div className="pt-2 border-t border-primary/20 flex items-center justify-between">
          <p className="text-xs text-primary">
            <span className="font-semibold">Rolünüz:</span> {roleLabel}
          </p>
          <a
            href={`/api/sign/${token}/preview`}
            className="text-xs font-semibold text-primary underline underline-offset-2"
          >
            Belgeyi Görüntüle ↗
          </a>
        </div>
      </div>

      {/* Full contract view */}
      {expanded && contractSections.length > 0 && (
        <div className="border-t border-primary/20 bg-surface-container px-4 py-4 space-y-4">
          {contractSections.map(section => (
            <div key={section.title}>
              {section.title && <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2">{section.title}</p>}
              <div className="space-y-1">
                {section.rows.map((row, i) => (
                  <div key={i} className={row.label ? 'flex justify-between text-sm' : 'text-sm text-on-surface leading-relaxed'}>
                    {row.label && <span className="text-on-surface-variant shrink-0 mr-3">{row.label}</span>}
                    <span className="font-medium text-on-surface text-right">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PageState = 'loading' | 'ready' | 'already_signed' | 'expired' | 'error' | 'success'

export default function SignPage() {
  const { token } = useParams<{ token: string }>()

  const [state, setState] = useState<PageState>('loading')
  const [sigReq, setSigReq] = useState<SignRequest | null>(null)
  const [doc, setDoc] = useState<DocInfo | null>(null)
  const [officeName, setOfficeName] = useState('Ambiance Gayrimenkul')

  const [officeLogo, setOfficeLogo] = useState<string | null>(null)

  const [tab, setTab] = useState<'draw' | 'type'>('draw')
  const [typedName, setTypedName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [kycRequired, setKycRequired] = useState(false)
  const [kycStatus, setKycStatus] = useState<string | null>(null)
  const [kycStarted, setKycStarted] = useState(false)
  const [kycLoading, setKycLoading] = useState(false)
  const [kycError, setKycError] = useState('')

  const [kvkkAgreed, setKvkkAgreed] = useState(false)
  const [kvkkExpanded, setKvkkExpanded] = useState(false)

  const getCanvasDataURL = useRef<(() => string | null) | null>(null)

  useEffect(() => {
    loadRequest()
  }, [token])

  async function loadRequest() {
    try {
      // Use API route (service_role) — avoids RLS issues with anon client
      const res = await fetch(`/api/sign/${token}`)
      if (!res.ok) { setState('error'); return }

      const { sigReq: req, doc: docData, officeName: name, officeLogo: logo } = await res.json()

      if (!req) { setState('error'); return }
      setSigReq(req as SignRequest)
      if (name) setOfficeName(name)
      if (logo) setOfficeLogo(logo)

      if (req.status === 'signed') { setState('already_signed'); return }

      if (!docData) { setState('error'); return }
      const docInfo = docData as DocInfo
      setDoc(docInfo)

      setKycRequired(!!docInfo.kyc_required)
      const loadedKycStatus = (req as SignRequest).kyc_status || null
      setKycStatus(loadedKycStatus)
      // If a session already exists (user returning from DiDit), auto-start polling
      if ((req as SignRequest).kyc_session_id && loadedKycStatus !== 'approved') {
        setKycStarted(true)
      }

      setState('ready')
    } catch {
      setState('error')
    }
  }

  // Poll for KYC approval after user starts DiDit flow
  useEffect(() => {
    if (!kycStarted || kycStatus === 'approved') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sign/${token}`)
        if (!res.ok) return
        const data = await res.json()
        const newStatus = data.sigReq?.kyc_status as string | null
        if (newStatus && newStatus !== kycStatus) setKycStatus(newStatus)
      } catch {
        // silently ignore polling errors
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [kycStarted, kycStatus, token])

  async function handleStartKyc() {
    setKycLoading(true)
    setKycError('')
    try {
      const res = await fetch('/api/didit/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) { setKycError(data.error || 'Doğrulama başlatılamadı.'); return }
      if (data.already_approved) { setKycStatus('approved'); return }
      setKycStarted(true)
      // Redirect in same window — avoids in-app browser (WhatsApp/Facebook)
      // DiDit will redirect back to callback URL (/sign/token) after completion
      window.location.href = data.url
    } catch {
      setKycError('Bağlantı hatası. Lütfen tekrar deneyin.')
    } finally {
      setKycLoading(false)
    }
  }

  async function handleSubmit() {
    if (!sigReq || !doc) return
    if (!agreed) { setError('Lütfen belgeyi okuduğunuzu onaylayın.'); return }

    let signatureData: string | null = null
    let signatureType: string = 'drawn'

    if (tab === 'draw') {
      signatureData = getCanvasDataURL.current ? getCanvasDataURL.current() : null
      if (!signatureData) { setError('Lütfen imzanızı çizin.'); return }
      signatureType = 'drawn'
    } else {
      if (!typedName.trim() || typedName.trim().length < 2) {
        setError('Lütfen adınızı yazın.')
        return
      }
      signatureData = typedName.trim()
      signatureType = 'typed'
    }

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureData, signatureType, kvkkConsent: true }),
      })

      const result = await res.json()
      if (!res.ok) {
        setError(result.error || 'Bir hata oluştu.')
        setSubmitting(false)
        return
      }

      setState('success')
    } catch {
      setError('Bağlantı hatası. Lütfen tekrar deneyin.')
      setSubmitting(false)
    }
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-surface-container-high flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (state === 'already_signed') {
    return (
      <div className="min-h-screen bg-surface-container-high flex items-center justify-center p-4">
        <div className="bg-surface-container rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          {officeLogo && (
            <img src={officeLogo} alt={officeName} className="h-14 max-w-[180px] object-contain mx-auto mb-5" />
          )}
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-on-surface mb-2">Zaten İmzalandı</h2>
          <p className="text-on-surface-variant text-sm">
            Bu belge <strong>{sigReq?.signer_name}</strong> tarafından{' '}
            {sigReq?.signed_at
              ? new Date(sigReq.signed_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
              : ''}{' '}
            tarihinde imzalanmıştır.
          </p>
          <a
            href={`/api/sign/${token}/preview`}
            className="mt-5 inline-block w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition text-center"
          >
            Belgeyi Görüntüle / PDF İndir
          </a>
          <p className="text-xs text-on-surface-variant mt-4">{officeName}</p>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-surface-container-high flex items-center justify-center p-4">
        <div className="bg-surface-container rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle size={32} className="text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-on-surface mb-2">Geçersiz Link</h2>
          <p className="text-on-surface-variant text-sm">Bu imzalama linki geçersiz veya süresi dolmuş.</p>
          <p className="text-xs text-on-surface-variant mt-4">{officeName}</p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen bg-surface-container-high flex items-center justify-center p-4">
        <div className="bg-surface-container rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          {officeLogo && (
            <img src={officeLogo} alt={officeName} className="h-14 max-w-[180px] object-contain mx-auto mb-5" />
          )}
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-on-surface mb-2">İmzalandı!</h2>
          <p className="text-on-surface-variant text-sm mb-1">
            <strong>{sigReq?.signer_name}</strong>, belgeniz başarıyla imzalanmıştır.
          </p>
          <p className="text-on-surface-variant text-sm">
            {new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className="mt-4 p-3 bg-surface-container-high rounded-lg text-left">
            <p className="text-xs text-on-surface-variant font-medium">{doc?.title}</p>
            {doc?.property && <p className="text-xs text-on-surface-variant">{doc.property.title}</p>}
          </div>
          <a
            href={`/api/sign/${token}/preview`}
            className="mt-5 inline-block w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition text-center"
          >
            Belgeyi Görüntüle / PDF İndir
          </a>
          <p className="text-xs text-on-surface-variant mt-6">{officeName}</p>
        </div>
      </div>
    )
  }

  // ── Ready: show signing form (with optional KYC section inline) ──────────

  const kycApproved = kycStatus === 'approved'
  const kycBlocked = kycRequired && !kycApproved

  return (
    <div className="min-h-screen bg-surface-container-high">
      {/* Header */}
      <div className="bg-surface-container border-b border-outline px-4 py-3 text-center">
        {officeLogo
          ? <img src={officeLogo} alt={officeName} className="h-10 max-w-[160px] object-contain mx-auto mb-1" />
          : <p className="text-xs text-on-surface-variant">{officeName}</p>
        }
        <p className="text-sm font-semibold text-on-surface">Elektronik İmza</p>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4 pb-8">

        {/* Belge Özeti */}
        {doc && sigReq && <DocSummary doc={doc} signerRole={sigReq.signer_role} token={token} />}

        {/* İmzacı Bilgisi */}
        {sigReq && (
          <div className="bg-surface-container rounded-xl border border-outline p-4">
            <p className="text-xs text-on-surface-variant mb-0.5">İmzacı</p>
            <p className="font-semibold text-on-surface">{sigReq.signer_name}</p>
            {sigReq.signer_phone && <p className="text-sm text-on-surface-variant">{sigReq.signer_phone}</p>}
          </div>
        )}

        {/* KYC Section — shown only when required */}
        {kycRequired && (
          <div className={`rounded-xl border p-4 space-y-3 ${kycApproved ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${kycApproved ? 'bg-green-100' : 'bg-amber-100'}`}>
                {kycApproved
                  ? <CheckCircle size={22} className="text-green-600" />
                  : <ShieldCheck size={22} className="text-amber-600" />}
              </div>
              <div>
                <p className={`text-sm font-semibold ${kycApproved ? 'text-green-800' : 'text-amber-800'}`}>
                  {kycApproved ? 'Kimlik Doğrulandı' : 'Kimlik Doğrulama Gerekli'}
                </p>
                <p className={`text-xs ${kycApproved ? 'text-green-700' : 'text-amber-700'}`}>
                  {kycApproved
                    ? 'Kimliğiniz başarıyla doğrulandı. Artık imzalayabilirsiniz.'
                    : 'İmzalamadan önce kimliğinizi DiDit ile doğrulamanız gerekmektedir.'}
                </p>
              </div>
            </div>

            {!kycApproved && (
              <>
                {!kycStarted ? (
                  <>
                    <div className="bg-white/70 rounded-lg p-3 space-y-1.5 text-xs text-amber-800">
                      <p className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">1</span>
                        TC Kimlik Kartı veya Pasaportunuzu hazırlayın
                      </p>
                      <p className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">2</span>
                        Aşağıdaki butona tıklayın — açılan ekranda <strong>Türkiye</strong> seçili gelecektir
                      </p>
                      <p className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">3</span>
                        Doğrulama tamamlandığında bu sayfaya dönün ve imzalayın
                      </p>
                    </div>
                    {kycError && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                        <AlertCircle size={12} className="shrink-0" />
                        {kycError}
                      </div>
                    )}
                    <button
                      onClick={handleStartKyc}
                      disabled={kycLoading}
                      className="w-full py-3 bg-amber-600 text-white font-semibold rounded-xl text-sm hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {kycLoading
                        ? <><Loader2 size={15} className="animate-spin" /> Hazırlanıyor...</>
                        : <><ShieldCheck size={15} /> Kimliğimi Doğrula</>}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-amber-700 text-sm">
                      <Loader2 size={16} className="animate-spin" />
                      <span>Doğrulama bekleniyor... Sayfa otomatik güncellenecek.</span>
                    </div>
                    {kycStatus === 'declined' && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                        <XCircle size={12} className="shrink-0" />
                        Kimlik doğrulama reddedildi. Danışmanınızla iletişime geçin.
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setKycStarted(false); handleStartKyc() }}
                        className="flex-1 py-2 border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                      >
                        Yeniden Aç
                      </button>
                      <button
                        onClick={() => window.location.reload()}
                        className="flex-1 py-2 border border-amber-300 rounded-lg text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                      >
                        Durumu Yenile
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* İmza Alanı */}
        <div className="bg-surface-container rounded-xl border border-outline p-4 space-y-3">
          <p className="text-sm font-semibold text-on-surface">İmzanız</p>

          {/* Tabs */}
          <div className="flex gap-1 bg-surface-container-high rounded-lg p-1">
            <button
              onClick={() => setTab('draw')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === 'draw' ? 'bg-surface-container text-on-surface shadow-sm' : 'text-on-surface-variant'
              }`}
            >
              <PenLine size={14} /> İmza Çiz
            </button>
            <button
              onClick={() => setTab('type')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === 'type' ? 'bg-surface-container text-on-surface shadow-sm' : 'text-on-surface-variant'
              }`}
            >
              <Type size={14} /> İsim Yaz
            </button>
          </div>

          {tab === 'draw' ? (
            <SignaturePad
              onReady={(fn) => { getCanvasDataURL.current = fn }}
            />
          ) : (
            <div>
              <input
                type="text"
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                placeholder="Adınızı ve soyadınızı yazın..."
                className="w-full px-3 py-3 border border-outline rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ fontFamily: 'cursive', fontSize: '18px' }}
              />
              <p className="text-xs text-on-surface-variant mt-1 text-center">
                Yazılan isim elektronik imzanız olarak kabul edilir
              </p>
            </div>
          )}
        </div>

        {/* KVKK Consent */}
        <div className="border border-outline rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setKvkkExpanded(!kvkkExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 bg-surface-container-high text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
          >
            <span>KVKK Aydınlatma Metni ve Açık Rıza</span>
            {kvkkExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {kvkkExpanded && (
            <div className="px-4 py-3 bg-surface text-xs text-on-surface-variant leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-outline">
              {KVKK_SIGNING_TEXT}
            </div>
          )}
          <label className="flex items-start gap-3 px-4 py-3 border-t border-outline bg-surface cursor-pointer">
            <input
              type="checkbox"
              checked={kvkkAgreed}
              onChange={e => setKvkkAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
            />
            <span className="text-xs text-on-surface leading-relaxed">
              <strong>KVKK Aydınlatma Metnini</strong> okudum, anladım; kişisel verilerimin ve KYC kapsamındaki kimlik verilerimin belirtilen amaçlarla işlenmesine <strong>açık rıza veriyorum.</strong>
            </span>
          </label>
        </div>

        {/* Belge Onay Checkbox */}
        <label className="flex items-start gap-3 bg-surface-container rounded-xl border border-outline p-4 cursor-pointer">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="w-5 h-5 rounded border-outline accent-blue-600"
            />
          </div>
          <span className="text-sm text-on-surface leading-relaxed">
            Yukarıda özetlenen <strong>{doc ? docTypeLabels[doc.doc_type] : 'belgeyi'}</strong> okuduğumu,
            anladığımı ve içeriğini onayladığımı beyan ederim. Bu elektronik imzanın 5070 sayılı
            Elektronik İmza Kanunu kapsamında geçerli olduğunu kabul ediyorum.
          </span>
        </label>

        {/* Hata */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            <AlertCircle size={14} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        {kycBlocked && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
            <ShieldCheck size={14} className="shrink-0" />
            Kimlik doğrulamanızı tamamladıktan sonra imzalayabilirsiniz.
          </div>
        )}
        {!kvkkAgreed && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800">
            <AlertCircle size={14} className="shrink-0" />
            KVKK Aydınlatma Metnini onaylamanız gerekmektedir.
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || !agreed || !kvkkAgreed || kycBlocked}
          className="w-full py-4 bg-primary text-white font-semibold rounded-xl text-base hover:bg-primary-hover active:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'İmzalanıyor...' : 'Belgeyi İmzala'}
        </button>

        <p className="text-xs text-on-surface-variant text-center">
          Bu imzalama işlemi güvenli bir şekilde kaydedilmektedir.
          İşlem tarihi, saati ve IP adresi loglanmaktadır.
        </p>
      </div>
    </div>
  )
}
