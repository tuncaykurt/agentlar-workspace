'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Phone, PhoneOff, Mic, MicOff, Send, X,
  Volume2, Clock, CheckCircle, AlertCircle, Loader2
} from 'lucide-react'

type CallState = 'idle' | 'starting' | 'ringing' | 'in-progress' | 'ended' | 'error'

type TranscriptEntry = {
  role: 'assistant' | 'user'
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

export default function VapiCallModal({ isOpen, onClose, listing }: VapiCallModalProps) {
  const [callState, setCallState] = useState<CallState>('idle')
  const [callId, setCallId] = useState<string | null>(null)
  const [controlUrl, setControlUrl] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [command, setCommand] = useState('')
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const [summary, setSummary] = useState<string | null>(null)
  const [sentiment, setSentiment] = useState<{ Olumlu?: string; Olumsuz?: string; Belirsiz?: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  // Temizle
  const cleanup = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  useEffect(() => {
    if (!isOpen) { cleanup(); setCallState('idle'); setElapsedSecs(0); setTranscript([]); setSummary(null); setSentiment(null); setCallId(null) }
    return cleanup
  }, [isOpen, cleanup])

  // Transcript sonuna scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // Poll call status
  const pollStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/vapi/call-status/${id}`)
      const data = await res.json()

      // Transcript parse
      if (data.transcript) {
        const lines = data.transcript.split('\n').filter(Boolean)
        const parsed: TranscriptEntry[] = lines.map((line: string) => {
          const isAssistant = line.startsWith('AI:') || line.startsWith('assistant:')
          return {
            role: isAssistant ? 'assistant' : 'user',
            text: line.replace(/^(AI:|assistant:|user:|User:)\s*/i, ''),
            time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          }
        })
        if (parsed.length > 0) setTranscript(parsed)
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
    } catch { /* sessiz geç */ }
  }, [cleanup])

  // Aramayı başlat
  const startCall = async () => {
    setCallState('starting')
    setErrorMsg(null)
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

      if (data.controlUrl) setControlUrl(data.controlUrl)

      // Timer başlat
      timerRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000)

      // Poll başlat
      pollRef.current = setInterval(() => pollStatus(data.callId), 3000)

    } catch (err) {
      setCallState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Bilinmeyen hata')
    }
  }

  // Komut gönder (controlUrl WebSocket)
  const sendCommand = async () => {
    if (!command.trim() || !controlUrl) return
    try {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        wsRef.current = new WebSocket(controlUrl)
        await new Promise((res, rej) => {
          wsRef.current!.onopen = res
          wsRef.current!.onerror = rej
        })
      }
      wsRef.current.send(JSON.stringify({
        type: 'add-message',
        message: {
          role: 'system',
          content: command.trim(),
        }
      }))
      setTranscript(prev => [...prev, {
        role: 'assistant',
        text: `⚡ Yönlendirme: ${command.trim()}`,
        time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      }])
      setCommand('')
    } catch {
      alert('Komut gönderilemedi. Control URL bağlantısı kopmuş olabilir.')
    }
  }

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className={`p-5 border-b border-slate-700 ${
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
              {callState === 'in-progress' && (
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

          {/* Durum */}
          <div className="mt-3 text-sm">
            {callState === 'idle' && <p className="text-slate-400">Lina ile <strong className="text-white">{listing.seller_name || 'mülk sahibini'}</strong> arayacaksınız</p>}
            {callState === 'starting' && <p className="text-blue-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Arama başlatılıyor...</p>}
            {callState === 'ringing' && <p className="text-blue-400 flex items-center gap-2"><Volume2 size={14} className="animate-bounce" /> Çalıyor...</p>}
            {callState === 'in-progress' && <p className="text-emerald-400 flex items-center gap-2"><Mic size={14} /> Görüşme devam ediyor</p>}
            {callState === 'ended' && <p className="text-purple-400 flex items-center gap-2"><CheckCircle size={14} /> Görüşme tamamlandı</p>}
            {callState === 'error' && <p className="text-red-400 flex items-center gap-2"><AlertCircle size={14} /> {errorMsg}</p>}
          </div>
        </div>

        {/* İlan özeti */}
        <div className="px-5 py-3 bg-slate-800/40 border-b border-slate-700/60 text-xs text-slate-400">
          <span className="line-clamp-1">{listing.title}</span>
          {listing.price && <span className="ml-2 font-medium text-slate-300">{listing.price.toLocaleString('tr-TR')} TL</span>}
        </div>

        {/* Transcript */}
        <div className="h-52 overflow-y-auto px-5 py-4 space-y-3">
          {transcript.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-slate-600 text-sm">
                {callState === 'idle' ? 'Aramayı başlatın...' : 'Transcript bekleniyor...'}
              </p>
            </div>
          ) : (
            transcript.map((t, i) => (
              <div key={i} className={`flex gap-2 ${t.role === 'assistant' ? '' : 'flex-row-reverse'}`}>
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  t.role === 'assistant' ? 'bg-blue-500 text-white' : 'bg-slate-600 text-slate-200'
                }`}>
                  {t.role === 'assistant' ? 'L' : 'M'}
                </div>
                <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs ${
                  t.role === 'assistant'
                    ? 'bg-blue-500/15 border border-blue-500/20 text-blue-100'
                    : 'bg-slate-700 text-slate-200'
                }`}>
                  <p>{t.text}</p>
                  <p className="text-slate-500 mt-1">{t.time}</p>
                </div>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Sentiment (arama bittikten sonra) */}
        {callState === 'ended' && sentiment && (
          <div className="px-5 py-3 border-t border-slate-700/60 grid grid-cols-3 gap-2">
            {sentiment.Olumlu && <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-xs text-green-400"><span className="font-medium block mb-0.5">Olumlu</span>{sentiment.Olumlu}</div>}
            {sentiment.Olumsuz && <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-xs text-red-400"><span className="font-medium block mb-0.5">Olumsuz</span>{sentiment.Olumsuz}</div>}
            {sentiment.Belirsiz && <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 text-xs text-yellow-400"><span className="font-medium block mb-0.5">Belirsiz</span>{sentiment.Belirsiz}</div>}
          </div>
        )}

        {callState === 'ended' && summary && (
          <div className="px-5 py-3 border-t border-slate-700/60">
            <p className="text-xs text-slate-400 font-medium mb-1">Özet</p>
            <p className="text-xs text-slate-300">{summary}</p>
          </div>
        )}

        {/* Komut girişi (arama devam ederken) */}
        {(callState === 'in-progress' || callState === 'ringing') && controlUrl && (
          <div className="px-5 py-3 border-t border-slate-700/60 bg-slate-800/40">
            <p className="text-xs text-slate-500 mb-2">Lina'ya yönlendirme gönder</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={command}
                onChange={e => setCommand(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendCommand()}
                placeholder="Örn: Randevu için bu haftayı öner"
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={sendCommand}
                className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Aksiyon butonları */}
        <div className="p-5 border-t border-slate-700 flex gap-3">
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
          {(callState === 'ringing' || callState === 'in-progress') && (
            <button
              onClick={() => { cleanup(); setCallState('ended') }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500/80 hover:bg-red-600 rounded-xl text-white font-medium transition-all"
            >
              <PhoneOff size={16} />
              Takip Et / Kapat
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
