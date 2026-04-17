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
  const [controlConnected, setControlConnected] = useState(false)

  const listenWsRef = useRef<WebSocket | null>(null)
  const controlWsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  const now = () => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const cleanup = useCallback(() => {
    if (listenWsRef.current) { listenWsRef.current.close(); listenWsRef.current = null }
    if (controlWsRef.current) { controlWsRef.current.close(); controlWsRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
    nextPlayTimeRef.current = 0
    setIsListening(false)
    setControlConnected(false)
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
      setErrorMsg(null)
    }
    return cleanup
  }, [isOpen, cleanup])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  /* ── Control WebSocket — mesaj gönderme için ── */
  const connectControl = useCallback((url: string) => {
    if (!url) return
    if (controlWsRef.current) { controlWsRef.current.close(); controlWsRef.current = null }

    console.log('[Control] Connecting to:', url)
    const ws = new WebSocket(url)
    controlWsRef.current = ws

    ws.onopen = () => {
      console.log('[Control] Connected')
      setControlConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        console.log('[Control] Message:', msg.type, msg)

        // Vapi control WS sends conversation updates
        if (msg.type === 'conversation-update' && Array.isArray(msg.conversation)) {
          const parsed: TranscriptEntry[] = msg.conversation
            .filter((t: any) => t.role === 'assistant' || t.role === 'user')
            .map((t: any) => ({
              role: t.role === 'assistant' || t.role === 'bot' ? 'assistant' as const : 'user' as const,
              text: t.content || t.text || '',
              time: now(),
            }))
          if (parsed.length > 0) {
            setTranscript(prev => {
              const sysMsgs = prev.filter(p => p.role === 'system')
              return [...parsed, ...sysMsgs]
            })
          }
        }
        // Speech updates
        if (msg.type === 'speech-update') {
          console.log('[Control] Speech:', msg.status, msg.role)
        }
      } catch { /* not JSON */ }
    }

    ws.onclose = (e) => {
      console.log('[Control] Disconnected:', e.code, e.reason)
      setControlConnected(false)
      controlWsRef.current = null
    }

    ws.onerror = (e) => {
      console.error('[Control] Error:', e)
      setControlConnected(false)
      controlWsRef.current = null
    }
  }, [])

  /* ── Live Audio — canlı dinleme ── */
  const startListening = useCallback((url: string) => {
    if (!url) return
    if (listenWsRef.current) { listenWsRef.current.close(); listenWsRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }

    try {
      // Telefon sesi genellikle 8kHz mono PCM — Vapi 24kHz de kullanabilir
      // AudioContext'i varsayılan sample rate ile oluşturup resample yapacağız
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      nextPlayTimeRef.current = 0

      console.log('[Listen] Connecting to:', url)
      const ws = new WebSocket(url)
      listenWsRef.current = ws
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        console.log('[Listen] Connected')
        setIsListening(true)
      }

      ws.onmessage = (event) => {
        const ctx = audioCtxRef.current
        if (!ctx) return

        if (event.data instanceof ArrayBuffer && event.data.byteLength > 0) {
          try {
            const pcm16 = new Int16Array(event.data)
            const samples = new Float32Array(pcm16.length)
            for (let i = 0; i < pcm16.length; i++) {
              samples[i] = pcm16[i] / 32768
            }

            // Vapi monitor genellikle 24kHz veya 16kHz gönderir
            // Her iki rate'i de deneyelim — chunk boyutuna göre tahmin
            // 8kHz: 160 samples/20ms, 16kHz: 320/20ms, 24kHz: 480/20ms
            let srcRate = 24000
            if (samples.length <= 200) srcRate = 8000
            else if (samples.length <= 400) srcRate = 16000

            // OfflineAudioContext ile cihaz sample rate'ine resample
            const duration = samples.length / srcRate
            const outLen = Math.ceil(duration * ctx.sampleRate)

            const offCtx = new OfflineAudioContext(1, outLen, ctx.sampleRate)
            const srcBuf = offCtx.createBuffer(1, samples.length, srcRate)
            srcBuf.getChannelData(0).set(samples)

            const src = offCtx.createBufferSource()
            src.buffer = srcBuf
            src.connect(offCtx.destination)
            src.start()

            offCtx.startRendering().then(renderedBuffer => {
              if (!audioCtxRef.current) return

              const source = audioCtxRef.current.createBufferSource()
              source.buffer = renderedBuffer

              // Gain node ile ses seviyesini kontrol et
              const gain = audioCtxRef.current.createGain()
              gain.gain.value = 1.5 // Telefon sesi genelde düşük gelir
              source.connect(gain)
              gain.connect(audioCtxRef.current.destination)

              // Sıralı oynatma — üst üste binmeyi önle
              const currentTime = audioCtxRef.current.currentTime
              const startTime = Math.max(nextPlayTimeRef.current, currentTime)
              source.start(startTime)
              nextPlayTimeRef.current = startTime + renderedBuffer.duration
            }).catch(() => {})
          } catch { /* decode error */ }
        } else if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data)
            console.log('[Listen] JSON:', msg.type)

            if (msg.type === 'transcript' || msg.type === 'conversation-update') {
              if (msg.text) {
                const role = msg.role === 'assistant' || msg.role === 'bot' ? 'assistant' as const : 'user' as const
                setTranscript(prev => {
                  if (prev.length > 0 && prev[prev.length - 1].role === role && !msg.isFinal) {
                    const updated = [...prev]
                    updated[updated.length - 1] = { role, text: msg.text, time: now() }
                    return updated
                  }
                  return [...prev, { role, text: msg.text, time: now() }]
                })
              }
            }
          } catch { /* not JSON */ }
        }
      }

      ws.onclose = () => {
        console.log('[Listen] Disconnected')
        setIsListening(false)
        listenWsRef.current = null
      }

      ws.onerror = () => {
        setIsListening(false)
        listenWsRef.current = null
      }
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

      // controlUrl sonradan gelebilir — poll'dan al
      if (data.controlUrl && !controlWsRef.current) {
        setControlUrl(data.controlUrl)
        connectControl(data.controlUrl)
      }
      if (data.monitorUrl && !listenWsRef.current && !monitorUrl) {
        setMonitorUrl(data.monitorUrl)
      }

      // Transcript fallback
      if (data.transcript && typeof data.transcript === 'string') {
        const lines = data.transcript.split('\n').filter(Boolean)
        if (lines.length > 0) {
          const parsed: TranscriptEntry[] = lines.map((line: string) => {
            const isBot = line.startsWith('AI:') || line.startsWith('assistant:') || line.startsWith('bot:')
            return {
              role: isBot ? 'assistant' as const : 'user' as const,
              text: line.replace(/^(AI:|assistant:|bot:|user:|User:)\s*/i, ''),
              time: now(),
            }
          })
          setTranscript(prev => {
            const nonSystem = prev.filter(t => t.role !== 'system').length
            if (parsed.length > nonSystem) {
              const sysMsgs = prev.filter(t => t.role === 'system')
              return [...parsed, ...sysMsgs]
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
  }, [cleanup, connectControl, monitorUrl])

  /* ── Start call ── */
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

      console.log('[StartCall] Response:', data)
      setCallId(data.callId)
      setCallState('ringing')

      if (data.monitorUrl) {
        setMonitorUrl(data.monitorUrl)
        startListening(data.monitorUrl)
      }
      if (data.controlUrl) {
        setControlUrl(data.controlUrl)
        connectControl(data.controlUrl)
      }

      timerRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000)
      pollRef.current = setInterval(() => pollStatus(data.callId), 3000)

    } catch (err) {
      setCallState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Bilinmeyen hata')
    }
  }

  /* ── Send command ── */
  const sendCommand = async (text?: string) => {
    const msg = (text || command).trim()
    if (!msg || !callId) return

    setSendingCmd(true)
    try {
      let sent = false

      // Method 1: controlUrl WebSocket
      if (controlWsRef.current && controlWsRef.current.readyState === WebSocket.OPEN) {
        // Vapi control WS add-message format
        controlWsRef.current.send(JSON.stringify({
          type: 'add-message',
          message: { role: 'system', content: msg },
        }))
        console.log('[Control] Message sent via WS')
        sent = true
      }

      // Method 2: Reconnect control WS if disconnected
      if (!sent && controlUrl) {
        console.log('[Control] Reconnecting to send message...')
        const ws = new WebSocket(controlUrl)

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Bağlantı zaman aşımı')), 5000)
          ws.onopen = () => { clearTimeout(timeout); resolve() }
          ws.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket bağlantısı kurulamadı')) }
        })

        controlWsRef.current = ws
        setControlConnected(true)

        ws.onclose = () => { setControlConnected(false); controlWsRef.current = null }
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            console.log('[Control] Reconnected msg:', data.type)
          } catch { /* ignore */ }
        }

        ws.send(JSON.stringify({
          type: 'add-message',
          message: { role: 'system', content: msg },
        }))
        console.log('[Control] Message sent via reconnected WS')
        sent = true
      }

      // Method 3: Try fetching controlUrl from status if we don't have it
      if (!sent && callId) {
        console.log('[Control] No controlUrl, fetching from status...')
        const statusRes = await fetch(`/api/vapi/call-status/${callId}`)
        const statusData = await statusRes.json()

        if (statusData.controlUrl) {
          setControlUrl(statusData.controlUrl)
          connectControl(statusData.controlUrl)

          // Wait a bit for connection
          await new Promise(r => setTimeout(r, 1500))

          if (controlWsRef.current && controlWsRef.current.readyState === WebSocket.OPEN) {
            controlWsRef.current.send(JSON.stringify({
              type: 'add-message',
              message: { role: 'system', content: msg },
            }))
            console.log('[Control] Message sent after fetching controlUrl')
            sent = true
          }
        }
      }

      if (!sent) {
        throw new Error('Mesaj gönderilemedi — control bağlantısı kurulamadı')
      }

      setTranscript(prev => [...prev, {
        role: 'system',
        text: msg,
        time: now(),
      }])
      setCommand('')
    } catch (err) {
      console.error('[Control] Send error:', err)
      alert(err instanceof Error ? err.message : 'Komut gönderilemedi')
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

          {/* Status line */}
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm">
              {callState === 'idle' && <p className="text-slate-400">Lina ile <strong className="text-white">{listing.seller_name || 'mülk sahibini'}</strong> arayacaksınız</p>}
              {callState === 'starting' && <p className="text-blue-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Arama başlatılıyor...</p>}
              {callState === 'ringing' && <p className="text-blue-400 flex items-center gap-2"><Phone size={14} className="animate-bounce" /> Çalıyor...</p>}
              {callState === 'in-progress' && <p className="text-emerald-400 flex items-center gap-2"><Mic size={14} /> Görüşme devam ediyor</p>}
              {callState === 'ended' && <p className="text-purple-400 flex items-center gap-2"><CheckCircle size={14} /> Görüşme tamamlandı</p>}
              {callState === 'error' && <p className="text-red-400 flex items-center gap-2"><AlertCircle size={14} /> {errorMsg}</p>}
            </div>

            {isActive && (
              <div className="flex items-center gap-2">
                {monitorUrl && (
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
                <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] ${
                  controlConnected ? 'text-green-400' : 'text-yellow-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${controlConnected ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
                  {controlConnected ? 'Bağlı' : 'Bağlanıyor'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Property info bar */}
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

        {/* Sentiment & Summary */}
        {callState === 'ended' && sentiment && (
          <div className="px-5 py-3 border-t border-slate-700/60 grid grid-cols-3 gap-2 flex-shrink-0">
            {Object.entries(sentiment).map(([key, val]) => {
              const colors: Record<string, string> = {
                Olumlu: 'bg-green-500/10 border-green-500/20 text-green-400',
                Olumsuz: 'bg-red-500/10 border-red-500/20 text-red-400',
                Belirsiz: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400',
              }
              return val ? (
                <div key={key} className={`border rounded-lg p-2 text-xs ${colors[key] || 'bg-slate-700 border-slate-600 text-slate-300'}`}>
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

        {/* Command input */}
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
                  className="px-2.5 py-1 bg-slate-700/80 hover:bg-slate-600 border border-slate-600/50 rounded-lg text-[11px] text-slate-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cmd}
                </button>
              ))}
            </div>

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
                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors flex items-center gap-1.5"
              >
                {sendingCmd ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="p-5 border-t border-slate-700 flex gap-3 flex-shrink-0">
          {callState === 'idle' && (
            <button
              onClick={startCall}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white font-medium transition-all"
            >
              <Phone size={16} />
              Lina ile Ara
            </button>
          )}
          {callState === 'starting' && (
            <button disabled className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-700 rounded-xl text-slate-400 cursor-not-allowed">
              <Loader2 size={16} className="animate-spin" />
              Başlatılıyor...
            </button>
          )}
          {isActive && (
            <button
              onClick={() => { cleanup(); setCallState('ended') }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500/80 hover:bg-red-600 rounded-xl text-white font-medium transition-all"
            >
              <PhoneOff size={16} />
              Aramayı Sonlandır
            </button>
          )}
          {(callState === 'ended' || callState === 'error') && (
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-medium transition-all"
            >
              Kapat
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
