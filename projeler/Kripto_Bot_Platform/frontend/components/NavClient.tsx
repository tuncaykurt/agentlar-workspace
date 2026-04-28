"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export default function NavClient() {
  const pathname = usePathname()

  return (
    <nav className="border-b border-slate-800 px-4 py-2.5 flex items-center justify-between shrink-0 z-50">
      <div className="flex items-center gap-6">
        <Link href="/dashboard" className="font-bold text-base text-white flex items-center gap-1.5">
          ⚡ <span className="text-blue-400">Kripto</span>Bot
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/dashboard" className={`text-sm transition-colors px-3 py-1.5 rounded hover:bg-slate-800 ${pathname === "/dashboard" ? "text-white" : "text-slate-400 hover:text-white"}`}>Dashboard</Link>
          <Link href="/bots" className={`text-sm transition-colors px-3 py-1.5 rounded hover:bg-slate-800 ${pathname === "/bots" ? "text-white" : "text-slate-400 hover:text-white"}`}>Botlar</Link>
          <Link href="/backtest" className={`text-sm transition-colors px-3 py-1.5 rounded hover:bg-slate-800 ${pathname === "/backtest" ? "text-white" : "text-slate-400 hover:text-white"}`}>Backtest</Link>
          <Link href="/strategy-view" className={`text-sm transition-colors px-3 py-1.5 rounded hover:bg-slate-800 ${pathname === "/strategy-view" ? "text-white" : "text-slate-400 hover:text-white"}`}>Strateji Görüntüle</Link>
          <Link href="/settings" className={`text-sm transition-colors px-3 py-1.5 rounded hover:bg-slate-800 ${pathname === "/settings" ? "text-white" : "text-slate-400 hover:text-white"}`}>Borsa Bağlantısı</Link>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-slate-400">Canlı · Bitget</span>
      </div>
    </nav>
  )
}
