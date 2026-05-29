"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useAuth } from "@/components/AuthProvider"

const LINKS = [
  { href: "/dashboard",     label: "Dashboard" },
  { href: "/bots",          label: "Botlar" },
  { href: "/trades",        label: "Islemler" },
  { href: "/backtest",      label: "Backtest" },
  { href: "/strategy-view", label: "Strateji" },
  { href: "/analytics",     label: "Analiz" },
  { href: "/scanner",       label: "Tarayıcı" },
  { href: "/simulations",   label: "Simülasyon" },
  { href: "/hft",           label: "HFT Grid" },
  { href: "/ai-chat",       label: "AI Chat" },
  { href: "/news",           label: "Haberler" },
  { href: "/freqtrade",      label: "Freqtrade" },
  { href: "/settings",       label: "Borsa Bağlantısı" },
  { href: "/calculator",     label: "Hesaplama" },
  { href: "/billing",        label: "Abonelik" },
]

export default function NavClient() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { user, logout, isLoading } = useAuth()

  // Login sayfasinda NavGosterme
  if (pathname === "/login") return null
  if (isLoading || !user) return null

  // Linkleri filtrele (Kullanicinin allowed_pages listesine gore)
  const filteredLinks = LINKS.filter(link => {
    // Ornegin "/dashboard" -> "dashboard"
    const pageName = link.href.split("/")[1]
    return user.role === "admin" || (user.allowed_pages && user.allowed_pages.includes(pageName))
  })

  return (
    <nav className="border-b border-slate-800 bg-slate-950 shrink-0 z-50">
      <div className="px-4 py-2.5 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="font-bold text-base text-white flex items-center gap-1.5 shrink-0">
          ⚡ <span className="text-blue-400">Kripto</span>Bot
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 mx-4 flex-1">
          {filteredLinks.map(l => (
            <Link key={l.href} href={l.href}
              className={`text-sm transition-colors px-3 py-1.5 rounded whitespace-nowrap hover:bg-slate-800 ${
                pathname === l.href ? "text-white bg-slate-800" : "text-slate-400 hover:text-white"
              }`}>
              {l.label}
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link href="/admin/users"
              className={`text-sm transition-colors px-3 py-1.5 rounded whitespace-nowrap hover:bg-slate-800 ${
                pathname.startsWith("/admin") ? "text-emerald-400 bg-slate-800" : "text-emerald-500 hover:text-emerald-400"
              }`}>
              👑 Müşteriler
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs mr-2">
            <span className="text-slate-300 font-medium">{user.email.split("@")[0]}</span>
            <button onClick={logout} className="text-red-400 hover:text-red-300 bg-red-500/10 px-2 py-1 rounded">Çıkış</button>
          </div>
          {/* Canlı göstergesi */}
          <div className="flex items-center gap-1.5 text-xs shrink-0 hidden lg:flex">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-slate-400">Canlı · Borsa</span>
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
          {filteredLinks.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className={`text-sm px-4 py-2.5 rounded-lg transition-colors ${
                pathname === l.href
                  ? "bg-blue-600/20 text-white font-medium"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}>
              {l.label}
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link href="/admin/users" onClick={() => setOpen(false)}
              className="text-sm px-4 py-2.5 rounded-lg transition-colors text-emerald-400 hover:bg-slate-800">
              👑 Müşteriler
            </Link>
          )}
        </div>
      )}
    </nav>
  )
}
