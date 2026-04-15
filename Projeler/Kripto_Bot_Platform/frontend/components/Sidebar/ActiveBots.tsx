"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import clsx from "clsx"

interface Bot {
  id: number
  name: string
  symbol: string
  strategy: string
  paper_mode: boolean
  running: boolean
}

export default function ActiveBots() {
  const [bots, setBots] = useState<Bot[]>([])

  useEffect(() => {
    api.get("/bots/").then(setBots).catch(() => {})
    const interval = setInterval(() => {
      api.get("/bots/").then(setBots).catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const running = bots.filter(b => b.running)

  const toggle = async (bot: Bot) => {
    const action = bot.running ? "stop" : "start"
    await api.post(`/bots/${bot.id}/${action}`, {})
    api.get("/bots/").then(setBots)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Botlar</p>
        <div className="flex items-center gap-1">
          <div className={clsx("w-1.5 h-1.5 rounded-full", running.length > 0 ? "bg-green-400 animate-pulse" : "bg-slate-600")} />
          <span className="text-xs text-slate-400">{running.length} aktif</span>
        </div>
      </div>

      {bots.length === 0 ? (
        <div className="bg-slate-900 rounded-lg p-3 text-center text-xs text-slate-500">
          <a href="/bots" className="text-blue-400 hover:underline">Bot oluştur →</a>
        </div>
      ) : (
        <div className="space-y-1.5">
          {bots.map(bot => (
            <div key={bot.id} className="bg-slate-900 rounded-lg p-2.5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <div className={clsx("w-1.5 h-1.5 rounded-full", bot.running ? "bg-green-400 animate-pulse" : "bg-slate-600")} />
                  <span className="text-xs text-white font-medium">{bot.name}</span>
                  {bot.paper_mode && (
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1 rounded">Paper</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 ml-3">{bot.symbol.replace("/USDT:USDT", "")} · {bot.strategy}</p>
              </div>
              <button
                onClick={() => toggle(bot)}
                className={clsx(
                  "text-xs px-2 py-1 rounded transition-colors",
                  bot.running
                    ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                )}
              >
                {bot.running ? "Durdur" : "Başlat"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
