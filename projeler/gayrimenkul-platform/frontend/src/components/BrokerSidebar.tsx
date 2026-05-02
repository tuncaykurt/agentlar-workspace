'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  Users, Calculator, LogOut, Menu, X, Briefcase,
  Layout, Search, FileText, User, Settings, BookUser,
  Bot, Gift, UserCheck, Sparkles,
} from 'lucide-react'
import { ThemeToggle } from '@/lib/theme'

const navItems = [
  { href: '/broker', label: 'Ofis Yönetimi', icon: Briefcase },
  { href: '/broker/muhasebe', label: 'Ofis Muhasebesi', icon: Calculator },
  { href: '/broker/danismanlar', label: 'Danışmanlar', icon: Users },
  { href: '/broker/portfoylerim', label: 'Ofis Portföyleri', icon: Layout },
  { href: '/broker/ilanlar', label: 'Sahibinden İlanlar', icon: Search },
  { href: '/broker/evraklar', label: 'Evraklar', icon: FileText },
  { href: '/broker/crm', label: 'CRM', icon: UserCheck },
  { href: '/broker/rehber', label: 'Rehber', icon: BookUser },
  { href: '/broker/automations/birthday', label: 'Doğum Günü', icon: Gift },
  { href: '/broker/automations/chatbot', label: 'Chatbot', icon: Bot },
  { href: '/broker/automations/bulk-message', label: 'Toplu Mesaj', icon: Sparkles },
]

const bottomNavItems = [
  { href: '/broker/ayarlar', label: 'Ayarlar', icon: Settings },
  { href: '/broker/profil', label: 'Profilim', icon: User },
]

function isNavActive(href: string, pathname: string) {
  if (href === '/broker') return pathname === '/broker'
  return pathname === href || pathname.startsWith(href + '/')
}

function BrokerSidebarLinks({ onNav }: { onNav?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    onNav?.()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNav}
            className={`sidebar-link ${isNavActive(href, pathname) ? 'active' : ''}`}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="flex-shrink-0 px-3 py-4 border-t border-sidebar-border space-y-1">
        {bottomNavItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNav}
            className={`sidebar-link ${isNavActive(href, pathname) ? 'active' : ''}`}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
        <button
          className="sidebar-link w-full text-left text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={handleSignOut}
        >
          <LogOut size={18} />
          Çıkış
        </button>
      </div>
    </>
  )
}

export default function BrokerSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* ─── DESKTOP sidebar (md+) ──────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col flex-shrink-0 w-64 h-screen sticky top-0 bg-sidebar overflow-hidden">
        <div className="flex-shrink-0 px-6 py-5 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <Briefcase size={18} className="text-white" />
              </div>
              <div>
                <p className="text-on-primary font-semibold text-sm leading-none">
                  Broker Paneli
                </p>
                <p className="text-sidebar-text text-xs mt-0.5">Yönetim</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
        <BrokerSidebarLinks />
      </aside>

      {/* ─── MOBILE top header bar (hamburger) ──────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-3 px-4 h-14 bg-sidebar border-b border-sidebar-border">
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 -ml-1.5 text-sidebar-text hover:text-on-primary rounded-lg"
          aria-label="Menüyü aç"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-6 h-6 bg-purple-600 rounded flex items-center justify-center">
            <Briefcase size={13} className="text-white" />
          </div>
          <span className="text-on-primary font-semibold text-sm">
            Broker Paneli
          </span>
        </div>
        <ThemeToggle />
      </header>

      {/* ─── MOBILE backdrop ──────────────────────────────────────────── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ background: 'var(--backdrop)' }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* ─── MOBILE slide-in drawer ──────────────────────────────────── */}
      <aside
        className={`
          md:hidden fixed inset-y-0 left-0 z-50
          flex flex-col w-72 bg-sidebar shadow-ambient
          transition-transform duration-200 ease-design
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex-shrink-0 px-5 py-4 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <Briefcase size={18} className="text-white" />
            </div>
            <div>
              <p className="text-on-primary font-semibold text-sm leading-none">
                Broker Paneli
              </p>
              <p className="text-sidebar-text text-xs mt-0.5">Yönetim</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 text-sidebar-text hover:text-on-primary rounded-lg"
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        <BrokerSidebarLinks onNav={() => setOpen(false)} />
      </aside>
    </>
  )
}
