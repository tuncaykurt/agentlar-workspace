'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Building2, DollarSign,
  MessageSquare, Megaphone, FileText, Share2,
  UserCircle, Settings, LogOut, BookUser, Menu, X,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard',      label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/crm',            label: 'CRM',          icon: Users },
  { href: '/rehber',         label: 'Rehber',       icon: BookUser },
  { href: '/portfolio',      label: 'Portföy',      icon: Building2 },
  { href: '/finance',        label: 'Finans',       icon: DollarSign },
  { href: '/communications', label: 'İletişim',     icon: MessageSquare },
  { href: '/campaigns',      label: 'Kampanyalar',  icon: Megaphone },
  { href: '/documents',      label: 'Belgeler',     icon: FileText },
  { href: '/social',         label: 'Sosyal Medya', icon: Share2 },
]

const bottomItems = [
  { href: '/profile', label: 'Profilim', icon: UserCircle },
  { href: '/admin',   label: 'Yönetim',  icon: Settings },
]

/** Nav links — shared between desktop sidebar and mobile drawer */
function SidebarLinks({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname()
  return (
    <>
      {/* Scrollable nav — flex-1 fills remaining height */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNav}
            className={`sidebar-link ${pathname.startsWith(href) ? 'active' : 'text-slate-400'}`}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom items — always visible, never scrolled away */}
      <div className="flex-shrink-0 px-3 py-4 border-t border-slate-700 space-y-1">
        {bottomItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNav}
            className={`sidebar-link ${pathname.startsWith(href) ? 'active' : 'text-slate-400'}`}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
        <button
          className="sidebar-link text-slate-400 w-full text-left"
          onClick={onNav}
        >
          <LogOut size={18} />
          Çıkış
        </button>
      </div>
    </>
  )
}

export default function Sidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* ─── DESKTOP sidebar (md+) ───────────────────────────────────────────
          sticky + h-screen: stays in viewport no matter how long the page is
          overflow-hidden: inner nav scrolls, outer wrapper clips        */}
      <aside className="hidden md:flex flex-col flex-shrink-0 w-64 h-screen sticky top-0 bg-slate-800 overflow-hidden">
        {/* Logo */}
        <div className="flex-shrink-0 px-6 py-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Building2 size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-none">
                {process.env.NEXT_PUBLIC_OFFICE_NAME || 'Gayrimenkul'}
              </p>
              <p className="text-slate-400 text-xs mt-0.5">Platform</p>
            </div>
          </div>
        </div>
        <SidebarLinks />
      </aside>

      {/* ─── MOBILE top header bar (hamburger) ─────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-3 px-4 h-14 bg-slate-800 border-b border-slate-700">
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 -ml-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg"
          aria-label="Menüyü aç"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
            <Building2 size={13} className="text-white" />
          </div>
          <span className="text-white font-semibold text-sm">
            {process.env.NEXT_PUBLIC_OFFICE_NAME || 'Gayrimenkul'}
          </span>
        </div>
      </header>

      {/* ─── MOBILE backdrop ─────────────────────────────────────────────────── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ─── MOBILE slide-in drawer ──────────────────────────────────────────── */}
      <aside
        className={`
          md:hidden fixed inset-y-0 left-0 z-50
          flex flex-col w-72 bg-slate-800 shadow-2xl
          transition-transform duration-200 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Drawer header with close button */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Building2 size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-none">
                {process.env.NEXT_PUBLIC_OFFICE_NAME || 'Gayrimenkul'}
              </p>
              <p className="text-slate-400 text-xs mt-0.5">Platform</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        <SidebarLinks onNav={() => setOpen(false)} />
      </aside>
    </>
  )
}
