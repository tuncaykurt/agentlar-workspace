"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

const LINKS = [
  { href: "/dashboard",     label: "Dashboard" },
  { href: "/bots",          label: "Botlar" },
  { href: "/trades",        label: "Islemler" },
  { href: "/backtest",      label: "Backtest" },
  { href: "/strategy-view", label: "Strateji" },
  { href: "/analytics",     label: "Analiz" },
  { href: "/scanner",       label: "Tarayıcı" },
  { href: "/simulations",   label: "Simülasyon" },
  { href: "/ai-chat",       label: "AI Chat" },
  { href: "/news",           label: "Haberler" },
  { href: "/freqtrade",      label: "Freqtrade" },
  { href: "/settings",      label: "Borsa Bağlantısı" },
  { href: "/calculator",    label: "Hesaplama" },
]

export default function NavClient() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <nav className="border-b border-slate-800 bg-slate-950 shrink-0 z-50">
      <div className="px-4 py-2.5 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="font-bold text-base text-white flex items-center gap-1.5 shrink-0">
          ⚡ <span className="text-blue-400">Kripto</span>Bot
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 mx-4 flex-1">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href}
              className={`text-sm transition-colors px-3 py-1.5 rounded whitespace-nowrap hover:bg-slate-800 ${
                pathname === l.href ? "text-white bg-slate-800" : "text-slate-400 hover:text-white"
              }`}>
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Canlı göstergesi */}
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-slate-400 hidden sm:inline">Canlı · Bitget</span>
          </div>
          {/* Hamburger (mobile) */}
          <button
            onClick={() => setOpen(v => !v)}
            className="md:hidden p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Menü"
          >
            {open ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-slate-800 py-2 px-2 flex flex-col gap-0.5">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className={`text-sm px-4 py-2.5 rounded-lg transition-colors ${
                pathname === l.href
                  ? "bg-blue-600/20 text-white font-medium"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}>
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}
