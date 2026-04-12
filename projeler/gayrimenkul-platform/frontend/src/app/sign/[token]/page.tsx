'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { CheckCircle, XCircle, PenLine, Type, Trash2, AlertCircle } from 'lucide-react'

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
}

type DocInfo = {
  id: string
  title: string
  doc_type: string
  template_data: Record<string, string | null>
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
        className="w-full h-36 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 touch-none cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
      <button
        onClick={clearCanvas}
        type="button"
        className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 bg-white rounded-lg p-1 shadow-sm border border-slate-200"
        title="Temizle"
      >
        <Trash2 size={14} />
      </button>
      <p className="text-xs text-slate-400 mt-1 text-center">Yukarıdaki alana imzanızı çizin</p>
    </div>
  )
}

// ─── Document Summary ─────────────────────────────────────────────────────────

function DocSummary({ doc, signerRole }: { doc: DocInfo; signerRole: string }) {
  const data = doc.template_data || {}

  const money = (v: string | null | undefined) => {
    if (!v) return null
    const n = parseFloat(v.replace(',', '.'))
    if (isNaN(n)) return v
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n)
  }

  const keyItems: { label: string; value: string | null | undefined }[] = []

  if (doc.doc_type === 'authorization') {
    keyItems.push(
      { label: 'Yetki Türü', value: data.yetki_turu },
      { label: 'Komisyon Oranı', value: data.komisyon_orani ? `%${data.komisyon_orani}` : null },
      { label: 'Yetki Süresi', value: data.yetki_suresi_gun ? `${data.yetki_suresi_gun} gün` : null },
    )
  } else if (doc.doc_type === 'sales_contract') {
    keyItems.push(
      { label: 'Satış Bedeli', value: money(data.satis_bedeli) },
      { label: 'Kapora', value: money(data.kapora) },
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

  if (data.ozel_sartlar) {
    keyItems.push({ label: 'Özel Şartlar', value: data.ozel_sartlar })
  }

  const roleLabel =
    signerRole === 'main'
      ? doc.doc_type === 'authorization' ? 'Mülk Sahibi'
        : doc.doc_type === 'sales_contract' ? 'Satıcı'
        : doc.doc_type === 'rental_contract' ? 'Kiraya Veren'
        : 'Alıcı'
      : doc.doc_type === 'sales_contract' ? 'Alıcı'
        : doc.doc_type === 'rental_contract' ? 'Kiracı'
        : 'İmzacı'

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <div>
        <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">{docTypeLabels[doc.doc_type]}</span>
        <h2 className="text-base font-bold text-slate-900 mt-0.5 leading-tight">{doc.title}</h2>
      </div>

      {doc.property && (
        <div className="text-sm text-slate-700">
          <span className="text-slate-500">Mülk: </span>
          <span className="font-medium">{doc.property.title}</span>
          {doc.property.city && <span className="text-slate-500"> · {doc.property.city}</span>}
        </div>
      )}

      {keyItems.filter(i => i.value).map(item => (
        <div key={item.label} className="flex justify-between text-sm">
          <span className="text-slate-500">{item.label}</span>
          <span className="font-semibold text-slate-900">{item.value}</span>
        </div>
      ))}

      <div className="pt-2 border-t border-blue-200">
        <p className="text-xs text-blue-700">
          <span className="font-semibold">Rolünüz:</span> {roleLabel}
        </p>
      </div>
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
  const [officeName, setOfficeName] = useState('Gayrimenkul Ofisi')

  const [tab, setTab] = useState<'draw' | 'type'>('draw')
  const [typedName, setTypedName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const getCanvasDataURL = useRef<(() => string | null) | null>(null)

  useEffect(() => {
    loadRequest()
  }, [token])

  async function loadRequest() {
    try {
      const supabase = createClient()

      // Fetch signature request by token
      const { data: req, error: reqErr } = await supabase
        .from('signature_requests')
        .select('*')
        .eq('token', token)
        .single()

      if (reqErr || !req) { setState('error'); return }

      setSigReq(req as SignRequest)

      if (req.status === 'signed') { setState('already_signed'); return }

      // Fetch document
      const { data: docData } = await supabase
        .from('documents')
        .select('id, title, doc_type, template_data, client:clients(full_name, salutation), property:properties(title, city)')
        .eq('id', req.document_id)
        .single()

      if (!docData) { setState('error'); return }
      setDoc(docData as DocInfo)

      // Fetch office name from settings
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'office_name')
        .single()
      if (setting?.value) setOfficeName(String(setting.value).replace(/^"|"$/g, ''))

      // Mark as viewed
      await supabase
        .from('signature_requests')
        .update({ status: 'viewed', viewed_at: new Date().toISOString() })
        .eq('id', req.id)
        .eq('status', 'pending')

      setState('ready')
    } catch {
      setState('error')
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
        body: JSON.stringify({ signatureData, signatureType }),
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (state === 'already_signed') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Zaten İmzalandı</h2>
          <p className="text-slate-500 text-sm">
            Bu belge <strong>{sigReq?.signer_name}</strong> tarafından{' '}
            {sigReq?.signed_at
              ? new Date(sigReq.signed_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
              : ''}{' '}
            tarihinde imzalanmıştır.
          </p>
          <p className="text-xs text-slate-400 mt-4">{officeName}</p>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle size={32} className="text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Geçersiz Link</h2>
          <p className="text-slate-500 text-sm">Bu imzalama linki geçersiz veya süresi dolmuş.</p>
          <p className="text-xs text-slate-400 mt-4">{officeName}</p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">İmzalandı!</h2>
          <p className="text-slate-500 text-sm mb-1">
            <strong>{sigReq?.signer_name}</strong>, belgeniz başarıyla imzalanmıştır.
          </p>
          <p className="text-slate-500 text-sm">
            {new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className="mt-4 p-3 bg-slate-50 rounded-lg text-left">
            <p className="text-xs text-slate-500 font-medium">{doc?.title}</p>
            {doc?.property && <p className="text-xs text-slate-400">{doc.property.title}</p>}
          </div>
          <p className="text-xs text-slate-400 mt-6">{officeName}</p>
        </div>
      </div>
    )
  }

  // ── Ready: show signing form ───────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 text-center">
        <p className="text-xs text-slate-500">{officeName}</p>
        <p className="text-sm font-semibold text-slate-900">Elektronik İmza</p>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4 pb-8">

        {/* Belge Özeti */}
        {doc && sigReq && <DocSummary doc={doc} signerRole={sigReq.signer_role} />}

        {/* İmzacı Bilgisi */}
        {sigReq && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-0.5">İmzacı</p>
            <p className="font-semibold text-slate-900">{sigReq.signer_name}</p>
            {sigReq.signer_phone && <p className="text-sm text-slate-500">{sigReq.signer_phone}</p>}
          </div>
        )}

        {/* İmza Alanı */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">İmzanız</p>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setTab('draw')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === 'draw' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              <PenLine size={14} /> İmza Çiz
            </button>
            <button
              onClick={() => setTab('type')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === 'type' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
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
                className="w-full px-3 py-3 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ fontFamily: 'cursive', fontSize: '18px' }}
              />
              <p className="text-xs text-slate-400 mt-1 text-center">
                Yazılan isim elektronik imzanız olarak kabul edilir
              </p>
            </div>
          )}
        </div>

        {/* Onay Checkbox */}
        <label className="flex items-start gap-3 bg-white rounded-xl border border-slate-200 p-4 cursor-pointer">
          <div className="relative mt-0.5">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 accent-blue-600"
            />
          </div>
          <span className="text-sm text-slate-700 leading-relaxed">
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
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 bg-blue-600 text-white font-semibold rounded-xl text-base hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'İmzalanıyor...' : 'Belgeyi İmzala'}
        </button>

        <p className="text-xs text-slate-400 text-center">
          Bu imzalama işlemi güvenli bir şekilde kaydedilmektedir.
          İşlem tarihi, saati ve IP adresi loglanmaktadır.
        </p>
      </div>
    </div>
  )
}
