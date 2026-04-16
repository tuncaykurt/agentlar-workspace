'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Phone, PhoneOff, Mic, MicOff, Send, Volume2, VolumeX,
  Loader2, MessageSquare, Radio, Clock, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2,
} from 'lucide-react'

interface TranscriptMessage {
  role: 'assistant' | 'user' | 'system'
  content: string
  time?: string
}

interface WhisperMessage {
  text: string
  sentAt: string
  status: 'sent' | 'error'
}

interface CallData {
  callId: string
  status: string
  duration?: number
  summary?: string
  transcript?: string
  messages?: Array<{ role: string; message: string; time?: number }>
  recordingUrl?: string
  endedReason?: string
  monitor?: { listenUrl?: string; controlUrl?: string }
}

interface LiveCallPanelProps {
  callId: string
  onCallEnd: (data: CallData) => void
  propertyTitle?: string
}

export default function LiveCallPanel({ callId, onCallEnd, propertyTitle }: LiveCallPanelProps) {
  const [callData, setCallData] = useState<CallData | null>(null)
  const [transcriptMessages, setTranscriptMessages] = useState<TranscriptMessage[]>([])
  const [whisperMessages, setWhisperMessages] = useState<WhisperMessage[]>([])
  const [whisperInput, setWhisperInput] = useState('')
  const [sendingWhisper, setSendingWhisper] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isListening, setIsListening] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [expanded, setExpanded] = useState(true)

  const transcriptRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevMessageCount = useRef(0)
  const callEnded = useRef(false)

  // Geçen süre sayacı
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  // Transkript alanını otomatik aşağı kaydır
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcriptMessages])

  // Arama durumunu poll et ve canlı transkripti çek
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/vapi/call?callId=${callId}`)
      if (!res.ok) return
      const data: CallData = await res.json()
      setCallData(data)

      // Mesajları transkripte dönüştür
      if (data.messages && data.messages.length > prevMessageCount.current) {
        const newMsgs = data.messages.slice(prevMessageCount.current)
        prevMessageCount.current = data.messages.length

        const mapped: TranscriptMessage[] = newMsgs
          .filter(m => m.role === 'assistant' || m.role === 'user')
          .map(m => ({
            role: m.role as 'assistant' | 'user',
            content: m.message,
            time: m.time ? formatSeconds(m.time) : undefined,
          }))

        if (mapped.length > 0) {
          setTranscriptMessages(prev => [...prev, ...mapped])
        }
      }

      // Arama bittiyse
      if ((data.status === 'ended' || data.status === 'completed' || data.status === 'failed') && !callEnded.current) {
        callEnded.current = true
        if (timerRef.current) clearInterval(timerRef.current)
        onCallEnd(data)
      }
    } catch {
      // polling hatası — sessizce devam
    }
  }, [callId, onCallEnd])

  useEffect(() => {
    // Hemen bir kez çek
    pollStatus()
    // 2 saniyede bir poll et
    pollRef.current = setInterval(pollStatus, 2000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [pollStatus])

  // Canlı dinleme — Vapi monitor listenUrl varsa WebSocket audio bağla
  useEffect(() => {
    if (!callData?.monitor?.listenUrl) return

    try {
      const ws = new WebSocket(callData.monitor.listenUrl)
      ws.binaryType = 'arraybuffer'

      const audioCtx = new AudioContext({ sampleRate: 16000 })
      let nextTime = 0

      ws.onmessage = (event) => {
        if (!isListening) return
        if (!(event.data instanceof ArrayBuffer)) return

        const pcmData = new Int16Array(event.data)
        const floatData = new Float32Array(pcmData.length)
        for (let i = 0; i < pcmData.length; i++) {
          floatData[i] = pcmData[i] / 32768.0
        }

        const buffer = audioCtx.createBuffer(1, floatData.length, 16000)
        buffer.getChannelData(0).set(floatData)

        const source = audioCtx.createBufferSource()
        source.buffer = buffer

        // Muted kontrolü
        const gainNode = audioCtx.createGain()
        gainNode.gain.value = isMuted ? 0 : 1
        source.connect(gainNode)
        gainNode.connect(audioCtx.destination)

        const startTime = Math.max(audioCtx.currentTime, nextTime)
        source.start(startTime)
        nextTime = startTime + buffer.duration
      }

      ws.onerror = () => {
        console.warn('[LiveCallPanel] WebSocket audio error')
      }

      return () => {
        ws.close()
        audioCtx.close()
      }
    } catch {
      console.warn('[LiveCallPanel] WebSocket bağlantısı kurulamadı')
    }
  }, [callData?.monitor?.listenUrl, isMuted, isListening])

  // Whisper mesaj gönder — AI asistana anlık talimat
  async function sendWhisper() {
    const text = whisperInput.trim()
    if (!text || sendingWhisper) return

    setSendingWhisper(true)
    const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    try {
      const res = await fetch('/api/vapi/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          message: text,
        }),
      })

      const success = res.ok
      setWhisperMessages(prev => [...prev, {
        text,
        sentAt: timestamp,
        status: success ? 'sent' : 'error',
      }])

      // Transkripte de ekle (system mesajı olarak)
      setTranscriptMessages(prev => [...prev, {
        role: 'system',
        content: text,
        time: timestamp,
      }])

      if (success) setWhisperInput('')
    } catch {
      setWhisperMessages(prev => [...prev, {
        text,
        sentAt: timestamp,
        status: 'error',
      }])
    } finally {
      setSendingWhisper(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendWhisper()
    }
  }

  const isActive = callData?.status === 'ringing' || callData?.status === 'in-progress' || callData?.status === 'queued'

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-slate-800 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <Radio size={18} className={isActive ? 'text-green-400' : 'text-slate-500'} />
            {isActive && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
            )}
          </div>
          <div>
            <h3 className="text-white text-sm font-semibold">
              Canlı Arama Paneli
              {propertyTitle && <span className="text-slate-400 font-normal ml-2">— {propertyTitle}</span>}
            </h3>
            <div className="flex items-center gap-3 text-xs">
              <span className={`flex items-center gap-1 ${isActive ? 'text-green-400' : 'text-slate-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-400' : 'bg-slate-500'}`} />
                {callData?.status === 'ringing' ? 'Çalıyor' :
                 callData?.status === 'in-progress' ? 'Görüşme Devam Ediyor' :
                 callData?.status === 'queued' ? 'Kuyrukta' :
                 callData?.status === 'ended' ? 'Bitti' : 'Bağlanıyor...'}
              </span>
              <span className="text-slate-500 flex items-center gap-1">
                <Clock size={10} />
                {formatSeconds(elapsed)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Ses Kontrolleri */}
          <button
            onClick={e => { e.stopPropagation(); setIsMuted(!isMuted) }}
            className={`p-2 rounded-lg transition-colors ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-300 hover:text-white'}`}
            title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            onClick={e => { e.stopPropagation(); setIsListening(!isListening) }}
            className={`p-2 rounded-lg transition-colors ${!isListening ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-300 hover:text-white'}`}
            title={isListening ? 'Dinlemeyi Durdur' : 'Dinlemeye Başla'}
          >
            {isListening ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
          {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-700">
          {/* Sol: Canlı Transkript */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-slate-700 flex items-center gap-2">
              <MessageSquare size={14} className="text-blue-400" />
              <span className="text-xs font-medium text-slate-300">Canlı Transkript</span>
              {isActive && (
                <Loader2 size={12} className="animate-spin text-blue-400 ml-auto" />
              )}
            </div>
            <div
              ref={transcriptRef}
              className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[300px] min-h-[200px]"
            >
              {transcriptMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <Radio size={24} className="mb-2 opacity-30" />
                  <p className="text-xs">Konuşma başladığında transkript burada görünecek...</p>
                </div>
              ) : (
                transcriptMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'}`}>
                    {msg.role === 'system' ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full">
                        <Send size={10} className="text-amber-400" />
                        <span className="text-xs text-amber-300">{msg.content}</span>
                        {msg.time && <span className="text-[10px] text-amber-500/60">{msg.time}</span>}
                      </div>
                    ) : (
                      <div className={`max-w-[80%] ${msg.role === 'user' ? '' : ''}`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[10px] font-medium ${msg.role === 'assistant' ? 'text-blue-400' : 'text-green-400'}`}>
                            {msg.role === 'assistant' ? '🤖 Asistan' : '👤 Müşteri'}
                          </span>
                          {msg.time && <span className="text-[10px] text-slate-600">{msg.time}</span>}
                        </div>
                        <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${
                          msg.role === 'assistant'
                            ? 'bg-blue-500/10 text-blue-100 rounded-tl-sm'
                            : 'bg-green-500/10 text-green-100 rounded-tr-sm'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Sağ: Whisper / Yönlendirme Paneli */}
          <div className="lg:w-[340px] flex flex-col">
            <div className="px-4 py-2 border-b border-slate-700 flex items-center gap-2">
              <Send size={14} className="text-amber-400" />
              <span className="text-xs font-medium text-slate-300">Konuşma Yönlendirme</span>
            </div>

            {/* Gönderilmiş talimatlar */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[200px] min-h-[120px]">
              {whisperMessages.length === 0 ? (
                <div className="text-center py-6 text-slate-600">
                  <p className="text-xs">Asistana anlık talimat gönderin.</p>
                  <p className="text-[10px] mt-1 text-slate-700">Örn: &quot;Fiyatı sor&quot;, &quot;Randevu teklif et&quot;</p>
                </div>
              ) : (
                whisperMessages.map((w, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {w.status === 'sent' ? (
                      <CheckCircle2 size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-300">{w.text}</p>
                      <p className="text-[10px] text-slate-600">{w.sentAt}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Hızlı Talimat Butonları */}
            <div className="px-3 py-2 border-t border-slate-700/50 flex flex-wrap gap-1.5">
              {[
                'Fiyatı sor',
                'Randevu teklif et',
                'Pazarlık yap',
                'İlanın güncel mi sor',
                'Teşekkür et ve kapat',
                'Komisyon bilgisi ver',
              ].map(text => (
                <button
                  key={text}
                  onClick={() => { setWhisperInput(text); }}
                  disabled={!isActive}
                  className="text-[10px] px-2 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-slate-300 rounded-md transition-colors"
                >
                  {text}
                </button>
              ))}
            </div>

            {/* Mesaj Girişi */}
            <div className="p-3 border-t border-slate-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={isActive ? 'Asistana talimat yaz...' : 'Arama bitmeli...'}
                  value={whisperInput}
                  onChange={e => setWhisperInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!isActive || sendingWhisper}
                  className="flex-1 bg-slate-700 border border-slate-600 text-white placeholder-slate-500 rounded-xl text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-40"
                />
                <button
                  onClick={sendWhisper}
                  disabled={!whisperInput.trim() || !isActive || sendingWhisper}
                  className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-colors flex items-center gap-1"
                >
                  {sendingWhisper ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5 px-1">
                Enter ile gönder · Asistan talimatı doğal konuşmaya çevirir
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
