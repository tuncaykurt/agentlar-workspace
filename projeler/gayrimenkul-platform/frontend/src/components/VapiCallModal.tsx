'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Phone, PhoneOff, Send, X,
  Volume2, VolumeX, Clock, CheckCircle, AlertCircle, Loader2,
  Mic, MessageSquare,
} from 'lucide-react'

type CallState = 'idle' | 'starting' | 'ringing' | 'in-progress' | 'ended' | 'error'

type TranscriptEntry = {
  role: 'assistant' | 'user' | 'system'
  text: string
  time: string
}

interface VapiCallModalProps {
  isOpen: boolean
  onClose: () => void
  listing: {
    id: string
    seller_name: string
    seller_phone: string
    title: string
    price: number
    currency: string
    city: string
    district: string
  }
}

const QUICK_COMMANDS = [
  'Randevu için bu haftayı öner',
  'Fiyat konusunda esnek olup olmadığını sor',
  'Mülkün durumu hakkında detay sor',
  'Teşekkür et ve konuşmayı kapat',
]

export default function VapiCallModal({ isOpen, onClose, listing }: VapiCallModalProps) {
  const [callState, setCallState] = useState<CallState>('idle')
  const [callId, setCallId] = useState<string | null>(null)
  const [monitorUrl, setMonitorUrl] = useState<string | null>(null)
  const [controlUrl, setControlUrl] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [command, setCommand] = useState('')
  const [sendingCmd, setSendingCmd] = useState(false)
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const [summary, setSummary] = useState<string | null>(null)
  const [sentiment, setSentiment] = useState<Record<string, string> | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)

  const listenWsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const controlUrlRef = useRef<string | null>(null)

  const now = () => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const cleanup = useCallback(() => {
    if (listenWsRef.current) { listenWsRef.current.close(); listenWsRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
    nextPlayTimeRef.current = 0
    setIsListening(false)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      cleanup()
      setCallState('idle')
      setElapsedSecs(0)
      setTranscript([])
      setSummary(null)
      setSentiment(null)
      setCallId(null)
      setMonitorUrl(null)
      setControlUrl(null)
      controlUrlRef.current = null
      setErrorMsg(null)
    }
    return cleanup
  }, [isOpen, cleanup])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // controlUrl ref'ini senkron tut
  useEffect(() => { controlUrlRef.current = controlUrl }, [controlUrl])

  /* ── Canlı Ses Dinleme ── */
  const startListening = useCallback((url: string) => {
    if (!url) return
    if (listenWsRef.current) { listenWsRef.current.close(); listenWsRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }

    try {
      // Tarayıcının default sample rate'ini kullan (genelde 44100 veya 48000)
      // Vapi'den gelen PCM verisi muhtemelen 8kHz (telefon) veya 16kHz
      // İlk chunk'tan sample rate'i otomatik tespit edeceğiz
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      nextPlayTimeRef.current = 0

      const ws = new WebSocket(url)
      listenWsRef.current = ws
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => setIsListening(true)

      const playPcm16 = (raw: ArrayBuffer, inputRate: number) => {
        const ctx = audioCtxRef.current
        if (!ctx || raw.byteLength === 0) return
        try {
          const pcm16 = new Int16Array(raw)
          const float32 = new Float32Array(pcm16.length)
          for (let i = 0; i < pcm16.length; i++) {
            float32[i] = pcm16[i] / 32768
          }

          // Resample: inputRate -> ctx.sampleRate
          const outputRate = ctx.sampleRate
          const ratio = outputRate / inputRate
          const outputLen = Math.round(float32.length * ratio)
          const buffer = ctx.createBuffer(1, outputLen, outputRate)
          const output = buffer.getChannelData(0)

          for (let i = 0; i < outputLen; i++) {
            const srcIdx = i / ratio
            const idx = Math.floor(srcIdx)
            const frac = srcIdx - idx
            const s0 = float32[idx] || 0
            const s1 = float32[Math.min(idx + 1, float32.length - 1)] || 0
            output[i] = s0 + frac * (s1 - s0)
          }

          const source = ctx.createBufferSource()
          source.buffer = buffer
          source.connect(ctx.destination)

          const currentTime = ctx.currentTime
          // Gecikme kontrolü: 1 saniyeden fazla gerideyse atla, şimdiden başla
          if (nextPlayTimeRef.current < currentTime - 1) {
            nextPlayTimeRef.current = currentTime
          }
          if (nextPlayTimeRef.current < currentTime) {
            nextPlayTimeRef.current = currentTime
          }
          source.start(nextPlayTimeRef.current)
          nextPlayTimeRef.current += buffer.duration
        } catch { /* decode error */ }
      }

      // Birden fazla sample rate dene — ilk başarılı olan kalır
      let detectedRate = 0

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer && event.data.byteLength > 0) {
          // İlk chunk'ta sample rate tespit et
          if (detectedRate === 0) {
            // Telefon genelde 8kHz, web 16kHz veya 24kHz
            // Chunk boyutuna göre tahmin: 8kHz = 320 bytes/20ms, 16kHz = 640 bytes/20ms
            const byteLen = event.data.byteLength
            if (byteLen <= 400) detectedRate = 8000
            else if (byteLen <= 800) detectedRate = 16000
            else detectedRate = 24000
            console.log('[audio] Detected sample rate:', detectedRate, 'chunk size:', byteLen)
          }
          playPcm16(event.data, detectedRate)
        } else if (typeof event.data === 'string') {
          try {
            const json = JSON.parse(event.data)
            if (json.audio) {
              const binary = atob(json.audio)
              const bytes = new Uint8Array(binary.length)
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
              if (detectedRate === 0) detectedRate = 16000
              playPcm16(bytes.buffer, detectedRate)
            }
          } catch { /* not JSON or no audio field */ }
        }
      }

      ws.onclose = () => { setIsListening(false); listenWsRef.current = null }
      ws.onerror = () => { setIsListening(false); listenWsRef.current = null }
    } catch {
      setIsListening(false)
    }
  }, [])

  const stopListening = useCallback(() => {
    if (listenWsRef.current) { listenWsRef.current.close(); listenWsRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
    nextPlayTimeRef.current = 0
    setIsListening(false)
  }, [])

  /* ── Poll call status ── */
  const pollStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/vapi/call-status/${id}`)
      const data = await res.json()

      // controlUrl sonradan gelebilir
      if (data.controlUrl && !controlUrlRef.current) {
        setControlUrl(data.controlUrl)
      }
      if (data.monitorUrl && !monitorUrl) {
        setMonitorUrl(data.monitorUrl)
      }

      // Transcript
      if (data.transcript && typeof data.transcript === 'string') {
        const lines = data.transcript.split('\n').filter(Boolean)
        if (lines.length > 0) {
          const parsed: TranscriptEntry[] = lines.map((line: string) => {
            const isBot = /^(AI:|assistant:|bot:)/i.test(line)
            return {
              role: isBot ? 'assistant' as const : 'user' as const,
              text: line.replace(/^(AI:|assistant:|bot:|user:|User:)\s*/i, ''),
              time: now(),
            }
          })
          setTranscript(prev => {
            const nonSys = prev.filter(t => t.role !== 'system').length
            if (parsed.length > nonSys) {
              return [...parsed, ...prev.filter(t => t.role === 'system')]
            }
            return prev
          })
        }
      }

      if (data.status === 'ended') {
        setCallState('ended')
        setSummary(data.summary)
        setSentiment(data.sentiment)
        cleanup()
      } else if (data.status === 'in-progress') {
        setCallState('in-progress')
      } else if (data.status === 'ringing') {
        setCallState('ringing')
      }
    } catch { /* silent */ }
  }, [cleanup, monitorUrl])

  /* ── Arama başlat ── */
  const startCall = async () => {
    setCallState('starting')
    setErrorMsg(null)
    setTranscript([])
    try {
      const res = await fetch('/api/vapi/start-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          phoneNumber: listing.seller_phone,
          sellerName: listing.seller_name,
          propertyTitle: listing.title,
          price: listing.price,
          city: listing.city,
          district: listing.district,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Arama başlatılamadı')

      setCallId(data.callId)
      setCallState('ringing')

      if (data.monitorUrl) {
        setMonitorUrl(data.monitorUrl)
        startListening(data.monitorUrl)
      }
      if (data.controlUrl) {
        setControlUrl(data.controlUrl)
      }

      timerRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000)
      pollRef.current = setInterval(() => pollStatus(data.callId), 3000)

    } catch (err) {
      setCallState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Bilinmeyen hata')
    }
  }

  /* ── Mesaj gönder — Server-side HTTP POST proxy ── */
  const [cmdError, setCmdError] = useState<string | null>(null)

  const sendCommand = async (text?: string) => {
    const msg = (text || command).trim()
    if (!msg || !callId) return

    setSendingCmd(true)
    setCmdError(null)
    try {
      // Server proxy controlUrl'e HTTP POST ile add-message gönderir
      const res = await fetch('/api/vapi/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          message: msg,
          controlUrl: controlUrl || undefined,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Mesaj gönderilemedi')
      }

      setTranscript(prev => [...prev, {
        role: 'system',
        text: msg,
        time: now(),
      }])
      setCommand('')
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Komut gönderilemedi'
      setCmdError(errMsg)
      // 3 saniye sonra hatayı temizle
      setTimeout(() => setCmdError(null), 3000)
    } finally {
      setSendingCmd(false)
    }
  }

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  if (!isOpen) return null

  const isActive = callState === 'in-progress' || callState === 'ringing'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className={`p-5 border-b border-slate-700 flex-shrink-0 ${
          callState === 'in-progress' ? 'bg-emerald-500/10' :
          callState === 'ringing' ? 'bg-blue-500/10' :
          callState === 'ended' ? 'bg-purple-500/10' :
          callState === 'error' ? 'bg-red-500/10' : 'bg-slate-800/60'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                callState === 'in-progress' ? 'bg-emerald-500 animate-pulse' :
                callState === 'ringing' ? 'bg-blue-500 animate-pulse' :
                callState === 'ended' ? 'bg-purple-500' :
                callState === 'error' ? 'bg-red-500' : 'bg-slate-700'
              }`}>
                <Phone size={18} className="text-white" />
              </div>
              <div>
                <p className="text-white font-semibold">{listing.seller_name || 'Mülk Sahibi'}</p>
                <p className="text-slate-400 text-sm">{listing.seller_phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isActive && (
                <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-mono">
                  <Clock size={14} />
                  {fmtTime(elapsedSecs)}
                </span>
              )}
              <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm">
              {callState === 'idle' && <p className="text-slate-400">Lina ile <strong className="text-white">{listing.seller_name || 'mülk sahibini'}</strong> arayacaksınız</p>}
              {callState === 'starting' && <p className="text-blue-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Arama başlatılıyor...</p>}
              {callState === 'ringing' && <p className="text-blue-400 flex items-center gap-2"><Phone size={14} className="animate-bounce" /> Çalıyor...</p>}
              {callState === 'in-progress' && <p className="text-emerald-400 flex items-center gap-2"><Mic size={14} /> Görüşme devam ediyor</p>}
              {callState === 'ended' && <p className="text-purple-400 flex items-center gap-2"><CheckCircle size={14} /> Görüşme tamamlandı</p>}
              {callState === 'error' && <p className="text-red-400 flex items-center gap-2"><AlertCircle size={14} /> {errorMsg}</p>}
            </div>

            {isActive && monitorUrl && (
              <button
                onClick={() => isListening ? stopListening() : startListening(monitorUrl)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isListening
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-700 text-slate-400 border border-slate-600 hover:text-white'
                }`}
              >
                {isListening ? <Volume2 size={13} className="animate-pulse" /> : <VolumeX size={13} />}
                {isListening ? 'Canlı' : 'Dinle'}
              </button>
            )}
          </div>
        </div>

        {/* Property info */}
        <div className="px-5 py-2.5 bg-slate-800/40 border-b border-slate-700/60 text-xs text-slate-400 flex-shrink-0">
          <span className="line-clamp-1">{listing.title}</span>
          {listing.price > 0 && <span className="ml-2 font-medium text-slate-300">{listing.price.toLocaleString('tr-TR')} TL</span>}
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[200px]">
          {transcript.length === 0 ? (
            <div className="h-full flex items-center justify-center min-h-[150px]">
              <p className="text-slate-600 text-sm">
                {callState === 'idle' ? 'Aramayı başlatın...' : 'Transcript bekleniyor...'}
              </p>
            </div>
          ) : (
            transcript.map((t, i) => (
              <div key={i} className={`flex gap-2 ${t.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  t.role === 'assistant' ? 'bg-blue-500 text-white' :
                  t.role === 'system' ? 'bg-amber-500 text-white' :
                  'bg-slate-600 text-slate-200'
                }`}>
                  {t.role === 'assistant' ? 'L' : t.role === 'system' ? '!' : 'M'}
                </div>
                <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs ${
                  t.role === 'assistant'
                    ? 'bg-blue-500/15 border border-blue-500/20 text-blue-100'
                    : t.role === 'system'
                    ? 'bg-amber-500/15 border border-amber-500/20 text-amber-200 italic'
                    : 'bg-slate-700 text-slate-200'
                }`}>
                  {t.role === 'system' && <span className="text-amber-400 font-medium not-italic block mb-0.5">Yönlendirme:</span>}
                  <p>{t.text}</p>
                  <p className="text-slate-500 mt-1">{t.time}</p>
                </div>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Summary / Sentiment */}
        {callState === 'ended' && sentiment && (
          <div className="px-5 py-3 border-t border-slate-700/60 grid grid-cols-3 gap-2 flex-shrink-0">
            {Object.entries(sentiment).map(([key, val]) => {
              const c: Record<string, string> = {
                Olumlu: 'bg-green-500/10 border-green-500/20 text-green-400',
                Olumsuz: 'bg-red-500/10 border-red-500/20 text-red-400',
                Belirsiz: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
              }
              return val ? (
                <div key={key} className={`border rounded-lg p-2 text-xs ${c[key] || 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                  <span className="font-medium block mb-0.5">{key}</span>{val}
                </div>
              ) : null
            })}
          </div>
        )}
        {callState === 'ended' && summary && (
          <div className="px-5 py-3 border-t border-slate-700/60 flex-shrink-0">
            <p className="text-xs text-slate-400 font-medium mb-1">Özet</p>
            <p className="text-xs text-slate-300">{summary}</p>
          </div>
        )}

        {/* Komut girişi */}
        {isActive && (
          <div className="px-5 py-3 border-t border-slate-700/60 bg-slate-800/40 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare size={13} className="text-amber-400" />
              <p className="text-xs text-amber-400 font-medium">Lina&apos;ya anlık yönlendirme gönder</p>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_COMMANDS.map((cmd, i) => (
                <button
                  key={i}
                  onClick={() => sendCommand(cmd)}
                  disabled={sendingCmd}
                  className="px-2.5 py-1 bg-slate-700/80 hover:bg-slate-600 border border-slate-600/50 rounded-lg text-[11px] text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                >
                  {cmd}
                </button>
              ))}
            </div>

            {cmdError && (
              <p className="text-xs text-red-400 mb-2">{cmdError}</p>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={command}
                onChange={e => setCommand(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !sendingCmd && sendCommand()}
                placeholder="Özel yönlendirme yazın..."
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => sendCommand()}
                disabled={!command.trim() || sendingCmd}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
              >
                {sendingCmd ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        )}

        {/* Aksiyon butonları */}
        <div className="p-5 border-t border-slate-700 flex gap-3 flex-shrink-0">
          {callState === 'idle' && (
            <button onClick={startCall} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white font-medium">
              <Phone size={16} /> Lina ile Ara
            </button>
          )}
          {callState === 'starting' && (
            <button disabled className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-700 rounded-xl text-slate-400 cursor-not-allowed">
              <Loader2 size={16} className="animate-spin" /> Başlatılıyor...
            </button>
          )}
          {isActive && (
            <button onClick={() => { cleanup(); setCallState('ended') }} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500/80 hover:bg-red-600 rounded-xl text-white font-medium">
              <PhoneOff size={16} /> Aramayı Sonlandır
            </button>
          )}
          {(callState === 'ended' || callState === 'error') && (
            <button onClick={onClose} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-medium">
              Kapat
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
