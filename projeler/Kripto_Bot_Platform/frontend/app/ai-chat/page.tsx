"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import useSWR from "swr"
import { api } from "@/lib/api"

const fetcher = (path: string) => api.get(path)

interface Message {
  role: "user" | "assistant"
  content: string
  model?: string
  tokens?: number
}

// ─────── Markdown-like rendering ───────
function MessageContent({ content }: { content: string }) {
  // Basic markdown: bold, code blocks, headers, lists
  const lines = content.split("\n")
  const elements: JSX.Element[] = []
  let inCodeBlock = false
  let codeLines: string[] = []
  let codeLang = ""

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={i} className="bg-slate-900 rounded-lg p-3 my-2 overflow-x-auto text-xs">
            <code>{codeLines.join("\n")}</code>
          </pre>
        )
        codeLines = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
        codeLang = line.slice(3).trim()
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // Headers
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-sm font-bold text-white mt-3 mb-1">{formatInline(line.slice(4))}</h3>)
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-base font-bold text-white mt-4 mb-1">{formatInline(line.slice(3))}</h2>)
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-lg font-bold text-white mt-4 mb-2">{formatInline(line.slice(2))}</h1>)
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-slate-500 shrink-0">&#x2022;</span>
          <span>{formatInline(line.slice(2))}</span>
        </div>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)/)
      if (match) {
        elements.push(
          <div key={i} className="flex gap-2 ml-2">
            <span className="text-slate-500 shrink-0">{match[1]}.</span>
            <span>{formatInline(match[2])}</span>
          </div>
        )
      }
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />)
    } else {
      elements.push(<p key={i} className="leading-relaxed">{formatInline(line)}</p>)
    }
  }

  return <div className="space-y-0.5">{elements}</div>
}

function formatInline(text: string): React.ReactNode {
  // Bold **text** and inline code `text`
  const parts = text.split(/(\*\*.*?\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="bg-slate-800 text-blue-300 px-1 py-0.5 rounded text-xs">{part.slice(1, -1)}</code>
    }
    return part
  })
}

// ─────── Suggested Questions ───────
const SUGGESTIONS = [
  "Botlarin genel performansi nasil?",
  "En son gelen sinyaller neler?",
  "Hangi strateji en iyi sonuc veriyor?",
  "Risk yonetimi icin oneriler neler?",
  "Sinyal filtreleri nasil calisir?",
  "Hedge bot nasil kurulur?",
]

export default function AiChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState("deepseek/deepseek-chat")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data: modelsData } = useSWR("/ai-chat/models", fetcher)
  const models = modelsData?.models || []

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const sendMessage = useCallback(async (text?: string) => {
    const msg = text || input.trim()
    if (!msg || loading) return

    const userMsg: Message = { role: "user", content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setLoading(true)

    try {
      const res = await api.post("/ai-chat/chat", {
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        model: selectedModel,
        stream: false,
      })

      const assistantMsg: Message = {
        role: "assistant",
        content: res.content,
        model: res.model,
        tokens: res.usage?.total_tokens,
      }
      setMessages([...newMessages, assistantMsg])
    } catch (e: any) {
      const errMsg: Message = {
        role: "assistant",
        content: `Hata: ${e.message || "Bilinmeyen hata"}`,
      }
      setMessages([...newMessages, errMsg])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, selectedModel])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    setInput("")
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col" style={{ height: "calc(100vh - 48px)" }}>
      {/* Header */}
      <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold">AI Asistan</h1>
          <span className="text-xs text-slate-500">Proje hakkinda her seyi bilen yapay zeka</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Model secimi */}
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg text-xs px-2 py-1.5 text-white focus:outline-none focus:border-blue-500"
          >
            {models.length > 0 ? (
              <>
                <optgroup label="Hizli">
                  {models.filter((m: any) => m.category === "fast").map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Derin Analiz">
                  {models.filter((m: any) => m.category === "deep").map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Reasoning">
                  {models.filter((m: any) => m.category === "reasoning").map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Arama">
                  {models.filter((m: any) => m.category === "search").map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
              </>
            ) : (
              <option value="deepseek/deepseek-chat">DeepSeek V3</option>
            )}
          </select>
          <button
            onClick={clearChat}
            className="text-xs px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
          >
            Temizle
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-4xl mb-4">🤖</div>
            <h2 className="text-lg font-semibold text-white mb-2">KriptoBot AI Asistan</h2>
            <p className="text-sm text-slate-400 text-center max-w-md mb-6">
              Botlar, sinyaller, trade kayitlari, strateji onerileri ve platform hakkinda her seyi sorabilirsiniz.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-w-lg">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="text-xs text-left px-3 py-2.5 rounded-lg border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800 hover:border-slate-600 text-slate-400 hover:text-white transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800/80 border border-slate-700/50 text-slate-300"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="text-sm">
                      <MessageContent content={msg.content} />
                      {(msg.model || msg.tokens) && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700/50 text-[10px] text-slate-500">
                          {msg.model && <span>{msg.model.split("/").pop()}</span>}
                          {msg.tokens && <span>{msg.tokens} token</span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800/80 border border-slate-700/50 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span>Dusunuyor...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Bir soru sorun..."
              rows={1}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              style={{ minHeight: "42px", maxHeight: "120px" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = "auto"
                target.style.height = Math.min(target.scrollHeight, 120) + "px"
              }}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <div className="max-w-3xl mx-auto mt-1">
          <span className="text-[10px] text-slate-600">
            Model: {selectedModel.split("/").pop()} · Enter ile gonder · Shift+Enter yeni satir
          </span>
        </div>
      </div>
    </div>
  )
}
